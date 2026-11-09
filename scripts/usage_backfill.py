#!/usr/bin/env python3
"""Offline token reconstruction; PostgreSQL dry runs roll back by default.

No model inference or text upload. Requires an evidence manifest, never infers
users or dates from filenames, and never supplies a default model or tariff.
"""
import argparse
import hashlib
import importlib.metadata
import json
import os
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/202611090001_ai_usage_estimates.sql'
SCHEMA_VERSION = 1


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                    ensure_ascii=False).encode()).hexdigest()


def timestamp(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('Timestamps must specify a timezone')
    return result.astimezone(timezone.utc)


def rate(value):
    # Require decimal strings, avoiding floats and silent binary rounding.
    if not isinstance(value, str):
        raise ValueError('Rates must be decimal strings')
    result = Decimal(value)
    if not result.is_finite() or result < 0:
        raise ValueError('Rate must be finite and nonnegative')
    return result


def text_file(base, filename, allow_empty=False):
    path = (base / filename).resolve()
    if not path.is_relative_to(base.resolve()):
        raise ValueError('Evidence must be inside the manifest directory')
    data = path.read_bytes()
    text = data.decode('utf-8')
    if not allow_empty and not text.strip():
        raise ValueError('Missing evidence or text')
    return text, hashlib.sha256(data).hexdigest()


class GoogleLocalCounter:
    def __init__(self):
        from google.genai import local_tokenizer
        self.factory = local_tokenizer.LocalTokenizer
        self.version = 'google-genai/' + importlib.metadata.version('google-genai')
        self.tokenizers = {}

    def count(self, model, system, query, output):
        if model not in self.tokenizers:
            # Unsupported models raise; never substitute a different tokenizer.
            self.tokenizers[model] = self.factory(model_name=model)
        tokenizer = self.tokenizers[model]
        inp = tokenizer.count_tokens(query, config={'system_instruction': system}).total_tokens
        out = tokenizer.count_tokens(output).total_tokens
        return inp, out


def prepare(manifest_path, counter):
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('schema_version') != SCHEMA_VERSION or not manifest.get('calls'):
        raise ValueError('Manifest must contain a nonempty calls list and schema_version=1')
    rows, seen = [], set()
    for call in manifest['calls']:
        row = {key: call[key] for key in (
            'source_system', 'source_request_id', 'user_id', 'occurred_at',
            'operation', 'model_provider', 'model_name', 'tokenizer_model')}
        if any(not isinstance(v, str) or not v.strip() for v in row.values()):
            raise ValueError('Attribution, call identity, timestamp, and model are required')
        UUID(row['user_id'])
        when = timestamp(row['occurred_at'])
        if when > datetime.now(timezone.utc):
            raise ValueError('Historical call cannot occur in the future')
        if row['operation'] not in ('analyze', 'screening'):
            raise ValueError('Unknown operation')
        key = row['source_system'], row['source_request_id']
        if key in seen:
            raise ValueError('Duplicate original call in manifest')
        seen.add(key)
        base = manifest_path.parent
        evidence = {}
        # These documents must explain the identity, timestamp, exact final prompt,
        # model alias -> tokenizer mapping, and historical tariff. A human reviews them.
        for field in ('attribution_evidence', 'request_evidence', 'model_evidence', 'rate_evidence'):
            _, evidence[field] = text_file(base, call[field])
        system, evidence['system_sha256'] = text_file(base, call['system_file'], allow_empty=True)
        query, evidence['query_sha256'] = text_file(base, call['query_file'])
        output, evidence['output_sha256'] = text_file(base, call['output_file'])
        if call.get('input_scope') != 'complete_final_text_prompt':
            raise ValueError('Paper text alone is insufficient: supply the final prompt and rubric')
        pricing = {key: call['pricing'][key] for key in (
            'model_provider', 'model_name', 'effective_from', 'effective_until',
            'min_input_tokens', 'max_input_tokens', 'input_usd_per_million', 'output_usd_per_million')}
        if pricing['model_name'] != row['model_name'] or pricing['model_provider'] != row['model_provider']:
            raise ValueError('Historical tariff must match the provider and model')
        if not timestamp(pricing['effective_from']) <= when < timestamp(pricing['effective_until']):
            raise ValueError('Call timestamp is outside the historical tariff period')
        inp, out = counter.count(row['tokenizer_model'], system, query, output)
        if any(type(v) is not int or v < 0 for v in (inp, out)):
            raise ValueError('Tokenizer returned invalid counts')
        lo, hi = pricing['min_input_tokens'], pricing['max_input_tokens']
        if type(lo) is not int or lo < 0 or (hi is not None and (type(hi) is not int or hi <= lo)):
            raise ValueError('Invalid tariff token tier')
        if inp < lo or (hi is not None and inp >= hi):
            raise ValueError('Token count is outside the supplied tariff tier')
        input_rate, output_rate = rate(pricing['input_usd_per_million']), rate(pricing['output_usd_per_million'])
        evidence['pricing'] = pricing
        evidence['input_scope'] = call['input_scope']
        evidence['limitations'] = ['hidden_reasoning_unknown', 'missing_attempts_unknown',
                                   'cache_adjustments_unknown', 'provider_overhead_unknown']
        row.update(tokenizer_version=counter.version, estimated_input_tokens=inp,
                   estimated_visible_output_tokens=out, input_usd_per_million=str(input_rate),
                   output_usd_per_million=str(output_rate), provenance=evidence)
        row['record_sha256'] = digest(row)
        rows.append(row)
    return {'schema_version': SCHEMA_VERSION, 'migration_sha256': hashlib.sha256(MIGRATION.read_bytes()).hexdigest(),
            'runner_sha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'manifest_sha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(), 'rows': rows}


def validate_plan(plan):
    if plan.get('schema_version') != SCHEMA_VERSION or not plan.get('rows'):
        raise ValueError('Empty or unsupported plan')
    if plan['migration_sha256'] != hashlib.sha256(MIGRATION.read_bytes()).hexdigest():
        raise ValueError('Migration changed; prepare and review a new plan')
    if plan['runner_sha256'] != hashlib.sha256(Path(__file__).read_bytes()).hexdigest():
        raise ValueError('Runner changed; prepare and review a new plan')
    expected = {'source_system', 'source_request_id', 'user_id', 'occurred_at',
                'operation', 'model_provider', 'model_name', 'tokenizer_model',
                'tokenizer_version', 'estimated_input_tokens', 'estimated_visible_output_tokens',
                'input_usd_per_million', 'output_usd_per_million', 'provenance', 'record_sha256'}
    for row in plan['rows']:
        if set(row) != expected:
            raise ValueError('Unexpected prepared record fields')
        values = {k: v for k, v in row.items() if k != 'record_sha256'}
        if row['record_sha256'] != digest(values):
            raise ValueError('Prepared record changed; regenerate plan')


def execute_plan(conn, plan):
    """Caller MUST roll back unless all validation and explicit apply checks pass."""
    from psycopg import sql
    from psycopg.types.json import Jsonb
    validate_plan(plan)
    # Serializes this importer, including first-time table creation, for this transaction.
    conn.execute("select pg_advisory_xact_lock(hashtext('ai_usage_estimates_backfill'))")
    if conn.execute("select to_regclass('public.ai_usage_estimates')").fetchone()[0] is None:
        conn.execute(MIGRATION.read_text())
    inserted, existing = 0, 0
    for row in plan['rows']:
        if not conn.execute('select 1 from auth.users where id = %s', (row['user_id'],)).fetchone():
            raise ValueError('User not found in target database; attribution needs review')
        # Do not mix estimated records with observed ledger attempts for the same query.
        if conn.execute("select to_regclass('public.ai_usage_ledger')").fetchone()[0] is not None:
            if conn.execute('select 1 from public.ai_usage_ledger where provider_query_id = %s limit 1',
                            (row['source_request_id'],)).fetchone():
                raise ValueError('Call already has observed usage; exclude it from the estimate batch')
        prior = conn.execute('select record_sha256 from public.ai_usage_estimates '
                             'where source_system=%s and source_request_id=%s',
                             (row['source_system'], row['source_request_id'])).fetchone()
        if prior:
            if prior[0] != row['record_sha256']:
                raise ValueError('Existing call has different evidence; refusing to overwrite')
            existing += 1
            continue
        columns = list(row)
        values = [Jsonb(row[k]) if k == 'provenance' else row[k] for k in columns]
        conn.execute(sql.SQL('insert into public.ai_usage_estimates ({}) values ({})').format(
            sql.SQL(',').join(map(sql.Identifier, columns)),
            sql.SQL(',').join(sql.Placeholder() for _ in columns)), values)
        inserted += 1
    total = sum((Decimal(r['estimated_input_tokens']) * rate(r['input_usd_per_million']) +
                 Decimal(r['estimated_visible_output_tokens']) * rate(r['output_usd_per_million'])) /
                Decimal(1000000) for r in plan['rows'])
    return {'inserted': inserted, 'already_present': existing,
            'estimated_text_cost_usd': str(total), 'plan_sha256': digest(plan)}


def target_identity(conn):
    # No password/DSN in the report. Apply must match the same database endpoint.
    return {k: str(conn.info.get_parameters().get(k, '')) for k in ('host', 'port', 'dbname', 'user')}


def write_private(path, value):
    # Refuse accidental overwrite; reports may contain user UUIDs and source IDs.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('prepare')
    p.add_argument('--manifest', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True)
    for name in ('dry-run', 'apply'):
        p = sub.add_parser(name)
        p.add_argument('--plan', type=Path, required=True)
        p.add_argument('--report', type=Path, required=True)
        if name == 'apply':
            p.add_argument('--dry-run-report', type=Path, required=True)
            p.add_argument('--reviewed-plan-sha256', required=True)
    args = parser.parse_args()
    if args.command == 'prepare':
        plan = prepare(args.manifest, GoogleLocalCounter())
        write_private(args.out, plan)
        print(json.dumps({'rows': len(plan['rows']), 'plan_sha256': digest(plan)}))
        return
    import psycopg
    plan = json.loads(args.plan.read_text())
    validate_plan(plan)
    if args.report.exists():
        raise ValueError('Report already exists; use a new path')
    # PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD or PGSERVICE; never CLI secrets.
    with psycopg.connect(autocommit=False) as conn:
        target = target_identity(conn)
        if args.command == 'apply':
            previous = json.loads(args.dry_run_report.read_text())
            if (previous.get('outcome') != 'ROLLED_BACK' or previous.get('target') != target or
                    previous.get('plan_sha256') != digest(plan) or args.reviewed_plan_sha256 != digest(plan)):
                raise ValueError('Apply requires the reviewed plan and successful rollback on this target')
        try:
            conn.execute("set local lock_timeout = '5s'")
            conn.execute("set local statement_timeout = '60s'")
            report = execute_plan(conn, plan)
            if args.command == 'dry-run':
                conn.rollback()
                report['outcome'] = 'ROLLED_BACK'
            else:
                conn.commit()
                report['outcome'] = 'COMMITTED'
            report.update(target=target, completed_at=datetime.now(timezone.utc).isoformat())
            write_private(args.report, report)
            print(json.dumps(report))
        except Exception:
            conn.rollback()
            raise


if __name__ == '__main__':
    main()
