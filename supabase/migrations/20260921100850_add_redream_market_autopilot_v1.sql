
create or replace function public.redream_autopilot_market(
  p_limit integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,10),25));
  v_tenant uuid := private.redream_request_tenant();
  v_demand jsonb;
  v_pursuit jsonb;
  v_readiness jsonb;
  v_execution jsonb;
  v_responses jsonb;
  v_revenue jsonb;
  v_next jsonb;
  v_conversation_requests integer := 0;
  v_information_requests integer := 0;
  v_ready integer := 0;
  v_profile_holds integer := 0;
  v_career_holds integer := 0;
  v_sent_no_open integer := 0;
  v_roster_gaps integer := 0;
  v_human_review integer := 0;
  v_active_needs integer := 0;
begin
  v_demand := public.platform_server_demand_control_fast(v_tenant,v_limit);
  v_pursuit := public.platform_server_career_aligned_pursuit_board(v_tenant,v_limit);
  v_readiness := public.platform_server_pitch_readiness_command(v_tenant,v_limit);
  v_execution := public.platform_server_pitch_execution_command(v_tenant,v_limit);
  v_responses := public.platform_server_pitch_response_command(v_tenant,v_limit);
  v_revenue := public.platform_server_revenue_command(v_tenant,v_limit);

  begin v_conversation_requests := coalesce((v_responses#>>'{summary,conversation_requests}')::integer,0); exception when others then v_conversation_requests:=0; end;
  begin v_information_requests := coalesce((v_responses#>>'{summary,information_requests}')::integer,0); exception when others then v_information_requests:=0; end;
  begin v_ready := coalesce((v_readiness#>>'{summary,ready_to_prepare_pitch}')::integer,0); exception when others then v_ready:=0; end;
  begin v_profile_holds := coalesce((v_readiness#>>'{summary,profile_or_verification_holds}')::integer,0); exception when others then v_profile_holds:=0; end;
  begin v_career_holds := coalesce((v_readiness#>>'{summary,career_holds}')::integer,0); exception when others then v_career_holds:=0; end;
  begin v_sent_no_open := coalesce((v_execution#>>'{summary,sent_no_recorded_open}')::integer,0); exception when others then v_sent_no_open:=0; end;
  begin v_roster_gaps := coalesce((v_demand#>>'{summary,roster_gaps}')::integer,0); exception when others then v_roster_gaps:=0; end;
  begin v_human_review := coalesce((v_demand#>>'{summary,career_or_human_review}')::integer,0); exception when others then v_human_review:=0; end;
  begin v_active_needs := coalesce((v_demand#>>'{summary,active_needs}')::integer,0); exception when others then v_active_needs:=0; end;

  v_next := case
    when v_conversation_requests + v_information_requests > 0 then
      jsonb_build_object(
        'lane','club_response',
        'priority','human_judgement',
        'instruction','Review explicit club responses first. ReDream can prepare context, but the commercial response remains human-led.'
      )
    when v_ready > 0 then
      jsonb_build_object(
        'lane','prepare_pitch',
        'priority','revenue_action',
        'instruction','Prepare the highest-priority externally ready pitch for human review. Sending remains human-led.'
      )
    when v_profile_holds > 0 then
      jsonb_build_object(
        'lane','external_profile_control',
        'priority','unblock_revenue',
        'instruction','Resolve player verification or club-facing profile readiness that is blocking a credible pursuit.'
      )
    when v_career_holds > 0 then
      jsonb_build_object(
        'lane','career_control',
        'priority','player_judgement',
        'instruction','Resolve the player-owned career strategy gate before escalating external activity.'
      )
    when v_sent_no_open > 0 then
      jsonb_build_object(
        'lane','pitch_follow_up_control',
        'priority','commercial_follow_up',
        'instruction','Review sent pitches against their recorded opportunity next-action dates. No open is not treated as rejection.'
      )
    when v_roster_gaps > 0 then
      jsonb_build_object(
        'lane','source_for_demand',
        'priority','pipeline_creation',
        'instruction','A live club need has no recorded roster candidate. Create or progress a sourcing mandate.'
      )
    when v_human_review > 0 then
      jsonb_build_object(
        'lane','pursuit_exception_review',
        'priority','human_judgement',
        'instruction','Review the strongest pursuit requiring a career or market exception before any external action.'
      )
    when v_active_needs > 0 then
      jsonb_build_object(
        'lane','demand_review',
        'priority','market_work',
        'instruction','Work the highest-priority live club demand and progress the best recorded pursuit.'
      )
    else
      jsonb_build_object(
        'lane','clear',
        'priority','none',
        'instruction','No recorded market action currently needs the agent.'
      )
  end;

  return jsonb_build_object(
    'contract_version','redream_market_autopilot_v1',
    'generated_at',now(),
    'next_market_action',v_next,
    'demand',jsonb_build_object(
      'summary',coalesce(v_demand->'summary','{}'::jsonb),
      'items',coalesce(v_demand->'items','[]'::jsonb)
    ),
    'pursuits',jsonb_build_object(
      'summary',coalesce(v_pursuit->'summary','{}'::jsonb),
      'items',coalesce(v_pursuit->'items','[]'::jsonb)
    ),
    'pitch_readiness',jsonb_build_object(
      'summary',coalesce(v_readiness->'summary','{}'::jsonb),
      'items',coalesce(v_readiness->'items','[]'::jsonb)
    ),
    'pitch_execution',jsonb_build_object(
      'summary',coalesce(v_execution->'summary','{}'::jsonb),
      'items',coalesce(v_execution->'items','[]'::jsonb)
    ),
    'club_responses',jsonb_build_object(
      'summary',coalesce(v_responses->'summary','{}'::jsonb),
      'items',coalesce(v_responses->'items','[]'::jsonb)
    ),
    'revenue_control',jsonb_build_object(
      'by_currency',coalesce(v_revenue->'by_currency','[]'::jsonb),
      'protect_revenue',coalesce(v_revenue->'protect_revenue','[]'::jsonb),
      'commercial_hygiene',coalesce(v_revenue->'commercial_hygiene','{}'::jsonb),
      'pipeline_creation',coalesce(v_revenue->'pipeline_creation','{}'::jsonb)
    ),
    'truth_contract',jsonb_build_object(
      'demand','Only recorded club needs and recorded candidates are surfaced.',
      'career','Player career strategy remains a separate human-owned gate and can block external action.',
      'matching','Pursuit readiness is an operating prioritisation signal, not transfer probability.',
      'pitching','ReDream may prepare external work, but sending a pitch remains human-led.',
      'responses','Explicit club responses require human commercial judgement and do not automatically change deal stage.',
      'revenue','Recorded commission exposure remains separate by currency and is not treated as guaranteed revenue.'
    )
  );
end;
$function$;

revoke all on function public.redream_autopilot_market(integer) from public,anon;
grant execute on function public.redream_autopilot_market(integer) to authenticated,service_role;

comment on function public.redream_autopilot_market(integer) is
  'Tenant-derived ReDream Market Autopilot. Composes recorded club demand, player pursuits, relationship/career gates, pitch readiness, pitch execution, club responses and revenue controls into one commercial operating contract.';
