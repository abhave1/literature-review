begin;

alter table public.ai_usage_ledger
  add column estimate_input_usd_per_million numeric check (estimate_input_usd_per_million >= 0),
  add column estimate_output_usd_per_million numeric check (estimate_output_usd_per_million >= 0),
  add column estimate_rate_version text,
  add column estimate_rate_source text,
  add column estimated_cost_usd numeric generated always as
    ((input_tokens * estimate_input_usd_per_million + output_tokens * estimate_output_usd_per_million) / 1000000::numeric) stored,
  add constraint usage_estimate_complete check (
    (estimate_input_usd_per_million is null and estimate_output_usd_per_million is null
      and estimate_rate_version is null and estimate_rate_source is null)
    or (estimate_input_usd_per_million is not null and estimate_output_usd_per_million is not null
      and estimate_rate_version is not null and estimate_rate_source is not null
      and input_tokens is not null and output_tokens is not null)
  );

comment on column public.ai_usage_ledger.cost_usd is 'Provider-reported USD cost; NULL means unknown. Never replaced by an estimate.';
comment on column public.ai_usage_ledger.estimated_cost_usd is 'Indicative list-price estimate from reported input/output tokens and snapshotted rates, not billed credits. No assumptions about missing thinking tokens, cache discounts, or provider overhead.';

-- Security invoker preserves the ledger RLS policy: only admins can read usage.
-- Filter by request start, then include ALL its attempts, including later retries.
create function public.ai_usage_request_totals(
  p_from timestamptz default '-infinity', p_to timestamptz default 'infinity'
) returns table (
  user_id uuid, request_id uuid, started_at timestamptz,
  call_count bigint, attempt_count bigint, pending_attempts bigint,
  unknown_token_attempts bigint, unknown_cost_attempts bigint,
  input_tokens numeric, output_tokens numeric,
  provider_cost_usd numeric, estimated_cost_usd numeric, accounted_cost_usd numeric
) language sql stable security invoker set search_path = '' as $$
  select user_id, request_id, min(created_at),
    count(distinct call_id), count(*), count(*) filter (where status = 'pending'),
    count(*) filter (where input_tokens is null or output_tokens is null),
    count(*) filter (where coalesce(cost_usd, estimated_cost_usd) is null),
    case when count(input_tokens) = count(*) then sum(input_tokens) end,
    case when count(output_tokens) = count(*) then sum(output_tokens) end,
    case when count(cost_usd) = count(*) then sum(cost_usd) end,
    case when count(estimated_cost_usd) = count(*) then sum(estimated_cost_usd) end,
    case when count(coalesce(cost_usd, estimated_cost_usd)) = count(*)
      then sum(coalesce(cost_usd, estimated_cost_usd)) end
  from public.ai_usage_ledger
  group by user_id, request_id
  having min(created_at) >= p_from and min(created_at) < p_to
$$;

create function public.ai_usage_user_totals(
  p_from timestamptz default '-infinity', p_to timestamptz default 'infinity'
) returns table (
  user_id uuid, request_count bigint, attempt_count numeric,
  requests_with_tokens bigint, requests_with_estimates bigint, requests_with_accounted_cost bigint,
  avg_input_tokens_per_request numeric, avg_output_tokens_per_request numeric,
  avg_estimated_usd_per_request numeric, avg_accounted_usd_per_request numeric,
  known_accounted_cost_usd numeric
) language sql stable security invoker set search_path = '' as $$
  select user_id, count(*), sum(attempt_count),
    count(*) filter (where input_tokens is not null and output_tokens is not null),
    count(estimated_cost_usd), count(accounted_cost_usd),
    avg(input_tokens) filter (where output_tokens is not null),
    avg(output_tokens) filter (where input_tokens is not null),
    avg(estimated_cost_usd), avg(accounted_cost_usd), sum(accounted_cost_usd)
  from public.ai_usage_request_totals(p_from, p_to)
  group by user_id
$$;

revoke all on function public.ai_usage_request_totals(timestamptz,timestamptz) from public, anon;
revoke all on function public.ai_usage_user_totals(timestamptz,timestamptz) from public, anon;
grant execute on function public.ai_usage_request_totals(timestamptz,timestamptz) to authenticated, service_role;
grant execute on function public.ai_usage_user_totals(timestamptz,timestamptz) to authenticated, service_role;
comment on function public.ai_usage_user_totals(timestamptz,timestamptz) is 'Per-user averages over complete app requests, not attempts. Coverage counts identify excluded incomplete requests. Accounted cost prefers actual provider cost (including zero), otherwise the estimate. Known total excludes incomplete requests.';

notify pgrst, 'reload schema';
commit;
