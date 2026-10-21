begin;
-- Normalize definitions separately from project enablement. Preserve assignment IDs.
lock table public.project_settings, public.user_project_setting_permissions,
  public.user_projects, public.user_roles, public.roles, public.user_bot_grants,
  public.bots, public.projects in access exclusive mode;
create temporary table feature_access_before on commit drop as select * from public.user_project_permissions;
create temporary table bot_access_before_features on commit drop as select * from public.user_bot_access;

create table public.features (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null check (length(trim(name)) > 0),
  description text not null
);
insert into public.features(code,name,description) values
  ('prompt_access','System prompts','View and edit the system instructions used by bots. Available only to admins.'),
  ('permanent_upload','Permanent PDF uploads','Add PDFs to the shared library. Temporary uploads do not require this feature.');

-- Remove dependent derived objects, never user assignments.
drop view public.user_project_permissions;
drop function public.admin_save_user_project(uuid,uuid,boolean,uuid[],uuid[]);
drop function public.admin_set_project_setting(uuid,boolean);
alter table public.project_settings rename to project_features;
alter table public.project_features add column feature_id uuid references public.features(id);
update public.project_features pf set feature_id=f.id from public.features f where f.code=pf.key;
alter table public.project_features alter column feature_id set not null;
alter table public.project_features drop column key;
alter table public.project_features add constraint project_features_project_feature_key unique(project_id,feature_id);
alter table public.project_features rename constraint project_settings_pkey to project_features_pkey;
alter table public.project_features rename constraint project_settings_project_id_fkey to project_features_project_id_fkey;
alter table public.project_features rename constraint project_settings_id_project_id_key to project_features_id_project_id_key;
alter table public.user_project_setting_permissions rename to user_project_feature_permissions;
alter table public.user_project_feature_permissions rename column setting_id to project_feature_id;
alter table public.user_project_feature_permissions rename constraint user_project_setting_permissions_pkey to user_project_feature_permissions_pkey;
alter table public.user_project_feature_permissions rename constraint user_project_setting_permissions_user_id_project_id_fkey to user_project_feature_permissions_membership_fkey;
alter table public.user_project_feature_permissions rename constraint user_project_setting_permissions_setting_id_project_id_fkey to user_project_feature_permissions_project_feature_fkey;
alter policy "Read project settings" on public.project_features rename to "Read project features";
alter policy "Read own setting permissions" on public.user_project_feature_permissions rename to "Read own feature permissions";

alter table public.features enable row level security;
revoke all on public.features from public, anon, authenticated;
grant select on public.features to authenticated;
grant all on public.features to service_role;
create policy "Read feature catalog" on public.features for select to authenticated using (true);

create view public.user_feature_access with (security_invoker=true) as
  select u.user_id, pf.project_id, pf.id as project_feature_id, p.name as project_name, f.code
  from public.user_roles u join public.roles r on r.id=u.role_id
  cross join public.project_features pf join public.features f on f.id=pf.feature_id
  join public.projects p on p.id=pf.project_id
  where r.name='admin' and pf.enabled
  union all
  select u.user_id, pf.project_id, pf.id, p.name, f.code
  from public.user_roles u join public.roles r on r.id=u.role_id
  join public.user_project_feature_permissions g on g.user_id=u.user_id and g.allowed
  join public.user_projects m on m.user_id=g.user_id and m.project_id=g.project_id
  join public.project_features pf on pf.id=g.project_feature_id and pf.project_id=g.project_id
  join public.features f on f.id=pf.feature_id
  join public.projects p on p.id=pf.project_id
  where r.name='external' and pf.enabled and f.code<>'prompt_access';
