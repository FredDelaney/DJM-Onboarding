create table if not exists platform.agency_knowledge_cards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  knowledge_type text not null check (knowledge_type in ('market','route','negotiation','player_service','scouting','relationship','operations','commercial')),
  title text not null,
  statement text not null,
  status text not null default 'draft' check (status in ('draft','approved','retired')),
  source_kind text not null default 'manual',
  source_key text,
  source_snapshot jsonb not null default '{}'::jsonb,
  applicability jsonb not null default '{}'::jsonb,
  limitations jsonb not null default '[]'::jsonb,
  evidence_state text not null default 'human_review_required' check (evidence_state in ('human_review_required','insufficient','emerging','usable')),
  review_due_at date not null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  retired_by uuid references auth.users(id) on delete set null,
  retired_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agency_knowledge_cards_tenant_status_review_idx on platform.agency_knowledge_cards(tenant_id,status,review_due_at);
create index if not exists agency_knowledge_cards_tenant_type_idx on platform.agency_knowledge_cards(tenant_id,knowledge_type);
alter table platform.agency_knowledge_cards enable row level security;
revoke all on platform.agency_knowledge_cards from public, anon, authenticated;
grant all on platform.agency_knowledge_cards to service_role;

create or replace function public.platform_server_save_deal_closeout(p_tenant_id uuid,p_deal_room_id uuid,p_actor_user_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_role text;
  v_deal djm_os.deal_rooms%rowtype;
  v_status text:=coalesce(nullif(trim(p_input->>'status'),''),'draft');
  v_before jsonb; v_after jsonb;
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
  if v_status='confirmed' and not(v_deal.status='won' or v_deal.stage in ('contracting','won')) then raise exception 'deal_not_at_closeout_stage'; end if;
  if v_status='confirmed' and jsonb_object_length(v_terms)=0 then raise exception 'final_terms_required_for_confirmation'; end if;
  if v_status='confirmed' and not v_completion then raise exception 'completion_confirmation_required'; end if;
  select to_jsonb(r) into v_before from platform.deal_closeout_records r where r.tenant_id=p_tenant_id and r.deal_room_id=p_deal_room_id for update;
  insert into platform.deal_closeout_records(tenant_id,deal_room_id,status,final_terms,signed_agreement_recorded,completion_confirmed,player_acknowledgement_recorded,completion_note,confirmed_by,confirmed_at,created_by,updated_by)
  values(p_tenant_id,p_deal_room_id,v_status,v_terms,v_signed,v_completion,v_player_ack,nullif(trim(p_input->>'completion_note'),''),case when v_status='confirmed' then p_actor_user_id else null end,case when v_status='confirmed' then now() else null end,p_actor_user_id,p_actor_user_id)
  on conflict (tenant_id,deal_room_id) do update set status=excluded.status,final_terms=excluded.final_terms,signed_agreement_recorded=excluded.signed_agreement_recorded,completion_confirmed=excluded.completion_confirmed,player_acknowledgement_recorded=excluded.player_acknowledgement_recorded,completion_note=excluded.completion_note,confirmed_by=case when excluded.status='confirmed' then p_actor_user_id else platform.deal_closeout_records.confirmed_by end,confirmed_at=case when excluded.status='confirmed' then now() else platform.deal_closeout_records.confirmed_at end,updated_by=p_actor_user_id,updated_at=now();
  select to_jsonb(r) into v_after from platform.deal_closeout_records r where r.tenant_id=p_tenant_id and r.deal_room_id=p_deal_room_id;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','deal_closeout.saved','deal_closeout',p_deal_room_id::text,v_before,v_after,jsonb_build_object('closeout_status',v_status,'deal_status',v_deal.status,'deal_stage',v_deal.stage));
  return jsonb_build_object('saved',true,'closeout',v_after,'truth_contract',jsonb_build_object('final_terms','Final terms are human-recorded facts. DJM does not infer agreed terms from negotiation guardrails or messages.','completion','Completion confirmed is an internal operating fact, not legal certification of registration, transfer validity or contract enforceability.','stage_gate','A confirmed closeout can only be saved when the underlying deal is recorded at contracting/won or marked won.'));
end;$$;

create or replace function public.platform_server_knowledge_candidates(p_tenant_id uuid,p_window_days integer default 730)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_days integer:=greatest(90,least(coalesce(p_window_days,730),1460)); v_route jsonb:=public.platform_server_route_learning(p_tenant_id,v_days); v_market jsonb:=public.platform_server_market_learning(p_tenant_id,v_days); v_candidates jsonb:='[]'::jsonb; v_item jsonb;
begin
  for v_item in select value from jsonb_array_elements(coalesce(v_route->'routes','[]'::jsonb)) loop
    if coalesce(v_item->>'funnel_evidence_state','insufficient') in ('emerging','usable') or coalesce(v_item->>'close_evidence_state','insufficient') in ('emerging','usable') then
      v_candidates:=v_candidates||jsonb_build_array(jsonb_build_object('candidate_type','route','source_key',v_item->>'route_type','evidence_state',case when v_item->>'funnel_evidence_state'='usable' or v_item->>'close_evidence_state'='usable' then 'usable' else 'emerging' end,'recommendation',v_item->>'recommendation','source_snapshot',v_item,'suggested_title',format('Route learning: %s',coalesce(v_item->>'route_type','unknown route')),'human_review_required',true,'automatic_policy_change',false,'limitations',jsonb_build_array('Observed outcomes do not prove causality.','Route selection may differ by player, club and market context.')));
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(coalesce(v_market->'markets','[]'::jsonb)) loop
    if coalesce(v_item->>'funnel_evidence_state','insufficient') in ('emerging','usable') or coalesce(v_item->>'close_evidence_state','insufficient') in ('emerging','usable') then
      v_candidates:=v_candidates||jsonb_build_array(jsonb_build_object('candidate_type','market','source_key',v_item->>'market','evidence_state',case when v_item->>'funnel_evidence_state'='usable' or v_item->>'close_evidence_state'='usable' then 'usable' else 'emerging' end,'recommendation',v_item->>'recommendation','source_snapshot',v_item,'suggested_title',format('Market learning: %s',coalesce(v_item->>'market','unknown market')),'human_review_required',true,'automatic_policy_change',false,'limitations',jsonb_build_array('Agency targeting choices influence the sample.','Observed agency history is not proof that the market is objectively strong or weak.')));
    end if;
  end loop;
  return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'generated_at',now(),'window_days',v_days,'candidates',v_candidates,'truth_contract',jsonb_build_object('purpose','Surface evidence-qualified hypotheses for human review.','approval','Candidates do not become agency policy or approved knowledge automatically.','synthetic','Synthetic demo evidence remains blocked by the underlying learning functions.'));
