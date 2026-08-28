create or replace function public.djm_attach_whatsapp_thread(
  p_thread_id uuid,
  p_person_id uuid
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_person_name text;
  v_org_id uuid;
  v_org_name text;
begin
  if not exists (
    select 1 from djm_os.team_members tm
    where tm.user_id = (select auth.uid()) and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  select p.full_name into v_person_name
  from djm_os.people p
  where p.id = p_person_id and p.person_type = 'club_contact';

  if v_person_name is null then
    raise exception 'Club contact not found';
  end if;

  if not exists (
    select 1 from djm_os.conversation_threads t
    where t.id = p_thread_id
      and t.channel = 'whatsapp'
      and t.owner_user_id = (select auth.uid())
  ) then
    raise exception 'WhatsApp thread not found';
  end if;

  select e.organisation_id, o.name
    into v_org_id, v_org_name
  from djm_os.employments e
  join djm_os.organisations o on o.id = e.organisation_id
  where e.person_id = p_person_id and e.is_current = true
  order by e.updated_at desc nulls last, e.created_at desc
  limit 1;

  update djm_os.conversation_threads
  set person_id = p_person_id,
      organisation_id = v_org_id,
      thread_label = v_person_name,
      updated_at = now()
  where id = p_thread_id;

  update djm_os.review_items
  set status = 'resolved', resolved_at = now()
  where review_type = 'thread_identity'
    and payload->>'thread_id' = p_thread_id::text
    and status = 'open';

  perform djm_os.thread_interaction_rollup(p_thread_id);

  return jsonb_build_object(
    'thread_id', p_thread_id,
    'person_id', p_person_id,
    'person_name', v_person_name,
    'organisation_id', v_org_id,
    'organisation_name', v_org_name,
    'attached', true
  );
end
$function$;

revoke all on function public.djm_attach_whatsapp_thread(uuid,uuid) from public, anon;
grant execute on function public.djm_attach_whatsapp_thread(uuid,uuid) to authenticated;

create or replace function public.djm_prepare_me(p_person_id uuid)
returns jsonb
language sql
stable
set search_path to ''
as $function$
 select (public.djm_catch_me_up(p_person_id) || jsonb_build_object(
  'recent_claims',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select c.claim_type,c.claim_key,c.value_json,c.confidence,c.verification_status,c.created_at,c.valid_until from djm_os.claims c where c.person_id=p_person_id and (c.valid_until is null or c.valid_until>now()) order by c.created_at desc limit 12)x),'[]'::jsonb),
  'upcoming_meetings',coalesce((select jsonb_agg(to_jsonb(x) order by x.starts_at) from (select m.id,m.title,m.starts_at,m.ends_at,m.meeting_url,m.status from djm_os.meetings m where m.person_id=p_person_id and m.starts_at>=now() and m.status not in ('cancelled') order by m.starts_at limit 5)x),'[]'::jsonb),
  'recent_messages',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.sent_at desc)
    from (
      select m.id,m.sent_at,m.direction,m.sender_label,m.raw_text,m.message_type,t.id thread_id
      from djm_os.messages m
      join djm_os.conversation_threads t on t.id=m.thread_id
      where t.person_id=p_person_id
        and m.message_type='text'
        and nullif(trim(coalesce(m.raw_text,'')),'') is not null
        and not (coalesce(m.raw_text,'') ~* 'https?://' and coalesce(m.raw_text,'') ~* '<attached:')
      order by m.sent_at desc
      limit 8
    ) x
  ),'[]'::jsonb)
  ));
$function$;
