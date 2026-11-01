-- ReDream club directory: tenant-aware pagination, search and explicit catalogue imports.
-- Source names and aliases: OpenFootball/clubs CC0-1.0. No third-party logos are bundled.

CREATE OR REPLACE FUNCTION public.platform_server_agency_create_club(p_tenant_id uuid, p_actor_user_id uuid, p_club_name text, p_country text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_existing_id uuid;
  v_club_id uuid;
  v_created boolean;
BEGIN
  PERFORM private.platform_server_assert_agency_operator(p_tenant_id, p_actor_user_id);

  SELECT o.id INTO v_existing_id
  FROM djm_os.organisations AS o
  WHERE o.tenant_id = p_tenant_id
    AND o.organisation_type = 'club'
    AND o.archived_at IS NULL
    AND lower(btrim(o.name)) = lower(btrim(coalesce(p_club_name, '')))
  ORDER BY o.created_at
  LIMIT 1;

  v_club_id := private.platform_server_agency_ensure_club(
    p_tenant_id, p_club_name, p_country
  );
  v_created := v_existing_id IS NULL;

  IF v_created THEN
    INSERT INTO platform.audit_events (
      tenant_id, actor_user_id, actor_kind, action, entity_type,
      entity_id, after_state, metadata
    )
    VALUES (
      p_tenant_id, p_actor_user_id, 'user',
      'platform.agency.club_created', 'club', v_club_id::text,
      jsonb_build_object('name', btrim(p_club_name), 'country', nullif(btrim(coalesce(p_country, '')), '')),
      jsonb_build_object('source', 'agency_workspace')
    );
  END IF;

  RETURN jsonb_build_object(
    'organisation_id', v_club_id,
    'created', v_created
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public.platform_server_agency_create_club(uuid,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_server_agency_create_club(uuid,uuid,text,text)
  TO service_role;

CREATE TABLE IF NOT EXISTS platform.club_catalogue_links (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES djm_os.organisations(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('openfootball')),
  source_id text NOT NULL CHECK (char_length(source_id) BETWEEN 8 AND 150),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, source, source_id),
  UNIQUE (tenant_id, source, organisation_id)
);
ALTER TABLE platform.club_catalogue_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform.club_catalogue_links FROM PUBLIC, anon, authenticated;

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

REVOKE ALL ON FUNCTION public.platform_server_clubs_directory(uuid,uuid,text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_server_clubs_directory(uuid,uuid,text,integer,integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.platform_server_agency_import_club(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_club_name text,
  p_country text,
  p_league_name text,
  p_source_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
  v_existing_id uuid;
  v_source_id text := btrim(coalesce(p_source_id,''));
  v_link_id uuid;
BEGIN
  PERFORM private.platform_server_assert_agency_operator(p_tenant_id,p_actor_user_id);
  IF v_source_id !~ '^openfootball:[a-z0-9-]+:[a-z0-9-]+$'
     OR length(v_source_id)>150
     OR nullif(btrim(coalesce(p_club_name,'')),'') IS NULL
     OR length(btrim(p_club_name))>150
     OR length(coalesce(p_country,''))>100
     OR length(coalesce(p_league_name,''))>200 THEN
    RAISE EXCEPTION 'invalid_club_import' USING ERRCODE='22023';
  END IF;
  SELECT l.organisation_id INTO v_link_id
  FROM platform.club_catalogue_links l
  WHERE l.tenant_id=p_tenant_id AND l.source='openfootball' AND l.source_id=v_source_id;
  IF v_link_id IS NOT NULL THEN
    RETURN jsonb_build_object('organisation_id',v_link_id,'created',false,'already_imported',true);
  END IF;
  SELECT o.id INTO v_existing_id
  FROM djm_os.organisations o
  WHERE o.tenant_id=p_tenant_id AND o.organisation_type='club'
    AND o.archived_at IS NULL
    AND lower(btrim(o.name))=lower(btrim(p_club_name))
  ORDER BY o.created_at LIMIT 1;

  v_id := private.platform_server_agency_ensure_club(p_tenant_id,p_club_name,p_country);
  UPDATE djm_os.organisations o SET
    league_name=coalesce(nullif(o.league_name,''),nullif(btrim(coalesce(p_league_name,'')),''))
  WHERE o.id=v_id AND o.tenant_id=p_tenant_id;

  INSERT INTO platform.club_catalogue_links
    (tenant_id,organisation_id,source,source_id,created_by)
  VALUES (p_tenant_id,v_id,'openfootball',v_source_id,p_actor_user_id)
  ON CONFLICT DO NOTHING;

  IF v_existing_id IS NULL THEN
    INSERT INTO platform.audit_events
      (tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
    VALUES (p_tenant_id,p_actor_user_id,'user','platform.agency.club_imported','club',v_id::text,
      jsonb_build_object('name',p_club_name,'country',p_country),
      jsonb_build_object('source','openfootball','source_id',v_source_id));
  END IF;
  RETURN jsonb_build_object('organisation_id',v_id,'created',v_existing_id IS NULL,'already_imported',false);
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_server_agency_import_club(uuid,uuid,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_server_agency_import_club(uuid,uuid,text,text,text,text)
  TO service_role;