end;$$;

create or replace function public.platform_server_save_knowledge_card(p_tenant_id uuid,p_actor_user_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text; v_id uuid:=nullif(p_input->>'id','')::uuid; v_status text:=coalesce(nullif(trim(p_input->>'status'),''),'draft'); v_type text:=nullif(trim(p_input->>'knowledge_type'),''); v_title text:=nullif(trim(p_input->>'title'),''); v_statement text:=nullif(trim(p_input->>'statement'),''); v_review date:=nullif(p_input->>'review_due_at','')::date; v_before jsonb; v_after jsonb;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active' where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' limit 1;
  if v_role is null or v_role not in ('owner','admin','agent','operations') then raise exception 'agency_operator_access_required'; end if;
  if v_status not in ('draft','approved','retired') then raise exception 'invalid_knowledge_status'; end if;
  if v_type not in ('market','route','negotiation','player_service','scouting','relationship','operations','commercial') then raise exception 'invalid_knowledge_type'; end if;
  if v_title is null or v_statement is null then raise exception 'knowledge_title_and_statement_required'; end if;
  if v_review is null then raise exception 'review_due_at_required'; end if;
  if v_status='approved' and v_role not in ('owner','admin') then raise exception 'owner_or_admin_required_to_approve_knowledge'; end if;
  if v_status='approved' and v_review<=current_date then raise exception 'future_review_due_at_required_for_approval'; end if;
  if v_id is not null then
    select to_jsonb(k) into v_before from platform.agency_knowledge_cards k where k.id=v_id and k.tenant_id=p_tenant_id for update;
    if v_before is null then raise exception 'knowledge_card_not_found_for_tenant'; end if;
    update platform.agency_knowledge_cards set knowledge_type=v_type,title=v_title,statement=v_statement,status=v_status,source_kind=coalesce(nullif(trim(p_input->>'source_kind'),''),source_kind),source_key=nullif(trim(p_input->>'source_key'),''),source_snapshot=coalesce(p_input->'source_snapshot',source_snapshot),applicability=coalesce(p_input->'applicability',applicability),limitations=coalesce(p_input->'limitations',limitations),evidence_state=coalesce(nullif(trim(p_input->>'evidence_state'),''),evidence_state),review_due_at=v_review,approved_by=case when v_status='approved' then p_actor_user_id else approved_by end,approved_at=case when v_status='approved' then now() else approved_at end,retired_by=case when v_status='retired' then p_actor_user_id else null end,retired_at=case when v_status='retired' then now() else null end,updated_by=p_actor_user_id,updated_at=now() where id=v_id and tenant_id=p_tenant_id;
  else
    insert into platform.agency_knowledge_cards(tenant_id,knowledge_type,title,statement,status,source_kind,source_key,source_snapshot,applicability,limitations,evidence_state,review_due_at,approved_by,approved_at,retired_by,retired_at,created_by,updated_by)
    values(p_tenant_id,v_type,v_title,v_statement,v_status,coalesce(nullif(trim(p_input->>'source_kind'),''),'manual'),nullif(trim(p_input->>'source_key'),''),coalesce(p_input->'source_snapshot','{}'::jsonb),coalesce(p_input->'applicability','{}'::jsonb),coalesce(p_input->'limitations','[]'::jsonb),coalesce(nullif(trim(p_input->>'evidence_state'),''),'human_review_required'),v_review,case when v_status='approved' then p_actor_user_id end,case when v_status='approved' then now() end,case when v_status='retired' then p_actor_user_id end,case when v_status='retired' then now() end,p_actor_user_id,p_actor_user_id) returning id into v_id;
  end if;
  select to_jsonb(k) into v_after from platform.agency_knowledge_cards k where k.id=v_id and k.tenant_id=p_tenant_id;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata) values(p_tenant_id,p_actor_user_id,'user','agency_knowledge.saved','agency_knowledge',v_id::text,v_before,v_after,jsonb_build_object('status',v_status,'knowledge_type',v_type));
  return jsonb_build_object('saved',true,'knowledge_card',v_after,'truth_contract',jsonb_build_object('approval','Approved knowledge is a human governance decision, not an AI policy change.','review','Every approved card has a future review date and should be reconsidered when evidence or market context changes.'));
