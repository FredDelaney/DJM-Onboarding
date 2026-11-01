-- Club profile summary and contact communication methods.
-- No broad staff access to contacts. We deliberately do not offer fake per-contact visibility settings.
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
      'position',p.primary_position
    ) ORDER BY p.first_name,p.last_name),'[]'::jsonb)
  INTO v_players
  FROM (
    SELECT p.id,p.first_name,p.last_name,p.primary_position
    FROM public.players p
    WHERE p.tenant_id=p_tenant_id AND p.archived_at IS NULL
      AND p.current_club IS NOT NULL
      AND lower(btrim(p.current_club))=lower(btrim(v_club_name))
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
    'can_view_contacts',v_admin,
    'player_count_basis','Exact current-club name match, not verified affiliation');
END;
$function$;
REVOKE ALL ON FUNCTION public.platform_server_club_reference_people(uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_server_club_reference_people(uuid,uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_server_agency_create_contact_with_methods(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_contact_name text,
  p_club_name text,
  p_contact_role text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
  v_person_id uuid;
  v_email text:=nullif(lower(btrim(coalesce(p_email,''))),'');
  v_phone text:=nullif(btrim(coalesce(p_phone,'')),'');
BEGIN
  PERFORM private.platform_server_assert_agency_operator(p_tenant_id,p_actor_user_id);
  IF v_email IS NOT NULL AND
     (length(v_email)>254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') THEN
    RAISE EXCEPTION 'contact_email_invalid' USING ERRCODE='22023';
  END IF;
  IF v_phone IS NOT NULL AND
     (length(v_phone)>40 OR length(v_phone)<5 OR v_phone !~ '^[+0-9() .-]+$') THEN
    RAISE EXCEPTION 'contact_phone_invalid' USING ERRCODE='22023';
  END IF;

  v_result:=public.platform_server_agency_create_contact(p_tenant_id,p_actor_user_id,
    p_contact_name,p_club_name,p_contact_role,p_country,p_notes);
  v_person_id:=(v_result->>'person_id')::uuid;

  IF v_email IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM djm_os.contact_methods m WHERE m.tenant_id=p_tenant_id
     AND m.person_id=v_person_id AND m.channel='email'
     AND lower(btrim(m.value))=v_email
  ) THEN
    INSERT INTO djm_os.contact_methods(tenant_id,person_id,channel,value,normalised_value,is_primary)
    VALUES(p_tenant_id,v_person_id,'email',v_email,v_email,
      NOT EXISTS(SELECT 1 FROM djm_os.contact_methods x WHERE x.person_id=v_person_id AND x.channel='email'));
  END IF;
  IF v_phone IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM djm_os.contact_methods m WHERE m.tenant_id=p_tenant_id
     AND m.person_id=v_person_id AND m.channel='phone'
     AND btrim(m.value)=v_phone
  ) THEN
    INSERT INTO djm_os.contact_methods(tenant_id,person_id,channel,value,normalised_value,is_primary)
    VALUES(p_tenant_id,v_person_id,'phone',v_phone,
      regexp_replace(v_phone,'[^+0-9]','','g'),
      NOT EXISTS(SELECT 1 FROM djm_os.contact_methods x WHERE x.person_id=v_person_id AND x.channel='phone'));
  END IF;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.platform_server_agency_create_contact_with_methods(uuid,uuid,text,text,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_server_agency_create_contact_with_methods(uuid,uuid,text,text,text,text,text,text,text) TO service_role;
