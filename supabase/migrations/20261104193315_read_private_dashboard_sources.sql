BEGIN;

CREATE FUNCTION public.platform_server_dashboard_sources(
  p_tenant_id uuid, p_actor_user_id uuid, p_scope text, p_fixture_date date, p_today date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  actor_role text;
  fixtures jsonb;
  requests jsonb;
  tasks jsonb;
BEGIN
  SELECT m.role::text INTO actor_role
  FROM platform.tenant_memberships m
  JOIN platform.tenants t ON t.id = m.tenant_id AND t.status = 'active'
  WHERE m.tenant_id = p_tenant_id AND m.user_id = p_actor_user_id AND m.status = 'active';

  IF actor_role IS NULL OR actor_role NOT IN ('owner','admin','operations','agent','scout')
     OR p_scope IS NULL OR p_scope NOT IN ('me','agency')
     OR (p_scope = 'agency' AND actor_role NOT IN ('owner','admin'))
     OR p_fixture_date IS NULL OR p_today IS NULL THEN
    RAISE EXCEPTION 'dashboard_access_denied' USING ERRCODE = '42501';
  END IF;

  -- Return only verified links for players already visible in this scope.
  SELECT coalesce(jsonb_agg(to_jsonb(link)), '[]'::jsonb) INTO fixtures
  FROM (
    SELECT DISTINCT s.player_id, f.id AS fixture_id, f.kickoff_at,
      f.home_team_name, f.away_team_name, f.status
    FROM public.players p
    JOIN djm_os.player_match_stat_snapshots s ON s.player_id = p.id
    JOIN djm_os.football_fixtures f ON f.id = s.fixture_id
    WHERE p.tenant_id = p_tenant_id AND p.archived_at IS NULL
      AND s.match_date BETWEEN p_fixture_date - 1 AND p_fixture_date + 1
      AND (p_scope = 'agency' OR p.primary_staff_user_id = p_actor_user_id OR EXISTS (
        SELECT 1 FROM public.staff_player_access a
        WHERE a.staff_user_id = p_actor_user_id AND a.player_id = p.id
      ))
    ORDER BY f.kickoff_at, f.id, s.player_id
    LIMIT 501
  ) link;

  IF actor_role IN ('owner','admin') THEN
    SELECT coalesce(jsonb_agg(to_jsonb(request) ORDER BY request.updated_at DESC, request.id), '[]'::jsonb)
    INTO requests
    FROM (
      SELECT n.id, n.updated_at, coalesce(o.name, 'Club') AS club_name,
        coalesce(nullif(n.position,''), nullif(n.title,''), 'Unspecified position') AS position,
        n.need_type, matches.candidate_count, matches.shortlisted_count, pitches.pitched_count
      FROM (
        SELECT id, organisation_id, updated_at, position, title, need_type
        FROM djm_os.club_needs
        WHERE tenant_id = p_tenant_id AND archived_at IS NULL
          AND status IN ('active','open','confirmed')
          AND (p_scope = 'agency' OR owner_user_id = p_actor_user_id)
        ORDER BY updated_at DESC, id LIMIT 7
      ) n
      LEFT JOIN djm_os.organisations o ON o.id = n.organisation_id AND o.tenant_id = p_tenant_id
      CROSS JOIN LATERAL (
        SELECT count(*) AS candidate_count,
          count(*) FILTER (WHERE m.status IN ('shortlisted','selected')) AS shortlisted_count
        FROM djm_os.player_matches m WHERE m.tenant_id = p_tenant_id AND m.club_need_id = n.id
      ) matches
      CROSS JOIN LATERAL (
        SELECT count(*) AS pitched_count FROM djm_os.deal_rooms d
        WHERE d.tenant_id = p_tenant_id AND d.club_need_id = n.id
          AND lower(d.pitch_status) IN ('pitched','pending','accepted','declined')
      ) pitches
    ) request;
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(task)), '[]'::jsonb) INTO tasks
  FROM (
    SELECT id, title, due_at
    FROM djm_os.tasks
    WHERE tenant_id = p_tenant_id AND owner_user_id = p_actor_user_id
      AND due_at >= (p_today::timestamp AT TIME ZONE 'UTC')
      AND due_at < ((p_today + 91)::timestamp AT TIME ZONE 'UTC')
      AND lower(coalesce(status,'')) NOT IN ('done','completed','cancelled','archived')
    ORDER BY due_at, id
    LIMIT 501
  ) task;

  RETURN jsonb_build_object('fixture_links', fixtures, 'requests', requests, 'tasks', tasks);
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_server_dashboard_sources(uuid,uuid,text,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_server_dashboard_sources(uuid,uuid,text,date,date) TO service_role;
NOTIFY pgrst, 'reload schema';

COMMIT;
