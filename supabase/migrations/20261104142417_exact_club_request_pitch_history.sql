begin;

-- A staff observation is a separate source from a reply submitted on a share link.
create table platform.club_pitch_staff_replies (
  share_id uuid not null references platform.club_pitch_contexts(share_id) on delete cascade,
  command_id uuid not null,
  actor_user_id uuid not null,
  reply_type text not null check (reply_type in ('request_conversation','request_information','not_now','decline')),
  channel text not null check (channel in ('phone','email','message','in_person','other')),
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  recorded_at timestamptz not null default now(),
  primary key (share_id, command_id)
);
alter table platform.club_pitch_staff_replies enable row level security;
revoke all on platform.club_pitch_staff_replies from public, anon, authenticated, service_role;

create function public.platform_server_club_request_pitch_history(
  p_tenant_id uuid, p_actor_user_id uuid, p_scope text, p_scope_id uuid
) returns jsonb
language plpgsql stable security definer set search_path=''
as $function$
declare
  v_items jsonb;
  v_more boolean;
begin
  if not coalesce(private.user_is_tenant_admin(p_tenant_id,p_actor_user_id),false) then
    raise exception 'Agency administrator access required' using errcode='42501';
  end if;
  if p_scope is null or p_scope not in ('request','player','match') or p_scope_id is null then
    raise exception 'Choose a valid pitch history scope' using errcode='22023';
  end if;

  with selected as (
    select row_number() over(order by (s.revoked_at is not null),s.created_at desc,s.id) as row_no,
      jsonb_build_object(
        'share_id',s.id,'player_match_id',m.id,'club_need_id',n.id,
        'player_id',p.id,'organisation_id',o.id,
        'player_name',coalesce(nullif(btrim(p.preferred_name),''),nullif(btrim(concat_ws(' ',p.first_name,p.last_name)),''),'Player'),
        'club_name',o.name,'need_title',n.title,
        'request_available',n.archived_at is null and o.archived_at is null,
        'pitch_status',s.pitch_status,'active',s.active,
        'created_at',s.created_at,'sent_at',s.sent_at,'expires_at',s.expires_at,'revoked_at',s.revoked_at,
        'view_count',s.view_count,'last_viewed_at',s.last_viewed_at,
        'opportunity_id',d.id,'deal_owner_user_id',d.owner_user_id,
        'deal_owner_name',coalesce(nullif(btrim(tm.display_name),''),
          case when d.owner_user_id is not null then 'Agency member' end),
        'next_action_text',d.next_action_text,'next_action_at',d.next_action_at,
        'link_reply',case when r.share_id is not null then jsonb_build_object(
          'response_type',r.response_type,'message',r.message,'updated_at',r.updated_at,
          'responder',jsonb_build_object('name',r.responder_name,'identity_status',r.identity_status)
        ) end,
        'staff_reply',case when a.share_id is not null then jsonb_build_object(
          'response_type',a.reply_type,'channel',a.channel,'message',a.note,'updated_at',a.recorded_at
        ) end
      ) as item
    from platform.club_pitch_contexts c
    join djm_os.player_matches m on m.id=c.player_match_id and m.club_need_id=c.club_need_id and m.tenant_id=c.tenant_id
    join djm_os.club_needs n on n.id=c.club_need_id and n.tenant_id=c.tenant_id
    join public.club_share_links s on s.id=c.share_id and s.player_id=m.player_id and s.organisation_id=n.organisation_id
    join public.players p on p.id=m.player_id and p.tenant_id=c.tenant_id
    join djm_os.organisations o on o.id=n.organisation_id and o.tenant_id=c.tenant_id
    left join djm_os.deal_rooms d on d.id=s.opportunity_id and d.tenant_id=c.tenant_id
      and d.club_need_id=n.id and d.player_id=p.id and d.organisation_id=o.id
    left join platform.tenant_memberships owner_membership on owner_membership.tenant_id=c.tenant_id
      and owner_membership.user_id=d.owner_user_id and owner_membership.status='active'
    left join djm_os.team_members tm on tm.user_id=owner_membership.user_id
    left join platform.club_pitch_responses r on r.share_id=s.id and r.tenant_id=c.tenant_id
    left join lateral (
      select reply.share_id,reply.reply_type,reply.channel,reply.note,reply.recorded_at
      from platform.club_pitch_staff_replies reply
      where reply.share_id=s.id
      order by reply.recorded_at desc,reply.command_id desc
      limit 1
    ) a on true
    where c.tenant_id=p_tenant_id and case p_scope
      when 'request' then c.club_need_id=p_scope_id
      when 'match' then c.player_match_id=p_scope_id
      when 'player' then p.id=p_scope_id
    end
    order by (s.revoked_at is not null),s.created_at desc,s.id
    limit 51
  )
  select coalesce(jsonb_agg(item order by row_no) filter(where row_no<=50),'[]'::jsonb), count(*)>50
    into v_items,v_more from selected;

  return jsonb_build_object('scope',p_scope,'scope_id',p_scope_id,'items',v_items,'has_more',v_more);
