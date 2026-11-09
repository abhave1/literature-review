-- Included by usage-ledger.sql on a disposable database.
\ir ../supabase/migrations/202611090002_usage_cost_estimates.sql

set role service_role;
insert into public.ai_usage_ledger (
  id,user_id,request_id,call_id,attempt,bot_key,project_name,operation,model_provider,model_name,
  status,input_tokens,output_tokens,cost_usd,created_at,completed_at,
  estimate_input_usd_per_million,estimate_output_usd_per_million,estimate_rate_version,estimate_rate_source
) values
  ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000004',1,
   'mxml4','MxML','analyze','gcp-deepmind','geminipro3_1','failed',1000,100,0,
   '2050-01-01 23:59Z','2050-01-01 23:59Z',2,12,'fixture-rate','https://example.test/rates'),
  ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000004',2,
   'mxml4','MxML','analyze','gcp-deepmind','geminipro3_1','succeeded',10,5,null,
   '2050-01-02 00:01Z','2050-01-02 00:01Z',2,12,'fixture-rate','https://example.test/rates'),
  ('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000006',1,
   'mxml4','MxML','analyze','gcp-deepmind','geminipro3_1','succeeded',2000,50,0.001,
   '2050-01-02 00:02Z','2050-01-02 00:02Z',2,12,'fixture-rate','https://example.test/rates'),
  ('10000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000007',1,
   'mxml4','MxML','analyze','gcp-deepmind','geminipro3_1','succeeded',0,1000,null,
   '2050-01-02 00:02Z','2050-01-02 00:02Z',2,12,'fixture-rate','https://example.test/rates');

do $$ declare r record; begin
  select * into strict r from public.ai_usage_request_totals('2050-01-01 00:00Z','2050-01-02 00:00Z');
  if r.attempt_count is distinct from 2 or r.call_count is distinct from 1
    or r.input_tokens is distinct from 1010 or r.output_tokens is distinct from 105
    or r.estimated_cost_usd is distinct from 0.00328 or r.accounted_cost_usd is distinct from 0.00008 or r.provider_cost_usd is not null
    then raise exception 'Retry/date window/cost precedence incorrect: %', row_to_json(r); end if;
  select * into strict r from public.ai_usage_user_totals() where user_id='00000000-0000-0000-0000-000000000002';
  if r.request_count is distinct from 3 or r.attempt_count is distinct from 6 or r.requests_with_estimates is distinct from 2
    or r.requests_with_accounted_cost is distinct from 2 or r.requests_with_tokens is distinct from 2
    or r.avg_estimated_usd_per_request is distinct from 0.00394 or r.avg_accounted_usd_per_request is distinct from 0.00054
    or r.avg_input_tokens_per_request is distinct from 1505 or r.avg_output_tokens_per_request is distinct from 77.5
    or r.known_accounted_cost_usd is distinct from 0.00108
    then raise exception 'User averages/coverage incorrect: %', row_to_json(r); end if;
  if (select avg_estimated_usd_per_request from public.ai_usage_user_totals()
    where user_id='00000000-0000-0000-0000-000000000001') is distinct from 0.012
    then raise exception 'Usage leaked between user aggregates'; end if;
  if (select accounted_cost_usd from public.ai_usage_request_totals()
    where request_id='20000000-0000-0000-0000-000000000001') is not null
    then raise exception 'Unknown retry treated as zero'; end if;
  begin
    update public.ai_usage_ledger set estimate_input_usd_per_million=2
      where id='10000000-0000-0000-0000-000000000001';
    raise exception 'Partial rate snapshot accepted';
  exception when check_violation then null; end;
end $$;
reset role;
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000002"}';
do $$ begin
  if exists(select from public.ai_usage_user_totals()) or exists(select from public.ai_usage_request_totals())
    then raise exception 'Non-admin can read usage reports'; end if;
end $$;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001"}';
do $$ begin
  if (select count(*) from public.ai_usage_user_totals()) <> 2 then raise exception 'Admin report missing users'; end if;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform * from public.ai_usage_user_totals(); raise exception 'Anonymous report allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: exact USD estimates, request-weighted user averages, retry coverage, date boundaries and report RLS' as result;
