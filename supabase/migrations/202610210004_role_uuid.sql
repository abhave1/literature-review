begin;
lock table public.roles, public.user_roles, public.bots, public.user_bot_grants
  in access exclusive mode;

create temporary table role_uuid_map on commit drop as
  select id as old_id, gen_random_uuid() as new_id from public.roles;
create temporary table role_assignments_before on commit drop as
  select user_id, role_id from public.user_roles;
create temporary table bot_permissions_before on commit drop as
  select user_id, bot_id from public.user_bot_access;
do $$ begin
  if (select count(*) from role_uuid_map) <> 2
    or exists(select 1 from role_uuid_map where old_id not in ('admin','external')) then
    raise exception 'Unexpected roles; review UUID migration';
  end if;
end $$;

-- Temporarily detach dependent expressions inside this atomic transaction.
-- No table or user data is deleted; existing primary keys remain primary keys.
create or replace view public.user_bot_access with (security_invoker = true) as
  select null::uuid as user_id, null::text as bot_id where false;
alter policy "Read bot catalog" on public.bots using (false);
alter table public.user_roles drop constraint user_roles_role_id_fkey;
alter table public.roles drop constraint roles_id_check;

update public.roles r set name = m.old_id, id = m.new_id::text
  from role_uuid_map m where r.id = m.old_id;
update public.user_roles u set role_id = m.new_id::text
  from role_uuid_map m where u.role_id = m.old_id;
alter table public.roles alter column id type uuid using id::uuid;
alter table public.roles alter column id set default gen_random_uuid();
alter table public.roles add constraint roles_name_key unique (name);
alter table public.roles add constraint roles_name_check check (name in ('admin','external'));
alter table public.user_roles alter column role_id type uuid using role_id::uuid;
alter table public.user_roles add constraint user_roles_role_id_fkey
  foreign key (role_id) references public.roles(id);

alter policy "Read bot catalog" on public.bots using (
  not internal_only or exists (
    select 1 from public.user_roles u join public.roles r on r.id = u.role_id
    where u.user_id = (select auth.uid()) and r.name = 'admin'
  )
);
create or replace view public.user_bot_access with (security_invoker = true) as
  select u.user_id, b.id as bot_id
    from public.user_roles u join public.roles r on r.id = u.role_id
    cross join public.bots b where r.name = 'admin'
  union all
  select u.user_id, b.id as bot_id
    from public.user_roles u join public.roles r on r.id = u.role_id
    join public.user_bot_grants g on g.user_id = u.user_id
    join public.bots b on b.id = g.bot_id
    where r.name = 'external' and not b.internal_only;

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
      select new.id, r.id from claimed c join public.roles r on r.name = c.role_id
      on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.claim_invited_roles() from public, anon, authenticated;

-- Verify both directions: no lost assignments/access and no added access.
do $$ begin
  if exists (
    (select u.user_id, r.name from public.user_roles u join public.roles r on r.id=u.role_id
      except select user_id, role_id from role_assignments_before)
    union all
    (select user_id, role_id from role_assignments_before except
      select u.user_id, r.name from public.user_roles u join public.roles r on r.id=u.role_id)
  ) or exists (
    (select * from public.user_bot_access except select * from bot_permissions_before)
    union all
    (select * from bot_permissions_before except select * from public.user_bot_access)
  ) then
    raise exception 'UUID conversion changed assignments or permissions';
  end if;
end $$;
commit;
