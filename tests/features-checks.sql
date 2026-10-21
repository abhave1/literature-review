-- Permission checks for the disposable local test database only.
\set ON_ERROR_STOP on
do $$ begin
  begin
    insert into public.project_features(project_id,feature_id) select project_id,feature_id from public.project_features limit 1;
    raise exception 'Duplicate feature allowed';
  exception when unique_violation then null; end;
  begin
    update public.project_features set feature_id='00000000-0000-0000-0000-000000000099' where id=(select id from public.project_features limit 1);
    raise exception 'Missing feature FK accepted';
  exception when foreign_key_violation then null; end;
  begin
    update public.user_project_feature_permissions set project_feature_id=(select pf.id from public.project_features pf join public.projects p on p.id=pf.project_id where p.name='CSCL' limit 1)
      where project_feature_id=(select project_feature_id from public.user_project_feature_permissions limit 1);
    raise exception 'Cross-project assignment accepted';
  exception when foreign_key_violation then null; end;
end $$;
set role authenticated;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000002"}';
do $$ begin
  if (select count(*) from public.user_feature_access)<>1 or exists(select from public.user_feature_access where code<>'permanent_upload') then raise exception 'External feature access incorrect'; end if;
  if exists(select from public.user_project_feature_permissions where user_id<>auth.uid()) then raise exception 'RLS leak'; end if;
  begin perform public.admin_access_snapshot(); raise exception 'External admin RPC allowed'; exception when insufficient_privilege then null; end;
  begin update public.project_features set enabled=true; raise exception 'External feature write allowed'; exception when insufficient_privilege then null; end;
  begin perform public.admin_set_project_feature((select id from public.project_features limit 1),false); raise exception 'External toggle allowed'; exception when insufficient_privilege then null; end;
end $$;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001"}';
do $$ declare pid uuid; fid uuid; bid uuid; begin
  if (select count(*) from public.user_feature_access)<>4 then raise exception 'Disabled project feature bypassed by admin'; end if;
  if jsonb_array_length(public.admin_access_snapshot()->'features')<>2 then raise exception 'Snapshot catalog missing'; end if;
  select id into pid from public.projects where name='MxML';
  select id into bid from public.bots where key='mxml4';
  select pf.id into fid from public.project_features pf join public.features f on f.id=pf.feature_id where pf.project_id=pid and f.code='prompt_access';
  begin
    perform public.admin_save_user_project('00000000-0000-0000-0000-000000000002',pid,true,array[bid],array[fid]);
    raise exception 'Prompt assigned to external user';
  exception when raise_exception then if sqlerrm<>'Invalid bot or feature assignment' then raise; end if; end;
  select pf.id into fid from public.project_features pf join public.features f on f.id=pf.feature_id where pf.project_id=pid and f.code='permanent_upload';
  perform public.admin_save_user_project('00000000-0000-0000-0000-000000000002',pid,true,array[bid],array[fid]);
  perform public.admin_set_project_feature(fid,false);
end $$;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000002"}';
do $$ begin
  if exists(select from public.user_feature_access) then raise exception 'Disabled feature still usable'; end if;
  if (select count(*) from public.user_bot_access)<>1 then raise exception 'Feature toggle changed bot access'; end if;
end $$;
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000001"}';
select public.admin_save_user_project('00000000-0000-0000-0000-000000000002',(select id from public.projects where name='MxML'),false,'{}','{}');
set request.jwt.claims='{"sub":"00000000-0000-0000-0000-000000000002"}';
do $$ begin
  if exists(select from public.user_project_feature_permissions) or exists(select from public.user_bot_access) then raise exception 'Membership revocation failed'; end if;
end $$;
reset role;
set role anon;
do $$ begin
  begin perform * from public.user_feature_access; raise exception 'Anonymous permissions exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: normalization, preservation, FKs, RLS, admin RPCs, feature disable and membership revocation' as result;
