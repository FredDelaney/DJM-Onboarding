-- Staging ltvmopvarlnidiozvpow only. Synthetic identities; no provider calls.
-- Every fixture, event, task and responsibility is rolled back.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $canary$
declare
 ta uuid:=gen_random_uuid(); tb uuid:=gen_random_uuid();
 users uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid()];
 invite uuid; email text; i integer; caller_role text; caller_status text;
 cid uuid; colleague_capture uuid; qid uuid; pid uuid:=gen_random_uuid();
 primary_owner uuid; second_owner uuid; responsible uuid[];
 result jsonb; action jsonb; choice jsonb; before_tasks integer;
begin
 insert into platform.tenants(id,slug,status,metadata) values
 (ta,'qa-tell-staff-'||ta,'active','{"synthetic":true}'),
 (tb,'qa-tell-staff-'||tb,'active','{"synthetic":true}');
 for i in 1..4 loop
  invite:=gen_random_uuid();email:='qa-tell-'||users[i]||'@example.test';
  insert into platform.tenant_staff_invites(id,tenant_id,email,role,token_hash,expires_at,metadata)
  values(invite,case when i=4 then tb else ta end,email,'agent',
   md5(invite::text)||md5(users[i]::text),now()+interval '1 hour','{"synthetic":true}');
  -- Exercise the existing verified-staff-signup trigger, without sending an invite.
  insert into auth.users(id,email,role,aud,raw_app_meta_data,raw_user_meta_data)
  values(users[i],email,'authenticated','authenticated',jsonb_build_object(
   'invitation_kind','agency_staff','staff_invite_id',invite,
   'invited_tenant_id',case when i=4 then tb else ta end),jsonb_build_object(
   'full_name',case i when 1 then 'Canary Owner' when 2 then 'Alex Canary' when 3 then 'Moses Canary' else 'Foreign Canary' end));
  insert into platform.tenant_memberships(tenant_id,user_id,role,status)
  values(case when i=4 then tb else ta end,users[i],case i when 1 then 'owner' when 3 then 'operations' else 'agent' end,'active');
 end loop;
 if exists(select 1 from djm_os.team_members where user_id=any(users))
 then raise exception 'Canary unexpectedly depends on a global staff row';end if;
 -- BASELINE_CHECKPOINT: the pre-repair variant stops here after proving the old FK.
 insert into djm_os.tell_djm_permissions(tenant_id,user_id,is_enabled,permission_scope)
 select case when ord=4 then tb else ta end,id,true,'full' from unnest(users) with ordinality u(id,ord);
 perform set_config('request.jwt.claim.sub',users[1]::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-redream-workspace','qa-tell-staff-'||ta)::text,true);
 set local role authenticated;
 result:=public.redream_ai_enqueue_capture(gen_random_uuid(),'text',p_raw_text:='Moses Canary and Alex Canary will send reviewed footage.');
 cid:=(result->>'capture_id')::uuid;
 reset role;
 if cid is null then raise exception 'Typed capture enqueue failed: %',result;end if;
 update djm_os.captures set status='processing',transcript_text=raw_text where id=cid;
 set local role service_role;
 if not public.redream_ai_user_can_process(users[1],cid)
 then raise exception 'Current fresh-agency owner cannot process';end if;
 result:=public.redream_ai_resolve_team_member(cid,'Alex Canary');
 if result->>'user_id'<>users[2]::text or not coalesce((result->>'resolved')::boolean,false)
 then raise exception 'Alex resolution failed: %',result;end if;
 result:=public.redream_ai_resolve_team_member(cid,'Moses Canary');
 if result->>'user_id'<>users[3]::text or not coalesce((result->>'resolved')::boolean,false)
 then raise exception 'Moses resolution failed: %',result;end if;
 if coalesce((public.redream_ai_resolve_team_member(cid,'Foreign Canary')->>'resolved')::boolean,false)
 then raise exception 'Foreign agency staff leaked into resolution';end if;
 reset role;
 -- Reverse UUID order while retaining the explicit primary owner.
 select max(id::text)::uuid,min(id::text)::uuid,array_agg(id order by id)
 into primary_owner,second_owner,responsible from unnest(array[users[2],users[3]]) u(id);
 set local role service_role;
 result:=public.redream_ai_stage_action(cid,'qa-shared',0,'create_task',0.99,
  'Moses Canary and Alex Canary will send reviewed footage.',jsonb_build_object(
   'title','[QA rollback] Send reviewed footage','owner_user_id',primary_owner,
   'responsible_user_ids',jsonb_build_array(primary_owner,second_owner)));
 reset role;
 set local role authenticated;
 result:=public.redream_ai_approve_capture(cid);
 reset role;
 select to_jsonb(a) into action from djm_os.tell_djm_actions a where capture_id=cid and action_hash='qa-shared';
 if action->>'status'<>'applied' then raise exception 'Shared approval failed: %',action->>'error_message';end if;
 if (select owner_user_id from djm_os.tasks where id=(action->>'target_id')::uuid) is distinct from primary_owner
 or not exists(select 1 from platform.work_responsibilities where work_id=(action->>'target_id')::uuid
  and tenant_id=ta and work_kind='task' and responsible_user_ids=responsible and revision=1)
 then raise exception 'Shared owner/responsibility/read-back mismatch';end if;
 select count(*) into before_tasks from djm_os.tasks where tenant_id=ta;
 set local role authenticated;
 result:=public.redream_ai_approve_capture(cid);
 reset role;
 if before_tasks<>(select count(*) from djm_os.tasks where tenant_id=ta)
 then raise exception 'Repeated approval duplicated work';end if;
 set local role service_role;
 result:=public.redream_ai_task_context(cid);
 if exists(select 1 from jsonb_array_elements(result->'tasks') t where t->>'id'=action->>'target_id')
 then raise exception 'Creator was silently added to responsibility';end if;
 reset role;
 perform set_config('request.jwt.claim.sub',users[2]::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',users[2],'role','authenticated')::text,true);
 set local role authenticated;
 result:=public.redream_ai_enqueue_capture(gen_random_uuid(),'text',p_raw_text:='[QA rollback] Show my reviewed work.');
 colleague_capture:=(result->>'capture_id')::uuid;
 reset role;
 set local role service_role;
 result:=public.redream_ai_task_context(colleague_capture);
 if not exists(select 1 from jsonb_array_elements(result->'tasks') t where t->>'id'=action->>'target_id'
  and t->>'owner_display_name'=case when primary_owner=users[2] then 'Alex Canary' else 'Moses Canary' end)
 then raise exception 'Responsible colleague context or factual profile label is missing';end if;
 reset role;
 perform set_config('request.jwt.claim.sub',users[1]::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',users[1],'role','authenticated')::text,true);
 set local role authenticated;
 result:=public.redream_ai_undo_action((action->>'id')::uuid);
 reset role;
 if exists(select 1 from djm_os.tasks where id=(action->>'target_id')::uuid)
 or exists(select 1 from platform.work_responsibilities where work_kind='task' and work_id=(action->>'target_id')::uuid)
 then raise exception 'Creation Undo retained work';end if;
 -- The existing question/answer path also works without global staff identity.
 insert into djm_os.people(id,tenant_id,full_name) values(pid,ta,'Synthetic Canary Contact');
 choice:=jsonb_build_object('kind','entity','entity_type','contact','entity_id',pid,'label','Synthetic Canary Contact');
 set local role service_role;
 qid:=public.redream_ai_record_question(cid,'entity:contact:qa','Which contact?','Ambiguous contact',
  jsonb_build_array(choice),'{"spoken_name":"Canary Contact"}');
 reset role;
 set local role authenticated;
 result:=public.redream_ai_answer_question(qid,choice);
 reset role;
 if not exists(select 1 from djm_os.tell_djm_aliases where tenant_id=ta and owner_user_id=users[1] and entity_id=pid)
 then raise exception 'Confirmed question alias is missing';end if;
 -- Every supported staff role, plus actual revocation and AI-permission denials.
 foreach caller_role in array array['owner','admin','agent','operations','scout','player'] loop
  update platform.tenant_memberships set role=caller_role where tenant_id=ta and user_id=users[1];
  set local role service_role;
  if public.redream_ai_user_can_process(users[1],cid) is distinct from (caller_role<>'player')
  then raise exception 'Processing role boundary failed for %',caller_role;end if;
  reset role;
 end loop;
 update platform.tenant_memberships set role='owner' where tenant_id=ta and user_id=users[1];
 foreach caller_status in array array['invited','suspended','ended'] loop
  update platform.tenant_memberships set status=caller_status where tenant_id=ta and user_id=users[1];
  set local role service_role;
  if public.redream_ai_user_can_process(users[1],cid) then raise exception 'Revoked caller can process';end if;
  reset role;
 end loop;
 update platform.tenant_memberships set status='active' where tenant_id=ta and user_id=users[1];
 update djm_os.tell_djm_permissions set is_enabled=false where tenant_id=ta and user_id=users[1];
 set local role service_role;
 if public.redream_ai_user_can_process(users[1],cid) or public.redream_ai_user_can_process(users[4],cid)
 then raise exception 'Disabled AI or foreign caller can process';end if;
 reset role;
 update djm_os.tell_djm_permissions set is_enabled=true where tenant_id=ta and user_id=users[1];
 set local role service_role;
 result:=public.redream_ai_stage_action(cid,'qa-revoked',1,'create_task',0.99,'Two colleagues will send footage.',
  jsonb_build_object('title','[QA rollback] Revoked assignment','owner_user_id',primary_owner,
   'responsible_user_ids',to_jsonb(responsible)));
 reset role;
 update platform.tenant_memberships set status='ended' where tenant_id=ta and user_id=users[3];
 select count(*) into before_tasks from djm_os.tasks where tenant_id=ta;
 set local role authenticated;
 result:=public.redream_ai_approve_capture(cid);
 reset role;
 if before_tasks<>(select count(*) from djm_os.tasks where tenant_id=ta)
 or not exists(select 1 from djm_os.tell_djm_actions where capture_id=cid and action_hash='qa-revoked' and status='failed')
 then raise exception 'Late colleague revocation allowed a partial task';end if;
 if exists(select 1 from djm_os.team_members where user_id=any(users))
 then raise exception 'Tell silently created a global staff prerequisite';end if;
end;
$canary$;
rollback;
select 'PASS: canonical staff, typed intake/events, scoped resolution, shared approval/repeat/context/Undo, question alias, five staff roles, player/revocation/disabled-AI/foreign denial, atomic late-revocation denial; all fixtures rolled back' as acceptance;
