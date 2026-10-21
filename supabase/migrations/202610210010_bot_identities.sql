begin;
lock table public.bots, public.user_bot_grants, public.user_roles, public.roles,
  public.user_projects, public.project_features, public.features,
  public.user_project_feature_permissions in access exclusive mode;

-- This migration targets the reviewed state: no assignments to variant rows.
-- Stop rather than silently widening access for an unexpected legacy grant.
do $$ begin
  if (select count(*) from public.bots) <> 11
    or (select count(*) from public.bots where key in ('icap-internal','mxml4-internal','mxml4-open-internal')) <> 3
    or exists(select 1 from public.user_bot_grants g join public.bots b on b.id=g.bot_id
      where b.key in ('icap-internal','mxml4-internal','mxml4-open-internal'))
    or exists(select 1 from public.bots b where b.key in ('icap-internal','mxml4-internal','mxml4-open-internal')
      and not exists(select 1 from public.bots canonical where canonical.key=replace(b.key,'-internal','') and canonical.project_id=b.project_id)) then
    raise exception 'Bot catalog or variant grants changed; review before consolidation';
  end if;
end $$;

create temporary table canonical_access_before on commit drop as
  select distinct user_id, replace(bot_key,'-internal','') as bot_key from public.user_bot_access;
create temporary table feature_access_before_bot_merge on commit drop as select * from public.user_feature_access;
create temporary table bot_grants_before_merge on commit drop as select * from public.user_bot_grants;

-- Preserve the three former bot rows privately. No users or grants are removed.
create table research_bot_legacy.bot_route_variants as
  select * from public.bots where key in ('icap-internal','mxml4-internal','mxml4-open-internal');
revoke all on research_bot_legacy.bot_route_variants from public, anon, authenticated;
delete from public.bots where key in ('icap-internal','mxml4-internal','mxml4-open-internal');
update public.bots set name=case key
  when 'icap' then 'ICAP analysis'
  when 'mxml1' then 'MxML1 analysis'
  when 'screening' then 'Metadata screening'
  when 'mxml4' then 'MxML4 Yes/No'
  when 'mxml4-open' then 'MxML4 Open-ended'
  when 'cscl-screening' then 'CSCL screening'
  when 'cscl-close' then 'CSCL closed-ended'
  when 'cscl-open' then 'CSCL open-ended'
  else name end;
alter table public.bots add constraint bots_no_route_variants
  check (key not in ('icap-internal','mxml4-internal','mxml4-open-internal'));
comment on table public.bots is 'One identity per research bot. Internal/external URLs are page variants defined in code; internal routes require the admin role.';
comment on view public.user_bot_access is 'Canonical bot access. Admins access all bots; external users require membership and assignment. Internal-page restrictions are enforced separately in application code.';

do $$ begin
  if (select count(*) from public.bots) <> 8 then raise exception 'Unexpected canonical bot count'; end if;
  if exists((select user_id,bot_key from public.user_bot_access except select * from canonical_access_before)
    union all (select * from canonical_access_before except select user_id,bot_key from public.user_bot_access)) then
    raise exception 'Canonical bot access changed';
  end if;
  if exists((select * from public.user_feature_access except select * from feature_access_before_bot_merge)
    union all (select * from feature_access_before_bot_merge except select * from public.user_feature_access)) then
    raise exception 'Feature access changed';
  end if;
  if exists((select * from public.user_bot_grants except select * from bot_grants_before_merge)
    union all (select * from bot_grants_before_merge except select * from public.user_bot_grants)) then
    raise exception 'User assignments changed';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
