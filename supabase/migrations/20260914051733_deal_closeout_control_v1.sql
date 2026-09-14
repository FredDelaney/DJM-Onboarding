create table if not exists platform.deal_closeout_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  deal_room_id uuid not null references djm_os.deal_rooms(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','confirmed','archived')),
  final_terms jsonb not null default '{}'::jsonb,
  signed_agreement_recorded boolean not null default false,
  completion_confirmed boolean not null default false,
  player_acknowledgement_recorded boolean not null default false,
  completion_note text null,
  confirmed_by uuid null,
  confirmed_at timestamptz null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id,deal_room_id)
);

alter table platform.deal_closeout_records enable row level security;
create index if not exists deal_closeout_records_deal_fk_idx on platform.deal_closeout_records(deal_room_id);

create or replace function public.platform_server_save_deal_closeout(
  p_tenant_id uuid,
  p_deal_room_id uuid,
  p_actor_user_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_deal djm_os.deal_rooms%rowtype;
  v_status text:=coalesce(nullif(trim(p_input->>'status'),''),'draft');
  v_before jsonb;
  v_after jsonb;
  v_terms jsonb:=coalesce(p_input->'final_terms','{}'::jsonb);
  v_signed boolean:=coalesce((p_input->>'signed_agreement_recorded')::boolean,false);
  v_completion boolean:=coalesce((p_input->>'completion_confirmed')::boolean,false);
  v_player_ack boolean:=coalesce((p_input->>'player_acknowledgement_recorded')::boolean,false);
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  if v_status not in ('draft','confirmed','archived') then raise exception 'invalid_closeout_status'; end if;
  if v_status='confirmed' and jsonb_object_length(v_terms)=0 then raise exception 'final_terms_required_for_confirmation'; end if;
  if v_status='confirmed' and not v_completion then raise exception 'completion_confirmation_required'; end if;
  select to_jsonb(r) into v_before from platform.deal_closeout_records r where r.tenant_id=p_tenant_id and r.deal_room_id=p_deal_room_id for update;
  insert into platform.deal_closeout_records(tenant_id,deal_room_id,status,final_terms,signed_agreement_recorded,completion_confirmed,player_acknowledgement_recorded,completion_note,confirmed_by,confirmed_at,created_by,updated_by)
  values(p_tenant_id,p_deal_room_id,v_status,v_terms,v_signed,v_completion,v_player_ack,nullif(trim(p_input->>'completion_note'),''),case when v_status='confirmed' then p_actor_user_id else null end,case when v_status='confirmed' then now() else null end,p_actor_user_id,p_actor_user_id)
  on conflict (tenant_id,deal_room_id) do update set
    status=excluded.status,
    final_terms=excluded.final_terms,
    signed_agreement_recorded=excluded.signed_agreement_recorded,
    completion_confirmed=excluded.completion_confirmed,
    player_acknowledgement_recorded=excluded.player_acknowledgement_recorded,
    completion_note=excluded.completion_note,
    confirmed_by=case when excluded.status='confirmed' then p_actor_user_id else platform.deal_closeout_records.confirmed_by end,
    confirmed_at=case when excluded.status='confirmed' then now() else platform.deal_closeout_records.confirmed_at end,
    updated_by=p_actor_user_id,updated_at=now();
  select to_jsonb(r) into v_after from platform.deal_closeout_records r where r.tenant_id=p_tenant_id and r.deal_room_id=p_deal_room_id;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','deal_closeout.saved','deal_closeout',p_deal_room_id::text,v_before,v_after,jsonb_build_object('closeout_status',v_status));
  return jsonb_build_object('saved',true,'closeout',v_after,'truth_contract',jsonb_build_object('final_terms','Final terms are human-recorded facts. DJM does not infer agreed terms from negotiation guardrails or messages.','completion','Completion confirmed is an internal operating fact, not legal certification of registration, transfer validity or contract enforceability.'));
end;
$$;

create or replace function public.platform_server_deal_closeout_control(
  p_tenant_id uuid,
  p_deal_room_id uuid
)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_deal djm_os.deal_rooms%rowtype;
  v_player_name text;
  v_club_name text;
  v_origin jsonb;
  v_guardrails jsonb;
  v_closeout platform.deal_closeout_records%rowtype;
  v_rep_active integer:=0;
  v_rep_document integer:=0;
  v_receivable_count integer:=0;
  v_open_receivable_count integer:=0;
  v_receivable_total jsonb:='[]'::jsonb;
  v_checks jsonb:='[]'::jsonb;
  v_gaps integer:=0;
  v_state text;
begin
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  select coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') into v_player_name from public.players p where p.id=v_deal.player_id and p.tenant_id=p_tenant_id;
  select o.name into v_club_name from djm_os.organisations o where o.id=v_deal.organisation_id and o.tenant_id=p_tenant_id;
  v_origin:=public.platform_server_deal_origin(p_tenant_id,p_deal_room_id);
  v_guardrails:=public.platform_server_deal_guardrails(p_tenant_id,p_deal_room_id);
  select * into v_closeout from platform.deal_closeout_records r where r.tenant_id=p_tenant_id and r.deal_room_id=p_deal_room_id;
  if v_deal.player_id is not null then
    select count(*),count(*) filter(where a.document_id is not null) into v_rep_active,v_rep_document from public.player_agreements a where a.player_id=v_deal.player_id and a.status='active' and (a.end_date is null or a.end_date>=current_date);
  end if;
  select count(*),count(*) filter(where r.status not in ('paid','waived','cancelled')) into v_receivable_count,v_open_receivable_count from djm_os.deal_receivables r where r.tenant_id=p_tenant_id and r.deal_room_id=p_deal_room_id;
  select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'scheduled_amount',scheduled_amount,'recorded_paid',recorded_paid,'outstanding',scheduled_amount-recorded_paid) order by currency),'[]'::jsonb) into v_receivable_total
  from (select r.currency,sum(r.amount) scheduled_amount,sum(r.amount_paid) recorded_paid from djm_os.deal_receivables r where r.tenant_id=p_tenant_id and r.deal_room_id=p_deal_room_id and r.status not in ('waived','cancelled') group by r.currency) x;

  v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','deal_state','state',case when v_deal.status='won' or v_deal.stage in ('contracting','won') then 'ready' else 'not_yet_closeout_stage' end,'fact',format('Deal status %s; stage %s.',v_deal.status,v_deal.stage),'required_action',case when not(v_deal.status='won' or v_deal.stage in ('contracting','won')) then 'Keep using the live deal workflow until a genuine closeout stage is reached.' else null end));
  if coalesce(v_origin#>>'{origin,confirmation_status}',v_origin->>'confirmation_status','')='confirmed' or coalesce((v_origin#>>'{summary,confirmed}')::boolean,false) then
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','deal_origin','state','ready','fact','Deal origin is human-confirmed.','required_action',null));
  else
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','deal_origin','state','gap','fact','No human-confirmed deal origin is currently evidenced.','required_action','Confirm who originated the deal and route before final attribution.')); v_gaps:=v_gaps+1;
  end if;
  if v_closeout.id is null then
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','final_terms','state','gap','fact','No closeout record is present.','required_action','Record the actual final agreed terms and completion evidence.')); v_gaps:=v_gaps+1;
  elsif v_closeout.status<>'confirmed' then
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','final_terms','state','gap','fact','Closeout record exists but is not confirmed.','required_action','Human-review the final terms and completion evidence, then confirm the closeout record.')); v_gaps:=v_gaps+1;
  else
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','final_terms','state','ready','fact','Human-confirmed closeout terms are recorded.','required_action',null));
  end if;
  if v_closeout.id is not null and v_closeout.signed_agreement_recorded then
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','signed_agreement_record','state','ready','fact','The closeout record says a signed agreement is recorded.','required_action',null));
  else
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','signed_agreement_record','state','gap','fact','The closeout record does not evidence a signed agreement.','required_action','Record whether the signed agreement is held in the agency records.')); v_gaps:=v_gaps+1;
  end if;
  if v_closeout.id is not null and v_closeout.completion_confirmed then
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','completion','state','ready','fact','Operational completion is human-confirmed.','required_action',null));
  else
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','completion','state','gap','fact','Operational completion has not been human-confirmed.','required_action','Confirm completion only after the agency has the appropriate factual evidence.')); v_gaps:=v_gaps+1;
  end if;
  if v_deal.player_id is not null and v_rep_active>0 then
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','representation_record','state','ready','fact',format('%s active representation record(s) are evidenced in DJM.',v_rep_active),'required_action',null));
  else
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','representation_record','state','gap','fact','DJM does not currently evidence an active representation record for the player.','required_action','Review and migrate/link the applicable representation record.')); v_gaps:=v_gaps+1;
  end if;
  if coalesce(v_deal.expected_commission,0)<=0 then
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','commission_schedule','state','not_applicable_or_unrecorded','fact','No positive expected commission is recorded on the deal.','required_action','If the agency has a commission entitlement, record the real receivable only after confirming the amount and due date.'));
  elsif v_receivable_count=0 then
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','commission_schedule','state','gap','fact','The deal has forecast commission but no human-recorded receivable schedule.','required_action','Confirm the actual commission entitlement, currency and due date, then create the receivable manually.')); v_gaps:=v_gaps+1;
  else
    v_checks:=v_checks||jsonb_build_array(jsonb_build_object('key','commission_schedule','state','ready','fact',format('%s receivable record(s) are linked to the deal.',v_receivable_count),'required_action',null));
  end if;

  v_state:=case
    when not(v_deal.status='won' or v_deal.stage in ('contracting','won')) then 'not_ready_for_closeout'
    when v_gaps>0 then 'closeout_gaps_remain'
    when v_open_receivable_count>0 then 'operationally_closed_cash_outstanding'
    else 'operationally_closed' end;
  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'generated_at',now(),'state',v_state,
    'deal',jsonb_build_object('title',v_deal.title,'status',v_deal.status,'stage',v_deal.stage,'player_id',v_deal.player_id,'player_name',v_player_name,'organisation_id',v_deal.organisation_id,'club_name',v_club_name,'expected_commission',v_deal.expected_commission,'currency',v_deal.currency,'closed_at',v_deal.closed_at),
    'closeout_record',case when v_closeout.id is null then null else jsonb_build_object('status',v_closeout.status,'final_terms',v_closeout.final_terms,'signed_agreement_recorded',v_closeout.signed_agreement_recorded,'completion_confirmed',v_closeout.completion_confirmed,'player_acknowledgement_recorded',v_closeout.player_acknowledgement_recorded,'completion_note',v_closeout.completion_note,'confirmed_at',v_closeout.confirmed_at) end,
    'checks',v_checks,
    'cash_collection',jsonb_build_object('receivable_records',v_receivable_count,'open_receivables',v_open_receivable_count,'by_currency',v_receivable_total),
    'next_action',case
      when not(v_deal.status='won' or v_deal.stage in ('contracting','won')) then jsonb_build_object('api_action','deal_war_room','instruction','Continue the live deal workflow. Closeout control is not yet the primary operating workflow.')
      when v_closeout.id is null or v_closeout.status<>'confirmed' then jsonb_build_object('api_action','deal_closeout_save','instruction','Record and human-confirm the final agreed terms and completion evidence.')
      when coalesce(v_deal.expected_commission,0)>0 and v_receivable_count=0 then jsonb_build_object('api_action','deal_receivable_save','instruction','Confirm the actual commission entitlement and schedule manually. Do not copy forecast commission automatically.')
      when v_open_receivable_count>0 then jsonb_build_object('api_action','deal_receivables','instruction','Work the human-recorded collection schedule until the balance is resolved.')
      else jsonb_build_object('api_action','deal_closeout','instruction','No closeout action is currently forced by the recorded operational controls.') end,
    'truth_contract',jsonb_build_object(
      'closeout','Operational closeout is not legal certification of transfer validity, registration, contract enforceability or regulatory compliance.',
      'guardrails','Negotiation guardrails are not final terms. Final terms must be separately human-recorded in the closeout record.',
      'commission','Expected commission is a forecast field. It never becomes a receivable automatically.',
      'representation','A missing active representation record means DJM cannot evidence it from current data; it does not prove no valid agreement exists elsewhere.',
      'cash','Receivable balances are human-recorded collections data, not accounting statements or guaranteed collectible amounts.')
  );
end;
$$;

create or replace function public.platform_server_deal_closeout_command(p_tenant_id uuid,p_limit integer default 100)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare v_items jsonb:='[]'::jsonb; v_deal record; v_item jsonb; v_count integer:=0; begin
  for v_deal in
    select d.id from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and (d.status='won' or d.stage in ('contracting','won')) order by d.closed_at desc nulls last,d.updated_at desc limit greatest(1,least(coalesce(p_limit,100),500))
  loop
    v_item:=public.platform_server_deal_closeout_control(p_tenant_id,v_deal.id);
    v_count:=v_count+1;
    v_items:=v_items||jsonb_build_array(v_item);
  end loop;
  return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'generated_at',now(),'deal_count',v_count,'items',v_items,'truth_contract',jsonb_build_object('scope','Only deals at a recorded contracting/won stage are included. The command does not infer that an active deal has closed.'));
end;
$$;

revoke all on function public.platform_server_save_deal_closeout(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.platform_server_deal_closeout_control(uuid,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_deal_closeout_command(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_save_deal_closeout(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.platform_server_deal_closeout_control(uuid,uuid) to service_role;
grant execute on function public.platform_server_deal_closeout_command(uuid,integer) to service_role;
;
