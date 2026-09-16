create or replace function public.platform_server_pitch_readiness_command(p_tenant_id uuid,p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_board jsonb:=public.platform_server_career_aligned_pursuit_board(p_tenant_id,greatest(1,least(coalesce(p_limit,50),100)));
  v_item jsonb;
  v_items jsonb:='[]'::jsonb;
  v_player_id uuid;
  v_org_id uuid;
  v_match_id uuid;
  v_gate_state text;
  v_player public.players%rowtype;
  v_published boolean:=false;
  v_profile_verified timestamptz;
  v_active_pitch integer:=0;
  v_state text;
  v_next jsonb;
  v_rank integer:=0;
begin
  for v_item in select value from jsonb_array_elements(coalesce(v_board->'items','[]'::jsonb)) loop
    v_player_id:=(v_item#>>'{player,player_id}')::uuid;
    v_org_id:=(v_item#>>'{club,organisation_id}')::uuid;
    v_match_id:=(v_item->>'player_match_id')::uuid;
    v_gate_state:=coalesce(v_item#>>'{career_strategy_gate,state}','unknown');
    select * into v_player from public.players p where p.id=v_player_id and p.tenant_id=p_tenant_id;
    select pp.published,pp.verified_at into v_published,v_profile_verified from public.player_public_profiles pp where pp.player_id=v_player_id;
    v_published:=coalesce(v_published,false);
    select count(*) into v_active_pitch
    from public.club_share_links s
    where s.player_id=v_player_id and s.organisation_id=v_org_id and s.active=true and s.revoked_at is null and (s.expires_at is null or s.expires_at>now());

    v_state:=case
      when v_gate_state not in ('open_aligned','open_approved_exception') then 'career_control_hold'
      when v_player.id is null then 'player_record_missing'
      when v_player.verification_status<>'verified' or v_player.verified_at is null then 'player_not_verified_for_external_share'
      when not v_published then 'club_profile_not_published'
      when v_profile_verified is null then 'club_profile_not_verified'
      when v_active_pitch>0 then 'active_pitch_exists'
      else 'ready_to_prepare_pitch' end;

    v_next:=case
      when v_state='career_control_hold' then jsonb_build_object('api_action','career_alignment','player_id',v_player_id,'instruction','Resolve the human-owned career strategy gate before external pitching.')
      when v_state='player_not_verified_for_external_share' then jsonb_build_object('api_action','player_service_card','player_id',v_player_id,'instruction','Verify the player record before using a public club share.')
      when v_state='club_profile_not_published' then jsonb_build_object('api_action','player_profile','player_id',v_player_id,'instruction','Review and publish the club-facing player profile before pitching.')
      when v_state='club_profile_not_verified' then jsonb_build_object('api_action','player_profile','player_id',v_player_id,'instruction','Verify the club-facing profile before external pitching.')
      when v_state='active_pitch_exists' then jsonb_build_object('api_action','pitch_execution','player_id',v_player_id,'organisation_id',v_org_id,'instruction','Use the existing active pitch rather than creating a duplicate share.')
      else jsonb_build_object('api_action','pitch_prepare','player_match_id',v_match_id,'instruction','Prepare the external pitch for human review. Sending remains a human action.') end;

    v_rank:=v_rank+1;
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
      'rank',v_rank,
      'player_match_id',v_match_id,
      'player',v_item->'player',
      'club',v_item->'club',
      'need',v_item->'need',
      'pursuit_readiness',jsonb_build_object('score',v_item->'readiness_score','state',v_item->'readiness_state'),
      'career_gate',v_item->'career_strategy_gate',
      'external_profile',jsonb_build_object('player_verification_status',v_player.verification_status,'player_verified_at',v_player.verified_at,'profile_published',v_published,'profile_verified_at',v_profile_verified),
      'active_pitch_count',v_active_pitch,
      'pitch_readiness_state',v_state,
      'next_action',v_next
    ));
  end loop;

  return jsonb_build_object(
    'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'items',v_items,
    'summary',jsonb_build_object(
      'pursuits',v_rank,
      'ready_to_prepare_pitch',(select count(*) from jsonb_array_elements(v_items) x where x->>'pitch_readiness_state'='ready_to_prepare_pitch'),
      'career_holds',(select count(*) from jsonb_array_elements(v_items) x where x->>'pitch_readiness_state'='career_control_hold'),
      'profile_or_verification_holds',(select count(*) from jsonb_array_elements(v_items) x where x->>'pitch_readiness_state' in ('player_not_verified_for_external_share','club_profile_not_published','club_profile_not_verified')),
      'active_pitches',(select count(*) from jsonb_array_elements(v_items) x where x->>'pitch_readiness_state'='active_pitch_exists')
    ),
    'truth_contract',jsonb_build_object(
      'separation','Internal pursuit readiness, player career permission and external pitch readiness are separate controls.',
      'profile','DJM only treats a pitch as externally shareable when the player record is verified and the club-facing public profile is published and verified.',
      'send','Ready to prepare does not mean automatically send. External pitching remains a human action.',
      'duplicates','An existing active share blocks duplicate pitch creation and routes the user back to Pitch Execution.'
    )
  );
end;
$function$;

revoke all on function public.platform_server_pitch_readiness_command(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_pitch_readiness_command(uuid,integer) to service_role;;
