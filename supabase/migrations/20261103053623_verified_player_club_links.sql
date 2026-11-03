-- Tenant-safe, human-verified player to club associations.
-- No guessed, fuzzy, name-based or automatic backfill of existing player records.
-- Existing name matches remain labelled provisional until an owner/admin confirms one.

CREATE UNIQUE INDEX IF NOT EXISTS players_club_link_tenant_identity_uidx
  ON public.players(tenant_id,id);

CREATE TABLE djm_os.player_club_links (
  tenant_id uuid NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  player_id uuid NOT NULL,
  organisation_id uuid NOT NULL,
  source_club_name text,
  linked_by_user_id uuid NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,player_id),
  CONSTRAINT player_club_links_player_fk FOREIGN KEY(tenant_id,player_id)
    REFERENCES public.players(tenant_id,id) ON DELETE CASCADE,
  CONSTRAINT player_club_links_club_fk FOREIGN KEY(tenant_id,organisation_id)
    REFERENCES djm_os.organisations(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX player_club_links_club_idx ON djm_os.player_club_links(tenant_id,organisation_id);
ALTER TABLE djm_os.player_club_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON djm_os.player_club_links FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON djm_os.player_club_links TO service_role;

-- Any independent edit to the player's current club clears a prior confirmation
-- instead of leaving an apparently verified link to the wrong club.
CREATE OR REPLACE FUNCTION private.platform_clear_stale_player_club_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
BEGIN
  IF lower(btrim(coalesce(NEW.current_club,'')))
     IS DISTINCT FROM lower(btrim(coalesce(OLD.current_club,''))) THEN
    DELETE FROM djm_os.player_club_links l
    WHERE l.tenant_id=OLD.tenant_id AND l.player_id=OLD.id;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION private.platform_clear_stale_player_club_link() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS clear_stale_player_club_link ON public.players;
CREATE TRIGGER clear_stale_player_club_link
  AFTER UPDATE OF current_club ON public.players
  FOR EACH ROW EXECUTE FUNCTION private.platform_clear_stale_player_club_link();

CREATE OR REPLACE FUNCTION public.platform_server_club_link_candidates(
  p_tenant_id uuid, p_actor_user_id uuid, p_organisation_id uuid,
  p_search text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_items jsonb;
  v_search text:=left(btrim(coalesce(p_search,'')),100);
BEGIN
  IF NOT coalesce(private.user_is_tenant_admin(p_tenant_id,p_actor_user_id),false)
  THEN RAISE EXCEPTION 'club_link_admin_required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM djm_os.organisations o WHERE o.id=p_organisation_id
      AND o.tenant_id=p_tenant_id AND o.organisation_type='club'
      AND o.archived_at IS NULL
  ) THEN RAISE EXCEPTION 'club_not_found' USING ERRCODE='P0002'; END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY lower(c.name),c.id),'[]'::jsonb)
  INTO v_items
  FROM (
    SELECT p.id,coalesce(nullif(btrim(p.preferred_name),''),
      nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') name,
      p.current_club,p.current_country,
      l.organisation_id linked_club_id,
      (l.organisation_id IS NULL) can_link
    FROM public.players p LEFT JOIN djm_os.player_club_links l
      ON l.tenant_id=p.tenant_id AND l.player_id=p.id
    WHERE p.tenant_id=p_tenant_id AND p.archived_at IS NULL
      AND (v_search='' OR concat_ws(' ',p.first_name,p.last_name,p.preferred_name,p.current_club)
        ILIKE '%'||v_search||'%')
      AND (l.organisation_id IS DISTINCT FROM p_organisation_id)
    ORDER BY lower(coalesce(p.preferred_name,concat_ws(' ',p.first_name,p.last_name))),p.id
    LIMIT 30
  ) c;
  RETURN jsonb_build_object('items',v_items);
END;
$function$;
REVOKE ALL ON FUNCTION public.platform_server_club_link_candidates(uuid,uuid,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_server_club_link_candidates(uuid,uuid,uuid,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.platform_server_club_link_player(
  p_tenant_id uuid, p_actor_user_id uuid,
  p_player_id uuid, p_organisation_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE
  v_club_name text;
  v_country text;
  v_player_name text;
  v_original_name text;
  v_linked_club uuid;
BEGIN
  IF NOT coalesce(private.user_is_tenant_admin(p_tenant_id,p_actor_user_id),false)
  THEN RAISE EXCEPTION 'club_link_admin_required' USING ERRCODE='42501'; END IF;

  SELECT o.name,o.country INTO v_club_name,v_country
  FROM djm_os.organisations o
  WHERE o.tenant_id=p_tenant_id AND o.id=p_organisation_id
    AND o.organisation_type='club' AND o.archived_at IS NULL;
  IF v_club_name IS NULL THEN
    RAISE EXCEPTION 'club_not_found' USING ERRCODE='P0002';
  END IF;

  SELECT p.current_club,coalesce(nullif(btrim(p.preferred_name),''),
    nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Player')
  INTO v_original_name,v_player_name
  FROM public.players p
  WHERE p.id=p_player_id AND p.tenant_id=p_tenant_id AND p.archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'player_not_found' USING ERRCODE='P0002'; END IF;

  SELECT l.organisation_id INTO v_linked_club
  FROM djm_os.player_club_links l
  WHERE l.tenant_id=p_tenant_id AND l.player_id=p_player_id;

  IF v_linked_club IS NOT NULL AND v_linked_club<>p_organisation_id
  THEN RAISE EXCEPTION 'player_linked_elsewhere' USING ERRCODE='23514'; END IF;
  IF v_linked_club=p_organisation_id THEN
    RETURN jsonb_build_object('linked',true,'already_linked',true,
      'player_id',p_player_id,'organisation_id',p_organisation_id);
  END IF;

  -- Correct the display name in the roster only after explicit owner confirmation.
  -- The prior club text is retained in the link's audit evidence.
  UPDATE public.players p
  SET current_club=v_club_name,
      current_country=coalesce(nullif(btrim(p.current_country),''),v_country)
  WHERE p.tenant_id=p_tenant_id AND p.id=p_player_id;

  INSERT INTO djm_os.player_club_links
    (tenant_id,player_id,organisation_id,source_club_name,linked_by_user_id)
  VALUES(p_tenant_id,p_player_id,p_organisation_id,v_original_name,p_actor_user_id);

  INSERT INTO platform.audit_events(
    tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,
    after_state,metadata
  ) VALUES(
    p_tenant_id,p_actor_user_id,'user','platform.player.club_link_verified',
    'player',p_player_id::text,
    jsonb_build_object('organisation_id',p_organisation_id,'club',v_club_name,
      'previous_club',v_original_name),
    jsonb_build_object('source','explicit_agent_selection','verification','admin')
  );
  RETURN jsonb_build_object('linked',true,'already_linked',false,
    'player_id',p_player_id,'organisation_id',p_organisation_id,'club_name',v_club_name);
END;
$function$;
REVOKE ALL ON FUNCTION public.platform_server_club_link_player(uuid,uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_server_club_link_player(uuid,uuid,uuid,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.platform_server_club_reference_people(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_organisation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_club_name text;
  v_admin boolean;
  v_players jsonb;
  v_contacts jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM platform.tenant_memberships m
    JOIN platform.tenants t ON t.id=m.tenant_id AND t.status='active'
    WHERE m.tenant_id=p_tenant_id AND m.user_id=p_actor_user_id
      AND m.status='active' AND m.role IN ('owner','admin','operations','agent','scout')
  ) THEN RAISE EXCEPTION 'club_access_denied' USING ERRCODE='42501'; END IF;

  SELECT o.name INTO v_club_name FROM djm_os.organisations o
  WHERE o.tenant_id=p_tenant_id AND o.id=p_organisation_id
    AND o.organisation_type='club' AND o.archived_at IS NULL;
  IF v_club_name IS NULL THEN
    RAISE EXCEPTION 'club_not_found' USING ERRCODE='P0002';
  END IF;
  v_admin := coalesce(private.user_is_tenant_admin(p_tenant_id,p_actor_user_id),false);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'name',concat_ws(' ',p.first_name,p.last_name),
      'position',p.primary_position,'verified_link',p.verified_link
    ) ORDER BY p.first_name,p.last_name),'[]'::jsonb)
  INTO v_players
  FROM (
    SELECT p.id,p.first_name,p.last_name,p.primary_position,
      coalesce(l.organisation_id=p_organisation_id,false) verified_link
    FROM public.players p
    LEFT JOIN djm_os.player_club_links l
      ON l.tenant_id=p.tenant_id AND l.player_id=p.id
    WHERE p.tenant_id=p_tenant_id AND p.archived_at IS NULL
      AND (l.organisation_id=p_organisation_id
        OR (l.player_id IS NULL AND p.current_club IS NOT NULL
          AND lower(btrim(p.current_club))=lower(btrim(v_club_name))))
      AND (v_admin OR p.primary_staff_user_id=p_actor_user_id OR EXISTS(
        SELECT 1 FROM public.staff_player_access s
        WHERE s.player_id=p.id AND s.staff_user_id=p_actor_user_id
      ))
    ORDER BY p.first_name,p.last_name LIMIT 100
  ) p;

  IF v_admin THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'name',p.full_name,'role',p.role_title
    ) ORDER BY p.full_name),'[]'::jsonb) INTO v_contacts
    FROM (
      SELECT DISTINCT ON (p.id) p.id,p.full_name,e.role_title
      FROM djm_os.employments e
      JOIN djm_os.people p ON p.id=e.person_id AND p.tenant_id=e.tenant_id
      WHERE e.tenant_id=p_tenant_id AND e.organisation_id=p_organisation_id
        AND e.is_current AND p.archived_at IS NULL
      ORDER BY p.id,e.updated_at DESC LIMIT 100
    ) p;
  ELSE
    v_contacts := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object('players',v_players,'contacts',v_contacts,
    'can_view_contacts',v_admin,'can_link_players',v_admin,
    'player_count_basis','Verified club links first; exact current-club name matches otherwise (unverified)');
END;
$function$;

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
       LEFT JOIN djm_os.player_club_links l ON l.tenant_id=p.tenant_id AND l.player_id=p.id
       WHERE p.tenant_id=p_tenant_id AND p.archived_at IS NULL
         AND (l.organisation_id=o.id OR (l.player_id IS NULL AND p.current_club IS NOT NULL
           AND lower(btrim(p.current_club))=lower(btrim(o.name))))) AS player_count,
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
    'player_count_basis','Verified club links first; exact-name fallback is unverified');
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_server_clubs_directory(uuid,uuid,text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_server_clubs_directory(uuid,uuid,text,integer,integer)
  TO service_role;

