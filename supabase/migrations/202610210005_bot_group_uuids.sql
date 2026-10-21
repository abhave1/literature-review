begin;
lock table public.bot_groups, public.bots, public.user_bot_grants,
  public.roles, public.user_roles in access exclusive mode;

create temporary table group_uuid_map on commit drop as
  select id as old_id, gen_random_uuid() as new_id from public.bot_groups;
create temporary table bot_uuid_map on commit drop as
  select id as old_id, gen_random_uuid() as new_id from public.bots;
create temporary table bot_catalog_before on commit drop as
  select b.id as bot_key, g.name as group_name, b.name, b.path, b.internal_only
  from public.bots b join public.bot_groups g on g.id = b.group_id;
create temporary table bot_grants_before on commit drop as
  select user_id, bot_id from public.user_bot_grants;
create temporary table bot_access_before on commit drop as
  select user_id, bot_id from public.user_bot_access;

-- Keep readable routing keys separate from UUID identity. Retain the existing
-- view object and privileges while detaching its type dependencies atomically.
alter view public.user_bot_access rename column bot_id to bot_key;
create or replace view public.user_bot_access with (security_invoker = true) as
  select null::uuid as user_id, null::text as bot_key, null::uuid as bot_id where false;
alter table public.bots drop constraint bots_group_id_fkey;
alter table public.user_bot_grants drop constraint user_bot_grants_bot_id_fkey;

alter table public.bots add column key text;
update public.bots set key = id;
alter table public.bots alter column key set not null;
alter table public.bots add constraint bots_key_key unique (key);
comment on column public.bots.key is 'Stable application routing key, separate from the UUID primary key.';

update public.bot_groups g set id = m.new_id::text from group_uuid_map m where g.id = m.old_id;
update public.bots b set group_id = m.new_id::text from group_uuid_map m where b.group_id = m.old_id;
update public.bots b set id = m.new_id::text from bot_uuid_map m where b.id = m.old_id;
update public.user_bot_grants g set bot_id = m.new_id::text from bot_uuid_map m where g.bot_id = m.old_id;

alter table public.bot_groups alter column id type uuid using id::uuid;
alter table public.bot_groups alter column id set default gen_random_uuid();
alter table public.bots alter column id type uuid using id::uuid;
alter table public.bots alter column id set default gen_random_uuid();
alter table public.bots alter column group_id type uuid using group_id::uuid;
alter table public.user_bot_grants alter column bot_id type uuid using bot_id::uuid;
alter table public.bots add constraint bots_group_id_fkey
  foreign key (group_id) references public.bot_groups(id);
alter table public.user_bot_grants add constraint user_bot_grants_bot_id_fkey
  foreign key (bot_id) references public.bots(id);

create or replace view public.user_bot_access with (security_invoker = true) as
  select u.user_id, b.key as bot_key, b.id as bot_id
    from public.user_roles u join public.roles r on r.id = u.role_id
    cross join public.bots b where r.name = 'admin'
  union all
  select u.user_id, b.key as bot_key, b.id as bot_id
    from public.user_roles u join public.roles r on r.id = u.role_id
    join public.user_bot_grants g on g.user_id = u.user_id
    join public.bots b on b.id = g.bot_id
    where r.name = 'external' and not b.internal_only;
comment on view public.user_bot_access is 'Effective access: UUID user_id and bot_id, plus readable bot_key for app routing. Admins get all bots; external users get only assigned non-internal bots.';

-- Preserve catalog contents, group membership, assignments and effective access.
do $$ begin
  if exists (
    (select b.key, g.name, b.name, b.path, b.internal_only from public.bots b
      join public.bot_groups g on g.id=b.group_id except select * from bot_catalog_before)
    union all
    (select * from bot_catalog_before except select b.key, g.name, b.name, b.path, b.internal_only
      from public.bots b join public.bot_groups g on g.id=b.group_id)
  ) or exists (
    (select g.user_id, b.key from public.user_bot_grants g join public.bots b on b.id=g.bot_id
      except select * from bot_grants_before)
    union all
    (select * from bot_grants_before except select g.user_id, b.key
      from public.user_bot_grants g join public.bots b on b.id=g.bot_id)
  ) or exists (
    (select user_id, bot_key from public.user_bot_access except select * from bot_access_before)
    union all
    (select * from bot_access_before except select user_id, bot_key from public.user_bot_access)
  ) then
    raise exception 'UUID conversion changed catalog, group membership, grants or access';
  end if;
end $$;
commit;
