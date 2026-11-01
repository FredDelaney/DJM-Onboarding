-- Reconcile previously deployed, tenant-authorised agency dashboard read model
-- and existing player connected-activity projection with the versioned repository.

CREATE OR REPLACE FUNCTION public.platform_server_dashboard_recent_activity(p_tenant_id uuid, p_actor_user_id uuid, p_scope text DEFAULT 'me'::text, p_limit integer DEFAULT 12)
 RETURNS TABLE(id uuid, actor_user_id uuid, action text, entity_type text, entity_id text, occurred_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
     OR p_scope IS NULL OR p_scope NOT IN ('me','agency') THEN
    RAISE EXCEPTION 'dashboard_activity_access_denied' USING ERRCODE='42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM platform.tenant_memberships m
    JOIN platform.tenants t ON t.id=m.tenant_id AND t.status='active'
    WHERE m.tenant_id=p_tenant_id
      AND m.user_id=p_actor_user_id
      AND m.status='active'
      AND m.role IN ('owner','admin','operations','agent','scout')
  ) THEN
    RAISE EXCEPTION 'dashboard_activity_access_denied' USING ERRCODE='42501';
  END IF;

  IF p_scope='agency'
     AND NOT COALESCE(private.user_is_tenant_admin(p_tenant_id,p_actor_user_id),false) THEN
    RAISE EXCEPTION 'dashboard_agency_access_denied' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  SELECT e.id,e.actor_user_id,e.action,e.entity_type,e.entity_id,e.occurred_at
  FROM platform.audit_events AS e
  WHERE e.tenant_id=p_tenant_id
    AND (p_scope='agency' OR e.actor_user_id=p_actor_user_id)
  ORDER BY e.occurred_at DESC, e.id
  LIMIT LEAST(GREATEST(COALESCE(p_limit,12),1),12);
END;
$function$
;
REVOKE ALL ON FUNCTION public.platform_server_dashboard_recent_activity(uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_server_dashboard_recent_activity(uuid,uuid,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_server_player_connected_activity(p_tenant_id uuid, p_player_id uuid, p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,8),20));
  v_exists boolean:=false;
  v_items jsonb:='[]'::jsonb;
  v_followups jsonb:='[]'::jsonb;
  v_total integer:=0;
  v_open_followups integer:=0;
  v_last_connected_at timestamptz;
begin
  select exists(
    select 1
    from public.players p
    where p.id=p_player_id
      and p.tenant_id=p_tenant_id
  )
  into v_exists;

  if not v_exists then
    raise exception 'player_not_found';
  end if;

  select
    count(*)::int,
    max(c.created_at)
  into
    v_total,
    v_last_connected_at
  from djm_os.captures c
  where c.tenant_id=p_tenant_id
    and c.player_id=p_player_id
    and c.status='done'
    and (
      c.context_json->>'capture_origin'='email'
      or c.channel in (
        'instagram_selected_chat',
        'whatsapp_selected_chat'
      )
    );

  select coalesce(
    jsonb_agg(item order by occurred_at desc),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      jsonb_build_object(
        'capture_id',c.id,
        'channel',c.channel,
        'direction',coalesce(
          nullif(c.context_json->>'email_direction',''),
          nullif(c.context_json->>'direction',''),
          null
        ),
        'summary',coalesce(
          nullif(trim(c.summary),''),
          nullif(trim(c.context_json->>'email_subject'),''),
          'Connected activity recorded'
        ),
        'occurred_at',coalesce(
          nullif(c.context_json->>'occurred_at','')::timestamptz,
          c.created_at
        ),
        'person_id',c.person_id,
        'person_name',p.full_name,
        'organisation_id',c.organisation_id,
        'organisation_name',o.name,
        'owner_user_id',c.submitted_by,
        'owner_name',coalesce(
          nullif(trim(tm.display_name),''),
          'Agency member'
        )
      ) as item,
      coalesce(
        nullif(c.context_json->>'occurred_at','')::timestamptz,
        c.created_at
      ) as occurred_at
    from djm_os.captures c
    left join djm_os.people p
      on p.id=c.person_id
     and p.tenant_id=c.tenant_id
    left join djm_os.organisations o
      on o.id=c.organisation_id
     and o.tenant_id=c.tenant_id
    left join djm_os.team_members tm
      on tm.user_id=c.submitted_by
     and tm.is_active
    where c.tenant_id=p_tenant_id
      and c.player_id=p_player_id
      and c.status='done'
      and (
        c.context_json->>'capture_origin'='email'
        or c.channel in (
          'instagram_selected_chat',
          'whatsapp_selected_chat'
        )
      )
    order by occurred_at desc
    limit v_limit
  ) q;
  select count(*)::int
  into v_open_followups
  from djm_os.tasks t
  where t.tenant_id=p_tenant_id
    and t.player_id=p_player_id
    and t.status not in (
      'done','completed','cancelled'
    )
    and exists(
      select 1
      from djm_os.captures c
      where c.tenant_id=p_tenant_id
        and c.player_id=p_player_id
        and t.source like
          'tell_djm:'||c.id::text||':%'
        and (
          c.context_json->>'capture_origin'='email'
          or c.channel in (
            'instagram_selected_chat',
            'whatsapp_selected_chat'
          )
        )
    );

  select coalesce(
    jsonb_agg(item order by due_at nulls last,created_at desc),
    '[]'::jsonb
  )
  into v_followups
  from (
    select
      jsonb_build_object(
        'task_id',t.id,
        'title',t.title,
        'due_at',t.due_at,
        'status',t.status,
        'priority',t.priority,
        'owner_user_id',t.owner_user_id,
        'owner_name',coalesce(
          nullif(trim(tm.display_name),''),
          'Agency member'
        )
      ) as item,
      t.due_at,
      t.created_at
    from djm_os.tasks t
    left join djm_os.team_members tm
      on tm.user_id=t.owner_user_id
     and tm.is_active
    where t.tenant_id=p_tenant_id
      and t.player_id=p_player_id
      and t.status not in (
        'done','completed','cancelled'
      )
      and exists(
        select 1
        from djm_os.captures c
        where c.tenant_id=p_tenant_id
          and c.player_id=p_player_id
          and t.source like
            'tell_djm:'||c.id::text||':%'
          and (
            c.context_json->>'capture_origin'='email'
            or c.channel in (
              'instagram_selected_chat',
              'whatsapp_selected_chat'
            )
          )
      )
    order by t.due_at nulls last,t.created_at desc
    limit 5
  ) q;
  return jsonb_build_object(
    'contract_version',
      'redream_player_connected_activity_v1',
    'generated_at',now(),
    'summary',jsonb_build_object(
      'connected_items',v_total,
      'open_followups',v_open_followups,
      'last_connected_at',v_last_connected_at
    ),
    'items',v_items,
    'open_followups',v_followups,
    'truth_contract',jsonb_build_object(
      'player_link',
        'Only connected captures explicitly linked to this player are shown.',
      'privacy',
        'The profile receives connected summaries and metadata, not raw message or email bodies.',
      'ownership',
        'Each communication and follow-up keeps the recorded accountable agency user.',
      'external_action',
        'Displaying connected activity never sends an external message.'
    )
  );
end;
$function$
;
REVOKE ALL ON FUNCTION public.platform_server_player_connected_activity(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_server_player_connected_activity(uuid,uuid,integer) TO service_role;
