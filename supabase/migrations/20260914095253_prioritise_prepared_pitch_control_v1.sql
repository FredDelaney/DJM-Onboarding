create or replace function public.platform_server_market_execution_command(p_tenant_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_readiness jsonb:=public.platform_server_pitch_readiness_command(p_tenant_id,100);
  v_execution jsonb:=public.platform_server_pitch_execution_command(p_tenant_id,100);
  v_responses jsonb:=public.platform_server_pitch_response_command(p_tenant_id,100);
  v_learning jsonb:=public.platform_server_pitch_learning(p_tenant_id,365);
  v_demand jsonb:=public.platform_server_demand_control_fast(p_tenant_id,100);
  v_dossiers jsonb:=public.platform_server_external_dossier_command(p_tenant_id,100);
  v_ready int:=0;
  v_career_holds int:=0;
  v_profile_holds int:=0;
  v_explicit int:=0;
  v_not_confirmed_sent int:=0;
  v_sent_no_open int:=0;
  v_next jsonb;
begin
  begin v_ready:=coalesce((v_readiness#>>'{summary,ready_to_prepare_pitch}')::int,0); exception when others then v_ready:=0; end;
  begin v_career_holds:=coalesce((v_readiness#>>'{summary,career_holds}')::int,0); exception when others then v_career_holds:=0; end;
  begin v_profile_holds:=coalesce((v_dossiers#>>'{summary,players_blocking_open_pursuits}')::int,0); exception when others then v_profile_holds:=0; end;
  begin v_explicit:=coalesce((v_execution#>>'{summary,explicit_responses}')::int,0); exception when others then v_explicit:=0; end;
  begin v_not_confirmed_sent:=coalesce((v_execution#>>'{summary,not_confirmed_sent}')::int,0); exception when others then v_not_confirmed_sent:=0; end;
  begin v_sent_no_open:=coalesce((v_execution#>>'{summary,sent_no_recorded_open}')::int,0); exception when others then v_sent_no_open:=0; end;

  v_next:=case
    when v_explicit>0 then jsonb_build_object('lane','explicit_response_review','api_action','pitch_responses','instruction','Review explicit pitch responses first and decide the human commercial next step.')
    when v_not_confirmed_sent>0 then jsonb_build_object('lane','prepared_pitch_control','api_action','pitch_execution','instruction','A pitch is published but not confirmed as sent. Decide whether to deliver, revise or revoke it before starting lower-priority market work.')
    when v_ready>0 then jsonb_build_object('lane','prepare_pitch','api_action','pitch_readiness','instruction','Prepare a pitch for the highest-priority externally ready pursuit. Sending remains human-led.')
    when v_profile_holds>0 then jsonb_build_object('lane','external_dossier_control','api_action','external_dossiers','instruction','Resolve the tenant-branded external dossier blocker on an otherwise career-open pursuit.')
    when v_career_holds>0 then jsonb_build_object('lane','career_control','api_action','pitch_readiness','instruction','Resolve player-owned career strategy gates before external pitching.')
    when v_sent_no_open>0 then jsonb_build_object('lane','sent_pitch_control','api_action','pitch_execution','instruction','Review sent pitches against their recorded deal next-action dates. No open is not a rejection.')
    else jsonb_build_object('lane','demand_and_pursuit','api_action','demand_control_fast','instruction','Work live club demand and create career-cleared pursuits before generating more pitch activity.') end;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),
    'executive_summary',jsonb_build_object(
      'ready_to_prepare_pitch',v_ready,
      'career_control_holds',v_career_holds,
      'external_dossier_holds_blocking_open_pursuits',v_profile_holds,
      'explicit_responses_needing_review',v_explicit,
      'prepared_pitches_not_confirmed_sent',v_not_confirmed_sent,
      'sent_without_recorded_open',v_sent_no_open
    ),
    'next_market_action',v_next,
    'external_dossier_control',v_dossiers,
    'pitch_readiness',v_readiness,
    'pitch_execution',v_execution,
    'explicit_responses',v_responses,
    'demand_control',v_demand,
    'pitch_learning',v_learning,
    'truth_contract',jsonb_build_object(
      'layers','Career permission, dossier share safety, pitch delivery, browser telemetry, explicit response and deal state are separate facts.',
      'dossiers','Dossier presentation advisories do not silently become player-quality judgements. Publication remains a human agency decision.',
      'prepared_pitch','Publishing a share does not mean it was sent. Prepared-but-unsent pitches remain an explicit operating state.',
      'responses','Explicit share responses are stronger evidence than views but responder identity remains self-asserted unless separately verified.',
      'automation','No external message, deal-stage change, dossier publication or market-strategy change occurs automatically from this command.',
      'learning','Pitch learning remains evidence-gated and cannot automatically change agency policy.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_market_execution_command(uuid) from public,anon,authenticated;
grant execute on function public.platform_server_market_execution_command(uuid) to service_role;;
