begin;
lock table public.roles, public.user_roles, public.projects, public.bots, public.user_bot_grants in access exclusive mode;
create temporary table access_before on commit drop as select * from public.user_bot_access;
-- The previous internal flag is retained privately for historical reference.
create table research_bot_legacy.bot_visibility as select id, internal_only, path from public.bots;
revoke all on research_bot_legacy.bot_visibility from public, anon, authenticated;

create table public.user_projects (
  user_id uuid not null references public.user_roles(user_id) on delete cascade,
  project_id uuid not null references public.projects(id),
  created_at timestamptz not null default now(),
  primary key (user_id, project_id)
);
insert into public.user_projects(user_id, project_id)
  select distinct g.user_id, b.project_id from public.user_bot_grants g join public.bots b on b.id=g.bot_id;

create table public.project_settings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  key text not null check (key in ('prompt_access', 'permanent_upload')),
  enabled boolean not null default true,
  unique (project_id, key), unique (id, project_id)
);
insert into public.project_settings(project_id, key)
  select p.id, s.key from public.projects p cross join
    (values ('prompt_access'), ('permanent_upload')) s(key);

create table public.user_project_setting_permissions (
  user_id uuid not null,
  project_id uuid not null,
  setting_id uuid not null,
  allowed boolean not null default false,
  primary key (user_id, setting_id),
  foreign key (user_id, project_id) references public.user_projects(user_id, project_id) on delete cascade,
  foreign key (setting_id, project_id) references public.project_settings(id, project_id)
);
alter table public.bots add constraint bots_id_project_key unique (id, project_id);
alter table public.user_bot_grants add column project_id uuid;
update public.user_bot_grants g set project_id=b.project_id from public.bots b where b.id=g.bot_id;
alter table public.user_bot_grants alter column project_id set not null;
alter table public.user_bot_grants add constraint user_bot_grants_bot_project_fkey
  foreign key (bot_id, project_id) references public.bots(id, project_id);
alter table public.user_bot_grants add constraint user_bot_grants_user_project_fkey
  foreign key (user_id, project_id) references public.user_projects(user_id, project_id) on delete cascade;

create or replace view public.user_bot_access with (security_invoker=true) as
  select u.user_id, b.key as bot_key, b.id as bot_id
  from public.user_roles u join public.roles r on r.id=u.role_id cross join public.bots b where r.name='admin'
  union all
  select u.user_id, b.key, b.id from public.user_roles u join public.roles r on r.id=u.role_id
  join public.user_projects m on m.user_id=u.user_id
  join public.user_bot_grants g on g.user_id=m.user_id and g.project_id=m.project_id
  join public.bots b on b.id=g.bot_id and b.project_id=m.project_id where r.name='external';
drop policy "Read bot catalog" on public.bots;
create policy "Read bot catalog" on public.bots for select to authenticated using (true);
alter table public.bots drop column internal_only;
alter table public.bots drop column path;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_roles u join public.roles r on r.id=u.role_id
    where u.user_id=(select auth.uid()) and r.name='admin');
$$;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

alter table public.user_projects enable row level security;
alter table public.project_settings enable row level security;
alter table public.user_project_setting_permissions enable row level security;
revoke all on public.user_projects, public.project_settings, public.user_project_setting_permissions from public, anon, authenticated;
grant select on public.user_projects, public.project_settings, public.user_project_setting_permissions to authenticated;
grant all on public.user_projects, public.project_settings, public.user_project_setting_permissions to service_role;
create policy "Read own projects" on public.user_projects for select to authenticated using (user_id=(select auth.uid()));
create policy "Read project settings" on public.project_settings for select to authenticated using (true);
create policy "Read own setting permissions" on public.user_project_setting_permissions for select to authenticated using (user_id=(select auth.uid()));

create view public.user_project_permissions with (security_invoker=true) as
  select u.user_id, s.project_id, s.id as setting_id, p.name as project_name, s.key
  from public.user_roles u join public.roles r on r.id=u.role_id
  cross join public.project_settings s join public.projects p on p.id=s.project_id
  where r.name='admin' and s.enabled
  union all
  select u.user_id, s.project_id, s.id, p.name, s.key
  from public.user_roles u join public.roles r on r.id=u.role_id
  join public.user_project_setting_permissions g on g.user_id=u.user_id and g.allowed
  join public.user_projects m on m.user_id=g.user_id and m.project_id=g.project_id
  join public.project_settings s on s.id=g.setting_id and s.project_id=g.project_id
  join public.projects p on p.id=s.project_id
  where r.name='external' and s.enabled and s.key<>'prompt_access';
revoke all on public.user_project_permissions from public, anon, authenticated;
grant select on public.user_project_permissions to authenticated, service_role;
comment on table public.user_projects is 'Project membership. External users also need individual bot grants; admins automatically access every project.';
comment on table public.project_settings is 'Project-wide feature switches. Prompt access is always restricted to admins.';
comment on table public.user_project_setting_permissions is 'Per-user permissions within a project. Disabled project settings always win; prompt_access never applies to external users.';
comment on table public.user_bot_grants is 'Individual bot assignments, constrained to an existing membership in the same project.';
comment on view public.user_bot_access is 'Admins access every bot. External users need both project membership and the individual bot assignment.';
update public.roles set description=case name when 'admin' then 'All projects and bots; manage users and project settings; exclusive prompt access.' else 'Assigned projects and bots only; explicit project feature permissions; no prompt access.' end;
-- Fail atomically if an existing assignment would change access.
do $$ begin
  if exists ((select * from public.user_bot_access except select * from access_before)
    union all (select * from access_before except select * from public.user_bot_access)) then
    raise exception 'Existing bot access changed; review assignments before migration';
  end if;
end $$;
commit;
