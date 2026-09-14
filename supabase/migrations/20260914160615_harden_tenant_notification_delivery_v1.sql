begin;

create or replace function public.platform_server_can_deliver_tenant_notification(
  p_tenant_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.user_has_active_tenant_membership(
    p_tenant_id,
    p_user_id
  );
$$;

revoke all on function public.platform_server_can_deliver_tenant_notification(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.platform_server_can_deliver_tenant_notification(uuid, uuid)
  to service_role;

create or replace function public.djm_tell_notify_attention(
  p_capture_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_capture djm_os.captures%rowtype;
  v_title text;
  v_body text;
  v_fingerprint text;
  v_inserted integer := 0;
  v_has_open_work boolean := false;
begin
  select *
    into v_capture
  from djm_os.captures
  where id = p_capture_id;

  if not found then
    raise exception 'Capture not found';
  end if;

  if v_capture.status not in (
    'needs_input',
    'needs_review',
    'partial',
    'failed',
    'budget_blocked'
  ) then
    return jsonb_build_object(
      'queued', false,
      'status', v_capture.status
    );
  end if;

  select exists(
    select 1
    from djm_os.tell_djm_questions q
    where q.capture_id = v_capture.id
      and q.status not in ('answered', 'superseded', 'cancelled')
    union all
    select 1
    from djm_os.tell_djm_actions a
    where a.capture_id = v_capture.id
      and a.status in ('needs_review', 'failed')
  )
  into v_has_open_work;

  if v_capture.status = 'needs_review'
    and not v_has_open_work
  then
    return jsonb_build_object(
      'queued', false,
      'status', v_capture.status,
      'reason', 'no_action_required'
    );
  end if;

  v_title := case v_capture.status
    when 'needs_input' then 'Your update needs an answer'
    when 'needs_review' then 'Your update needs a quick check'
    when 'failed' then 'Your update could not finish'
    when 'partial' then 'Part of your update was saved'
    else 'Your update is paused'
  end;

  v_body := left(
    coalesce(
      nullif(v_capture.summary, ''),
      'Open your workspace to check this update.'
    ),
    240
  );

  v_fingerprint := 'tell:' || v_capture.id::text;

  insert into djm_os.notifications(
    tenant_id,
    user_id,
    notification_type,
    title,
    body,
    priority,
    person_id,
    organisation_id,
    player_id,
    payload,
    fingerprint,
    expires_at
  )
  values(
    v_capture.tenant_id,
    v_capture.submitted_by,
    'tell_djm_attention',
    v_title,
    v_body,
    case
      when v_capture.status in ('failed', 'partial', 'budget_blocked') then 92
      else 82
    end,
    v_capture.person_id,
    v_capture.organisation_id,
    v_capture.player_id,
    jsonb_build_object(
      'tenant_id', v_capture.tenant_id,
      'capture_id', v_capture.id,
      'status', v_capture.status,
      'url', '/tell?capture=' || v_capture.id::text
    ),
    v_fingerprint,
    now() + interval '14 days'
  )
  on conflict(fingerprint)
  where fingerprint is not null
  do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    perform private.djm_queue_push(
      v_capture.submitted_by,
      'tell_djm_attention',
      v_title,
      v_body,
      '/tell?capture=' || v_capture.id::text,
      jsonb_build_object(
        'tenant_id', v_capture.tenant_id,
        'capture_id', v_capture.id,
        'status', v_capture.status
      ),
      'tell:' || v_capture.id::text
    );
  end if;

  return jsonb_build_object(
    'queued', v_inserted = 1,
    'status', v_capture.status,
    'fingerprint', v_fingerprint
  );
end;
$$;

commit;
