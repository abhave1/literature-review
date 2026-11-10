-- Included after the ledger/cost fixture suite on a disposable database only.
\ir ../supabase/migrations/202611100001_daily_usage_totals.sql

set role service_role;
insert into public.ai_usage_ledger(id,user_id,request_id,call_id,attempt,bot_key,project_name,operation,model_provider,model_name,status,created_at)
values
 (gen_random_uuid(),'00000000-0000-0000-0000-000000000002',gen_random_uuid(),gen_random_uuid(),1,'mxml4','MxML','analyze','gcp-deepmind','geminipro3_1','pending','2050-01-02 20:00Z'),
 (gen_random_uuid(),'00000000-0000-0000-0000-000000000002',gen_random_uuid(),gen_random_uuid(),1,'mxml4','MxML','analyze','gcp-deepmind','geminipro3_1','pending','2050-01-03 20:00Z');
insert into public.ai_usage_ledger(id,user_id,request_id,call_id,attempt,bot_key,project_name,operation,model_provider,model_name,status,created_at,completed_at,input_tokens,output_tokens,cost_usd)
values (gen_random_uuid(),'00000000-0000-0000-0000-000000000002',gen_random_uuid(),gen_random_uuid(),1,'mxml4','MxML','analyze','gcp-deepmind','geminipro3_1','succeeded','2050-01-04 01:00Z','2050-01-04 01:01Z',0,0,0);
reset role;
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001"}';
set timezone='America/Los_Angeles';
do $$ declare r record; begin
  if (select count(*) from public.ai_usage_daily_totals('2050-01-01','2050-01-05')) <> 5 then raise exception 'Missing days'; end if;
  select * into strict r from public.ai_usage_daily_totals('2050-01-01','2050-01-01');
  if r.request_count is distinct from 1 or r.attempt_count is distinct from 2 or r.known_input_tokens is distinct from 1010
     or r.known_output_tokens is distinct from 105 or r.known_accounted_cost_usd is distinct from 0.00008 then
    raise exception 'Cross-midnight retry/UTC grouping failed: %', row_to_json(r); end if;
  select * into strict r from public.ai_usage_daily_totals('2050-01-02','2050-01-02');
  if r.request_count is distinct from 3 or r.active_users is distinct from 2 or r.requests_with_tokens is distinct from 2
     or r.requests_with_accounted_cost is distinct from 2 or r.known_input_tokens is distinct from 2000
     or r.known_output_tokens is distinct from 1050 or r.known_accounted_cost_usd is distinct from 0.013 then
    raise exception 'All-user totals or incomplete coverage incorrect: %', row_to_json(r); end if;
  select * into strict r from public.ai_usage_daily_totals('2050-01-03','2050-01-03');
  if r.request_count is distinct from 1 or r.known_input_tokens is not null or r.known_output_tokens is not null
     or r.known_accounted_cost_usd is not null then raise exception 'Unknown activity became zero'; end if;
  select * into strict r from public.ai_usage_daily_totals('2050-01-04','2050-01-04');
  if r.request_count is distinct from 1 or r.known_accounted_cost_usd is distinct from 0 then raise exception 'Real zero cost lost'; end if;
  select * into strict r from public.ai_usage_daily_totals('2050-01-05','2050-01-05');
  if r.request_count is distinct from 0 or r.active_users is distinct from 0 or r.known_input_tokens is distinct from 0
    or r.known_accounted_cost_usd is distinct from 0 then raise exception 'Empty day not zero'; end if;
  begin
    perform * from public.ai_usage_daily_totals('2050-01-01','2051-01-02');
    raise exception 'Unbounded report allowed';
  exception when invalid_parameter_value then null; end;
end $$;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000002"}';
do $$ begin
  begin perform * from public.ai_usage_daily_totals('2050-01-01','2050-01-05'); raise exception 'Non-admin daily report allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform * from public.ai_usage_daily_totals('2050-01-01','2050-01-05'); raise exception 'Anonymous daily report allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: all-user daily totals, UTC retries, exact costs, incomplete/zero coverage, bounds and admin-only access' as result;
