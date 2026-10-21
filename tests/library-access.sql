-- Empty disposable local database only; includes the full migration chain. Never run on Supabase.
\set ON_ERROR_STOP on
\ir bot-identities.sql
\ir ../supabase/migrations/202610210011_library_access.sql
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001"}';
do $$ begin
  if not exists(select from public.user_feature_access where code='nonmeasurement_library' and project_name='MxML') then raise exception 'Admin did not receive the library'; end if;
end $$;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000002"}';
do $$ begin
  if exists(select from public.user_feature_access where code='nonmeasurement_library') then raise exception 'External received the library without a grant'; end if;
end $$;
reset role;
-- An admin grant through the existing RPC is what gives an external user the library.
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001"}';
select public.admin_save_user_project('00000000-0000-0000-0000-000000000002',
  (select id from public.projects where name='MxML'), true,
  array(select id from public.bots where key='mxml4'),
  array(select pf.id from public.project_features pf join public.features f on f.id=pf.feature_id where f.code='nonmeasurement_library'));
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000002"}';
do $$ begin
  if not exists(select from public.user_feature_access where code='nonmeasurement_library') then raise exception 'Granted library not effective'; end if;
end $$;
reset role;
-- Disabling it project-wide removes it for everyone, admins included.
update public.project_features set enabled=false where feature_id=(select id from public.features where code='nonmeasurement_library');
set role authenticated;
do $$ begin
  if exists(select from public.user_feature_access where code='nonmeasurement_library') then raise exception 'Disabled library still granted'; end if;
end $$;
reset role;
select 'PASS: admins get the library, externals only when granted, project switch overrides' as result;
