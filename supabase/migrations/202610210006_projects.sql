begin;
lock table public.bot_groups, public.bots, public.roles,
  public.user_roles, public.user_bot_grants in access exclusive mode;

do $$ begin
  if (select count(*) from public.bot_groups) <> 5
    or exists (select 1 from public.bot_groups where name not in
      ('ICAP','MxML1','MxML4','MxML screening','CSCL')) then
    raise exception 'Unexpected group catalog; review project migration';
  end if;
end $$;
create temporary table bot_catalog_before on commit drop as
  select b.id, b.key, b.name, b.path, b.internal_only,
    case when g.name in ('MxML1','MxML4','MxML screening') then 'MxML'
      else g.name end as project_name
  from public.bots b join public.bot_groups g on g.id = b.group_id;
create temporary table bot_access_before on commit drop as
  select * from public.user_bot_access;

-- Preserve the superseded five-group catalog privately; no records are deleted.
alter table public.bot_groups set schema research_bot_legacy;
revoke all on research_bot_legacy.bot_groups from public, anon, authenticated;
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);
insert into public.projects(id, name)
  select id, case when name = 'MxML4' then 'MxML' else name end
  from research_bot_legacy.bot_groups where name in ('ICAP','MxML4','CSCL');

alter table public.bots drop constraint bots_group_id_fkey;
alter table public.bots rename column group_id to project_id;
update public.bots b set project_id = p.id
  from bot_catalog_before previous join public.projects p on p.name = previous.project_name
  where b.id = previous.id;
alter table public.bots add constraint bots_project_id_fkey
  foreign key (project_id) references public.projects(id);
alter index public.bots_group_id_idx rename to bots_project_id_idx;

alter table public.projects enable row level security;
revoke all on public.projects from public, anon, authenticated;
grant select on public.projects to authenticated;
grant all on public.projects to service_role;
create policy "Read project catalog" on public.projects
  for select to authenticated using (true);
comment on table public.projects is 'Research projects: ICAP, MxML, CSCL. Individual bots belong to exactly one project; project membership does not grant user access.';
comment on column public.bots.project_id is 'UUID foreign key to projects.id. Each bot belongs to one research project.';

do $$ begin
  if (select count(*) from public.projects) <> 3 or exists (
    (select b.id,b.key,b.name,b.path,b.internal_only,p.name from public.bots b
      join public.projects p on p.id=b.project_id except select * from bot_catalog_before)
    union all
    (select * from bot_catalog_before except select b.id,b.key,b.name,b.path,b.internal_only,p.name
      from public.bots b join public.projects p on p.id=b.project_id)
  ) or exists (
    (select * from public.user_bot_access except select * from bot_access_before)
    union all
    (select * from bot_access_before except select * from public.user_bot_access)
  ) then
    raise exception 'Project mapping or effective access preservation failed';
  end if;
end $$;
commit;
