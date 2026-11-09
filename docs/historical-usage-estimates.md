# Historical text-usage estimates

`public.ai_usage_estimates` is separate from provider-reported `ai_usage_ledger`.
It contains reconstructed text costs, not billed credits, invoices, quota debits,
or a complete spend total. This change does not alter application routes and can
be reviewed independently of the live ledger. No shared migration is applied by CI.

## Evidence required before a real backfill

Each candidate must identify one original provider call and its historical user,
timestamp, provider/model, exact final system prompt and user prompt, and original
model output. A paper PDF or parsed screening result alone is insufficient. Include
the effective historical tariff and any token-length tier, with its source. Never
apply today's Google list prices as if they were historical ASU CreateAI credits.

The app did not centrally persist historical analyses. Its full-text JSON download
can retain nested provider metadata, depending on the response shape; it has no
verified user ID. Screening checkpoints contain parsed article results, not the
original provider response. File ownership, a login timestamp, or the current user
does not prove who made a historical call. Call IDs must come from source evidence;
do not invent call IDs from filenames or assume identical text means one call.

The importer requires a nonempty manifest and evidence files. Missing identity,
timestamp, prompt, model mapping, or applicable rate blocks the batch. Review the
evidence itself: file existence and hashes do not establish semantic correctness.
Never manufacture attribution to make a row pass. Deleted users currently need
separate review: the importer requires the UUID to exist in the target `auth.users`.

## Counting and limitations

The preparation command uses Google's local tokenizer for the supplied supported
Gemini model, including system instructions and final user prompt. It counts the
visible original answer separately. No inference request is sent and paper text
stays on the local machine. Tokenizer assets may download on first use; some models
require gated Hugging Face assets and extra dependencies. An unsupported or
unavailable tokenizer fails; there is no character-count or different-model fallback.

Record the ASU alias-to-tokenizer mapping evidence. The pinned SDK version is
recorded in every row, along with source text and evidence SHA-256 hashes. Archive
the installed tokenizer assets with the evidence if exact future reproducibility
is needed; an SDK version alone does not freeze externally downloaded assets.

Hidden thinking tokens, missed/failed attempts, caching adjustments, provider
overhead, and non-text modalities cannot be reconstructed this way. They remain
unknown, not zero. Estimated text cost is not guaranteed to be a lower bound on
billed cost (discounts/caching may reduce charges). Do not add these rows to live
usage totals without first reconciling coverage and duplicates.

Sources: [Google local tokenizer](https://github.com/googleapis/python-genai#local-count-tokens),
[CreateAI API](https://docs.aiml.asu.edu/llms.txt), and
[Gemini thinking usage](https://ai.google.dev/gemini-api/docs/thinking).

## Private manifest

Keep manifests, evidence, plans and reports under ignored `scratch/`; never commit
real user data. `prepare` creates an audit plan with hashes, counts, rates, and user
UUIDs, but no paper text, prompts, answers, emails or credentials. Plans/reports are
created with mode 0600 and cannot overwrite an existing file.

A manifest contains `schema_version: 1` and a nonempty `calls` array. Every call has:

| Field | Required evidence |
| --- | --- |
| `source_system`, `source_request_id` | Stable provider/project namespace and original provider-call ID |
| `user_id`, `occurred_at` | Verified historical user UUID and timezone-qualified timestamp |
| `operation` | `analyze` or `screening` |
| `model_provider`, `model_name`, `tokenizer_model` | Actual historical provider/model and supported Google tokenizer model |
| `system_file`, `query_file`, `output_file` | UTF-8 files containing exact final text; only the system file may be empty |
| `input_scope` | Must be `complete_final_text_prompt`; includes wrappers, rubric and instructions |
| `attribution_evidence`, `request_evidence`, `model_evidence`, `rate_evidence` | Nonempty UTF-8 evidence files inside the manifest directory |
| `pricing` | Provider/model, effective dates, token tier and decimal rate strings described below |

`pricing` must contain `model_provider`, `model_name`, timezone-qualified
`effective_from` (inclusive), `effective_until` (exclusive), integer
`min_input_tokens` (inclusive), `max_input_tokens` (exclusive, or null for no upper
bound), and decimal strings `input_usd_per_million`, `output_usd_per_million`.
Use the historical ASU tariff for an ASU estimate. No rate is supplied by default.

## Rollback first, review, then apply the exact plan

Install the offline operator dependencies in an isolated environment:

```sh
uv venv scratch/backfill-venv
uv pip install --python scratch/backfill-venv/bin/python -r scripts/usage-backfill-requirements.txt
scratch/backfill-venv/bin/python scripts/usage_backfill.py prepare \
  --manifest scratch/backfill/manifest.json --out scratch/backfill/plan.json
```

Set the intended database through libpq's `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`
and a secure password mechanism (`PGPASSFILE` or `PGPASSWORD`); never put secrets
on the command line or in reports. A row REST API is insufficient for transactional
DDL and rollback. Use an authorized PostgreSQL operator connection.

```sh
scratch/backfill-venv/bin/python scripts/usage_backfill.py dry-run \
  --plan scratch/backfill/plan.json --report scratch/backfill/dry-run.json
```

This starts a transaction, obtains an importer lock, creates the separate table if
absent, verifies target users, checks for matching observed provider IDs, inserts
the candidate rows, and executes **ROLLBACK**. Table creation is rolled back too.
Check that the report says `ROLLED_BACK`, then independently verify target counts
and inspect every candidate's evidence, counts, historical pricing, and exclusions.
Review any duplicate across alternate namespaces/source exports manually.

After review, use the exact SHA-256 printed by preparation/dry run:

```sh
scratch/backfill-venv/bin/python scripts/usage_backfill.py apply \
  --plan scratch/backfill/plan.json --dry-run-report scratch/backfill/dry-run.json \
  --reviewed-plan-sha256 REVIEWED_SHA256 --report scratch/backfill/applied.json
```

Apply rejects a changed plan, runner, migration, endpoint/database/user, or missing
successful rollback report. It revalidates within a new transaction and commits
only on success. Exact reimports are counted as already present; conflicting
evidence aborts the whole batch without overwriting. Do not bypass these checks.
After commit, verify the separate table by source IDs and compare counts/sums to
the report. If report writing or the connection fails after commit, check source
IDs before assuming rollback; a retry of the same plan is idempotent.

## Validation and current data status

`tests/test_usage_backfill.py` tests evidence/rate validation and real PostgreSQL
rollback (including DDL), apply gating, idempotency, conflicts, unknown-user atomicity,
observed-usage overlap, decimal cost calculation and admin-only reads. Set
`BACKFILL_TEST_DATABASE=disposable` only for an empty disposable database; tests
refuse a database containing `auth.users`. CI uses synthetic text, a deterministic
fixture counter and a fresh PostgreSQL service, not a model service or Supabase.

On November 9, 2026, no historical analysis-result exports were found in the
searched Downloads/Documents folders on the personal laptop or Downloads/School
folders on the work laptop. The historical source, user attribution and effective
ASU tariff remain unavailable. Therefore no real-data plan, rollback, table
creation or backfill has been performed against a shared database. A successful
fixture rollback is not evidence that real historical rows can be reconstructed.
