begin;
-- Non-measurement Journals becomes a per-user MxML feature. Measurement Journals stays
-- part of the MxML4 bots. Admins receive it through user_feature_access like every
-- enabled feature; external users only when an admin grants it.
lock table public.features, public.project_features, public.user_project_feature_permissions in exclusive mode;
create temporary table feature_access_before_library on commit drop as select * from public.user_feature_access;

insert into public.features(code,name,description) values
  ('nonmeasurement_library','Non-measurement Journals','See, analyze, and add to the Non-measurement Journals library. Measurement Journals come with the bot.');
insert into public.project_features(project_id,feature_id,enabled)
  select p.id,f.id,true from public.projects p cross join public.features f
  where p.name='MxML' and f.code='nonmeasurement_library';

do $$ begin
  if (select count(*) from public.project_features pf join public.features f on f.id=pf.feature_id where f.code='nonmeasurement_library')<>1 then
    raise exception 'Library feature must exist exactly once, on MxML';
  end if;
  if exists (select * from feature_access_before_library except select * from public.user_feature_access) then
    raise exception 'Existing feature access changed';
  end if;
  if exists (select from public.user_feature_access a where a.code='nonmeasurement_library'
    and not exists (select from public.user_roles u join public.roles r on r.id=u.role_id where u.user_id=a.user_id and r.name='admin')) then
    raise exception 'A non-admin received the new library';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
