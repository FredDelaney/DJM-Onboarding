-- Explicit DJM owner/admin shortlist against an existing player/request match.
-- Never creates a match, sends a pitch, or changes advanced commercial states.
CREATE OR REPLACE FUNCTION public.platform_server_club_need_shortlist(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_player_match_id uuid,
  p_operation text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_need_id uuid;
  v_player_id uuid;
  v_club_id uuid;
  v_before text;
  v_after text;
  v_mode text := lower(btrim(coalesce(p_operation,'')));
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
    OR NOT coalesce(private.user_is_tenant_admin(p_tenant_id,p_actor_user_id),false)
  THEN RAISE EXCEPTION 'club_shortlist_admin_required' USING ERRCODE='42501'; END IF;
  IF v_mode NOT IN ('shortlist','remove')
  THEN RAISE EXCEPTION 'Invalid shortlist operation' USING ERRCODE='22023'; END IF;

  SELECT m.club_need_id,m.player_id,n.organisation_id,m.status
    INTO v_need_id,v_player_id,v_club_id,v_before
  FROM djm_os.player_matches m
  JOIN djm_os.club_needs n ON n.id=m.club_need_id AND n.tenant_id=m.tenant_id
  JOIN djm_os.organisations o ON o.id=n.organisation_id AND o.tenant_id=n.tenant_id
  JOIN public.players p ON p.id=m.player_id AND p.tenant_id=m.tenant_id
  WHERE m.id=p_player_match_id AND m.tenant_id=p_tenant_id
    AND n.archived_at IS NULL AND n.status='active'
    AND (n.expires_at IS NULL OR n.expires_at>=now())
    AND o.archived_at IS NULL AND o.organisation_type='club'
    AND p.archived_at IS NULL AND coalesce(p.football_status,'active')<>'retired'
  FOR UPDATE OF m;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'club_match_unavailable' USING ERRCODE='P0002';
  END IF;
  IF v_before NOT IN ('suggested','reviewing','shortlisted') THEN
    RAISE EXCEPTION 'Match has progressed beyond the internal shortlist. Use the pitch/deal workflow.' USING ERRCODE='23514';
  END IF;

  v_after := CASE WHEN v_mode='shortlist' THEN 'shortlisted'
                  WHEN v_before='shortlisted' THEN 'reviewing'
                  ELSE v_before END;

  IF v_after=v_before THEN
    RETURN jsonb_build_object('saved',true,'changed',false,
      'player_match_id',p_player_match_id,'club_need_id',v_need_id,
      'player_id',v_player_id,'status',v_after);
  END IF;

  UPDATE djm_os.player_matches
  SET status=v_after,updated_at=now()
  WHERE tenant_id=p_tenant_id AND id=p_player_match_id;

  INSERT INTO platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    after_state,metadata
  ) VALUES(
    p_tenant_id,p_actor_user_id,'user','platform.club_need.shortlist_changed',
    'player_match',p_player_match_id::text,
    jsonb_build_object('club_need_id',v_need_id,'player_id',v_player_id,
      'organisation_id',v_club_id,'status',v_after),
    jsonb_build_object('source','explicit_owner_choice',
      'previous_status',v_before,'operation',v_mode,'external_pitch_sent',false)
  );
  RETURN jsonb_build_object('saved',true,'changed',true,
    'player_match_id',p_player_match_id,'club_need_id',v_need_id,
    'player_id',v_player_id,'status',v_after);
END;
$function$;
REVOKE ALL ON FUNCTION public.platform_server_club_need_shortlist(uuid,uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_server_club_need_shortlist(uuid,uuid,uuid,text)
  TO service_role;
