-- Keep unassigned roster counts private from non-administrator staff.
CREATE OR REPLACE FUNCTION public.platform_server_clubs_directory(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_search text DEFAULT '',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_search text := left(btrim(coalesce(p_search,'')),120);
  v_limit integer := greatest(1,least(coalesce(p_limit,20),50));
  v_offset integer := greatest(0,least(coalesce(p_offset,0),5000));
  v_admin boolean;
  v_items jsonb;
  v_total integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM platform.tenant_memberships m
    JOIN platform.tenants t ON t.id=m.tenant_id AND t.status='active'
    WHERE m.tenant_id=p_tenant_id AND m.user_id=p_actor_user_id
      AND m.status='active' AND m.role IN ('owner','admin','operations','agent','scout')
  ) THEN
    RAISE EXCEPTION 'club_directory_access_denied' USING ERRCODE='42501';
  END IF;
  v_admin := coalesce(private.user_is_tenant_admin(p_tenant_id,p_actor_user_id),false);
  SELECT count(*) INTO v_total
  FROM djm_os.organisations o
  WHERE o.tenant_id=p_tenant_id AND o.organisation_type='club'
    AND o.archived_at IS NULL
    AND (v_search='' OR o.name ILIKE '%'||v_search||'%'
      OR coalesce(o.country,'') ILIKE '%'||v_search||'%'
      OR coalesce(o.league_name,'') ILIKE '%'||v_search||'%');

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'organisation_id',q.id,'name',q.name,'country',q.country,
    'city',q.city,'league_name',q.league_name,
    'player_count',CASE WHEN v_admin THEN q.player_count ELSE NULL END,
    'request_count',CASE WHEN v_admin THEN q.request_count ELSE NULL END,
    'deal_count',CASE WHEN v_admin THEN q.deal_count ELSE NULL END,
    'contact_count',CASE WHEN v_admin THEN q.contact_count ELSE NULL END,
    'source_id',q.source_id
  ) ORDER BY lower(q.name),q.id),'[]'::jsonb) INTO v_items
  FROM (
    SELECT o.id,o.name,o.country,o.city,o.league_name,
      (SELECT count(*) FROM public.players p
       WHERE p.tenant_id=p_tenant_id AND p.archived_at IS NULL
         AND p.current_club IS NOT NULL
         AND lower(btrim(p.current_club))=lower(btrim(o.name))) AS player_count,
      (SELECT count(*) FROM djm_os.club_needs n
       WHERE n.tenant_id=p_tenant_id AND n.organisation_id=o.id
         AND n.archived_at IS NULL AND n.status IN ('active','open','confirmed')) AS request_count,
      (SELECT count(*) FROM djm_os.deal_rooms d
       WHERE d.tenant_id=p_tenant_id AND d.organisation_id=o.id AND d.status='active') AS deal_count,
      (SELECT count(DISTINCT e.person_id) FROM djm_os.employments e
       WHERE e.tenant_id=p_tenant_id AND e.organisation_id=o.id AND e.is_current) AS contact_count,
      (SELECT l.source_id FROM platform.club_catalogue_links l
       WHERE l.tenant_id=p_tenant_id AND l.organisation_id=o.id AND l.source='openfootball'
       LIMIT 1) AS source_id
    FROM djm_os.organisations o
    WHERE o.tenant_id=p_tenant_id AND o.organisation_type='club'
      AND o.archived_at IS NULL
      AND (v_search='' OR o.name ILIKE '%'||v_search||'%'
        OR coalesce(o.country,'') ILIKE '%'||v_search||'%'
        OR coalesce(o.league_name,'') ILIKE '%'||v_search||'%')
    ORDER BY lower(o.name),o.id
    LIMIT v_limit OFFSET v_offset
  ) q;

  RETURN jsonb_build_object('items',v_items,'total',v_total,
    'limit',v_limit,'offset',v_offset,'has_more',v_offset+v_limit<v_total,
    'player_count_basis','Exact match to the roster current-club field, not verified affiliation');
END;
$function$;
