-- Synthetic database canary. Run in a transaction and always ROLLBACK.
-- A validated synthetic staff identity and invitation are created only inside
-- this rollback transaction. No model call, email or existing work is changed.
begin;
do $connected_work_canary$
declare
 t uuid:=gen_random_uuid(); actor uuid; colleague uuid:=gen_random_uuid(); invite uuid:=gen_random_uuid(); c uuid; owned uuid; shared uuid;
 synthetic_email text;
 slug text; task_row djm_os.tasks%rowtype; payload jsonb; result jsonb; action_id uuid;
 denied boolean:=false;
begin
 select m.user_id into actor from platform.tenant_memberships m
 join auth.users u on u.id=m.user_id
 where m.status='active' and m.role in ('owner','admin') order by m.is_primary desc,m.joined_at limit 1;
 if actor is null then raise exception 'An existing management identity is required'; end if;
 slug:='connected-work-qa-'||t::text;
 insert into platform.tenants(id,slug,status,metadata) values(t,slug,'active','{"synthetic_test_tenant":true}');
 insert into platform.tenant_memberships(tenant_id,user_id,role) values(t,actor,'owner');
 synthetic_email:='connected-work-qa-'||colleague::text||'@example.invalid';
 insert into platform.tenant_staff_invites(id,tenant_id,email,role,token_hash,expires_at,created_by)
 values(invite,t,synthetic_email,'agent',repeat('c',64),now()+interval '1 hour',actor);
 insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
 values(colleague,synthetic_email,jsonb_build_object('invitation_kind','agency_staff','staff_invite_id',invite,'invited_tenant_id',t),'{"full_name":"Synthetic QA colleague"}');
 insert into platform.tenant_memberships(tenant_id,user_id,role) values(t,colleague,'agent');
 perform private.platform_server_ensure_team_member(colleague);
 insert into djm_os.tell_djm_permissions(tenant_id,user_id,is_enabled,permission_scope) values(t,actor,true,'full');
 insert into djm_os.captures(tenant_id,submitted_by,transcript_text,status,processing_version)
 values(t,actor,'I confirmed the synthetic trial dates. I reviewed the synthetic player profile.','needs_review','tell_djm_v1') returning id into c;
 insert into djm_os.tasks(tenant_id,owner_user_id,title,status)
 values(t,actor,'Confirm synthetic trial dates','open') returning id into owned;
 -- The existing staff-invite auth guard validates this temporary colleague.
 insert into djm_os.tasks(tenant_id,owner_user_id,title,status)
 values(t,colleague,'Review synthetic player profile','open') returning id into shared;
 insert into platform.work_responsibilities(tenant_id,work_kind,work_id,responsible_user_ids,updated_by)
 values(t,'task',shared,array[actor],actor);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 perform set_config('request.headers',jsonb_build_object('x-redream-workspace',slug)::text,true);
 result:=public.redream_ai_task_context(c);
 if not exists(select 1 from jsonb_array_elements(result->'tasks') x where x->>'id'=shared::text and x->>'shared_with_you'='true') then
  raise exception 'shared work missing from context';
 end if;
 select * into task_row from djm_os.tasks where id=shared;
 payload:=jsonb_build_object('task_id',shared,'task_kind','task','task_title',task_row.title,
  'expected_updated_at',task_row.updated_at,'expected_status',task_row.status,'operation','complete','objective_satisfied',true,'_automatic',false);
 begin
  perform public.redream_ai_update_task(c,repeat('a',64),0,0.99,'I reviewed the synthetic player profile',payload);
 exception when insufficient_privilege then denied:=true;
 end;
 if not denied then raise exception 'shared work changed without review'; end if;
 insert into djm_os.tell_djm_actions(tenant_id,capture_id,action_hash,action_index,action_type,status,confidence,evidence,proposed_payload,resolved_payload)
 values(t,c,repeat('a',64),0,'update_task','pending',0.99,'I reviewed the synthetic player profile',payload,payload);
 result:=public.redream_ai_update_task(c,repeat('a',64),0,0.99,'I reviewed the synthetic player profile',payload);
 action_id:=(result->>'action_id')::uuid;
 if (select status from djm_os.tasks where id=shared)<>'completed'
    or (select owner_user_id from djm_os.tasks where id=shared) is distinct from colleague then
  raise exception 'shared completion failed or changed ownership';
 end if;
 result:=public.redream_ai_update_task(c,repeat('a',64),0,0.99,'I reviewed the synthetic player profile',payload);
 if result->>'duplicate'<>'true' then raise exception 'shared completion retry was not idempotent'; end if;
 update platform.work_responsibilities set responsible_user_ids='{}' where tenant_id=t and work_kind='task' and work_id=shared;
 denied:=false;
 begin
  perform private.redream_ai_undo_task(action_id);
 exception when others then
  if sqlerrm not like 'This task changed%' then raise; end if;
  denied:=true;
 end;
 if not denied then raise exception 'revoked responsibility retained Undo rights'; end if;
 update platform.work_responsibilities set responsible_user_ids=array[actor] where tenant_id=t and work_kind='task' and work_id=shared;
 perform private.redream_ai_undo_task(action_id);
 if (select status from djm_os.tasks where id=shared)<>'open' then raise exception 'approved shared Undo failed'; end if;
 select * into task_row from djm_os.tasks where id=owned;
 payload:=jsonb_build_object('task_id',owned,'task_kind','task','task_title',task_row.title,
  'expected_updated_at',task_row.updated_at,'expected_status',task_row.status,'operation','complete','objective_satisfied',true,'_automatic',true);
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','{}',true);
 perform public.redream_ai_update_task(c,repeat('b',64),1,0.99,'I confirmed the synthetic trial dates',payload);
 if (select status from djm_os.tasks where id=owned)<>'completed' then raise exception 'owned automatic completion failed'; end if;
 if has_function_privilege('authenticated','public.platform_server_attach_player_photo(uuid,uuid,uuid,text,text)','execute') then
  raise exception 'photo attachment is browser executable';
 end if;
end;
$connected_work_canary$;
rollback;
