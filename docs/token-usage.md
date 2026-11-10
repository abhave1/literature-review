# Per-user request usage

Analysis and screening attach usage to the verified Supabase Auth user. One app
request can contain multiple model calls; each retry is a separate ledger attempt.
No prompt, paper content, response text, or caller-supplied identity is stored.

## Cost and token semantics

- `input_tokens` / `output_tokens`: counts reported by CreateAI, not character-based approximations.
- `cost_usd`: provider-reported cost, including a genuine zero; never overwritten by an estimate.
- `estimated_cost_usd`: indicative USD list-price estimate calculated exactly in PostgreSQL:
  `(input_tokens × input_USD_per_million + output_tokens × output_USD_per_million) / 1,000,000`.
- Each estimate snapshots both rates, an immutable rate version, and its source URL.
  Missing counts or an unsupported model leave the estimate NULL, not zero.

The initial rate card maps the app's requested `gcp-deepmind/geminipro3_1` model to
Google Gemini 3.1 Pro standard global text pricing, checked November 9, 2026:
$2 input / $12 output per million tokens for input contexts up to and including
200,000 tokens, and $4 / $18 above that. Source:
https://cloud.google.com/vertex-ai/generative-ai/pricing

This is an indicative estimate, **not ASU billing or a charge to a user**. It assumes
the requested model and standard global tier. It does not reconstruct missing
thinking tokens, account for cache/batch discounts, grounding, or ASU-specific
rates. Provider-reported cost takes precedence in accounted totals. Never update
an old rate version in place; create a new version for future calls.

## Reports

Admins open **Costs** in the `/admin` left sidebar, alongside **People & access**
and **Project features**. Select a person to see cost summaries, token averages,
inclusive UTC date filters, and paginated request details. Costs uses the same
admin shell; it is not a nested tab inside a person's access settings. Old
`/admin/usage` bookmarks and `?tab=usage` links open Costs, preserving valid
user/date filters. New report links use `/admin?tab=costs`.

The read-only selected-user API requires admin authorization and uses the
caller's session so ledger RLS remains enforced. It scopes both summary and
request queries to the selected user. Each request page returns at most 50 rows
plus a next-page indicator, with stable newest-first ordering. Unknown usage is
shown as unknown, and cost coverage remains explicit. Sidebar navigation keeps
the existing unsaved-permission confirmation before leaving People & access.

Two read-only, security-invoker SQL functions expose reports through Supabase RPC.
They inherit the ledger's admin-only read policy. Ordinary signed-in users see
no rows; anonymous users cannot execute them. No SQL views or stored rollups.

```sql
-- One row per authenticated user + app request, including ALL files and retries.
select * from public.ai_usage_request_totals('2026-11-01', '2026-12-01');

-- One row per user, with per-request average tokens and USD estimates.
select * from public.ai_usage_user_totals('2026-11-01', '2026-12-01');
```

Date bounds are inclusive/exclusive and select by the start of the app request.
Attempts finishing outside the window are still included. Omit bounds for all
history. Use explicit timezone offsets when supplying dates from an application.

`accounted_cost_usd` prefers each attempt's reported cost, falling back to its
estimate. This can mix reported and estimated values and must not be labeled billed
cost. A request's full total is NULL if any attempt's cost is unknown. Retries and
multi-file requests are summed before averaging: the denominator is app requests,
not HTTP attempts. Failed/pending attempts with unknown usage make the request
incomplete; they are never assumed free.

User reports include `request_count`, `requests_with_tokens`,
`requests_with_estimates`, and `requests_with_accounted_cost`. Display these
coverage counts alongside averages. `known_accounted_cost_usd` sums only complete
requests and is not an overall total when coverage is incomplete. Averages over
no complete requests are NULL. Re-running a report may change a pending request's
totals once its attempt finishes.

## Rollout

Apply `202610300001_ai_usage_ledger.sql` and
`202611090002_usage_cost_estimates.sql` before deploying the code. Both belong to
the app's existing Supabase database. Verify the report functions and admin-only
access, then deploy and check a real authenticated request's usage row.

If the initial insert fails, the model request is not sent. If finalization fails,
the model response is preserved, no paid request is repeated for accounting, and
the pending row records the gap. Existing historical records are not repriced or
backfilled by these migrations. This PR does not need CreateAI history access.

## Validation

`npm run test:usage`, `npm run test:auth`, `npm run test:prompts`, TypeScript checking,
and `psql -v ON_ERROR_STOP=1 -f tests/usage-ledger.sql` against an **empty disposable
database**. The SQL suite installs the migration chain and verifies exact amounts,
retry grouping, date boundaries, missing-data coverage, user separation, and RLS.
Provider calls in tests are fixtures; a real production request is a post-deploy
check, not evidence supplied by these tests.