end;$$;

create or replace function public.platform_server_knowledge_library(p_tenant_id uuid,p_limit integer default 100)
returns jsonb language sql stable security definer set search_path='' as $$
with base as (select k.*,case when k.status='approved' and k.review_due_at<current_date then 'review_overdue' when k.status='approved' and k.review_due_at<=current_date+30 then 'review_due_soon' else k.status end operating_state from platform.agency_knowledge_cards k where k.tenant_id=p_tenant_id), ranked as (select b.*,row_number() over(order by case operating_state when 'review_overdue' then 1 when 'review_due_soon' then 2 when 'draft' then 3 when 'approved' then 4 else 5 end,review_due_at,title) rn from base b)
select jsonb_build_object('available',true,'tenant_id',p_tenant_id,'generated_at',now(),'summary',jsonb_build_object('approved',(select count(*) from base where status='approved'),'draft',(select count(*) from base where status='draft'),'review_overdue',(select count(*) from base where operating_state='review_overdue'),'review_due_soon',(select count(*) from base where operating_state='review_due_soon')),'items',coalesce((select jsonb_agg(jsonb_build_object('rank',rn,'id',id,'knowledge_type',knowledge_type,'title',title,'statement',statement,'status',status,'operating_state',operating_state,'source_kind',source_kind,'source_key',source_key,'evidence_state',evidence_state,'applicability',applicability,'limitations',limitations,'review_due_at',review_due_at,'approved_at',approved_at) order by rn) from ranked where rn<=greatest(1,least(coalesce(p_limit,100),500))),'[]'::jsonb),'truth_contract',jsonb_build_object('staleness','Approved knowledge is surfaced for review when its review date passes; DJM does not silently treat stale knowledge as current.','causality','Knowledge cards preserve their limitations and source evidence. Approval does not convert correlation into causation.','policy','Approved cards inform humans; they do not automatically change autonomy, pricing, market or negotiation policy.'));$$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('platform_server_save_deal_closeout','platform_server_knowledge_candidates','platform_server_save_knowledge_card','platform_server_knowledge_library') loop
    execute format('revoke all on function %s from public, anon, authenticated',r.sig);
    execute format('grant execute on function %s to service_role',r.sig);
  end loop;
end $$;;
