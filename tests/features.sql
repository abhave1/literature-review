-- Disposable, empty LOCAL PostgreSQL database only. Never run on Supabase.
\set ON_ERROR_STOP on
do $$ begin
  if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
grant usage on schema auth, public to anon, authenticated, service_role;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz);
insert into auth.users values('00000000-0000-0000-0000-000000000001','abhaveabhilash@gmail.com',now(),now());
\ir ../supabase/migrations/202610210001_bot_access.sql
insert into public.bot_access(email,bot_id) select 'abhaveabhilash@gmail.com',bot_id from public.bot_access;
\ir ../supabase/migrations/202610210002_roles.sql
\ir ../supabase/migrations/202610210003_user_bot_tags.sql
\ir ../supabase/migrations/202610210004_role_uuid.sql
\ir ../supabase/migrations/202610210005_bot_group_uuids.sql
\ir ../supabase/migrations/202610210006_projects.sql
\ir ../supabase/migrations/202610210007_project_permissions.sql
\ir ../supabase/migrations/202610210008_admin_access.sql

insert into auth.users values('00000000-0000-0000-0000-000000000002','external@example.invalid',now(),now());
insert into public.user_roles select '00000000-0000-0000-0000-000000000002',id,now() from public.roles where name='external';
insert into public.user_projects(user_id,project_id) select '00000000-0000-0000-0000-000000000002',id from public.projects where name='MxML';
insert into public.user_bot_grants(user_id,project_id,bot_id) select '00000000-0000-0000-0000-000000000002',project_id,id from public.bots where key='mxml4';
-- Include both allowed upload and a forbidden prompt grant to exercise preservation.
insert into public.user_project_setting_permissions(user_id,project_id,setting_id,allowed)
  select '00000000-0000-0000-0000-000000000002',s.project_id,s.id,true from public.project_settings s join public.projects p on p.id=s.project_id where p.name='MxML';
update public.project_settings set enabled=false where project_id=(select id from public.projects where name='ICAP');
create temporary table assignments_before as select * from public.user_project_setting_permissions;
\ir ../supabase/migrations/202610210009_features.sql

do $$ begin
  if (select count(*) from public.features)<>2 or (select count(*) from public.project_features)<>6 then raise exception 'Catalog normalization failed'; end if;
  if exists((select * from assignments_before except select * from public.user_project_feature_permissions)
    union all (select * from public.user_project_feature_permissions except select * from assignments_before)) then raise exception 'Assignment data changed'; end if;
end $$;
\ir features-checks.sql
