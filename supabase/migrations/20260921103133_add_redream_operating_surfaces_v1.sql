
create or replace function public.redream_autopilot_players(
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,20),100));
  v_tenant uuid := private.redream_request_tenant();
  v_service jsonb;
  v_relationships jsonb;
  v_renewals jsonb;
  v_representation jsonb;
  v_verification jsonb;
  v_value jsonb;
  v_next jsonb;
  v_urgent integer := 0;
  v_immediate integer := 0;
  v_renewal_due integer := 0;
  v_rep_missing integer := 0;
  v_verify integer := 0;
  v_market_gaps integer := 0;
begin
  v_service := public.platform_server_player_service_command(v_tenant,v_limit);
  v_relationships := public.platform_server_player_relationship_control(v_tenant,v_limit);
  v_renewals := public.platform_server_representation_renewal_command(v_tenant,120,v_limit);
  v_representation := public.platform_server_representation_records_control(v_tenant,120);
  v_verification := public.platform_server_verification_queue(v_tenant,least(v_limit,25));
  v_value := public.platform_server_player_value_proof_portfolio(v_tenant,30,v_limit);

  begin v_urgent := coalesce((v_service#>>'{summary,urgent_service_queue}')::integer,0); exception when others then v_urgent:=0; end;
  begin v_immediate := coalesce((v_relationships#>>'{summary,immediate_service_interventions}')::integer,0); exception when others then v_immediate:=0; end;
  begin v_renewal_due := coalesce((v_renewals#>>'{summary,renewal_or_expiry_reviews_due}')::integer,0); exception when others then v_renewal_due:=0; end;
  begin v_rep_missing := coalesce((v_renewals#>>'{summary,representation_records_missing}')::integer,0); exception when others then v_rep_missing:=0; end;
  begin v_verify := coalesce((v_verification#>>'{summary,verification_item_count}')::integer,0); exception when others then v_verify:=0; end;
  begin v_market_gaps := coalesce((v_service#>>'{summary,market_coverage_gaps}')::integer,0); exception when others then v_market_gaps:=0; end;

  v_next := case
    when v_urgent>0 or v_immediate>0 then jsonb_build_object(
      'lane','player_service',
      'priority','protect_player_relationship',
      'instruction','Resolve the highest-priority player service exception before lower-value administration.'
    )
    when v_renewal_due>0 then jsonb_build_object(
      'lane','representation_renewal',
      'priority','retention',
      'instruction','Prepare the next factual representation renewal review and player service evidence pack.'
    )
    when v_rep_missing>0 then jsonb_build_object(
      'lane','representation_records',
      'priority','control',
      'instruction','Resolve missing representation records so ReDream can reliably protect renewal, authority and deal preparation.'
    )
    when v_verify>0 then jsonb_build_object(
      'lane','verification',
      'priority','data_safety',
      'instruction','Review the highest-value player verification item blocking safe external or commercial work.'
    )
    when v_market_gaps>0 then jsonb_build_object(
      'lane','market_coverage',
      'priority','career_revenue',
      'instruction','Build market coverage for the highest-priority player with a current career trigger and no adequate recorded route.'
    )
    else jsonb_build_object(
      'lane','controlled',
      'priority','none',
      'instruction','No recorded player-service exception currently requires agent attention.'
    )
  end;

  return jsonb_build_object(
    'contract_version','redream_player_autopilot_v1',
    'generated_at',now(),
    'next_player_action',v_next,
    'service',jsonb_build_object(
      'summary',coalesce(v_service->'summary','{}'::jsonb),
      'players',coalesce(v_service->'players','[]'::jsonb)
    ),
    'relationship_control',jsonb_build_object(
      'summary',coalesce(v_relationships->'summary','{}'::jsonb),
      'items',coalesce(v_relationships->'items','[]'::jsonb)
    ),
    'representation_renewal',jsonb_build_object(
      'summary',coalesce(v_renewals->'summary','{}'::jsonb),
      'items',coalesce(v_renewals->'items','[]'::jsonb)
    ),
    'representation_records',jsonb_build_object(
      'summary',coalesce(v_representation->'summary','{}'::jsonb),
      'players',coalesce(v_representation->'players','[]'::jsonb),
      'expiring_documents',coalesce(v_representation->'expiring_documents','[]'::jsonb)
    ),
    'verification',v_verification,
    'value_proof',jsonb_build_object(
      'summary',coalesce(v_value->'summary','{}'::jsonb),
      'items',coalesce(v_value->'items','[]'::jsonb)
    ),
    'truth_contract',jsonb_build_object(
      'service','Operational control and recorded service evidence, not player satisfaction.',
      'representation','Representation dates and records are records-control facts, not legal-validity conclusions.',
      'renewal','No renewal or churn probability is calculated.',
      'market','Market coverage reflects recorded ReDream activity only.'
    )
  );
end;
$function$;

create or replace function public.redream_player_service(
  p_player_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  return jsonb_build_object(
    'contract_version','redream_player_service_v1',
    'generated_at',now(),
    'service',public.platform_server_player_service_card(v_tenant,p_player_id),
    'player_safe_statement',public.platform_server_player_service_statement(v_tenant,p_player_id),
    'career_alignment',public.platform_server_player_career_alignment(v_tenant,p_player_id),
    'value_proof',public.platform_server_player_value_proof(v_tenant,p_player_id,30)
  );
end;
$function$;

create or replace function public.redream_autopilot_clubs(
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,20),100));
  v_tenant uuid := private.redream_request_tenant();
  v_portfolio jsonb;
  v_accounts jsonb;
  v_next jsonb;
  v_underconnected integer := 0;
  v_intro integer := 0;
  v_deals integer := 0;
  v_demand integer := 0;
begin
  v_portfolio := public.platform_server_club_portfolio_control(v_tenant,v_limit);
  v_accounts := public.platform_server_club_accounts(v_tenant,v_limit);

  begin v_underconnected := coalesce((v_accounts#>>'{summary,underconnected_live_accounts}')::integer,0); exception when others then v_underconnected:=0; end;
  begin v_intro := coalesce((v_accounts#>>'{summary,live_accounts_with_strong_introduction_option}')::integer,0); exception when others then v_intro:=0; end;
  begin v_deals := coalesce((v_accounts#>>'{summary,clubs_with_active_deals}')::integer,0); exception when others then v_deals:=0; end;
  begin v_demand := coalesce((v_accounts#>>'{summary,clubs_with_confirmed_demand}')::integer,0); exception when others then v_demand:=0; end;

  v_next := case
    when v_intro>0 then jsonb_build_object(
      'lane','warm_introduction',
      'priority','revenue_access',
      'instruction','Use the strongest recorded warm-introduction route on a live commercial club account.'
    )
    when v_underconnected>0 then jsonb_build_object(
      'lane','relationship_development',
      'priority','revenue_access',
      'instruction','Strengthen access to the highest-value live club account where ReDream records weak relationship coverage.'
    )
    when v_deals>0 then jsonb_build_object(
      'lane','protect_live_business',
      'priority','revenue',
      'instruction','Protect the highest-value club account with active deal exposure and keep its next actions controlled.'
    )
    when v_demand>0 then jsonb_build_object(
      'lane','serve_confirmed_demand',
      'priority','pipeline_creation',
      'instruction','Work the strongest confirmed club demand and route the best credible player through the strongest access path.'
    )
    else jsonb_build_object(
      'lane','network_development',
      'priority','none',
      'instruction','No recorded live club account currently requires commercial escalation.'
    )
  end;

  return jsonb_build_object(
    'contract_version','redream_club_autopilot_v1',
    'generated_at',now(),
    'next_club_action',v_next,
    'portfolio',v_portfolio,
    'accounts',jsonb_build_object(
      'summary',coalesce(v_accounts->'summary','{}'::jsonb),
      'clubs',coalesce(v_accounts->'clubs','[]'::jsonb)
    ),
    'truth_contract',jsonb_build_object(
      'access','Relationship and introduction routes are deterministic rankings from recorded evidence, not probabilities.',
      'commercial','Recorded deal exposure is not guaranteed revenue.',
      'network','Absence of a recorded relationship does not prove the agency has no offline access.'
    )
  );
end;
$function$;

create or replace function public.redream_club_account(
  p_organisation_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  return public.platform_server_club_account(v_tenant,p_organisation_id);
end;
$function$;

create or replace function public.redream_autopilot_deals(
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,20),100));
  v_tenant uuid := private.redream_request_tenant();
  v_portfolio jsonb;
  v_deadlines jsonb;
  v_receivables jsonb;
  v_closeout jsonb;
  v_risk jsonb;
  v_next jsonb;
  v_overdue integer := 0;
  v_unowned integer := 0;
  v_receivable_overdue integer := 0;
  v_closeout_due integer := 0;
begin
  v_portfolio := public.platform_server_deal_portfolio_v4(v_tenant,v_limit);
  v_deadlines := public.platform_server_execution_deadline_command(v_tenant,90,v_limit);
  v_receivables := public.platform_server_receivables_command(v_tenant,90,v_limit);
  v_closeout := public.platform_server_deal_closeout_command(v_tenant,v_limit);
  v_risk := public.platform_server_commercial_exposure_risk(v_tenant);

  begin v_overdue := coalesce((v_deadlines#>>'{summary,overdue}')::integer,0); exception when others then v_overdue:=0; end;
  begin v_unowned := coalesce((public.platform_server_team_capacity(v_tenant)#>>'{summary,active_deals_without_owner}')::integer,0); exception when others then v_unowned:=0; end;
  begin v_receivable_overdue := coalesce((v_receivables#>>'{summary,overdue_receivables}')::integer,0); exception when others then v_receivable_overdue:=0; end;
  begin v_closeout_due := coalesce((v_closeout#>>'{summary,closeout_required}')::integer,0); exception when others then v_closeout_due:=0; end;

  v_next := case
    when v_unowned>0 then jsonb_build_object(
      'lane','deal_ownership',
      'priority','control',
      'instruction','Assign an accountable owner to the highest-value unowned active deal.'
    )
    when v_overdue>0 then jsonb_build_object(
      'lane','deal_execution',
      'priority','protect_revenue',
      'instruction','Resolve the highest-priority overdue deal action or deliberately reset it.'
    )
    when v_receivable_overdue>0 then jsonb_build_object(
      'lane','commission_collection',
      'priority','cash_collection',
      'instruction','Review the oldest overdue commission receivable and record the real collection next step.'
    )
    when v_closeout_due>0 then jsonb_build_object(
      'lane','deal_closeout',
      'priority','learning_and_control',
      'instruction','Complete the oldest deal closeout so ReDream preserves the outcome and can learn from it.'
    )
    else jsonb_build_object(
      'lane','portfolio',
      'priority','revenue',
      'instruction','Protect the strongest live deal and keep its next move, access route and negotiation preparation current.'
    )
  end;

  return jsonb_build_object(
    'contract_version','redream_deal_autopilot_v1',
    'generated_at',now(),
    'next_deal_action',v_next,
    'portfolio',v_portfolio,
    'deadlines',v_deadlines,
    'receivables',v_receivables,
    'closeout',v_closeout,
    'commercial_risk',v_risk,
    'truth_contract',jsonb_build_object(
      'probability','Deal probabilities remain recorded estimates, not ReDream predictions.',
      'receivables','Collections records are human-confirmed and are not accounting or legal conclusions.',
      'closeout','Closing evidence supports learning but does not prove causality.'
    )
  );
end;
$function$;

create or replace function public.redream_deal_war_room(
  p_deal_room_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  return public.platform_server_deal_war_room_instant_v3(v_tenant,p_deal_room_id);
end;
$function$;

create or replace function public.redream_autopilot_operations(
  p_horizon_days integer default 90,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_horizon integer := greatest(1,least(coalesce(p_horizon_days,90),366));
  v_limit integer := greatest(1,least(coalesce(p_limit,30),100));
  v_tenant uuid := private.redream_request_tenant();
  v_deadlines jsonb;
  v_capacity jsonb;
  v_receivables jsonb;
  v_renewals jsonb;
  v_roi jsonb;
  v_learning jsonb;
begin
  v_deadlines := public.platform_server_execution_deadline_command(v_tenant,v_horizon,v_limit);
  v_capacity := public.platform_server_team_capacity(v_tenant);
  v_receivables := public.platform_server_receivables_command(v_tenant,v_horizon,v_limit);
  v_renewals := public.platform_server_representation_renewal_command(v_tenant,least(greatest(v_horizon,30),365),v_limit);
  v_roi := public.platform_server_agency_roi_proof(v_tenant,30);
  v_learning := public.platform_server_learning_center(v_tenant);

  return jsonb_build_object(
    'contract_version','redream_operations_autopilot_v1',
    'generated_at',now(),
    'deadlines',v_deadlines,
    'team_capacity',v_capacity,
    'receivables',v_receivables,
    'representation_renewal',v_renewals,
    'value_proof',v_roi,
    'learning',jsonb_build_object(
      'maturity_state',v_learning->>'maturity_state',
      'next_learning_action',v_learning->'next_learning_action',
      'data_flywheel',v_learning->'data_flywheel'
    )
  );
end;
$function$;

revoke all on function public.redream_autopilot_players(integer) from public,anon;
revoke all on function public.redream_player_service(uuid) from public,anon;
revoke all on function public.redream_autopilot_clubs(integer) from public,anon;
revoke all on function public.redream_club_account(uuid) from public,anon;
revoke all on function public.redream_autopilot_deals(integer) from public,anon;
revoke all on function public.redream_deal_war_room(uuid) from public,anon;
revoke all on function public.redream_autopilot_operations(integer,integer) from public,anon;

grant execute on function public.redream_autopilot_players(integer) to authenticated,service_role;
grant execute on function public.redream_player_service(uuid) to authenticated,service_role;
grant execute on function public.redream_autopilot_clubs(integer) to authenticated,service_role;
grant execute on function public.redream_club_account(uuid) to authenticated,service_role;
grant execute on function public.redream_autopilot_deals(integer) to authenticated,service_role;
grant execute on function public.redream_deal_war_room(uuid) to authenticated,service_role;
grant execute on function public.redream_autopilot_operations(integer,integer) to authenticated,service_role;
