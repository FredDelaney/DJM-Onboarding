create table if not exists djm_os.home_item_controls (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  state text not null check (state in ('dismissed','snoozed')),
  snoozed_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id,item_key),
  constraint home_item_controls_state_time_check check (
    (state='dismissed' and snoozed_until is null)
    or (state='snoozed' and snoozed_until is not null)
  )
);

alter table djm_os.home_item_controls enable row level security;
revoke all on djm_os.home_item_controls from public;
revoke all on djm_os.home_item_controls from anon;
revoke all on djm_os.home_item_controls from authenticated;

create or replace function public.djm_home_item_controls()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when not djm_os.is_team_member() then
      (select pg_catalog.jsonb_build_array())
    else coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'item_key',c.item_key,
          'state',c.state,
          'snoozed_until',c.snoozed_until
        ) order by c.updated_at desc
      )
      from djm_os.home_item_controls c
      where c.user_id=auth.uid()
        and (
          c.state='dismissed'
          or (c.state='snoozed' and c.snoozed_until>pg_catalog.now())
        )
    ),'[]'::jsonb)
  end;
$function$;

revoke execute on function public.djm_home_item_controls() from public;
revoke execute on function public.djm_home_item_controls() from anon;
grant execute on function public.djm_home_item_controls() to authenticated;

create or replace function public.djm_home_set_item_control(
  p_item_key text,
  p_action text,
  p_snoozed_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_key text:=trim(coalesce(p_item_key,''));
  v_action text:=lower(trim(coalesce(p_action,'')));
begin
  if v_uid is null or not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;
  if length(v_key)<3 or length(v_key)>300 then
    raise exception 'Invalid Home item';
  end if;
  if v_action not in ('dismiss','snooze','restore') then
    raise exception 'Invalid Home action';
  end if;

  if v_action='restore' then
    delete from djm_os.home_item_controls
    where user_id=v_uid and item_key=v_key;
    return jsonb_build_object('item_key',v_key,'state','visible');
  end if;

  if v_action='snooze' and (p_snoozed_until is null or p_snoozed_until<=now()) then
    raise exception 'Snooze time must be in the future';
  end if;

  insert into djm_os.home_item_controls(user_id,item_key,state,snoozed_until)
  values(
    v_uid,
    v_key,
    case when v_action='dismiss' then 'dismissed' else 'snoozed' end,
    case when v_action='snooze' then p_snoozed_until else null end
  )
  on conflict(user_id,item_key) do update
  set state=excluded.state,
      snoozed_until=excluded.snoozed_until,
      updated_at=now();

  return jsonb_build_object(
    'item_key',v_key,
    'state',case when v_action='dismiss' then 'dismissed' else 'snoozed' end,
    'snoozed_until',case when v_action='snooze' then p_snoozed_until else null end
  );
end;
$function$;

revoke execute on function public.djm_home_set_item_control(text,text,timestamptz) from public;
revoke execute on function public.djm_home_set_item_control(text,text,timestamptz) from anon;
grant execute on function public.djm_home_set_item_control(text,text,timestamptz) to authenticated;

create or replace function private.djm_queue_delivery(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_url text,
  p_payload jsonb,
  p_dedupe_key text
)
returns boolean
language plpgsql
security definer
set search_path to 'private','public','pg_catalog'
as $function$
declare
  push_queued boolean:=false;
  email_queued boolean:=false;
  v_task_key text;
begin
  if p_payload ? 'task_id' then
    v_task_key:='system:task:'||coalesce(p_payload->>'task_id','');
    if exists(
      select 1
      from djm_os.home_item_controls c
      where c.user_id=p_user_id
        and c.item_key=v_task_key
        and (
          c.state='dismissed'
          or (c.state='snoozed' and c.snoozed_until>now())
        )
    ) then
      return false;
    end if;
  end if;

  push_queued:=private.djm_queue_push(p_user_id,p_kind,p_title,p_body,p_url,p_payload,p_dedupe_key);
  email_queued:=private.djm_queue_email(p_user_id,p_kind,p_title,p_body,p_url,p_payload,p_dedupe_key);
  return coalesce(push_queued,false) or coalesce(email_queued,false);
end;
$function$;

create or replace function private.djm_queue_push(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_url text,
  p_payload jsonb,
  p_dedupe_key text
)
returns boolean
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
declare
  prefs public.notification_preferences;
  v_entity_key text;
begin
  if p_user_id is null then return false; end if;

  select * into prefs
  from public.notification_preferences
  where user_id=p_user_id;

  if not coalesce(prefs.push_enabled,true) then
    return false;
  end if;

  if p_kind like 'staff_task_%' and p_payload ? 'task_id' then
    v_entity_key:=p_payload->>'task_id';
    if exists(
      select 1
      from public.notification_outbox n
      where n.user_id=p_user_id
        and n.kind like 'staff_task_%'
        and n.payload->>'task_id'=v_entity_key
        and n.status in ('pending','sent')
        and n.created_at>now()-interval '8 hours'
    ) then
      return false;
    end if;
  elsif p_kind like 'player_request_%' and p_payload ? 'request_id' then
    v_entity_key:=p_payload->>'request_id';
    if exists(
      select 1
      from public.notification_outbox n
      where n.user_id=p_user_id
        and n.kind like 'player_request_%'
        and n.payload->>'request_id'=v_entity_key
        and n.status in ('pending','sent')
        and n.created_at>now()-interval '8 hours'
    ) then
      return false;
    end if;
  end if;

  insert into public.notification_outbox(
    user_id,kind,title,body,url,payload,dedupe_key
  ) values(
    p_user_id,p_kind,left(coalesce(p_title,'DJM'),120),left(coalesce(p_body,''),240),coalesce(p_url,'/home'),
    coalesce(p_payload,'{}'::jsonb),p_dedupe_key
  )
  on conflict(dedupe_key) where dedupe_key is not null do nothing;

  return found;
end;
$function$;

create or replace function private.queue_admin_inbound_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
declare
  player_name text;
  admin_row record;
begin
  if new.request_type not in ('message','signal') then return new; end if;

  select coalesce(nullif(preferred_name,''),nullif(trim(concat_ws(' ',first_name,last_name)),''),'Player')
  into player_name
  from public.players
  where id=new.player_id;

  for admin_row in
    select pr.id
    from public.profiles pr
    left join public.notification_preferences np on np.user_id=pr.id
    where pr.role='admin' and coalesce(np.player_requests,true)
  loop
    perform private.djm_queue_push(
      admin_row.id,
      case when new.request_type='message' then 'player_message' else 'checkin_signal' end,
      case when new.request_type='message'
        then 'New message from '||coalesce(player_name,'Player')
        else coalesce(player_name,'Player')||' needs attention'
      end,
      left(case when new.request_type='message'
        then coalesce(new.player_reply,new.title,'Open the player message in DJM.')
        else coalesce(new.message,new.title,'Open the player update in DJM.')
      end,220),
      '/admin/players/'||new.player_id::text||'#inbox',
      jsonb_build_object('player_id',new.player_id,'request_id',new.id,'request_type',new.request_type),
      'player-inbound:'||new.id::text
    );
  end loop;

  perform net.http_post(
    url:='https://xogoigaaskmuspiehkba.supabase.co/functions/v1/dispatch-player-push',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'x-djm-cron',(select decrypted_secret from vault.decrypted_secrets where name='djm_push_cron_secret' limit 1)
    ),
    body:=jsonb_build_object('source','inbound-player-attention','player_id',new.player_id),
    timeout_milliseconds:=10000
  );
  return new;
