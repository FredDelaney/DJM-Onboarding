create table if not exists djm_os.timeline_hidden_items (
  item_type text not null check (item_type in ('message','logged')),
  item_id uuid not null,
  hidden_by uuid not null default auth.uid(),
  hidden_at timestamptz not null default now(),
  primary key (item_type,item_id)
);

alter table djm_os.timeline_hidden_items enable row level security;

drop policy if exists timeline_hidden_items_team_all on djm_os.timeline_hidden_items;
create policy timeline_hidden_items_team_all
on djm_os.timeline_hidden_items
for all
to authenticated
using (djm_os.is_team_member())
with check (djm_os.is_team_member());

grant select, insert, delete, update on djm_os.timeline_hidden_items to authenticated;

create or replace function public.djm_network_hide_timeline_item(
  p_person_id uuid,
  p_item_type text,
  p_item_id uuid
) returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_exists boolean := false;
begin
  if not djm_os.is_team_member() then
    raise exception 'DJM team access required';
  end if;

  if p_item_type not in ('message','logged') then
    raise exception 'Unsupported timeline item type';
  end if;

  if p_item_type='message' then
    select exists(
      select 1
      from djm_os.messages m
      join djm_os.conversation_threads t on t.id=m.thread_id
      where m.id=p_item_id and t.person_id=p_person_id
    ) into v_exists;
  else
    select exists(
      select 1 from djm_os.interactions i
      where i.id=p_item_id and i.person_id=p_person_id
        and i.source_type in ('network_manual','djm_capture')
    ) into v_exists;
  end if;

  if not v_exists then
    raise exception 'Timeline item not found for this contact';
  end if;

  insert into djm_os.timeline_hidden_items(item_type,item_id,hidden_by,hidden_at)
  values(p_item_type,p_item_id,v_uid,now())
  on conflict (item_type,item_id)
  do update set hidden_by=excluded.hidden_by, hidden_at=excluded.hidden_at;

  return jsonb_build_object('hidden',true,'item_type',p_item_type,'item_id',p_item_id);
end
$function$;

revoke all on function public.djm_network_hide_timeline_item(uuid,text,uuid) from public, anon;
grant execute on function public.djm_network_hide_timeline_item(uuid,text,uuid) to authenticated;

create or replace function public.djm_prepare_me(p_person_id uuid)
returns jsonb
language sql
stable
set search_path to ''
as $function$
 select (public.djm_catch_me_up(p_person_id) || jsonb_build_object(
  'recent_claims',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select c.claim_type,c.claim_key,c.value_json,c.confidence,c.verification_status,c.created_at,c.valid_until
      from djm_os.claims c
      where c.person_id=p_person_id and (c.valid_until is null or c.valid_until>now())
      order by c.created_at desc limit 12
    ) x
  ),'[]'::jsonb),
  'upcoming_meetings',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.starts_at)
    from (
      select m.id,m.title,m.starts_at,m.ends_at,m.meeting_url,m.status
      from djm_os.meetings m
      where m.person_id=p_person_id and m.starts_at>=now() and m.status not in ('cancelled')
      order by m.starts_at limit 5
    ) x
  ),'[]'::jsonb),
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
        and not exists (
          select 1 from djm_os.timeline_hidden_items h
          where h.item_type='message' and h.item_id=m.id
        )
      order by m.sent_at desc
      limit 8
    ) x
  ),'[]'::jsonb),
  'recent_timeline',coalesce((
    select jsonb_agg(to_jsonb(x) order by x.occurred_at desc)
    from (
      select *
      from (
        select
          'message'::text as item_type,
          m.id,
          m.sent_at as occurred_at,
          'whatsapp'::text as channel,
          m.direction,
          m.sender_label as actor_label,
          m.raw_text as body,
          m.message_type,
          t.id as thread_id,
          null::text as team_member_name,
          'whatsapp_import'::text as source_type
        from djm_os.messages m
        join djm_os.conversation_threads t on t.id=m.thread_id
        where t.person_id=p_person_id
          and m.message_type='text'
          and nullif(trim(coalesce(m.raw_text,'')),'') is not null
          and not exists (
            select 1 from djm_os.timeline_hidden_items h
            where h.item_type='message' and h.item_id=m.id
          )

        union all

        select
          'logged'::text as item_type,
          i.id,
          i.occurred_at,
          i.channel,
          coalesce(i.direction,'logged') as direction,
          coalesce(tm.display_name,'DJM') as actor_label,
          coalesce(nullif(i.raw_text,''),i.summary) as body,
          'note'::text as message_type,
          null::uuid as thread_id,
          tm.display_name as team_member_name,
          i.source_type
        from djm_os.interactions i
        left join djm_os.team_members tm on tm.user_id=i.team_member_id
        where i.person_id=p_person_id
          and i.source_type in ('network_manual','djm_capture')
          and nullif(trim(coalesce(i.raw_text,i.summary,'')),'') is not null
          and not exists (
            select 1 from djm_os.timeline_hidden_items h
            where h.item_type='logged' and h.item_id=i.id
          )
      ) timeline_items
      order by occurred_at desc
      limit 24
    ) x
  ),'[]'::jsonb)
  ));
$function$;
