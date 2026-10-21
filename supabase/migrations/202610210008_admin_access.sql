begin;
-- All writes are scoped, transactional operations. No browser table-write grants.
create function public.admin_access_snapshot() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  return jsonb_build_object(
    'users', coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'role',r.name) order by u.email)
      from auth.users u left join public.user_roles a on a.user_id=u.id left join public.roles r on r.id=a.role_id), '[]'::jsonb),
    'projects', (select jsonb_agg(p order by p.name) from public.projects p),
    'bots', (select jsonb_agg(b order by b.name) from public.bots b),
    'settings', (select jsonb_agg(s order by s.key) from public.project_settings s),
    'memberships', coalesce((select jsonb_agg(m) from public.user_projects m),'[]'::jsonb),
    'grants', coalesce((select jsonb_agg(g) from public.user_bot_grants g),'[]'::jsonb),
    'permissions', coalesce((select jsonb_agg(p) from public.user_project_setting_permissions p),'[]'::jsonb));
end;
$$;

create function public.admin_save_user_project(target_user_id uuid, target_project_id uuid,
  is_member boolean, bot_ids uuid[], setting_ids uuid[]) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  if is_member is null or bot_ids is null or setting_ids is null then raise exception 'Missing assignments'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));
  if not exists(select 1 from auth.users where id=target_user_id)
    or not exists(select 1 from public.projects where id=target_project_id) then raise exception 'Unknown user or project'; end if;
  if exists(select 1 from public.user_roles u join public.roles r on r.id=u.role_id where u.user_id=target_user_id and r.name='admin') then
    raise exception 'Admins already have every project and bot';
  end if;
  if exists(select 1 from unnest(bot_ids) i where not exists(select 1 from public.bots b where b.id=i and b.project_id=target_project_id))
    or exists(select 1 from unnest(setting_ids) i where not exists(select 1 from public.project_settings s where s.id=i and s.project_id=target_project_id and s.enabled and s.key<>'prompt_access')) then
    raise exception 'Invalid bot or setting assignment';
  end if;
  if not is_member and (cardinality(bot_ids)>0 or cardinality(setting_ids)>0) then raise exception 'Membership required'; end if;
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
  delete from public.user_project_setting_permissions where user_id=target_user_id and project_id=target_project_id;
  insert into public.user_project_setting_permissions(user_id,project_id,setting_id,allowed)
    select target_user_id,target_project_id,i,true from (select distinct unnest(setting_ids) i) s;
end;
$$;

create function public.admin_set_project_setting(target_setting_id uuid, is_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Admin required' using errcode='42501'; end if;
  if is_enabled is null then raise exception 'Enabled is required'; end if;
  update public.project_settings set enabled=is_enabled where id=target_setting_id;
  if not found then raise exception 'Unknown project setting'; end if;
end;
$$;
revoke all on function public.admin_access_snapshot(), public.admin_save_user_project(uuid,uuid,boolean,uuid[],uuid[]), public.admin_set_project_setting(uuid,boolean) from public, anon, authenticated;
grant execute on function public.admin_access_snapshot(), public.admin_save_user_project(uuid,uuid,boolean,uuid[],uuid[]), public.admin_set_project_setting(uuid,boolean) to authenticated;
commit;
