create or replace function public.platform_server_representation_renewal_command(
  p_tenant_id uuid,
  p_horizon_days integer default 120,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable security definer
set search_path=''
as $$
declare
  v_horizon integer:=greatest(30,least(coalesce(p_horizon_days,120),365));
  v_proof jsonb:=public.platform_server_player_value_proof_portfolio(p_tenant_id,30,500);
  v_relationship jsonb:=public.platform_server_player_relationship_control(p_tenant_id,500);
  v_items jsonb;
  v_total integer:=0; v_missing integer:=0; v_due integer:=0; v_current integer:=0;
begin
  with players as (
    select p.id,coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') player_name,p.football_status,p.contract_status,p.contract_expiry
    from public.players p where p.tenant_id=p_tenant_id and p.football_status in ('active','free_agent')
  ), agreements as (
    select distinct on (a.player_id) a.player_id,a.id agreement_id,a.title,a.agreement_type,a.status,a.start_date,a.end_date,a.document_id
    from public.player_agreements a join players p on p.id=a.player_id
    where a.status='active'
    order by a.player_id,a.end_date desc nulls last,a.created_at desc
  ), joined as (
    select p.*,a.agreement_id,a.title agreement_title,a.agreement_type,a.start_date,a.end_date,a.document_id,
      case when a.end_date is null then null else a.end_date-current_date end days_to_representation_end,
      pr.value->>'proof_state' proof_state,
      rel.value->>'state' relationship_control_state,
      rel.value#>>'{service_control,state}' service_control_state,
      coalesce((rel.value#>>'{service_control,high_breach_count}')::integer,0) high_service_breaches
    from players p left join agreements a on a.player_id=p.id
    left join lateral (select value from jsonb_array_elements(coalesce(v_proof->'items','[]'::jsonb)) where value->>'player_id'=p.id::text limit 1) pr on true
    left join lateral (select value from jsonb_array_elements(coalesce(v_relationship->'items','[]'::jsonb)) where value->>'player_id'=p.id::text limit 1) rel on true
  ), classified as (
    select j.*,
      case
        when agreement_id is null then 'representation_record_missing'
        when end_date is not null and end_date<current_date then 'representation_record_expired'
        when end_date is not null and end_date<=current_date+v_horizon then 'renewal_review_due'
        else 'representation_record_current' end renewal_state,
      case
        when agreement_id is null then 1
        when end_date is not null and end_date<current_date then 2
        when end_date is not null and end_date<=current_date+30 then 3
        when end_date is not null and end_date<=current_date+60 then 4
        when end_date is not null and end_date<=current_date+v_horizon then 5
        else 6 end state_rank
    from joined j
  ), ranked as (
    select *,row_number() over(order by state_rank,end_date nulls first,high_service_breaches desc,player_name) rn from classified
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',rn,'player_id',id,'player_name',player_name,'football_status',football_status,'contract_status',contract_status,'contract_expiry',contract_expiry,
    'renewal_state',renewal_state,
    'representation_record',case when agreement_id is null then null else jsonb_build_object('agreement_id',agreement_id,'title',agreement_title,'agreement_type',agreement_type,'start_date',start_date,'end_date',end_date,'days_to_end',days_to_representation_end,'document_linked',document_id is not null) end,
    'service_evidence',jsonb_build_object('value_proof_state',proof_state,'relationship_control_state',relationship_control_state,'service_control_state',service_control_state,'high_service_breaches',high_service_breaches),
    'next_action',case
      when renewal_state='representation_record_missing' then jsonb_build_object('api_action','representation_control','instruction','Review and migrate/link the applicable representation record before treating renewal status as known.','requires_human_input',true)
      when renewal_state='representation_record_expired' then jsonb_build_object('api_action','representation_control','instruction','Review the expired record immediately and confirm the current representation position outside automation.','requires_human_input',true)
      when renewal_state='renewal_review_due' and proof_state='thin_recorded_evidence' then jsonb_build_object('api_action','player_review_pack','instruction','Review service evidence completeness before a human renewal conversation. Thin DJM evidence must not be presented as proof that no work occurred.','requires_human_input',true)
      when renewal_state='renewal_review_due' then jsonb_build_object('api_action','player_review_pack','instruction','Prepare the factual player review pack and conduct the renewal conversation with the player.','requires_human_input',true)
      else jsonb_build_object('api_action','player_value_proof','instruction','Maintain service records and proof cadence; no representation renewal action is forced by the recorded end date.','requires_human_input',false) end
  ) order by rn) filter(where rn<=greatest(1,least(coalesce(p_limit,100),500))),'[]'::jsonb),
  count(*),count(*) filter(where renewal_state='representation_record_missing'),count(*) filter(where renewal_state in ('representation_record_expired','renewal_review_due')),count(*) filter(where renewal_state='representation_record_current')
  into v_items,v_total,v_missing,v_due,v_current from ranked;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'horizon_days',v_horizon,
    'summary',jsonb_build_object('active_players',v_total,'representation_records_missing',v_missing,'renewal_or_expiry_reviews_due',v_due,'representation_records_current',v_current),
    'items',v_items,
    'principle','Prepare representation-record and player-service reviews before recorded end dates without predicting renewal behaviour or making legal-validity judgements.',
    'truth_contract',jsonb_build_object(
      'renewal_probability','No renewal, churn or loyalty probability is calculated.',
      'legal_status','Recorded agreement dates and document linkage are records-control facts, not legal enforceability or FIFA/regulatory compliance judgements.',
      'value_proof','Recorded player-service evidence supports a human review conversation; it is not a guarantee of player satisfaction or renewal.',
      'missing_record','A missing active record means DJM cannot evidence the representation position from its current data. It does not prove no valid agreement exists elsewhere.'
    )
  );
end;
$$;

revoke all on function public.platform_server_representation_renewal_command(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.platform_server_representation_renewal_command(uuid,integer,integer) to service_role;
;
