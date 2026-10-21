-- Apply only after reviewing/approving this migration against the target project.
create table public.bot_access (
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  bot_id text not null check (bot_id in (
    'icap', 'icap-internal', 'mxml1', 'screening',
    'mxml4', 'mxml4-internal', 'mxml4-open', 'mxml4-open-internal',
    'cscl-screening', 'cscl-close', 'cscl-open'
  )),
  created_at timestamptz not null default now(),
  primary key (email, bot_id)
);

alter table public.bot_access enable row level security;
revoke all on public.bot_access from anon, authenticated;
grant select on public.bot_access to authenticated;

-- Only trusted dashboard/database administrators manage grants.
-- Users can see their own grants; they cannot insert or edit them.
create policy "Read own bot grants" on public.bot_access
  for select to authenticated
  using (email = lower((select auth.jwt() ->> 'email')));

-- Initial project owner, preauthorized by email before their first Google login.
insert into public.bot_access (email, bot_id)
select 'cat.study.asu@gmail.com', bot_id from unnest(array[
  'icap', 'icap-internal', 'mxml1', 'screening',
  'mxml4', 'mxml4-internal', 'mxml4-open', 'mxml4-open-internal',
  'cscl-screening', 'cscl-close', 'cscl-open'
]) as bot_id;
