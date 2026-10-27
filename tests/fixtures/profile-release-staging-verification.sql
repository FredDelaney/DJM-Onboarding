-- Run inside a transaction with the candidate migration, then ROLLBACK.
-- Every record created here is synthetic. Do not COMMIT this canary.
begin;
do $profile_canary$
declare
 t uuid:=gen_random_uuid(); other_t uuid:=gen_random_uuid();
 own_user uuid; agent_user uuid;
 p uuid:=gen_random_uuid(); other_p uuid:=gen_random_uuid();
 result jsonb; denied boolean; role_name text; signature text;
begin
 -- Reuse existing staff identities; account creation has a separate privacy-consent gate.
 -- Their existing memberships and profiles are untouched, and these test memberships roll back.
 select m.user_id into own_user from platform.tenant_memberships m
 join auth.users u on u.id=m.user_id
 where m.status='active' and m.role in ('owner','admin')
 order by m.is_primary desc,m.joined_at,m.user_id limit 1;
 select m.user_id into agent_user from platform.tenant_memberships m
 join auth.users u on u.id=m.user_id
 where m.status='active' and m.role in ('owner','admin','agent','operations','scout') and m.user_id<>own_user
 order by m.is_primary desc,m.joined_at,m.user_id limit 1;
 if own_user is null then raise exception 'An existing management identity is required for the rollback canary'; end if;
 -- Small staging fixtures may have only one staff identity. Exercise roles sequentially
 -- on the new synthetic membership, never on an existing agency membership.
 agent_user:=coalesce(agent_user,own_user);
 insert into platform.tenants(id,slug,status,metadata)
 values(t,'profile-release-qa-'||t::text,'active','{"synthetic_test_tenant":true}'),
       (other_t,'profile-release-foreign-'||other_t::text,'active','{"synthetic_test_tenant":true}');
 insert into platform.tenant_branding(tenant_id,display_name,support_email)
 values(t,'Synthetic profile canary','qa@example.invalid');
 insert into platform.tenant_memberships(tenant_id,user_id,role) values(t,own_user,'owner');
 if agent_user<>own_user then
  insert into platform.tenant_memberships(tenant_id,user_id,role) values(t,agent_user,'agent');
 end if;
 insert into public.players(id,tenant_id,first_name,last_name,primary_position,current_club,verification_status)
 values(p,t,'Synthetic','Profile canary','Centre back','Synthetic FC','reviewing'),
       (other_p,other_t,'Synthetic','Foreign player','Goalkeeper','Other synthetic FC','reviewing');
 insert into public.staff_player_access(player_id,staff_user_id,can_edit) values(p,agent_user,true);

 denied:=false;
 begin
  perform public.platform_server_publish_player_profile_snapshot(t,p,own_user,'{}');
 exception when others then
  if sqlerrm<>'verified_player_required' then raise; end if;
  denied:=true;
 end;
 if not denied then raise exception 'unverified publication accepted'; end if;

 if agent_user=own_user then update platform.tenant_memberships set role='agent' where tenant_id=t and user_id=agent_user; end if;
 result:=public.platform_server_confirm_player_profile_verification(t,p,agent_user,'operator_confirmation');
 if result->'player'->>'verification_status'<>'verified' or nullif(result->>'verified_at','') is null then
  raise exception 'assigned verification did not persist';
 end if;
 update public.staff_player_access set can_edit=false where player_id=p and staff_user_id=agent_user;
 denied:=false;
 begin
  perform public.platform_server_confirm_player_profile_verification(t,p,agent_user,'operator_confirmation');
 exception when others then
  if sqlerrm<>'agency_operator_access_required' then raise; end if;
  denied:=true;
 end;
 if not denied then raise exception 'revoked assignment retained verification rights'; end if;
 if agent_user=own_user then update platform.tenant_memberships set role='owner' where tenant_id=t and user_id=own_user; end if;

 denied:=false;
 begin
  perform public.platform_server_confirm_player_profile_verification(t,other_p,own_user,'operator_confirmation');
 exception when others then
  if sqlerrm<>'player_not_found' then raise; end if;
  denied:=true;
 end;
 if not denied then raise exception 'foreign player verification accepted'; end if;

 result:=public.platform_server_publish_player_profile_snapshot(t,p,own_user,'{"headline":"Synthetic club-facing canary"}');
 if result->'profile'->>'current_club'<>'Synthetic FC'
    or result->'profile'->>'contact_email'<>'qa@example.invalid'
    or result->'profile'->>'primary_position'<>'Centre back'
    or result->'profile'->>'published'<>'true' then
  raise exception 'published profile did not retain canonical facts and tenant contact';
 end if;
 if (select count(*) from platform.audit_events where tenant_id=t and action in ('player_profile.player_data_verified','player_profile.published'))<>2 then
  raise exception 'profile audit receipt missing';
 end if;
 foreach role_name in array array['anon','authenticated'] loop
  foreach signature in array array[
   'public.platform_server_confirm_player_profile_verification(uuid,uuid,uuid,text)',
   'public.platform_server_publish_player_profile_snapshot(uuid,uuid,uuid,jsonb)'
  ] loop
   if has_function_privilege(role_name,signature,'execute') then raise exception 'browser role can execute %',signature; end if;
  end loop;
 end loop;
 perform set_config('request.jwt.claim.sub',own_user::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',own_user,'role','authenticated')::text,true);
 update public.players set current_club='Updated synthetic FC' where id=p;
 if (select verification_status from public.players where id=p)<>'reviewing'
    or (select verified_at from public.players where id=p) is not null then
  raise exception 'edited facts retained stale verification';
 end if;
end;
$profile_canary$;
rollback;
