-- Staging ltvmopvarlnidiozvpow only. Synthetic identities and rows; no external send.
-- Execute only after the reviewed entrypoint migration. Every change rolls back.
begin;
set local lock_timeout='5s';set local statement_timeout='30s';
do $canary$
declare ta uuid:=gen_random_uuid();tb uuid:=gen_random_uuid();u uuid:=gen_random_uuid();invite uuid:=gen_random_uuid();email text;
 club uuid:=gen_random_uuid();person uuid:=gen_random_uuid();player uuid:=gen_random_uuid();prospect uuid:=gen_random_uuid();need uuid:=gen_random_uuid();deal uuid:=gen_random_uuid();
 history_player uuid:=gen_random_uuid();history_prospect uuid:=gen_random_uuid();agency uuid:=gen_random_uuid();player_person uuid:=gen_random_uuid();rows jsonb;r jsonb;result jsonb;denied boolean;role_name text;operation text;bad_confirm boolean;
begin
 insert into platform.tenants(id,slug,status,metadata) values(ta,'qa-entity-management-'||ta,'active','{"synthetic":true}'),(tb,'qa-entity-management-'||tb,'active','{"synthetic":true}');
 email:='qa-entity-management-'||u||'@example.test';
 insert into platform.tenant_staff_invites(id,tenant_id,email,role,token_hash,expires_at,metadata) values(invite,ta,email,'agent',md5(invite::text)||md5(u::text),now()+interval '1 hour','{"synthetic":true}');
 insert into auth.users(id,email,role,aud,raw_app_meta_data,raw_user_meta_data) values(u,email,'authenticated','authenticated',jsonb_build_object('invitation_kind','agency_staff','staff_invite_id',invite,'invited_tenant_id',ta),'{"full_name":"Entity Management Canary"}');
 insert into platform.tenant_memberships(tenant_id,user_id,role,status) values(ta,u,'owner','active'),(tb,u,'admin','active');
 if exists(select 1 from djm_os.team_members where user_id=u) then raise exception 'Unexpected global staff dependency';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-redream-workspace','qa-entity-management-'||ta)::text,true);
 insert into djm_os.organisations(id,tenant_id,name,organisation_type) values(club,ta,'[QA rollback] Management FC','club'),(agency,ta,'[QA rollback] Management Agency','agency');
 insert into djm_os.people(id,tenant_id,full_name,person_type) values(person,ta,'[QA rollback] Management Contact','club_contact'),(player_person,ta,'[QA rollback] Player Person','player');
 insert into public.players(id,tenant_id,first_name,last_name) values(player,ta,'[QA rollback]','Management Player');
 insert into djm_os.scouting_prospects(id,tenant_id,full_name) values(prospect,ta,'[QA rollback] Management Prospect');
 insert into djm_os.club_needs(id,tenant_id,organisation_id,title,position) values(need,ta,club,'[QA rollback] Management Need','Striker');
 insert into djm_os.deal_rooms(id,tenant_id,organisation_id,player_id,title) values(deal,ta,club,player,'[QA rollback] Management Deal');
 insert into djm_os.employments(tenant_id,person_id,organisation_id,role_title,is_current) values(ta,person,club,'Director',true);
 rows:=jsonb_build_array(
  jsonb_build_object('kind','player','id',player,'patch',jsonb_build_object('preferred_name','[QA rollback] Updated Player')),
  jsonb_build_object('kind','club','id',club,'patch',jsonb_build_object('name','[QA rollback] Updated Management FC')),
  jsonb_build_object('kind','club_contact','id',person,'patch',jsonb_build_object('full_name','[QA rollback] Updated Contact','role_title','Sporting Director')),
  jsonb_build_object('kind','recruitment_target','id',prospect,'patch',jsonb_build_object('full_name','[QA rollback] Updated Prospect')),
  jsonb_build_object('kind','club_need','id',need,'patch','{}'::jsonb),
  jsonb_build_object('kind','deal_room','id',deal,'patch',jsonb_build_object('title','[QA rollback] Updated Deal')));
 set local role authenticated;
 for r in select * from jsonb_array_elements(rows) loop
  if r->>'kind'<>'club_need' then
   result:=public.redream_entity_patch(r->>'kind',(r->>'id')::uuid,r->'patch');
   if result->>'ok'<>'true' or result->>'id'<>r->>'id' then raise exception 'Edit acknowledgement mismatch';end if;
  end if;
  result:=public.redream_entity_archive(r->>'kind',(r->>'id')::uuid,true);
  if result->>'archived'<>'true' then raise exception 'Archive acknowledgement mismatch';end if;
  if not exists(select 1 from jsonb_array_elements(public.redream_entity_archives()->'items') x where x->>'entity_id'=r->>'id') then raise exception 'Archive projection missing';end if;
  result:=public.redream_entity_archive(r->>'kind',(r->>'id')::uuid,false);
  if result->>'archived'<>'false' then raise exception 'Restore acknowledgement mismatch';end if;
  result:=public.redream_entity_action_preview(r->>'kind',(r->>'id')::uuid);
  if result->>'can_delete'<>'true' then raise exception 'Owner delete preview unavailable';end if;
 end loop;
 denied:=false;begin perform public.djm_entity_patch_v1('club',club,'{"name":"Forbidden direct call"}');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Private canonical writer exposed';end if;
 for bad_confirm in select unnest(array[false,null]::boolean[]) loop
  denied:=false;begin perform public.redream_entity_delete('club',club,bad_confirm);exception when invalid_parameter_value then denied:=true;end;
  if not denied then raise exception 'Unconfirmed deletion admitted';end if;
 end loop;
 denied:=false;begin perform public.redream_entity_patch('club_need',need,'{"title":"Bypass"}');exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Versioned club-brief bypass admitted';end if;
 denied:=false;begin perform public.redream_entity_patch('club',club,jsonb_build_object('tenant_id',tb));exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Tenant field patch admitted';end if;
 for r in select * from jsonb_array_elements(jsonb_build_array(jsonb_build_object('kind','club','id',agency),jsonb_build_object('kind','club_contact','id',player_person))) loop
  for operation in select unnest(array['patch','archive','delete']) loop
   denied:=false;begin
    if operation='patch' then perform public.redream_entity_patch(r->>'kind',(r->>'id')::uuid,'{}');
    elsif operation='archive' then perform public.redream_entity_archive(r->>'kind',(r->>'id')::uuid,true);
    else perform public.redream_entity_delete(r->>'kind',(r->>'id')::uuid,true);end if;
   exception when insufficient_privilege then denied:=true;end;
   if not denied then raise exception 'Record type alias admitted';end if;
  end loop;
 end loop;
 reset role;
 if (select preferred_name from public.players where id=player)<>'[QA rollback] Updated Player'
  or (select name from djm_os.organisations where id=club)<>'[QA rollback] Updated Management FC'
  or (select full_name from djm_os.people where id=person)<>'[QA rollback] Updated Contact'
  or (select role_title from djm_os.employments where tenant_id=ta and person_id=person and is_current)<>'Sporting Director'
  or (select full_name from djm_os.scouting_prospects where id=prospect)<>'[QA rollback] Updated Prospect'
  or (select title from djm_os.deal_rooms where id=deal)<>'[QA rollback] Updated Deal' then raise exception 'Canonical edit did not persist';end if;
 -- Both memberships are administrative. Only the selected workspace may be managed.
 perform set_config('request.headers',jsonb_build_object('x-redream-workspace','qa-entity-management-'||tb)::text,true);
 set local role authenticated;
 for r in select * from jsonb_array_elements(rows) loop
  for operation in select unnest(array['patch','archive','delete']) loop
   denied:=false;begin
    if operation='patch' then perform public.redream_entity_patch(r->>'kind',(r->>'id')::uuid,r->'patch');
    elsif operation='archive' then perform public.redream_entity_archive(r->>'kind',(r->>'id')::uuid,true);
    else perform public.redream_entity_delete(r->>'kind',(r->>'id')::uuid,true);end if;
   exception when insufficient_privilege then denied:=true;end;
   if not denied then raise exception 'Foreign workspace admitted';end if;
  end loop;
 end loop;
 reset role;
 perform set_config('request.headers',jsonb_build_object('x-redream-workspace','qa-entity-management-'||ta)::text,true);
 for role_name in select unnest(array['agent','operations','scout','player']) loop
  update platform.tenant_memberships set role=role_name where tenant_id=ta and user_id=u;
  set local role authenticated;
  for operation in select unnest(array['patch','archive','delete']) loop
   denied:=false;begin
    if operation='patch' then perform public.redream_entity_patch('club',club,'{"name":"Denied"}');
    elsif operation='archive' then perform public.redream_entity_archive('club',club,true);
    else perform public.redream_entity_delete('club',club,true);end if;
   exception when insufficient_privilege then denied:=true;end;
   if not denied then raise exception 'Role admitted: %',role_name;end if;
  end loop;
  reset role;
 end loop;
 update platform.tenant_memberships set role='admin',status='ended' where tenant_id=ta and user_id=u;
 set local role authenticated;
 denied:=false;begin perform public.redream_entity_archive('club',club,true);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Revoked membership admitted';end if;
 reset role;
 update platform.tenant_memberships set status='active' where tenant_id=ta and user_id=u;
 update platform.tenants set status='suspended' where id=ta;
 set local role authenticated;
 denied:=false;begin perform public.redream_entity_archive('club',club,true);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Suspended agency admitted';end if;
 reset role;
 update platform.tenants set status='active' where id=ta;
 -- Linked representation history is protected by the canonical writer.
 insert into public.players(id,tenant_id,first_name,last_name) values(history_player,ta,'[QA rollback]','Representation History');
 insert into djm_os.scouting_prospects(id,tenant_id,full_name,linked_player_id) values(history_prospect,ta,'[QA rollback] Linked History',history_player);
 set local role authenticated;
 denied:=false;begin perform public.redream_entity_delete('recruitment_target',history_prospect,true);exception when raise_exception or invalid_parameter_value then if sqlerrm like '%representation history%' then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Linked representation deletion admitted';end if;
 reset role;
 update djm_os.scouting_prospects set linked_player_id=null,signed_player_id=history_player where id=history_prospect;
 set local role authenticated;
 result:=public.redream_entity_action_preview('recruitment_target',history_prospect);
 if result->>'can_delete'<>'false' then raise exception 'Signed-only representation offered deletion';end if;
 denied:=false;begin perform public.redream_entity_delete('recruitment_target',history_prospect,true);exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Signed-only representation deletion admitted';end if;
 perform public.redream_entity_archive('recruitment_target',history_prospect,true);
 perform public.redream_entity_archive('recruitment_target',history_prospect,false);
 reset role;
 -- Delete dependants first, preserving the existing transaction/dependency contract.
 set local role authenticated;
 for r in select * from jsonb_array_elements(jsonb_build_array(jsonb_build_object('kind','deal_room','id',deal),jsonb_build_object('kind','club_need','id',need),jsonb_build_object('kind','club_contact','id',person),jsonb_build_object('kind','recruitment_target','id',prospect),jsonb_build_object('kind','player','id',player),jsonb_build_object('kind','club','id',club))) loop
  result:=public.redream_entity_delete(r->>'kind',(r->>'id')::uuid,true);
  if result->>'deleted'<>'true' then raise exception 'Delete acknowledgement mismatch';end if;
 end loop;
 reset role;
 if exists(select 1 from djm_os.events where tenant_id=ta and actor_user_id is distinct from u) or (select count(*) from djm_os.events where tenant_id=ta and event_type='ENTITY_DELETED')<>6 then raise exception 'Audit actor/delete history mismatch';end if;
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
 set local role authenticated;
 denied:=false;begin perform public.redream_entity_archive('club',agency,true);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Missing identity admitted';end if;
 reset role;
 set local role anon;
 denied:=false;begin perform public.redream_entity_archive('club',agency,true);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous execute admitted';end if;
 reset role;
end $canary$;
select 'Entity management role, workspace, persistence and lifecycle canary passed; rolling back' result;
rollback;
