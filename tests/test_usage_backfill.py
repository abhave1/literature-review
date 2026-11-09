import copy
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('backfill', ROOT / 'scripts/usage_backfill.py')
backfill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backfill)


class FixtureCounter:
    version = 'fixture-only/1'

    def count(self, model, system, query, output):
        if model != 'fixture-tokenizer':
            raise ValueError('Unsupported model')
        return len(system.split()) + len(query.split()), len(output.split())


class FixtureCase(unittest.TestCase):
    def setUp(self):
        scratch = ROOT / 'scratch'
        scratch.mkdir(exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(dir=scratch)
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        for name, content in {'system': 'Evaluate the paper carefully.', 'query': 'Here is the paper.',
                              'output': 'The paper qualifies.', 'evidence': 'Synthetic test evidence only.'}.items():
            (self.base / name).write_text(content)
        self.call = {
            'source_system': 'synthetic-test', 'source_request_id': 'original-query-1',
            'user_id': '00000000-0000-0000-0000-000000000002',
            'occurred_at': '2026-10-20T12:00:00Z', 'operation': 'analyze',
            'model_provider': 'fixture-provider', 'model_name': 'fixture-model',
            'tokenizer_model': 'fixture-tokenizer', 'input_scope': 'complete_final_text_prompt',
            'system_file': 'system', 'query_file': 'query', 'output_file': 'output',
            **{field: 'evidence' for field in ('attribution_evidence', 'request_evidence', 'model_evidence', 'rate_evidence')},
            'pricing': {'model_provider': 'fixture-provider', 'model_name': 'fixture-model',
                        'effective_from': '2026-10-01T00:00:00Z', 'effective_until': '2026-11-01T00:00:00Z',
                        'min_input_tokens': 0, 'max_input_tokens': 100,
                        'input_usd_per_million': '2', 'output_usd_per_million': '8'},
        }

    def plan(self, calls=None):
        manifest = self.base / 'manifest.json'
        manifest.write_text(json.dumps({'schema_version': 1, 'calls': calls or [self.call]}))
        return backfill.prepare(manifest, FixtureCounter())


class Preparation(FixtureCase):
    def test_count_includes_system_and_keeps_raw_content_out_of_plan(self):
        self.call['pricing']['unrelated_raw_text'] = 'Never copy this into the audit table.'
        plan = self.plan()
        row = plan['rows'][0]
        self.assertEqual((row['estimated_input_tokens'], row['estimated_visible_output_tokens']), (8, 3))
        self.assertNotIn('The paper qualifies.', json.dumps(plan))
        self.assertNotIn('Evaluate the paper', json.dumps(plan))
        self.assertNotIn('Never copy this', json.dumps(plan))
        self.assertEqual(row['tokenizer_version'], 'fixture-only/1')
        self.assertIn('hidden_reasoning_unknown', row['provenance']['limitations'])
        backfill.validate_plan(plan)

    def test_rejects_missing_identity_evidence_and_incomplete_prompt(self):
        for field, value in [('user_id', ''), ('attribution_evidence', 'missing'),
                             ('input_scope', 'paper_only'), ('tokenizer_model', 'unsupported')]:
            call = copy.deepcopy(self.call)
            call[field] = value
            with self.subTest(field=field), self.assertRaises((ValueError, FileNotFoundError)):
                self.plan([call])

    def test_rejects_wrong_rate_model_time_tier_and_nonfinite_price(self):
        for field, value in [('model_name', 'different'), ('effective_until', '2026-10-10T00:00:00Z'),
                             ('max_input_tokens', 8), ('input_usd_per_million', 'NaN'),
                             ('output_usd_per_million', '-1')]:
            call = copy.deepcopy(self.call)
            call['pricing'][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.plan([call])

    def test_duplicate_identity_is_not_silently_deduplicated(self):
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            self.plan([self.call, self.call])

    def test_modified_plan_is_rejected(self):
        plan = self.plan()
        plan['rows'][0]['estimated_input_tokens'] += 1
        with self.assertRaisesRegex(ValueError, 'changed'):
            backfill.validate_plan(plan)

    def test_changed_evidence_changes_record_identity_hash(self):
        first = self.plan()['rows'][0]['record_sha256']
        (self.base / 'evidence').write_text('Different attribution evidence.')
        self.assertNotEqual(first, self.plan()['rows'][0]['record_sha256'])


@unittest.skipUnless(os.getenv('BACKFILL_TEST_DATABASE') == 'disposable', 'Needs an empty disposable PostgreSQL database')
class Transactions(FixtureCase):
    @classmethod
    def setUpClass(cls):
        import psycopg
        cls.conn = psycopg.connect(autocommit=True)
        # Refuse to initialize a database with preexisting app/auth tables.
        if cls.conn.execute("select to_regclass('auth.users')").fetchone()[0] is not None:
            raise RuntimeError('Tests require an empty disposable database')
        cls.conn.execute('create schema auth; create table auth.users(id uuid primary key)')
        cls.conn.execute("insert into auth.users values ('00000000-0000-0000-0000-000000000002')")
        for role in ('anon', 'authenticated', 'service_role'):
            if not cls.conn.execute('select 1 from pg_roles where rolname=%s', (role,)).fetchone():
                cls.conn.execute('create role ' + role)
        cls.conn.execute("create function public.is_admin() returns boolean language sql stable as $$ select current_setting('test.is_admin', true) = 'true' $$")

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    def tearDown(self):
        self.conn.execute('drop table if exists public.ai_usage_estimates')
        self.conn.execute('drop table if exists public.ai_usage_ledger')

    def cli(self, *args, success=True):
        r = subprocess.run([sys.executable, str(ROOT / 'scripts/usage_backfill.py'), *map(str, args)],
                           text=True, capture_output=True)
        self.assertEqual(r.returncode == 0, success, r.stdout + r.stderr)
        return r

    def test_real_rollback_apply_idempotency_conflict_and_rls(self):
        plan = self.plan()
        path = self.base / 'plan.json'
        path.write_text(json.dumps(plan))
        dry = self.base / 'dry.json'
        self.cli('dry-run', '--plan', path, '--report', dry)
        self.assertEqual(json.loads(dry.read_text())['outcome'], 'ROLLED_BACK')
        self.assertIsNone(self.conn.execute("select to_regclass('public.ai_usage_estimates')").fetchone()[0])
        self.cli('apply', '--plan', path, '--report', self.base / 'bad.json',
                 '--dry-run-report', dry, '--reviewed-plan-sha256', 'wrong', success=False)
        self.assertIsNone(self.conn.execute("select to_regclass('public.ai_usage_estimates')").fetchone()[0])
        applied = self.base / 'applied.json'
        self.cli('apply', '--plan', path, '--report', applied, '--dry-run-report', dry,
                 '--reviewed-plan-sha256', backfill.digest(plan))
        self.assertEqual(json.loads(applied.read_text())['inserted'], 1)
        cost = self.conn.execute('select estimated_text_cost_usd from public.ai_usage_estimates').fetchone()[0]
        self.assertEqual(str(cost.normalize()), '0.00004')
        again = self.base / 'again.json'
        self.cli('dry-run', '--plan', path, '--report', again)
        self.assertEqual(json.loads(again.read_text())['already_present'], 1)
        # Authenticated users cannot mutate; only authenticated admins can read.
        self.conn.execute('set role authenticated')
        self.assertEqual(self.conn.execute('select count(*) from public.ai_usage_estimates').fetchone()[0], 0)
        self.conn.execute("set test.is_admin='true'")
        self.assertEqual(self.conn.execute('select count(*) from public.ai_usage_estimates').fetchone()[0], 1)
        self.assertFalse(self.conn.execute("select has_table_privilege('authenticated', 'public.ai_usage_estimates', 'insert')").fetchone()[0])
        self.conn.execute('reset role')
        # A modified reconstruction of an existing call must fail, never overwrite.
        (self.base / 'output').write_text('Different saved output for the same call.')
        path.write_text(json.dumps(self.plan()))
        self.cli('dry-run', '--plan', path, '--report', self.base / 'conflict.json', success=False)
        self.assertEqual(self.conn.execute('select count(*) from public.ai_usage_estimates').fetchone()[0], 1)

    def test_unknown_user_rolls_back_entire_batch(self):
        other = copy.deepcopy(self.call)
        other['source_request_id'] = 'another-query'
        other['user_id'] = '00000000-0000-0000-0000-000000000099'
        path = self.base / 'plan.json'
        path.write_text(json.dumps(self.plan([self.call, other])))
        self.cli('dry-run', '--plan', path, '--report', self.base / 'dry.json', success=False)
        self.assertIsNone(self.conn.execute("select to_regclass('public.ai_usage_estimates')").fetchone()[0])

    def test_observed_usage_is_not_backfilled_as_estimated(self):
        self.conn.execute('create table public.ai_usage_ledger(provider_query_id text)')
        self.conn.execute("insert into public.ai_usage_ledger values ('original-query-1')")
        path = self.base / 'plan.json'
        path.write_text(json.dumps(self.plan()))
        self.cli('dry-run', '--plan', path, '--report', self.base / 'dry.json', success=False)
        self.assertIsNone(self.conn.execute("select to_regclass('public.ai_usage_estimates')").fetchone()[0])


if __name__ == '__main__':
    unittest.main()
