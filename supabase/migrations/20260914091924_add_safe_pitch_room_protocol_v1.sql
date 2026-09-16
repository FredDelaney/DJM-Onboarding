create table if not exists platform.club_pitch_contexts (
  share_id uuid primary key references public.club_share_links(id) on delete cascade,
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  player_match_id uuid not null references djm_os.player_matches(id) on delete cascade,
  club_need_id uuid not null references djm_os.club_needs(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists club_pitch_contexts_tenant_idx on platform.club_pitch_contexts(tenant_id,created_at desc);
create index if not exists club_pitch_contexts_player_match_idx on platform.club_pitch_contexts(player_match_id);
create index if not exists club_pitch_contexts_created_by_idx on platform.club_pitch_contexts(created_by);
alter table platform.club_pitch_contexts enable row level security;

create or replace function public.platform_server_create_pitch_draft(
  p_tenant_id uuid,
  p_player_match_id uuid,
  p_actor_user_id uuid,
  p_input jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_match djm_os.player_matches%rowtype;
  v_need djm_os.club_needs%rowtype;
  v_gate jsonb;
  v_share public.club_share_links%rowtype;
  v_existing uuid;
  v_deal_id uuid;
  v_org_id uuid;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;

  select * into v_match from djm_os.player_matches pm where pm.id=p_player_match_id and pm.tenant_id=p_tenant_id;
  if not found then raise exception 'player_match_not_found_for_tenant'; end if;
  select * into v_need from djm_os.club_needs n where n.id=v_match.club_need_id and n.tenant_id=p_tenant_id;
  if not found then raise exception 'club_need_not_found_for_tenant'; end if;
  v_org_id:=v_need.organisation_id;

  v_gate:=public.platform_server_career_pursuit_gate(p_tenant_id,p_player_match_id);
  if coalesce(v_gate->>'state','') not in ('open_aligned','open_approved_exception') then raise exception 'career_control_gate_not_open'; end if;

  select c.share_id into v_existing
  from platform.club_pitch_contexts c join public.club_share_links s on s.id=c.share_id
  where c.tenant_id=p_tenant_id and c.player_match_id=p_player_match_id and s.revoked_at is null
  order by s.created_at desc limit 1;
  if v_existing is not null then
    return jsonb_build_object('created',false,'existing',true,'share_id',v_existing,'pitch',public.platform_server_pitch_execution_command(p_tenant_id,100));
  end if;

  if nullif(trim(p_input->>'deal_room_id'),'') is not null then
    v_deal_id:=(p_input->>'deal_room_id')::uuid;
    if not exists(select 1 from djm_os.deal_rooms d where d.id=v_deal_id and d.tenant_id=p_tenant_id and d.player_id=v_match.player_id and d.organisation_id=v_org_id) then
      raise exception 'deal_room_does_not_match_pitch_context';
    end if;
  end if;

  insert into public.club_share_links(player_id,label,active,expires_at,created_by,opportunity_id,organisation_id,pitch_message,pitch_status,selected_sections)
  values(v_match.player_id,nullif(trim(p_input->>'label'),''),false,null,p_actor_user_id,v_deal_id,v_org_id,nullif(trim(p_input->>'pitch_message'),''),'draft',coalesce(p_input->'selected_sections','{}'::jsonb))
  returning * into v_share;

  insert into platform.club_pitch_contexts(share_id,tenant_id,player_match_id,club_need_id,created_by)
  values(v_share.id,p_tenant_id,p_player_match_id,v_match.club_need_id,p_actor_user_id);

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','club_pitch.draft_created','club_pitch',v_share.id::text,to_jsonb(v_share),jsonb_build_object('player_match_id',p_player_match_id,'club_need_id',v_match.club_need_id));

  return jsonb_build_object(
    'created',true,'existing',false,'share_id',v_share.id,'state','draft_private',
    'truth_contract',jsonb_build_object('privacy','Draft pitch links are inactive and cannot be opened through the public club-share reader.','career','Draft creation requires an open human-owned career gate.','send','Creating a draft is not external outreach.')
  );
end;
$function$;

create or replace function public.platform_server_publish_pitch_link(
  p_tenant_id uuid,
  p_share_id uuid,
  p_actor_user_id uuid,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_ctx platform.club_pitch_contexts%rowtype;
  v_share public.club_share_links%rowtype;
  v_player public.players%rowtype;
  v_profile public.player_public_profiles%rowtype;
  v_gate jsonb;
  v_expiry timestamptz:=coalesce(p_expires_at,now()+interval '30 days');
  v_other integer:=0;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  if v_expiry<=now() then raise exception 'pitch_expiry_must_be_future'; end if;

  select * into v_ctx from platform.club_pitch_contexts c where c.share_id=p_share_id and c.tenant_id=p_tenant_id;
  if not found then raise exception 'pitch_context_not_found_for_tenant'; end if;
  select * into v_share from public.club_share_links s where s.id=p_share_id for update;
  if not found or v_share.revoked_at is not null then raise exception 'pitch_share_not_available'; end if;
  select * into v_player from public.players p where p.id=v_share.player_id and p.tenant_id=p_tenant_id;
  if not found then raise exception 'player_not_found_for_tenant'; end if;
  select * into v_profile from public.player_public_profiles pp where pp.player_id=v_player.id;

  v_gate:=public.platform_server_career_pursuit_gate(p_tenant_id,v_ctx.player_match_id);
  if coalesce(v_gate->>'state','') not in ('open_aligned','open_approved_exception') then raise exception 'career_control_gate_not_open'; end if;
  if v_player.verification_status<>'verified' or v_player.verified_at is null then raise exception 'player_not_verified_for_external_share'; end if;
  if v_profile.player_id is null or not coalesce(v_profile.published,false) or v_profile.verified_at is null then raise exception 'club_profile_not_published_and_verified'; end if;

  select count(*) into v_other from public.club_share_links s
  join public.players p on p.id=s.player_id and p.tenant_id=p_tenant_id
  where s.id<>p_share_id and s.player_id=v_share.player_id and s.organisation_id=v_share.organisation_id and s.active=true and s.revoked_at is null and (s.expires_at is null or s.expires_at>now());
  if v_other>0 then raise exception 'another_active_pitch_exists_for_player_and_club'; end if;

  update public.club_share_links
  set active=true,expires_at=v_expiry,pitch_status=case when sent_at is null then 'ready' else pitch_status end
  where id=p_share_id
  returning * into v_share;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','club_pitch.published','club_pitch',p_share_id::text,to_jsonb(v_share),jsonb_build_object('player_match_id',v_ctx.player_match_id,'expires_at',v_expiry));

  return jsonb_build_object('published',true,'share_id',p_share_id,'state','ready_not_confirmed_sent','expires_at',v_expiry,
    'truth_contract',jsonb_build_object('public_link','The link is now externally accessible to anyone who possesses the unguessable share token until it is revoked or expires.','send','Publishing the link does not record that it was delivered to a club. A human must separately confirm sent.'));
end;
$function$;

create or replace function public.platform_server_confirm_pitch_sent(
  p_tenant_id uuid,
  p_share_id uuid,
  p_actor_user_id uuid,
  p_sent_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_ctx platform.club_pitch_contexts%rowtype;
  v_share public.club_share_links%rowtype;
  v_sent timestamptz:=coalesce(p_sent_at,now());
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  if v_sent>now()+interval '5 minutes' then raise exception 'pitch_sent_at_cannot_be_future'; end if;
  select * into v_ctx from platform.club_pitch_contexts c where c.share_id=p_share_id and c.tenant_id=p_tenant_id;
  if not found then raise exception 'pitch_context_not_found_for_tenant'; end if;
  select * into v_share from public.club_share_links s where s.id=p_share_id for update;
  if not found or not v_share.active or v_share.revoked_at is not null or (v_share.expires_at is not null and v_share.expires_at<=now()) then raise exception 'pitch_link_not_active'; end if;

  update public.club_share_links
  set sent_at=coalesce(sent_at,v_sent),pitch_status=case when coalesce(view_count,0)>0 then 'opened' else 'sent' end
  where id=p_share_id returning * into v_share;
  if v_share.opportunity_id is not null then
    update djm_os.deal_rooms set pitch_status=case when coalesce(v_share.view_count,0)>0 then 'opened' else 'sent' end,updated_at=now()
    where id=v_share.opportunity_id and tenant_id=p_tenant_id;
  end if;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','club_pitch.sent_confirmed','club_pitch',p_share_id::text,to_jsonb(v_share),jsonb_build_object('player_match_id',v_ctx.player_match_id,'sent_at',v_share.sent_at));
  return jsonb_build_object('confirmed_sent',true,'share_id',p_share_id,'sent_at',v_share.sent_at,'pitch_status',v_share.pitch_status,
    'truth_contract',jsonb_build_object('meaning','Sent is a human-confirmed operating fact. DJM does not independently verify delivery, recipient identity or receipt.'));
end;
$function$;

create or replace function public.platform_server_revoke_pitch_link(
  p_tenant_id uuid,
  p_share_id uuid,
  p_actor_user_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_role text;
  v_ctx platform.club_pitch_contexts%rowtype;
  v_share public.club_share_links%rowtype;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  select * into v_ctx from platform.club_pitch_contexts c where c.share_id=p_share_id and c.tenant_id=p_tenant_id;
  if not found then raise exception 'pitch_context_not_found_for_tenant'; end if;
  update public.club_share_links set active=false,revoked_at=coalesce(revoked_at,now()),pitch_status='revoked' where id=p_share_id returning * into v_share;
  if not found then raise exception 'pitch_share_not_found'; end if;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','club_pitch.revoked','club_pitch',p_share_id::text,to_jsonb(v_share),jsonb_build_object('player_match_id',v_ctx.player_match_id,'reason',nullif(trim(p_reason),'')));
  return jsonb_build_object('revoked',true,'share_id',p_share_id,'revoked_at',v_share.revoked_at,'truth_contract',jsonb_build_object('access','Revocation disables the public share link immediately.'));
end;
$function$;

revoke all on table platform.club_pitch_contexts from anon,authenticated;
grant all on table platform.club_pitch_contexts to service_role;
revoke all on function public.platform_server_create_pitch_draft(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.platform_server_publish_pitch_link(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.platform_server_confirm_pitch_sent(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.platform_server_revoke_pitch_link(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.platform_server_create_pitch_draft(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.platform_server_publish_pitch_link(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.platform_server_confirm_pitch_sent(uuid,uuid,uuid,timestamptz) to service_role;
grant execute on function public.platform_server_revoke_pitch_link(uuid,uuid,uuid,text) to service_role;;
