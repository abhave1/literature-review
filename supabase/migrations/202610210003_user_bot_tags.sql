begin;

-- This migration targets the reviewed, admin-only state. Stop if anyone has
-- assigned a researcher since the preflight; their permissions need migration.
lock table public.roles, public.user_roles, public.role_bot_access,
  public.role_invitations, public.bot_access in access exclusive mode;
do $$ begin
  if (select count(*) from public.roles) <> 3
    or exists (select 1 from public.roles where id not in ('admin','icap_external','mxml4_external'))
    or exists (select 1 from public.user_roles where role_id <> 'admin')
    or exists (select 1 from public.role_invitations where role_id <> 'admin')
    or (select count(*) from public.role_bot_access where role_id = 'admin') <> 11 then
    raise exception 'Role state changed; review before migrating';
  end if;
end $$;

-- Preserve old records without keeping the superseded model in the public API.
create schema research_bot_legacy;
revoke all on schema research_bot_legacy from public, anon, authenticated;
alter table public.roles set schema research_bot_legacy;
alter table public.user_roles set schema research_bot_legacy;
alter table public.role_bot_access set schema research_bot_legacy;
alter table public.role_invitations set schema research_bot_legacy;
alter table public.bot_access set schema research_bot_legacy;
revoke all on all tables in schema research_bot_legacy from public, anon, authenticated;

create table public.roles (
  id text primary key check (id in ('admin', 'external')),
  name text not null,
  description text not null,
  created_at timestamptz not null default now()
);
insert into public.roles(id, name, description) values
  ('admin', 'Admin', 'Access to every bot, including internal pages. Assignments are managed in Supabase.'),
  ('external', 'External', 'Access only to individually assigned bots. Internal pages are excluded.');

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_id text not null references public.roles(id),
  created_at timestamptz not null default now()
);
create index user_roles_role_id_idx on public.user_roles(role_id);
insert into public.user_roles(user_id, role_id, created_at)
  select user_id, role_id, created_at from research_bot_legacy.user_roles;

create table public.bot_groups (
  id text primary key,
  name text not null unique
);
insert into public.bot_groups(id, name) values
  ('icap', 'ICAP'), ('mxml1', 'MxML1'), ('mxml4', 'MxML4'),
  ('mxml-screening', 'MxML screening'), ('cscl', 'CSCL');

create table public.bots (
  id text primary key,
  group_id text not null references public.bot_groups(id),
  name text not null,
  path text not null unique check (left(path, 1) = '/'),
  internal_only boolean not null default false
);
create index bots_group_id_idx on public.bots(group_id);
insert into public.bots(id, group_id, name, path, internal_only) values
  ('icap', 'icap', 'ICAP external', '/', false),
  ('icap-internal', 'icap', 'ICAP internal', '/internal', true),
  ('mxml1', 'mxml1', 'Phase 1 analysis', '/mxml1', false),
  ('screening', 'mxml-screening', 'Metadata screening', '/screening', false),
  ('mxml4', 'mxml4', 'Yes/No external', '/mxml4', false),
  ('mxml4-internal', 'mxml4', 'Yes/No internal', '/internal/mxml4', true),
  ('mxml4-open', 'mxml4', 'Open-ended external', '/mxml4-open', false),
  ('mxml4-open-internal', 'mxml4', 'Open-ended internal', '/internal/mxml4-open', true),
  ('cscl-screening', 'cscl', 'Screening', '/metadata-screening-cscl-prototype', false),
  ('cscl-close', 'cscl', 'Closed-ended analysis', '/fulltext-analysis-close-ended-cscl-prototype', false),
  ('cscl-open', 'cscl', 'Open-ended analysis', '/fulltext-analysis-open-ended-cscl-prototype', false);

create table public.user_bot_grants (
  user_id uuid not null references public.user_roles(user_id) on delete cascade,
  bot_id text not null references public.bots(id),
  created_at timestamptz not null default now(),
  primary key (user_id, bot_id)
);
create index user_bot_grants_bot_id_idx on public.user_bot_grants(bot_id);
comment on table public.user_bot_grants is 'Individual bot tags for external users. Admins automatically have all bots; internal-only bots never authorize external users.';
comment on table public.user_roles is 'Exactly one role per assigned Auth user. External users need separate user_bot_grants rows.';
comment on table public.bot_groups is 'Organizational labels only. Membership does not grant every bot in the group.';

-- Preserve the existing one-time, verified-email admin preapproval. No new
-- invitation table or external invitation workflow is introduced.
create or replace function public.claim_invited_roles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null then
    with claimed as (
      update research_bot_legacy.role_invitations set claimed_by = new.id
      where email = lower(new.email) and claimed_by is null and role_id = 'admin'
      returning role_id
    )
    insert into public.user_roles(user_id, role_id)
      select new.id, role_id from claimed
      on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.claim_invited_roles() from public, anon, authenticated;

alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.bot_groups enable row level security;
alter table public.bots enable row level security;
alter table public.user_bot_grants enable row level security;
revoke all on public.roles, public.user_roles, public.bot_groups, public.bots,
  public.user_bot_grants from public, anon, authenticated;
grant select on public.roles, public.user_roles, public.bot_groups, public.bots,
  public.user_bot_grants to authenticated;
grant all on public.roles, public.user_roles, public.bot_groups, public.bots,
  public.user_bot_grants to service_role;

create policy "Read role catalog" on public.roles for select to authenticated using (true);
create policy "Read own role" on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Read bot groups" on public.bot_groups for select to authenticated using (true);
create policy "Read bot catalog" on public.bots for select to authenticated
  using (not internal_only or exists (
    select 1 from public.user_roles where user_id = (select auth.uid()) and role_id = 'admin'
  ));
create policy "Read own bot tags" on public.user_bot_grants for select to authenticated
  using (user_id = (select auth.uid()));

-- Retain the app's existing interface. Both branches use caller RLS; even an
-- accidentally assigned internal tag cannot authorize an external account.
create or replace view public.user_bot_access with (security_invoker = true) as
  select ur.user_id, b.id as bot_id
    from public.user_roles ur cross join public.bots b
    where ur.role_id = 'admin'
  union all
  select ur.user_id, b.id as bot_id
    from public.user_roles ur
    join public.user_bot_grants g on g.user_id = ur.user_id
    join public.bots b on b.id = g.bot_id
    where ur.role_id = 'external' and not b.internal_only;
revoke all on public.user_bot_access from public, anon, authenticated;
grant select on public.user_bot_access to authenticated, service_role;
comment on view public.user_bot_access is 'Effective app access: every bot for admins; explicitly tagged, non-internal bots for external users.';

-- Structural checks only; no synthetic users or application test runs.
do $$ begin
  if (select count(*) from public.roles) <> 2
    or (select count(*) from public.bot_groups) <> 5
    or (select count(*) from public.bots) <> 11
    or (select count(*) from public.bots where internal_only) <> 3
    or exists (
      select user_id, role_id from research_bot_legacy.user_roles
      except select user_id, role_id from public.user_roles
    ) then
    raise exception 'Schema or assignment preservation check failed';
  end if;
end $$;
commit;