end;
$function$;

create or replace function public.djm_tell_notify_attention(p_capture_id uuid)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_capture djm_os.captures%rowtype;
  v_title text;
  v_body text;
  v_fingerprint text;
  v_inserted integer:=0;
  v_has_open_work boolean:=false;
begin
  select * into v_capture
  from djm_os.captures
  where id=p_capture_id;
  if not found then raise exception 'Capture not found'; end if;

  if v_capture.status not in ('needs_input','needs_review','partial','failed','budget_blocked') then
    return jsonb_build_object('queued',false,'status',v_capture.status);
  end if;

  select exists(
    select 1 from djm_os.tell_djm_questions q
    where q.capture_id=v_capture.id and q.status not in ('answered','superseded','cancelled')
    union all
    select 1 from djm_os.tell_djm_actions a
    where a.capture_id=v_capture.id and a.status in ('needs_review','failed')
  ) into v_has_open_work;

  if v_capture.status='needs_review' and not v_has_open_work then
    return jsonb_build_object('queued',false,'status',v_capture.status,'reason','no_action_required');
  end if;

  v_title:=case v_capture.status
    when 'needs_input' then 'Tell DJM needs an answer'
    when 'needs_review' then 'Tell DJM needs a quick check'
    when 'failed' then 'Tell DJM could not finish'
    when 'partial' then 'Tell DJM saved part of this'
    else 'Tell DJM is paused'
  end;
  v_body:=left(coalesce(nullif(v_capture.summary,''),'Open Tell DJM to check this update.'),240);
  v_fingerprint:='tell:'||v_capture.id::text;

  insert into djm_os.notifications(
    user_id,notification_type,title,body,priority,
    person_id,organisation_id,player_id,payload,fingerprint,expires_at
  ) values (
    v_capture.submitted_by,
    'tell_djm_attention',
    v_title,
    v_body,
    case when v_capture.status in ('failed','partial','budget_blocked') then 92 else 82 end,
    v_capture.person_id,
    v_capture.organisation_id,
    v_capture.player_id,
    jsonb_build_object('capture_id',v_capture.id,'status',v_capture.status,'url','/tell?capture='||v_capture.id::text),
    v_fingerprint,
    now()+interval '14 days'
  )
  on conflict(fingerprint) where fingerprint is not null do nothing;
  get diagnostics v_inserted=row_count;

  if v_inserted=1 then
    perform private.djm_queue_push(
      v_capture.submitted_by,
      'tell_djm_attention',
      v_title,
      v_body,
      '/tell?capture='||v_capture.id::text,
      jsonb_build_object('capture_id',v_capture.id,'status',v_capture.status),
      'tell:'||v_capture.id::text
    );
  end if;

  return jsonb_build_object(
    'queued',v_inserted=1,
    'status',v_capture.status,
    'fingerprint',v_fingerprint
  );
end;
$function$;