revoke all on public.user_feature_access from public, anon, authenticated;
grant select on public.user_feature_access to authenticated, service_role;
comment on table public.features is 'Shared catalog of implemented application features. Code identifies behavior; UUID id is used by all foreign keys.';
comment on table public.project_features is 'Enables a catalog feature within one project. Disabled features are unavailable to everyone.';
comment on table public.user_project_feature_permissions is 'Explicit permission for a feature in a project where the user is a member. Prompts remain admin-only.';
comment on view public.user_feature_access is 'Effective feature permissions after role, membership, project enablement, and user permission checks.';
create or replace function public.admin_access_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  return jsonb_build_object(
    'users', coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'role',r.name) order by u.email)
      from auth.users u left join public.user_roles a on a.user_id=u.id left join public.roles r on r.id=a.role_id), '[]'::jsonb),
    'projects', (select jsonb_agg(p order by p.name) from public.projects p),
    'bots', (select jsonb_agg(b order by b.name) from public.bots b),
    'features', (select jsonb_agg(f order by f.name) from public.features f),
    'projectFeatures', (select jsonb_agg(pf order by pf.id) from public.project_features pf),
    'memberships', coalesce((select jsonb_agg(m) from public.user_projects m),'[]'::jsonb),
    'grants', coalesce((select jsonb_agg(g) from public.user_bot_grants g),'[]'::jsonb),
    'permissions', coalesce((select jsonb_agg(p) from public.user_project_feature_permissions p),'[]'::jsonb));
end;
$$;

create function public.admin_save_user_project(target_user_id uuid, target_project_id uuid,
  is_member boolean, bot_ids uuid[], project_feature_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  if is_member is null or bot_ids is null or project_feature_ids is null then raise exception 'Missing assignments'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));
  if not exists(select 1 from auth.users where id=target_user_id)
    or not exists(select 1 from public.projects where id=target_project_id) then raise exception 'Unknown user or project'; end if;
  if exists(select 1 from public.user_roles u join public.roles r on r.id=u.role_id where u.user_id=target_user_id and r.name='admin') then
    raise exception 'Admins already have every project and bot';
  end if;
  if exists(select 1 from unnest(bot_ids) i where not exists(select 1 from public.bots b where b.id=i and b.project_id=target_project_id))
    or exists(select 1 from unnest(project_feature_ids) i where not exists(select 1 from public.project_features s join public.features f on f.id=s.feature_id where s.id=i and s.project_id=target_project_id and s.enabled and f.code<>'prompt_access')) then
    raise exception 'Invalid bot or feature assignment';
  end if;
  if not is_member and (cardinality(bot_ids)>0 or cardinality(project_feature_ids)>0) then raise exception 'Membership required'; end if;
  if not is_member then
    delete from public.user_projects where user_id=target_user_id and project_id=target_project_id;
    return;
  end if;
  insert into public.user_roles(user_id,role_id)
    select target_user_id,id from public.roles where name='external' on conflict(user_id) do nothing;
  insert into public.user_projects(user_id,project_id) values(target_user_id,target_project_id) on conflict do nothing;
  delete from public.user_bot_grants where user_id=target_user_id and project_id=target_project_id;
  insert into public.user_bot_grants(user_id,project_id,bot_id)
    select target_user_id,target_project_id,i from (select distinct unnest(bot_ids) i) b;
  delete from public.user_project_feature_permissions where user_id=target_user_id and project_id=target_project_id;
  insert into public.user_project_feature_permissions(user_id,project_id,project_feature_id,allowed)
    select target_user_id,target_project_id,i,true from (select distinct unnest(project_feature_ids) i) s;
end;
$$;

create function public.admin_set_project_feature(target_project_feature_id uuid, is_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  if is_enabled is null then raise exception 'Enabled is required'; end if;
  update public.project_features set enabled=is_enabled where id=target_project_feature_id;
  if not found then raise exception 'Unknown project feature'; end if;
end;
$$;
revoke all on function public.admin_access_snapshot(), public.admin_save_user_project(uuid,uuid,boolean,uuid[],uuid[]), public.admin_set_project_feature(uuid,boolean) from public, anon, authenticated;
grant execute on function public.admin_access_snapshot(), public.admin_save_user_project(uuid,uuid,boolean,uuid[],uuid[]), public.admin_set_project_feature(uuid,boolean) to authenticated;

-- Symmetric comparisons abort the entire migration on any access change.
do $$ begin
  if exists ((select * from public.user_feature_access except select * from feature_access_before)
    union all (select * from feature_access_before except select * from public.user_feature_access)) then
    raise exception 'Feature access changed during normalization';
  end if;
  if exists ((select * from public.user_bot_access except select * from bot_access_before_features)
    union all (select * from bot_access_before_features except select * from public.user_bot_access)) then
    raise exception 'Bot access changed during normalization';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
