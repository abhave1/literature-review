-- Run only against an empty, disposable local PostgreSQL database:
-- psql -v ON_ERROR_STOP=1 -f tests/roles.sql <local connection>
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as
  $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
grant usage on schema auth, public to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz
);
insert into auth.users values
  ('00000000-0000-0000-0000-000000000001','abhaveabhilash@gmail.com',now(),now());
\ir ../supabase/migrations/202610210001_bot_access.sql
insert into public.bot_access(email,bot_id)
  select 'abhaveabhilash@gmail.com',bot_id from public.bot_access;
\ir ../supabase/migrations/202610210002_roles.sql

begin;
insert into public.role_invitations(email,role_id) values
  ('external@example.invalid','mxml4_external');
insert into auth.users values
  ('00000000-0000-0000-0000-000000000002','external@example.invalid',null,null),
  ('00000000-0000-0000-0000-000000000003','unknown@example.invalid',now(),now());
do $$ begin
  if exists(select 1 from public.user_roles where user_id='00000000-0000-0000-0000-000000000002')
    then raise exception 'Unverified email claimed invitation'; end if;
end $$;
update auth.users set email_confirmed_at=now() where id='00000000-0000-0000-0000-000000000002';

set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001"}';
do $$ begin
  if (select count(*) from public.user_bot_access) <> 11 then raise exception 'Admin permissions failed'; end if;
  if (select count(*) from public.user_roles) <> 1 then raise exception 'Assignment RLS leaked other users'; end if;
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000002"}';
do $$ begin
  if (select count(*) from public.user_bot_access) <> 2 then raise exception 'External permissions failed'; end if;
  if exists(select 1 from public.user_bot_access where bot_id not in ('mxml4','mxml4-open'))
    then raise exception 'External role leaked permissions'; end if;
  begin
    insert into public.user_roles values ('00000000-0000-0000-0000-000000000002','admin',now());
    raise exception 'Self-promotion allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.role_bot_access values ('mxml4_external','icap-internal');
    raise exception 'Permission editing allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.role_invitations;
    raise exception 'Invitations exposed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.bot_access;
    raise exception 'Legacy permissions exposed';
  exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000003"}';
do $$ begin
  if exists(select 1 from public.user_bot_access) then raise exception 'Unknown account granted access'; end if;
end $$;
reset role;

-- Multiple roles form a union; changing a role takes effect without a new JWT.
insert into public.user_roles(user_id,role_id) values
  ('00000000-0000-0000-0000-000000000002','icap_external');
set local role authenticated;
set local request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000002"}';
do $$ begin
  if (select count(*) from public.user_bot_access) <> 3 then raise exception 'Role union failed'; end if;
end $$;
reset role;
delete from public.user_roles where user_id='00000000-0000-0000-0000-000000000002';
update auth.users set last_sign_in_at=now() where id='00000000-0000-0000-0000-000000000002';
do $$ begin
  if exists(select 1 from public.user_roles where user_id='00000000-0000-0000-0000-000000000002')
    then raise exception 'Consumed invitation restored revoked roles'; end if;
  begin
    insert into public.user_roles(user_id,role_id) values
      ('00000000-0000-0000-0000-000000000099','admin');
    raise exception 'Missing user foreign key accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.user_roles(user_id,role_id) values
      ('00000000-0000-0000-0000-000000000001','nonexistent');
    raise exception 'Missing role foreign key accepted';
  exception when foreign_key_violation then null; end;
end $$;
set local role anon;
do $$ begin
  begin
    perform * from public.user_bot_access;
    raise exception 'Anonymous access allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: role permissions, RLS, FKs, invitation verification and revocation' as result;
