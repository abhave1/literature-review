# Per-user CreateAI usage

`public.ai_usage_ledger` records one row per outbound `/query` HTTP attempt from
analysis and screening. The server obtains `user_id` from validated Supabase Auth;
body/header identities are not trusted or forwarded to CreateAI. No new model calls
are made to measure usage. No prompts, papers, filenames, answers, or credentials
are stored in this table.

## Rollout

Apply `supabase/migrations/202610300001_ai_usage_ledger.sql` before deploying the
application change. The server requires the existing `SUPABASE_SERVICE_ROLE_KEY`.
This PR only prepares the migration; it does not apply it to any shared database.
Do not deploy/merge until the migration is applied: if the ledger insert fails,
the model call is blocked and the request reports an error.

Only the service role can insert/update rows. Authenticated admins can read all
rows; ordinary users and anonymous clients cannot read or write usage. User UUIDs
are retained after deletion of an auth account, without storing email addresses.
There is no automatic retention/purge policy in this change.

## Counting correctly

- `request_id`: server-generated ID for an incoming analysis/screening request
  that actually makes a model call. Multiple files share it. Invalid requests or
  no-abstract batches that do not use the model produce no rows.
- `call_id`: one logical model query; one per analyzed file or screened batch.
- `id` and `attempt`: individual HTTP attempt, including automatic retries.
  Updates finalize the same primary-key row, preventing duplicate finalization.
- `provider_query_id`: provider's correlation ID, when returned.
- `input_tokens`, `output_tokens`, `cost_usd`: provider-reported values from
  `metadata.usage_metric` (also supports the native nested `response.metadata`).
- `status`: provider HTTP outcome, not the result of parsing the answer.
  A failed downstream parse still consumed tokens and is counted.

A pending row is persisted **before** sending. Finalization is awaited; if it
fails, the successful answer is preserved, the row stays pending, and an error
containing only its ledger ID is logged. Process termination can also leave a
pending row. Timeouts/errors can have consumed tokens without reporting them:
missing/invalid values remain NULL, never assumed zero. These totals are observed
usage, not a complete billing reconciliation. Historical usage is not backfilled.
Separate client retries remain separate requests; provider retries share a call ID.

## Monthly aggregation by user (Arizona calendar months)

Run as an admin or through an authorized server connection. Include unknown counts
alongside sums: SQL SUM ignores NULL and therefore gives only the observed total.

```sql
select user_id,
       date_trunc('month', created_at at time zone 'America/Phoenix') as month,
       count(distinct request_id) as app_requests,
       count(distinct call_id) as model_calls,
       count(*) as http_attempts,
       count(*) filter (where status = 'failed') as failed_attempts,
       count(*) filter (where status = 'pending') as pending_attempts,
       sum(input_tokens) as observed_input_tokens,
       sum(output_tokens) as observed_output_tokens,
       sum(cost_usd) as observed_cost_usd,
       count(*) filter (where input_tokens is null or output_tokens is null) as unknown_token_attempts,
       count(*) filter (where cost_usd is null) as unknown_cost_attempts,
       max(completed_at) as last_updated
from public.ai_usage_ledger
where created_at >= timestamptz '2026-10-01 00:00:00 America/Phoenix'
  and created_at < timestamptz '2026-11-01 00:00:00 America/Phoenix'
group by user_id, month
order by month desc, observed_input_tokens desc nulls last;
```

Add `project_name` or `bot_key` to SELECT/GROUP BY for project/bot breakdowns.
Project monthly budget snapshots are intentionally not added together as per-user
cost: they cover all callers of the provider project.

## Validation

`npm run test:usage` runs mocked client/route tests without contacting any provider
or database. `tests/usage-ledger.sql` exercises the migrations and RLS against an
empty disposable local PostgreSQL database only. Never run that fixture on Supabase.

Source: [CreateAI limits](https://docs.aiml.asu.edu/limits.md) and the native
response examples in [CreateAI full documentation](https://docs.aiml.asu.edu/llms.txt).
