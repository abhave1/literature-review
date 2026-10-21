begin;

-- Refuse to silently widen permissions if the preflight grant set has changed.
do $$ begin
  if (select count(*) from public.bot_access) <> 22
    or exists (select 1 from public.bot_access where email not in
      ('cat.study.asu@gmail.com', 'abhaveabhilash@gmail.com')) then
    raise exception 'Legacy grants changed; review migration before applying';
  end if;
end $$;

create table public.roles (
  id text primary key check (id ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.role_bot_access (
  role_id text not null references public.roles(id) on delete cascade,
  bot_id text not null check (bot_id in (
    'icap', 'icap-internal', 'mxml1', 'screening',
    'mxml4', 'mxml4-internal', 'mxml4-open', 'mxml4-open-internal',
    'cscl-screening', 'cscl-close', 'cscl-open'
  )),
  primary key (role_id, bot_id)
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id text not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);
create index user_roles_role_id_idx on public.user_roles(role_id);

-- Pre-approve people who have not signed in yet. Consumed invitations never
-- restore a role that an administrator subsequently revoked.
create table public.role_invitations (
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  role_id text not null references public.roles(id) on delete cascade,
  claimed_by uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (email, role_id)
);
create index role_invitations_role_id_idx on public.role_invitations(role_id);
create index role_invitations_claimed_by_idx on public.role_invitations(claimed_by);

insert into public.roles (id, name, description) values
  ('admin', 'Administrator', 'All eleven bots, including internal uploads and prompt editing. Role management stays in the Supabase dashboard.'),
  ('mxml4_external', 'MxML4 external', 'External Yes/No and open-ended bots; temporary uploads only.'),
  ('icap_external', 'ICAP external', 'External ICAP bot only.');
insert into public.role_bot_access (role_id, bot_id)
  select distinct 'admin', bot_id from public.bot_access;
insert into public.role_bot_access (role_id, bot_id) values
  ('mxml4_external', 'mxml4'), ('mxml4_external', 'mxml4-open'),
  ('icap_external', 'icap');
insert into public.role_invitations (email, role_id)
  select distinct email, 'admin' from public.bot_access;

-- Bind existing verified accounts by immutable auth user ID.
insert into public.user_roles (user_id, role_id)
  select u.id, i.role_id from auth.users u join public.role_invitations i
    on i.email = lower(u.email) where u.email_confirmed_at is not null;
update public.role_invitations i set claimed_by = u.id
  from auth.users u where i.email = lower(u.email) and u.email_confirmed_at is not null;

create function public.claim_invited_roles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null then
    with claimed as (
      update public.role_invitations set claimed_by = new.id
      where email = lower(new.email) and claimed_by is null
      returning role_id
    )
    insert into public.user_roles (user_id, role_id)
      select new.id, role_id from claimed
      on conflict (user_id, role_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.claim_invited_roles() from public, anon, authenticated;
create trigger claim_research_bot_roles
  after insert or update of email_confirmed_at, last_sign_in_at on auth.users
  for each row execute function public.claim_invited_roles();

alter table public.roles enable row level security;
alter table public.role_bot_access enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_invitations enable row level security;
revoke all on public.roles, public.role_bot_access, public.user_roles,
  public.role_invitations from public, anon, authenticated;
grant select on public.roles, public.role_bot_access, public.user_roles to authenticated;
grant all on public.roles, public.role_bot_access, public.user_roles,
  public.role_invitations to service_role;
create policy "Read own role assignments" on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Read assigned roles" on public.roles
  for select to authenticated using (id in
    (select role_id from public.user_roles where user_id = (select auth.uid())));
create policy "Read assigned bot permissions" on public.role_bot_access
  for select to authenticated using (role_id in
    (select role_id from public.user_roles where user_id = (select auth.uid())));

-- Invoker security preserves RLS across joins; multiple roles form a union.
create view public.user_bot_access with (security_invoker = true) as
  select distinct ur.user_id, rb.bot_id
  from public.user_roles ur join public.role_bot_access rb on rb.role_id = ur.role_id;
revoke all on public.user_bot_access from public, anon, authenticated;
grant select on public.user_bot_access to authenticated, service_role;

-- Retain the old records for audit; they no longer authorize application access.
revoke all on public.bot_access from public, anon, authenticated;
comment on table public.bot_access is 'Legacy email grants. Retained for audit only; use roles and user_roles.';
commit;