end;
$function$;

create function public.platform_server_record_club_pitch_staff_reply(
  p_tenant_id uuid, p_actor_user_id uuid, p_need_id uuid, p_share_id uuid,
  p_command_id uuid, p_reply_type text, p_channel text, p_note text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_reply platform.club_pitch_staff_replies%rowtype;
begin
  if not coalesce(private.user_is_tenant_admin(p_tenant_id,p_actor_user_id),false) then
    raise exception 'Agency administrator access required' using errcode='42501';
  end if;
  if p_command_id is null or p_reply_type is null or p_reply_type not in ('request_conversation','request_information','not_now','decline')
    or p_channel is null or p_channel not in ('phone','email','message','in_person','other')
    or p_note is null or char_length(btrim(p_note)) not between 1 and 2000 then
    raise exception 'Choose a reply and channel and enter a note of up to 2,000 characters' using errcode='22023';
  end if;

  perform 1
  from platform.club_pitch_contexts c
  join djm_os.player_matches m on m.id=c.player_match_id and m.club_need_id=c.club_need_id and m.tenant_id=c.tenant_id
  join djm_os.club_needs n on n.id=c.club_need_id and n.tenant_id=c.tenant_id
  join public.club_share_links s on s.id=c.share_id and s.player_id=m.player_id and s.organisation_id=n.organisation_id
  join public.players p on p.id=m.player_id and p.tenant_id=c.tenant_id
  join djm_os.organisations o on o.id=n.organisation_id and o.tenant_id=c.tenant_id
  where c.tenant_id=p_tenant_id and c.club_need_id=p_need_id and c.share_id=p_share_id and s.sent_at is not null
  for update of s;
  if not found then
    raise exception 'This request has no matching pitch with a recorded send' using errcode='22023';
  end if;

  insert into platform.club_pitch_staff_replies(share_id,command_id,actor_user_id,reply_type,channel,note)
  values(p_share_id,p_command_id,p_actor_user_id,p_reply_type,p_channel,btrim(p_note))
  on conflict (share_id,command_id) do nothing;

  select * into v_reply from platform.club_pitch_staff_replies
  where share_id=p_share_id and command_id=p_command_id;
  if v_reply.actor_user_id is distinct from p_actor_user_id or v_reply.reply_type is distinct from p_reply_type
    or v_reply.channel is distinct from p_channel or v_reply.note is distinct from btrim(p_note) then
    raise exception 'This reply was already recorded with different details' using errcode='40001';
  end if;

  return jsonb_build_object('share_id',p_share_id,'command_id',p_command_id,'recorded_at',v_reply.recorded_at);
end;
$function$;

revoke all on function public.platform_server_club_request_pitch_history(uuid,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.platform_server_record_club_pitch_staff_reply(uuid,uuid,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.platform_server_club_request_pitch_history(uuid,uuid,text,uuid) to service_role;
grant execute on function public.platform_server_record_club_pitch_staff_reply(uuid,uuid,uuid,uuid,uuid,text,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
