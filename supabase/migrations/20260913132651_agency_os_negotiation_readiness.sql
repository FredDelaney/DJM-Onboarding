create or replace function public.platform_server_negotiation_readiness(p_tenant_id uuid,p_deal_room_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_deal djm_os.deal_rooms%rowtype;
  v_player public.players%rowtype;
  v_need djm_os.club_needs%rowtype;
  v_match djm_os.player_matches%rowtype;
  v_evidence jsonb;
  v_access jsonb;
  v_agreements jsonb;
  v_documents jsonb;
  v_active_rep integer:=0;
  v_active_rep_with_doc integer:=0;
  v_doc_count integer:=0;
  v_valid_doc_count integer:=0;
  v_rep integer:=35;
  v_contract integer:=35;
  v_commercial integer:=20;
  v_registration integer:=45;
  v_documents_score integer:=30;
  v_evidence_score integer:=50;
  v_access_score integer:=0;
  v_score integer;
  v_state text;
  v_mode text;
  v_gaps jsonb:='[]'::jsonb;
  v_budget_alignment jsonb;
  v_salary_alignment text:='unknown';
  v_fee_alignment text:='unknown';
  v_rep_state text;
  v_contract_state text;
  v_registration_source text:='no_specific_registration_evidence';
begin
  select * into v_deal from djm_os.deal_rooms d where d.id=p_deal_room_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  if v_deal.player_id is null then
    return jsonb_build_object(
      'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'available',false,'reason','player_link_required',
      'interpretation','Negotiation readiness currently requires a player-linked deal. Prospect-only deals need a separate evidence path.'
    );
  end if;

  select * into v_player from public.players p where p.id=v_deal.player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found_for_tenant'; end if;
  if v_deal.club_need_id is not null then select * into v_need from djm_os.club_needs n where n.id=v_deal.club_need_id and n.tenant_id=p_tenant_id; end if;
  if v_deal.club_need_id is not null then
    select * into v_match from djm_os.player_matches pm
    where pm.tenant_id=p_tenant_id and pm.club_need_id=v_deal.club_need_id and pm.player_id=v_deal.player_id limit 1;
  end if;

  select count(*) filter(where a.status='active' and a.agreement_type in ('representation','placement_authorisation','mandate'))::integer,
         count(*) filter(where a.status='active' and a.agreement_type in ('representation','placement_authorisation','mandate') and a.document_id is not null)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'agreement_id',a.id,'agreement_type',a.agreement_type,'status',a.status,'title',a.title,'start_date',a.start_date,'end_date',a.end_date,
           'territory',a.territory,'commission_terms_recorded',nullif(trim(a.commission_terms),'') is not null,'document_id',a.document_id,
           'date_state',case when a.status<>'active' then a.status when a.end_date is not null and a.end_date<current_date then 'recorded_active_but_end_date_passed' when a.start_date is not null and a.start_date>current_date then 'recorded_active_but_not_started' else 'recorded_active_in_date_window' end
         ) order by case when a.status='active' then 0 else 1 end,a.end_date desc nulls last,a.created_at desc),'[]'::jsonb)
  into v_active_rep,v_active_rep_with_doc,v_agreements
  from public.player_agreements a
  join public.players tp on tp.id=a.player_id and tp.tenant_id=p_tenant_id
  where a.player_id=v_deal.player_id;

  select count(*)::integer,
         count(*) filter(where pd.expires_at is null or pd.expires_at>=current_date)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'document_id',pd.id,'title',pd.title,'document_type',pd.document_type,'club_shareable',pd.club_shareable,'country',pd.country,'expires_at',pd.expires_at,
           'expiry_state',case when pd.expires_at is null then 'no_expiry_recorded' when pd.expires_at<current_date then 'expired' when pd.expires_at<=current_date+30 then 'expires_within_30d' else 'valid_beyond_30d' end
         ) order by pd.created_at desc),'[]'::jsonb)
  into v_doc_count,v_valid_doc_count,v_documents
  from public.player_documents pd
  join public.players tp on tp.id=pd.player_id and tp.tenant_id=p_tenant_id
  where pd.player_id=v_deal.player_id;

  v_rep_state:=case
    when v_active_rep_with_doc>0 then 'active_relevant_agreement_with_document_recorded'
    when v_active_rep>0 then 'active_relevant_agreement_recorded_without_linked_document'
    else 'no_active_relevant_agreement_recorded' end;
  v_rep:=case when v_active_rep_with_doc>0 then 100 when v_active_rep>0 then 75 else 35 end;
  if v_active_rep=0 then v_gaps:=v_gaps||jsonb_build_array('representation_or_mandate_record_not_confirmed_in_platform'); end if;
  if v_active_rep>0 and v_active_rep_with_doc=0 then v_gaps:=v_gaps||jsonb_build_array('active_representation_record_has_no_linked_document'); end if;

  v_contract_state:=case
    when v_player.contract_status='free_agent' then 'recorded_free_agent'
    when v_player.contract_status='under_contract' and v_player.contract_expiry is not null then 'recorded_under_contract_with_expiry'
    when v_player.contract_status is not null then 'contract_status_recorded_expiry_missing'
    else 'contract_position_not_recorded' end;
  v_contract:=case
    when v_player.contract_status='free_agent' then 100
    when v_player.contract_status='under_contract' and v_player.contract_expiry is not null then 100
    when v_player.contract_status is not null then 70 else 35 end;
  if v_contract<80 then v_gaps:=v_gaps||jsonb_build_array('player_contract_position_needs_clarification'); end if;

  v_commercial:=20
    + case when v_deal.currency is not null then 15 else 0 end
    + case when v_deal.transfer_fee is not null or v_player.contract_status='free_agent' then 20 else 0 end
    + case when v_deal.player_salary is not null then 20 else 0 end
    + case when v_deal.salary_period is not null then 15 else 0 end
    + case when nullif(trim(v_deal.financial_notes),'') is not null then 10 else 0 end;
  v_commercial:=least(100,v_commercial);
  if v_deal.player_salary is null then v_gaps:=v_gaps||jsonb_build_array('player_salary_not_recorded'); end if;
  if v_deal.salary_period is null then v_gaps:=v_gaps||jsonb_build_array('salary_period_not_recorded'); end if;
  if v_deal.transfer_fee is null and v_player.contract_status<>'free_agent' then v_gaps:=v_gaps||jsonb_build_array('transfer_fee_or_release_position_not_recorded'); end if;

  if v_match.id is not null and v_match.registration_score is not null then
    v_registration:=round(v_match.registration_score)::integer;
    v_registration_source:='player_match.registration_score';
  elsif v_need.id is not null and (nullif(trim(v_need.registration_notes),'') is not null or nullif(trim(v_need.passport_requirements),'') is not null or nullif(trim(v_need.foreign_player_notes),'') is not null) then
    v_registration:=70;
    v_registration_source:='club_need_registration_context_recorded_without_player_registration_score';
  else
    v_registration:=45;
    v_registration_source:='no_specific_registration_evidence';
  end if;
  if v_registration<65 then v_gaps:=v_gaps||jsonb_build_array('registration_case_requires_verification'); end if;

  v_documents_score:=case when v_active_rep_with_doc>0 and v_valid_doc_count>=2 then 100 when v_active_rep_with_doc>0 then 80 when v_valid_doc_count>=2 then 65 when v_valid_doc_count=1 then 50 else 30 end;
  if v_doc_count=0 then v_gaps:=v_gaps||jsonb_build_array('no_player_documents_recorded_for_deal_preparation'); end if;

  v_evidence:=platform.command_evidence_health_v2(p_tenant_id,jsonb_build_object('source_type','deal_room','source_id',v_deal.id::text,'player_id',v_deal.player_id,'club_need_id',v_deal.club_need_id));
  begin v_evidence_score:=coalesce((v_evidence->>'score')::integer,50); exception when others then v_evidence_score:=50; end;
  v_access:=public.platform_server_access_routes(p_tenant_id,v_deal.organisation_id,3);
  begin v_access_score:=coalesce((v_access->'best_route'->>'route_score')::integer,0); exception when others then v_access_score:=0; end;

  if v_need.id is not null and v_need.salary_budget is not null and v_deal.player_salary is not null then
    if coalesce(v_deal.salary_period,'')<>coalesce(v_need.salary_period,v_deal.salary_period,'') and v_need.salary_period is not null then
      v_salary_alignment:='period_mismatch_not_comparable';
    elsif v_deal.player_salary<=v_need.salary_budget then v_salary_alignment:='within_recorded_budget'; else v_salary_alignment:='above_recorded_budget'; end if;
  end if;
  if v_need.id is not null and v_need.transfer_budget is not null and v_deal.transfer_fee is not null then
    if v_deal.transfer_fee<=v_need.transfer_budget then v_fee_alignment:='within_recorded_budget'; else v_fee_alignment:='above_recorded_budget'; end if;
  end if;
  v_budget_alignment:=jsonb_build_object(
    'salary',v_salary_alignment,'transfer_fee',v_fee_alignment,
    'club_salary_budget',v_need.salary_budget,'club_transfer_budget',v_need.transfer_budget,'need_currency',v_need.currency,'deal_currency',v_deal.currency,
    'warning','Budget alignment only compares recorded numeric values when periods/currencies are sufficiently compatible. It is not a valuation or affordability conclusion.'
  );

  v_score:=round(
    v_rep*0.20 + v_contract*0.15 + v_commercial*0.20 + v_registration*0.15 + v_documents_score*0.10 + v_evidence_score*0.15 + least(100,v_access_score)*0.05
  )::integer;
  v_state:=case when v_score>=85 then 'strong_recorded_readiness' when v_score>=70 then 'mostly_ready_with_gaps' when v_score>=55 then 'prepare_before_negotiation' else 'recorded_readiness_low' end;
  v_mode:=case
    when v_evidence_score<65 then 'verify_evidence_first'
    when v_deal.stage in ('negotiating','offer','contracting') and v_active_rep=0 then 'verify_representation_record_before_terms'
    when v_deal.stage in ('negotiating','offer','contracting') and v_registration<65 then 'verify_registration_before_terms'
    when v_deal.stage in ('negotiating','offer','contracting') and v_commercial<70 then 'complete_commercial_terms_before_terms'
    when v_deal.stage in ('negotiating','offer','contracting') and v_score>=70 then 'human_negotiation_review'
    when v_score>=70 then 'pre_negotiation_preparation_strong'
    else 'pre_negotiation_preparation_required' end;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,'available',true,'score',v_score,'state',v_state,'operating_mode',v_mode,'gaps',v_gaps,
    'factors',jsonb_build_object(
      'representation_record',jsonb_build_object('score',v_rep,'weight',0.20,'state',v_rep_state,'agreements',v_agreements,
        'legal_warning','This checks what is recorded in the platform. An absent or present record does not by itself establish legal authority, enforceability or regulatory compliance.'),
      'player_contract_position',jsonb_build_object('score',v_contract,'weight',0.15,'state',v_contract_state,'contract_status',v_player.contract_status,'contract_expiry',v_player.contract_expiry,'current_club',v_player.current_club),
      'commercial_terms_clarity',jsonb_build_object('score',v_commercial,'weight',0.20,'transfer_fee',v_deal.transfer_fee,'player_salary',v_deal.player_salary,'salary_period',v_deal.salary_period,'currency',v_deal.currency,'financial_notes_recorded',nullif(trim(v_deal.financial_notes),'') is not null,'budget_alignment',v_budget_alignment),
      'registration_readiness',jsonb_build_object('score',v_registration,'weight',0.15,'source',v_registration_source,'registration_notes',v_need.registration_notes,'passport_requirements',v_need.passport_requirements,'foreign_player_notes',v_need.foreign_player_notes,
        'warning','A registration score or note is an internal readiness signal, not legal eligibility confirmation.'),
      'document_readiness',jsonb_build_object('score',v_documents_score,'weight',0.10,'recorded_documents',v_documents,'document_count',v_doc_count,'non_expired_or_no_expiry_count',v_valid_doc_count,
        'warning','Document presence is not proof that a complete legal or registration pack exists; required documents vary by transaction and jurisdiction.'),
      'evidence_health',jsonb_build_object('score',v_evidence_score,'weight',0.15,'detail',v_evidence),
      'club_access',jsonb_build_object('score',least(100,v_access_score),'weight',0.05,'best_route',v_access->'best_route')
    ),
    'readiness_statement',case
      when v_mode='human_negotiation_review' then 'Recorded operational inputs are sufficiently complete for human negotiation review, subject to legal, registration and transaction-specific verification.'
      when v_mode='verify_representation_record_before_terms' then 'The deal is at a term-negotiation stage but the platform does not contain an active relevant representation/mandate record. Verify the authority record before relying on the platform for negotiation preparation.'
      when v_mode='verify_registration_before_terms' then 'The deal is at a term-negotiation stage but the recorded registration case is insufficient. Verify registration requirements before relying on the platform for term preparation.'
      when v_mode='verify_evidence_first' then 'Material deal facts are below the evidence threshold and should be verified before negotiation preparation.'
      else 'Use this as an internal preparation checklist. It is not legal advice, eligibility confirmation or authority to negotiate.' end,
    'truth_contract',jsonb_build_object(
      'representation','record-presence check only, not legal authority conclusion','contract_position','recorded player contract data only','registration','internal readiness signal, not legal eligibility','documents','recorded files only, not complete-pack certification','commercial_terms','recorded term completeness and simple budget comparison only','overall_score','internal preparation completeness, not probability of signing or legal readiness'
    )
  );
end;
$$;

revoke execute on function public.platform_server_negotiation_readiness(uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_negotiation_readiness(uuid,uuid) to service_role;;
