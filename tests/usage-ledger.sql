-- Empty disposable LOCAL database only. Never run on Supabase.
\set ON_ERROR_STOP on
\ir bot-identities.sql
\ir ../supabase/migrations/202610300001_ai_usage_ledger.sql

set role service_role;
insert into public.ai_usage_ledger(id,user_id,request_id,call_id,attempt,bot_key,project_name,operation,model_provider,model_name,status)
values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
 '20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1,
 'mxml4','MxML','analyze','gcp-deepmind','geminipro3_1','pending');
update public.ai_usage_ledger set status='succeeded',input_tokens=65,output_tokens=39,cost_usd=0.00091,completed_at=now()
where id='10000000-0000-0000-0000-000000000001';
do $$ begin
  if (select sum(input_tokens) from public.ai_usage_ledger) <> 65 then raise exception 'Service write failed'; end if;
  begin
    update public.ai_usage_ledger set input_tokens=-1;
    raise exception 'Negative tokens accepted';
  exception when check_violation then null; end;
end $$;
reset role;

set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000002"}';
do $$ begin
  if exists(select from public.ai_usage_ledger) then raise exception 'External user can read ledger'; end if;
  begin
    update public.ai_usage_ledger set input_tokens=0;
    raise exception 'External user can edit usage';
  exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001"}';
do $$ begin
  if (select count(*) from public.ai_usage_ledger) <> 1 then raise exception 'Admin cannot read usage'; end if;
  if (select count(*) from public.ai_usage_ledger where input_tokens <> 65 or output_tokens <> 39 or status <> 'succeeded') <> 0 then raise exception 'Unexpected usage'; end if;
  if has_table_privilege('authenticated','public.ai_usage_ledger','INSERT') or
     has_table_privilege('authenticated','public.ai_usage_ledger','UPDATE') or
     has_table_privilege('authenticated','public.ai_usage_ledger','DELETE') then raise exception 'Authenticated clients have mutation privileges'; end if;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform * from public.ai_usage_ledger;
    raise exception 'Anonymous ledger access allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: usage ledger migration, service writes, token constraints, admin-only read access' as result;
