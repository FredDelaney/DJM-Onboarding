create table if not exists platform.player_portal_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('portal_opened','review_viewed','request_created','document_viewed','career_plan_viewed')),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists player_portal_events_tenant_player_time_idx on platform.player_portal_events(tenant_id,player_id,occurred_at desc);
create index if not exists player_portal_events_user_time_idx on platform.player_portal_events(user_id,occurred_at desc);
alter table platform.player_portal_events enable row level security;
revoke all on platform.player_portal_events from public,anon,authenticated;
grant all on platform.player_portal_events to service_role;

create or replace function public.platform_server_create_player_portal_invite(p_tenant_id uuid,p_player_id uuid,p_actor_user_id uuid,p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_role text; v_player public.players%rowtype; v_email text:=lower(trim(p_email)); v_token uuid; v_invite_id uuid; v_existing_user uuid; v_existing_email text;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' limit 1;
  if v_role not in ('owner','admin','agent','operations') then raise exception 'agency_operator_access_required'; end if;
  if v_email='' or position('@' in v_email)<2 then raise exception 'valid_player_email_required'; end if;
  select * into v_player from public.players p where p.id=p_player_id and p.tenant_id=p_tenant_id and p.football_status<>'retired' for update;
  if not found then raise exception 'player_not_found_for_tenant'; end if;
  if v_player.user_id is not null then raise exception 'player_account_already_linked'; end if;
  select u.id,u.email into v_existing_user,v_existing_email from auth.users u where lower(u.email)=v_email limit 1;
  if v_existing_user is not null then raise exception 'email_already_registered'; end if;

  select pi.id,pi.token into v_invite_id,v_token from public.player_invites pi
   where pi.player_id=p_player_id and pi.status='pending' and pi.expires_at>now() and lower(pi.email)=v_email
   order by pi.created_at desc limit 1;
  if v_token is not null then
    return jsonb_build_object('created',false,'existing',true,'invite_id',v_invite_id,'token',v_token,'player_id',p_player_id,'email',v_email,'truth_contract',jsonb_build_object('scope','The existing valid invite belongs to this exact player record. No player or account was created implicitly.'));
  end if;

  update public.player_invites set status='revoked' where player_id=p_player_id and status='pending';
  insert into public.player_invites(email,player_id,invited_by) values(v_email,p_player_id,p_actor_user_id) returning id,token into v_invite_id,v_token;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','player_portal.invite_created','player',p_player_id::text,jsonb_build_object('invite_id',v_invite_id,'email',v_email),jsonb_build_object('player_id',p_player_id));
  return jsonb_build_object('created',true,'existing',false,'invite_id',v_invite_id,'token',v_token,'player_id',p_player_id,'email',v_email,'truth_contract',jsonb_build_object('scope','The invite is tenant-validated and linked to an existing player. DJM never creates a player implicitly from an email in the white-label invite flow.'));
end;$$;

create or replace function public.platform_server_complete_player_invite_acceptance(p_token uuid,p_email text,p_user_id uuid,p_notice_version text,p_accepted_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_invite public.player_invites%rowtype; v_player public.players%rowtype; v_email text:=lower(trim(p_email)); v_tenant_active boolean;
begin
  if p_token is null or p_user_id is null or v_email='' or nullif(trim(p_notice_version),'') is null then raise exception 'acceptance_inputs_required'; end if;
  select * into v_invite from public.player_invites pi where pi.token=p_token for update;
  if not found or v_invite.status<>'pending' or v_invite.expires_at<=now() or lower(v_invite.email)<>v_email then raise exception 'player_invite_invalid_or_expired'; end if;
  select * into v_player from public.players p where p.id=v_invite.player_id for update;
  if not found then raise exception 'invited_player_not_found'; end if;
  select exists(select 1 from platform.tenants t where t.id=v_player.tenant_id and t.status='active') into v_tenant_active;
  if not v_tenant_active then raise exception 'invited_tenant_not_active'; end if;
  if v_player.user_id is not null and v_player.user_id<>p_user_id then raise exception 'player_already_linked_to_another_user'; end if;
  if exists(select 1 from public.players p where p.user_id=p_user_id and p.id<>v_player.id) then raise exception 'auth_user_already_linked_to_another_player'; end if;

  update public.players set user_id=p_user_id,onboarding_status=case when onboarding_status='not_started' then 'in_progress' else onboarding_status end where id=v_player.id;
  update public.player_invites set status='accepted',accepted_at=coalesce(p_accepted_at,now()) where id=v_invite.id;
  update public.player_invites set status='revoked' where player_id=v_player.id and id<>v_invite.id and status='pending';
  insert into public.player_privacy_acceptances(player_id,user_id,notice_version,accepted_at,accepted_via)
  values(v_player.id,p_user_id,trim(p_notice_version),coalesce(p_accepted_at,now()),'player_invite')
  on conflict (user_id,notice_version) do update set player_id=excluded.player_id,accepted_at=excluded.accepted_at,accepted_via=excluded.accepted_via;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(v_player.tenant_id,p_user_id,'user','player_portal.invite_accepted','player',v_player.id::text,jsonb_build_object('user_id',p_user_id,'invite_id',v_invite.id,'notice_version',p_notice_version),jsonb_build_object('player_id',v_player.id));
  return jsonb_build_object('completed',true,'tenant_id',v_player.tenant_id,'player_id',v_player.id,'user_id',p_user_id,'invite_id',v_invite.id,'truth_contract',jsonb_build_object('linkage','Acceptance links exactly the player record referenced by the validated invite token.','privacy','The supplied privacy notice version is persisted with the acceptance.'));
end;$$;

create or replace function public.platform_server_record_player_portal_event(p_user_id uuid,p_tenant_id uuid,p_event_type text,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_player public.players%rowtype; v_type text:=lower(trim(p_event_type)); v_id uuid;
begin
  if v_type not in ('portal_opened','review_viewed','request_created','document_viewed','career_plan_viewed') then raise exception 'invalid_player_portal_event_type'; end if;
  select p.* into v_player from public.players p join platform.tenants t on t.id=p.tenant_id and t.status='active'
   where p.user_id=p_user_id and p.tenant_id=p_tenant_id and p.football_status<>'retired' limit 1;
  if not found then raise exception 'player_workspace_not_found'; end if;
  insert into platform.player_portal_events(tenant_id,player_id,user_id,event_type,metadata) values(p_tenant_id,v_player.id,p_user_id,v_type,coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
  return jsonb_build_object('recorded',true,'event_id',v_id);
end;$$;

create or replace function public.platform_server_player_activation_command(p_tenant_id uuid,p_limit integer default 500)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_items jsonb; v_total int:=0; v_no_invite int:=0; v_pending int:=0; v_expired int:=0; v_linked_never_opened int:=0; v_portal_seen int:=0; v_value_loop int:=0;
begin
  with base as (
    select p.id,p.user_id,coalesce(nullif(trim(p.preferred_name),''),trim(concat_ws(' ',p.first_name,p.last_name))) player_name,p.football_status,p.onboarding_status,
      i.status invite_status,i.expires_at invite_expires_at,i.email invite_email,i.created_at invite_created_at,
      u.last_sign_in_at,
      e.last_portal_event_at,e.last_review_viewed_at,e.portal_event_count,
      cs.status strategy_status,cs.player_confirmed_at,
      ps.latest_proof_snapshot_date
    from public.players p
    left join lateral (select pi.status,pi.expires_at,pi.email,pi.created_at from public.player_invites pi where pi.player_id=p.id order by pi.created_at desc limit 1) i on true
    left join auth.users u on u.id=p.user_id
    left join lateral (select max(pe.occurred_at) last_portal_event_at,max(pe.occurred_at) filter(where pe.event_type='review_viewed') last_review_viewed_at,count(*)::int portal_event_count from platform.player_portal_events pe where pe.tenant_id=p_tenant_id and pe.player_id=p.id) e on true
    left join lateral (select s.status,s.player_confirmed_at from platform.player_career_strategies s where s.tenant_id=p_tenant_id and s.player_id=p.id and s.status in ('approved','draft') order by case when s.status='approved' then 0 else 1 end,s.updated_at desc limit 1) cs on true
    left join lateral (select max(s.snapshot_date) latest_proof_snapshot_date from platform.player_value_proof_snapshots s where s.tenant_id=p_tenant_id and s.player_id=p.id) ps on true
    where p.tenant_id=p_tenant_id and p.football_status in ('active','free_agent','loan','injured')
  ), classified as (
    select b.*,
      case
        when user_id is null and invite_status is null then 'invite_not_created'
        when user_id is null and invite_status='pending' and invite_expires_at<=now() then 'invite_expired'
        when user_id is null and invite_status='pending' then 'invite_pending'
        when user_id is null and invite_status in ('accepted','revoked') then 'access_linkage_incomplete'
        when user_id is not null and last_portal_event_at is null then 'account_linked_never_opened'
        when user_id is not null and last_portal_event_at<now()-interval '30 days' then 'portal_activity_stale'
        else 'portal_active' end access_state,
      case
        when strategy_status is null then 'career_strategy_missing'
        when strategy_status='draft' or player_confirmed_at is null then 'career_strategy_needs_confirmation'
        when latest_proof_snapshot_date is null then 'proof_baseline_missing'
        when user_id is not null and last_review_viewed_at is not null then 'player_value_loop_active'
        else 'agency_value_recorded_player_review_not_seen' end value_state
    from base b
  ), ranked as (
    select c.*,row_number() over(order by case access_state when 'access_linkage_incomplete' then 1 when 'invite_expired' then 2 when 'invite_not_created' then 3 when 'invite_pending' then 4 when 'account_linked_never_opened' then 5 when 'portal_activity_stale' then 6 else 7 end,case value_state when 'career_strategy_missing' then 1 when 'career_strategy_needs_confirmation' then 2 when 'proof_baseline_missing' then 3 when 'agency_value_recorded_player_review_not_seen' then 4 else 5 end,player_name) rn
    from classified c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'rank',rn,'player_id',id,'player_name',player_name,'football_status',football_status,'access_state',access_state,'value_state',value_state,
    'milestones',jsonb_build_object('roster_record',true,'invite_issued',invite_status is not null,'account_linked',user_id is not null,'portal_opened',last_portal_event_at is not null,'career_strategy_confirmed',strategy_status='approved' and player_confirmed_at is not null,'proof_baseline',latest_proof_snapshot_date is not null,'player_review_seen',last_review_viewed_at is not null),
    'invite',case when invite_status is null then null else jsonb_build_object('status',invite_status,'expires_at',invite_expires_at,'created_at',invite_created_at,'email',invite_email) end,
    'portal',jsonb_build_object('last_sign_in_at',last_sign_in_at,'last_portal_event_at',last_portal_event_at,'last_review_viewed_at',last_review_viewed_at,'recorded_event_count',coalesce(portal_event_count,0)),
    'next_action',case
      when access_state='invite_not_created' then jsonb_build_object('api_action','player_portal_invite_create','player_id',id,'instruction','Create a tenant-scoped player portal invite after confirming the player email.')
      when access_state='invite_expired' then jsonb_build_object('api_action','player_portal_invite_create','player_id',id,'instruction','Issue a new tenant-scoped invite after confirming the player email.')
      when access_state='access_linkage_incomplete' then jsonb_build_object('api_action','player_activation','player_id',id,'instruction','Review the accepted/revoked invite and account linkage before issuing another invite.')
      when access_state='invite_pending' then jsonb_build_object('api_action','player_activation','player_id',id,'instruction','Invite remains valid; follow up with the player rather than creating duplicate access.')
      when access_state='account_linked_never_opened' then jsonb_build_object('api_action','player_activation','player_id',id,'instruction','Help the player complete their first portal session.')
      when value_state='career_strategy_missing' then jsonb_build_object('api_action','career_strategy','player_id',id,'instruction','Create the human-owned career strategy.')
      when value_state='career_strategy_needs_confirmation' then jsonb_build_object('api_action','career_strategy','player_id',id,'instruction','Review and player-confirm the career strategy.')
      when value_state='proof_baseline_missing' then jsonb_build_object('api_action','player_value_proof_capture','player_id',id,'instruction','Capture the first player service proof baseline.')
      when value_state='agency_value_recorded_player_review_not_seen' then jsonb_build_object('api_action','player_activation','player_id',id,'instruction','Invite the player to review the player-safe service and career update in their portal.')
      else jsonb_build_object('api_action','player_review_pack','player_id',id,'instruction','Maintain the player service and review cadence.') end
  ) order by rn) filter(where rn<=greatest(1,least(coalesce(p_limit,500),1000))),'[]'::jsonb),
  count(*),count(*) filter(where access_state='invite_not_created'),count(*) filter(where access_state='invite_pending'),count(*) filter(where access_state='invite_expired'),count(*) filter(where access_state='account_linked_never_opened'),count(*) filter(where access_state in ('portal_active','portal_activity_stale')),count(*) filter(where value_state='player_value_loop_active')
  into v_items,v_total,v_no_invite,v_pending,v_expired,v_linked_never_opened,v_portal_seen,v_value_loop from ranked;
  return jsonb_build_object('available',true,'tenant_id',p_tenant_id,'generated_at',now(),
    'summary',jsonb_build_object('eligible_players',v_total,'invite_not_created',v_no_invite,'invite_pending',v_pending,'invite_expired',v_expired,'account_linked_never_opened',v_linked_never_opened,'players_with_recorded_portal_activity',v_portal_seen,'player_value_loop_active',v_value_loop),
    'items',v_items,
    'truth_contract',jsonb_build_object('activation','Activation is a factual sequence of access and usage milestones, not a proprietary engagement score.','portal_activity','Portal activity means DJM recorded a first-party Player OS event. Authentication alone is not treated as portal use.','value_loop','A player value loop is only marked active when an approved/player-confirmed strategy, proof baseline and player review view are all recorded.','satisfaction','No player satisfaction, loyalty or retention probability is inferred.'));
end;$$;

do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('platform_server_create_player_portal_invite','platform_server_complete_player_invite_acceptance','platform_server_record_player_portal_event','platform_server_player_activation_command') loop
    execute format('revoke all on function %s from public,anon,authenticated',r.sig);
    execute format('grant execute on function %s to service_role',r.sig);
  end loop;
end $$;;
