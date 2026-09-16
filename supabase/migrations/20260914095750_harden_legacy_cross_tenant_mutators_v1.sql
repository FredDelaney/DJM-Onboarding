create or replace function public.create_player_invitation(invite_email text, player_name text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
declare
  v_email text := lower(trim(invite_email));
  v_name text := trim(coalesce(player_name,''));
  v_first text;
  v_last text;
  v_player_id uuid;
  v_token uuid;
  v_existing_user uuid;
  v_tenant uuid;
  v_uid uuid:=auth.uid();
begin
  if v_uid is null or not private.is_admin() then
    raise exception 'Admin access required';
  end if;

  select m.tenant_id into v_tenant
  from platform.tenant_memberships m
  join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.user_id=v_uid and m.status='active' and m.role in ('owner','admin')
    and coalesce((t.metadata->>'internal_tenant')::boolean,false)=true
  order by m.joined_at asc
  limit 1;
  if v_tenant is null then raise exception 'Internal DJM tenant admin access required'; end if;

  if v_email = '' or position('@' in v_email) < 2 then
    raise exception 'A valid player email is required';
  end if;

  select p.user_id,p.id into v_existing_user,v_player_id
  from public.players p
  join public.player_private pr on pr.player_id=p.id
  where p.tenant_id=v_tenant and lower(pr.personal_email)=v_email
  order by p.created_at desc
  limit 1;

  if v_existing_user is not null then raise exception 'This player already has an account'; end if;

  select pi.token,pi.player_id into v_token,v_player_id
  from public.player_invites pi
  join public.players p on p.id=pi.player_id and p.tenant_id=v_tenant
  where lower(pi.email)=v_email and pi.status='pending' and pi.expires_at>now()
  order by pi.created_at desc
  limit 1;

  if v_token is not null then
    return jsonb_build_object('token',v_token,'player_id',v_player_id,'existing',true,'tenant_id',v_tenant);
  end if;

  if v_player_id is null then
    v_first:=nullif(split_part(v_name,' ',1),'');
    v_last:=nullif(trim(substr(v_name,length(coalesce(v_first,''))+1)),'');
    insert into public.players(first_name,last_name,preferred_name,onboarding_status,agency_priority,tenant_id)
    values(v_first,v_last,coalesce(v_first,split_part(v_email,'@',1)),'not_started','normal',v_tenant)
    returning id into v_player_id;
    insert into public.player_private(player_id,personal_email) values(v_player_id,v_email);
    insert into public.player_cv_settings(player_id) values(v_player_id) on conflict(player_id) do nothing;
  end if;

  insert into public.player_invites(email,player_id,invited_by)
  values(v_email,v_player_id,v_uid)
  returning token into v_token;

  return jsonb_build_object('token',v_token,'player_id',v_player_id,'existing',false,'tenant_id',v_tenant);
end;
$function$;

create or replace function djm_os.complete_player_request_internal(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_player_id uuid;
  v_tenant uuid;
  v_updated integer:=0;
begin
  select r.player_id,p.tenant_id into v_player_id,v_tenant
  from public.player_requests r
  join public.players p on p.id=r.player_id
  where r.id=p_request_id
  for update of r;

  if v_player_id is null or v_tenant is null then raise exception 'Player request not found'; end if;
  if not private.user_has_staff_tenant_access(v_tenant,v_uid) then raise exception 'Agency staff access required'; end if;

  update public.player_requests
  set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
  where id=p_request_id and player_id=v_player_id and status not in ('completed','dismissed');
  get diagnostics v_updated=row_count;

  return jsonb_build_object('request_id',p_request_id,'player_id',v_player_id,'tenant_id',v_tenant,'completed',v_updated>0);
end;
$function$;

create or replace function public.djm_player_send_reply(p_player_id uuid,p_request_id uuid,p_title text,p_message text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_tenant uuid;
  v_incoming public.player_requests%rowtype;
  v_reply_id uuid;
  v_candidate_task_id uuid;
  v_candidate_task_count integer:=0;
begin
  select p.tenant_id into v_tenant from public.players p where p.id=p_player_id;
  if v_tenant is null then raise exception 'Player not found'; end if;
  if not private.user_has_staff_tenant_access(v_tenant,v_uid) then raise exception 'Agency staff access required'; end if;
  if nullif(trim(coalesce(p_message,'')),'') is null then raise exception 'Reply message is required'; end if;

  select r.* into v_incoming
  from public.player_requests r
  join public.players p on p.id=r.player_id and p.tenant_id=v_tenant
  where r.id=p_request_id and r.player_id=p_player_id
  for update of r;

  if v_incoming.id is null then raise exception 'Player message not found'; end if;
  if v_incoming.created_by is not null or v_incoming.request_type not in ('message','signal') then raise exception 'This item is not an incoming player message'; end if;
  if v_incoming.status='completed' then raise exception 'This player message has already been handled'; end if;

  insert into public.player_requests(player_id,title,message,request_type,status,created_by,completed_at)
  values(p_player_id,coalesce(nullif(trim(coalesce(p_title,'')),''),'Reply from agency'),trim(p_message),'message','completed',v_uid,now())
  returning id into v_reply_id;

  update public.player_requests set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
  where id=p_request_id and player_id=p_player_id;

  select count(*) into v_candidate_task_count
  from djm_os.tasks t
  where t.tenant_id=v_tenant and t.player_id=p_player_id
    and t.status not in ('done','completed','cancelled')
    and t.task_type='tell_djm' and t.source like 'tell_djm:%'
    and lower(t.title) ~ '(catch[ -]?up|follow[ -]?up|reply|message|contact|speak|call|check[ -]?in)';

  if v_candidate_task_count=1 then
    select t.id into v_candidate_task_id
    from djm_os.tasks t
    where t.tenant_id=v_tenant and t.player_id=p_player_id
      and t.status not in ('done','completed','cancelled')
      and t.task_type='tell_djm' and t.source like 'tell_djm:%'
      and lower(t.title) ~ '(catch[ -]?up|follow[ -]?up|reply|message|contact|speak|call|check[ -]?in)'
    limit 1;
    update djm_os.tasks set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
    where id=v_candidate_task_id and tenant_id=v_tenant;
  else
    v_candidate_task_id:=null;
  end if;

  insert into djm_os.events(tenant_id,event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values(v_tenant,'PLAYER_MESSAGE_REPLIED',v_uid,p_player_id,
    jsonb_build_object('incoming_request_id',p_request_id,'reply_request_id',v_reply_id,'auto_completed_task_id',v_candidate_task_id,'communication_task_candidates',v_candidate_task_count),
    'player_inbox',1,now());

  return jsonb_build_object('tenant_id',v_tenant,'player_id',p_player_id,'incoming_request_id',p_request_id,'reply_request_id',v_reply_id,'auto_completed_task_id',v_candidate_task_id,'communication_task_candidates',v_candidate_task_count);
end;
$function$;

create or replace function public.djm_recruitment_promote_to_signed_player(p_prospect_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  sp djm_os.scouting_prospects%rowtype;
  v_player_id uuid;
  v_first text;
  v_last text;
  v_space int;
  v_uid uuid:=auth.uid();
begin
  select * into sp from djm_os.scouting_prospects where id=p_prospect_id for update;
  if sp.id is null then raise exception 'Recruitment target not found'; end if;
  if not exists(
    select 1 from platform.tenant_memberships m
    join platform.tenants t on t.id=m.tenant_id and t.status='active'
    where m.tenant_id=sp.tenant_id and m.user_id=v_uid and m.status='active' and m.role in ('owner','admin','agent','operations')
  ) then raise exception 'Agency operator access required'; end if;

  if sp.signed_player_id is not null then
    if not exists(select 1 from public.players p where p.id=sp.signed_player_id and p.tenant_id=sp.tenant_id) then raise exception 'Signed player tenant mismatch'; end if;
    return jsonb_build_object('player_id',sp.signed_player_id,'tenant_id',sp.tenant_id,'already_promoted',true);
  end if;
  if sp.recruitment_stage<>'signed' then raise exception 'Target must be marked signed before promotion'; end if;

  v_space:=strpos(trim(sp.full_name),' ');
  if v_space>0 then v_first:=left(trim(sp.full_name),v_space-1);v_last:=substr(trim(sp.full_name),v_space+1);
  else v_first:=trim(sp.full_name);v_last:=null; end if;

  insert into public.players(
    first_name,last_name,date_of_birth,nationalities,preferred_foot,primary_position,secondary_positions,current_club,current_country,
    contract_expiry,transfermarkt_url,wyscout_url,instagram_url,onboarding_status,verification_status,agency_priority,next_action,
    review_required_at,review_reason,tenant_id,primary_staff_user_id
  ) values(
    v_first,v_last,sp.date_of_birth,
    case when nullif(trim(coalesce(sp.nationality,'')),'') is null then '{}'::text[] else array[trim(sp.nationality)] end,
    sp.preferred_foot,sp.primary_position,coalesce(sp.secondary_positions,'{}'::text[]),sp.current_club,sp.current_country,
    sp.contract_expiry,sp.transfermarkt_url,sp.wyscout_url,sp.instagram_url,'not_started','unverified','high','Complete player onboarding',
    now(),'Promoted from Recruitment after signing',sp.tenant_id,sp.owner_user_id
  ) returning id into v_player_id;

  delete from djm_os.football_intelligence_subjects created
  where created.tenant_id=sp.tenant_id and created.player_id=v_player_id and created.prospect_id is null
    and exists(select 1 from djm_os.football_intelligence_subjects existing where existing.tenant_id=sp.tenant_id and existing.prospect_id=p_prospect_id and existing.id<>created.id);

  update djm_os.scouting_prospects
  set signed_player_id=v_player_id,linked_player_id=v_player_id,signed_at=coalesce(signed_at,now()),next_action_at=null,updated_at=now()
  where id=p_prospect_id and tenant_id=sp.tenant_id;

  update djm_os.tasks set status='completed',completed_at=now(),updated_at=now()
  where tenant_id=sp.tenant_id and source=('recruitment:'||p_prospect_id::text) and status not in ('completed','cancelled');

  insert into djm_os.events(tenant_id,event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values(sp.tenant_id,'RECRUITMENT_PROMOTED_TO_SIGNED_PLAYER',v_uid,v_player_id,
    jsonb_build_object('prospect_id',p_prospect_id,'player_name',sp.full_name),'recruitment',1,now());

  return jsonb_build_object('player_id',v_player_id,'prospect_id',p_prospect_id,'tenant_id',sp.tenant_id,'already_promoted',false,'onboarding_status','not_started');
end;
$function$;;
