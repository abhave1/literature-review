-- Empty disposable local database only; includes the full migration chain.
\set ON_ERROR_STOP on
\ir features.sql
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001"}';
select public.admin_save_user_project('00000000-0000-0000-0000-000000000002',
  (select id from public.projects where name='MxML'),true,
  array[(select id from public.bots where key='mxml4')],'{}');
reset role;
\ir ../supabase/migrations/202610210010_bot_identities.sql
set role authenticated;
do $$ begin
  if jsonb_array_length(public.admin_access_snapshot()->'bots')<>8 then raise exception 'Admin snapshot includes duplicate bots'; end if;
  if (select count(*) from public.bots b join public.projects p on p.id=b.project_id where p.name='MxML')<>4 then raise exception 'MxML must contain four bots'; end if;
  if (select count(*) from public.user_bot_access)<>8 then raise exception 'Admin canonical access incorrect'; end if;
end $$;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000002"}';
do $$ begin
  if (select count(*) from public.user_bot_access)<>1 or exists(select from public.user_bot_access where bot_key<>'mxml4') then raise exception 'External bot access changed'; end if;
  if exists(select from public.user_feature_access) then raise exception 'External gained feature permissions'; end if;
  begin perform * from research_bot_legacy.bot_route_variants; raise exception 'Variant archive exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: eight canonical bots, four MxML bots, unchanged external assignment, private archive' as result;
