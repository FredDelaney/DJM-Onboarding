create or replace function public.platform_server_seed_demo_deal_history(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_meta jsonb;
  v_west djm_os.deal_rooms%rowtype;
  v_riv djm_os.deal_rooms%rowtype;
  v_count integer:=0;
  v_hash text;
begin
  select metadata into v_meta from platform.tenants where id=p_tenant_id;
  if v_meta is null or not coalesce((v_meta->>'synthetic_test_tenant')::boolean,false) then raise exception 'demo_history_requires_synthetic_tenant'; end if;

  select * into v_west from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.title='Elias Novak to Westhaven FC' limit 1;
  select * into v_riv from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.title='Leo Martin exploratory move' limit 1;
  if v_west.id is null or v_riv.id is null then raise exception 'northstar_demo_deals_missing'; end if;

  delete from platform.deal_state_snapshots where tenant_id=p_tenant_id;

  v_hash:=md5(concat_ws('|','contacted','active','35',coalesce(v_west.expected_commission::text,''),coalesce(v_west.currency,''),'Club reviewing initial profile','Decide whether to request an updated pack','Send initial profile and clips',(now()-interval '9 days')::text,(now()-interval '10 days')::text,''));
  insert into platform.deal_state_snapshots(tenant_id,deal_room_id,observed_at,source,stage,status,probability,expected_commission,currency,primary_blocker,next_decision,next_action_text,next_action_at,last_meaningful_at,owner_user_id,state_hash,metadata)
  values(p_tenant_id,v_west.id,now()-interval '10 days','synthetic_demo_history','contacted','active',35,v_west.expected_commission,v_west.currency,'Club reviewing initial profile','Decide whether to request an updated pack','Send initial profile and clips',now()-interval '9 days',now()-interval '10 days',null,v_hash,jsonb_build_object('synthetic',true));
  v_count:=v_count+1;

  v_hash:=md5(concat_ws('|','interest','active','50',coalesce(v_west.expected_commission::text,''),coalesce(v_west.currency,''),coalesce(v_west.primary_blocker,''),coalesce(v_west.next_decision,''),'Send refreshed clips and availability',(now()-interval '3 days')::text,(now()-interval '4 days')::text,''));
  insert into platform.deal_state_snapshots(tenant_id,deal_room_id,observed_at,source,stage,status,probability,expected_commission,currency,primary_blocker,next_decision,next_action_text,next_action_at,last_meaningful_at,owner_user_id,state_hash,metadata)
  values(p_tenant_id,v_west.id,now()-interval '4 days','synthetic_demo_history','interest','active',50,v_west.expected_commission,v_west.currency,v_west.primary_blocker,v_west.next_decision,'Send refreshed clips and availability',now()-interval '3 days',now()-interval '4 days',null,v_hash,jsonb_build_object('synthetic',true));
  v_count:=v_count+1;

  v_hash:=md5(concat_ws('|',coalesce(v_west.stage,''),coalesce(v_west.status,''),coalesce(v_west.probability,v_west.manual_probability,v_west.model_probability)::text,coalesce(v_west.expected_commission::text,''),coalesce(v_west.currency,''),coalesce(v_west.primary_blocker,''),coalesce(v_west.next_decision,''),coalesce(v_west.next_action_text,''),coalesce(v_west.next_action_at::text,''),coalesce(v_west.last_meaningful_at::text,''),coalesce(v_west.owner_user_id::text,'')));
  insert into platform.deal_state_snapshots(tenant_id,deal_room_id,observed_at,source,stage,status,probability,expected_commission,currency,primary_blocker,next_decision,next_action_text,next_action_at,last_meaningful_at,owner_user_id,state_hash,metadata)
  values(p_tenant_id,v_west.id,now(),'synthetic_demo_history',v_west.stage,v_west.status,coalesce(v_west.probability,v_west.manual_probability,v_west.model_probability),v_west.expected_commission,v_west.currency,v_west.primary_blocker,v_west.next_decision,v_west.next_action_text,v_west.next_action_at,v_west.last_meaningful_at,v_west.owner_user_id,v_hash,jsonb_build_object('synthetic',true));
  v_count:=v_count+1;

  v_hash:=md5(concat_ws('|','qualifying','active','20',coalesce(v_riv.expected_commission::text,''),coalesce(v_riv.currency,''),'Need first sporting response','Decide whether there is genuine club interest','Send exploratory profile',(now()-interval '13 days')::text,(now()-interval '14 days')::text,''));
  insert into platform.deal_state_snapshots(tenant_id,deal_room_id,observed_at,source,stage,status,probability,expected_commission,currency,primary_blocker,next_decision,next_action_text,next_action_at,last_meaningful_at,owner_user_id,state_hash,metadata)
  values(p_tenant_id,v_riv.id,now()-interval '14 days','synthetic_demo_history','qualifying','active',20,v_riv.expected_commission,v_riv.currency,'Need first sporting response','Decide whether there is genuine club interest','Send exploratory profile',now()-interval '13 days',now()-interval '14 days',null,v_hash,jsonb_build_object('synthetic',true));
  v_count:=v_count+1;

  v_hash:=md5(concat_ws('|','contacted','active','35',coalesce(v_riv.expected_commission::text,''),coalesce(v_riv.currency,''),coalesce(v_riv.primary_blocker,''),coalesce(v_riv.next_decision,''),'Follow up after initial profile',(now()-interval '8 days')::text,(now()-interval '9 days')::text,''));
  insert into platform.deal_state_snapshots(tenant_id,deal_room_id,observed_at,source,stage,status,probability,expected_commission,currency,primary_blocker,next_decision,next_action_text,next_action_at,last_meaningful_at,owner_user_id,state_hash,metadata)
  values(p_tenant_id,v_riv.id,now()-interval '9 days','synthetic_demo_history','contacted','active',35,v_riv.expected_commission,v_riv.currency,v_riv.primary_blocker,v_riv.next_decision,'Follow up after initial profile',now()-interval '8 days',now()-interval '9 days',null,v_hash,jsonb_build_object('synthetic',true));
  v_count:=v_count+1;

  v_hash:=md5(concat_ws('|',coalesce(v_riv.stage,''),coalesce(v_riv.status,''),coalesce(v_riv.probability,v_riv.manual_probability,v_riv.model_probability)::text,coalesce(v_riv.expected_commission::text,''),coalesce(v_riv.currency,''),coalesce(v_riv.primary_blocker,''),coalesce(v_riv.next_decision,''),coalesce(v_riv.next_action_text,''),coalesce(v_riv.next_action_at::text,''),coalesce(v_riv.last_meaningful_at::text,''),coalesce(v_riv.owner_user_id::text,'')));
  insert into platform.deal_state_snapshots(tenant_id,deal_room_id,observed_at,source,stage,status,probability,expected_commission,currency,primary_blocker,next_decision,next_action_text,next_action_at,last_meaningful_at,owner_user_id,state_hash,metadata)
  values(p_tenant_id,v_riv.id,now(),'synthetic_demo_history',v_riv.stage,v_riv.status,coalesce(v_riv.probability,v_riv.manual_probability,v_riv.model_probability),v_riv.expected_commission,v_riv.currency,v_riv.primary_blocker,v_riv.next_decision,v_riv.next_action_text,v_riv.next_action_at,v_riv.last_meaningful_at,v_riv.owner_user_id,v_hash,jsonb_build_object('synthetic',true));
  v_count:=v_count+1;

  return jsonb_build_object('tenant_id',p_tenant_id,'snapshots_seeded',v_count,'note','Synthetic deal history is intentionally separated from real agency history.');
end;
$$;

revoke execute on function public.platform_server_seed_demo_deal_history(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_seed_demo_deal_history(uuid) to service_role;;
