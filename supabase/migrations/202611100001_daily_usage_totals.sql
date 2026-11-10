begin;

-- Group complete app requests by their UTC start day, including later retries.
-- Security invoker retains ledger RLS; the explicit role check also protects empty-day rows.
create function public.ai_usage_daily_totals(p_from date, p_through date)
returns table (
  day date, request_count bigint, active_users bigint, attempt_count numeric,
  requests_with_tokens bigint, requests_with_accounted_cost bigint,
  known_input_tokens numeric, known_output_tokens numeric, known_accounted_cost_usd numeric
) language plpgsql stable security invoker set search_path = '' as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Admin required' using errcode = '42501';
  end if;
  if p_from is null or p_through is null or not isfinite(p_from) or not isfinite(p_through)
     or p_from < date '2000-01-01' or p_through > date '9998-12-31'
     or p_through < p_from or p_through - p_from > 365 then
    raise exception 'Choose a valid range of at most 366 days' using errcode = '22023';
  end if;
  return query
  with daily as (
    select (r.started_at at time zone 'UTC')::date as day,
      count(*) as request_count, count(distinct r.user_id) as active_users,
      sum(r.attempt_count) as attempt_count,
      count(*) filter (where r.input_tokens is not null and r.output_tokens is not null) as requests_with_tokens,
      count(r.accounted_cost_usd) as requests_with_accounted_cost,
      sum(r.input_tokens) filter (where r.output_tokens is not null) as known_input_tokens,
      sum(r.output_tokens) filter (where r.input_tokens is not null) as known_output_tokens,
      sum(r.accounted_cost_usd) as known_accounted_cost_usd
    from public.ai_usage_request_totals(
      p_from::timestamp at time zone 'UTC', (p_through + 1)::timestamp at time zone 'UTC'
    ) r group by (r.started_at at time zone 'UTC')::date
  )
  select p_from + days.n, coalesce(d.request_count, 0), coalesce(d.active_users, 0),
    coalesce(d.attempt_count, 0), coalesce(d.requests_with_tokens, 0), coalesce(d.requests_with_accounted_cost, 0),
    case when d.request_count is null then 0 else d.known_input_tokens end,
    case when d.request_count is null then 0 else d.known_output_tokens end,
    case when d.request_count is null then 0 else d.known_accounted_cost_usd end
  from generate_series(0, p_through - p_from) as days(n)
  left join daily d on d.day = p_from + days.n
  order by days.n;
end $$;

revoke all on function public.ai_usage_daily_totals(date,date) from public, anon;
grant execute on function public.ai_usage_daily_totals(date,date) to authenticated;
comment on function public.ai_usage_daily_totals(date,date) is
  'Admin-only daily totals across all users by request start in UTC. Includes zero-activity days. Known totals exclude incomplete requests; NULL means all measurements are unknown. Actual provider USD takes precedence over estimates. Maximum 366 days.';
notify pgrst, 'reload schema';
commit;
