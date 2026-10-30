-- Staging contracts inspected 28 October 2026, before the guarded commercial-brief migration.
-- Test fixture only. Never deploy this baseline.
CREATE OR REPLACE FUNCTION public.platform_server_agency_create_club_need(p_tenant_id uuid, p_actor_user_id uuid, p_club_name text, p_country text, p_position text, p_title text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_expires_on date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_position text := nullif(btrim(coalesce(p_position, '')), '');
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_org_id uuid;
  v_need_id uuid;
  v_expires_at timestamptz;
begin
  perform private.platform_server_assert_agency_operator(
    p_tenant_id,
    p_actor_user_id
  );
  perform private.platform_server_ensure_team_member(p_actor_user_id);

  if v_position is null then
    raise exception 'position_required';
  end if;

  if length(coalesce(v_notes, '')) > 4000 then
    raise exception 'notes_too_long';
  end if;

  v_org_id := private.platform_server_agency_ensure_club(
    p_tenant_id,
    p_club_name,
    p_country
  );

  if p_expires_on is not null then
    v_expires_at := (p_expires_on + 1)::timestamptz - interval '1 second';
  end if;

  insert into djm_os.club_needs (
    tenant_id,
    organisation_id,
    owner_user_id,
    title,
    position,
    profile_notes,
    raw_request,
    source_context,
    status,
    confidence,
    confirmed_at,
    received_at,
    priority,
    need_type,
    expires_at
  )
  values (
    p_tenant_id,
    v_org_id,
    p_actor_user_id,
    coalesce(v_title, v_position || ' requirement'),
    v_position,
    v_notes,
    v_notes,
    'Agency workspace',
    'active',
    1,
    now(),
    now(),
    3,
    'confirmed',
    v_expires_at
  )
  returning id into v_need_id;

  insert into djm_os.events (
    tenant_id,
    event_type,
    actor_user_id,
    organisation_id,
    payload,
    source,
    confidence,
    occurred_at
  )
  values (
    p_tenant_id,
    'CLUB_NEED_CREATED',
    p_actor_user_id,
    v_org_id,
    jsonb_build_object(
      'club_need_id', v_need_id,
      'position', v_position,
      'source', 'agency_workspace'
    ),
    'agency_workspace',
    1,
    now()
  );

  insert into platform.audit_events (
    tenant_id,
    actor_user_id,
    actor_kind,
    action,
    entity_type,
    entity_id,
    after_state,
    metadata
  )
  values (
    p_tenant_id,
    p_actor_user_id,
    'user',
    'platform.agency.club_need_created',
    'club_need',
    v_need_id::text,
    jsonb_build_object(
      'organisation_id', v_org_id,
      'position', v_position,
      'title', coalesce(v_title, v_position || ' requirement')
    ),
    jsonb_build_object('source', 'agency_workspace')
  );

  return jsonb_build_object(
    'club_need_id', v_need_id,
    'organisation_id', v_org_id,
    'created', true
  );
end;
$function$;
CREATE OR REPLACE FUNCTION public.djm_entity_patch_v1(p_entity_type text, p_entity_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tenant uuid; v_name text; v_patch jsonb:=coalesce(p_patch,'{}'::jsonb);
begin
  if jsonb_typeof(v_patch)<>'object' then raise exception 'Patch must be an object'; end if;
  case p_entity_type
    when 'player' then select tenant_id into v_tenant from public.players where id=p_entity_id;
    when 'club' then select tenant_id into v_tenant from djm_os.organisations where id=p_entity_id and organisation_type='club';
    when 'club_contact' then select tenant_id into v_tenant from djm_os.people where id=p_entity_id and coalesce(person_type,'contact')<>'player';
    when 'recruitment_target' then select tenant_id into v_tenant from djm_os.scouting_prospects where id=p_entity_id;
    when 'club_need' then select tenant_id into v_tenant from djm_os.club_needs where id=p_entity_id;
    when 'deal_room' then select tenant_id into v_tenant from djm_os.deal_rooms where id=p_entity_id;
    else raise exception 'Unsupported entity type';
  end case;
  if v_tenant is null then raise exception 'Entity not found'; end if;
  if not private.user_is_tenant_admin(v_tenant,auth.uid()) or v_tenant is distinct from private.redream_request_tenant() then raise exception 'agency_admin_access_required' using errcode='42501'; end if;

  if p_entity_type='club' then
    update djm_os.organisations set
      name=case when v_patch?'name' then coalesce(nullif(trim(v_patch->>'name'),''),name) else name end,
      country=case when v_patch?'country' then nullif(trim(v_patch->>'country'),'') else country end,
      city=case when v_patch?'city' then nullif(trim(v_patch->>'city'),'') else city end,
      website_url=case when v_patch?'website_url' then nullif(trim(v_patch->>'website_url'),'') else website_url end,
      updated_at=now(),last_verified_at=now() where id=p_entity_id and tenant_id=v_tenant;
    select name into v_name from djm_os.organisations where id=p_entity_id;
  elsif p_entity_type='club_contact' then
    update djm_os.people set
      full_name=case when v_patch?'full_name' then coalesce(nullif(trim(v_patch->>'full_name'),''),full_name) else full_name end,
      preferred_name=case when v_patch?'preferred_name' then nullif(trim(v_patch->>'preferred_name'),'') else preferred_name end,
      country=case when v_patch?'country' then nullif(trim(v_patch->>'country'),'') else country end,
      city=case when v_patch?'city' then nullif(trim(v_patch->>'city'),'') else city end,
      updated_at=now(),last_verified_at=now() where id=p_entity_id and tenant_id=v_tenant;
    if v_patch?'role_title' then
      update djm_os.employments set
        role_title=nullif(trim(v_patch->>'role_title'),''),updated_at=now()
      where tenant_id=v_tenant and person_id=p_entity_id and is_current=true;
    end if;
    select full_name into v_name from djm_os.people where id=p_entity_id;
  elsif p_entity_type='recruitment_target' then
    update djm_os.scouting_prospects set
      full_name=case when v_patch?'full_name' then coalesce(nullif(trim(v_patch->>'full_name'),''),full_name) else full_name end,
      primary_position=case when v_patch?'primary_position' then nullif(trim(v_patch->>'primary_position'),'') else primary_position end,
      current_club=case when v_patch?'current_club' then nullif(trim(v_patch->>'current_club'),'') else current_club end,
      current_country=case when v_patch?'current_country' then nullif(trim(v_patch->>'current_country'),'') else current_country end,
      contract_expiry=case when v_patch?'contract_expiry' then nullif(v_patch->>'contract_expiry','')::date else contract_expiry end,
      transfermarkt_url=case when v_patch?'transfermarkt_url' then nullif(trim(v_patch->>'transfermarkt_url'),'') else transfermarkt_url end,
      updated_at=now() where id=p_entity_id and tenant_id=v_tenant;
    select full_name into v_name from djm_os.scouting_prospects where id=p_entity_id;
  elsif p_entity_type='club_need' then
    update djm_os.club_needs set
      title=case when v_patch?'title' then coalesce(nullif(trim(v_patch->>'title'),''),title) else title end,
      position=case when v_patch?'position' then nullif(trim(v_patch->>'position'),'') else position end,
      profile_notes=case when v_patch?'profile_notes' then nullif(trim(v_patch->>'profile_notes'),'') else profile_notes end,
      expires_at=case when v_patch?'expires_at' then nullif(v_patch->>'expires_at','')::timestamptz else expires_at end,
      updated_at=now() where id=p_entity_id and tenant_id=v_tenant;
    select coalesce(title,position) into v_name from djm_os.club_needs where id=p_entity_id;
  elsif p_entity_type='deal_room' then
    update djm_os.deal_rooms set
      title=case when v_patch?'title' then coalesce(nullif(trim(v_patch->>'title'),''),title) else title end,
      next_action_text=case when v_patch?'next_action_text' then nullif(trim(v_patch->>'next_action_text'),'') else next_action_text end,
      updated_at=now() where id=p_entity_id and tenant_id=v_tenant;
    select coalesce(title,'Deal') into v_name from djm_os.deal_rooms where id=p_entity_id;
  else
    update public.players set
      first_name=case when v_patch?'first_name' then nullif(trim(v_patch->>'first_name'),'') else first_name end,
      last_name=case when v_patch?'last_name' then nullif(trim(v_patch->>'last_name'),'') else last_name end,
      preferred_name=case when v_patch?'preferred_name' then nullif(trim(v_patch->>'preferred_name'),'') else preferred_name end,
      primary_position=case when v_patch?'primary_position' then nullif(trim(v_patch->>'primary_position'),'') else primary_position end,
      current_club=case when v_patch?'current_club' then nullif(trim(v_patch->>'current_club'),'') else current_club end,
      current_country=case when v_patch?'current_country' then nullif(trim(v_patch->>'current_country'),'') else current_country end,
      contract_expiry=case when v_patch?'contract_expiry' then nullif(v_patch->>'contract_expiry','')::date else contract_expiry end,
      updated_at=now() where id=p_entity_id and tenant_id=v_tenant;
    select coalesce(nullif(trim(preferred_name),''),nullif(trim(concat_ws(' ',first_name,last_name)),''),'Player') into v_name from public.players where id=p_entity_id;
  end if;

  insert into djm_os.events(event_type,actor_user_id,tenant_id,payload,source,confidence,occurred_at)
  values('ENTITY_EDITED',auth.uid(),v_tenant,jsonb_build_object('entity_type',p_entity_type,'entity_id',p_entity_id,'name',v_name,'fields',v_patch),'manual_ui',1,now());
  return jsonb_build_object('ok',true,'entity_type',p_entity_type,'id',p_entity_id,'name',v_name);
end $function$;
CREATE OR REPLACE FUNCTION public.platform_server_workspace_need_record(p_tenant_id uuid, p_user_id uuid, p_need_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_result jsonb;
begin
 if p_tenant_id is null or p_user_id is null or not private.user_is_tenant_admin(p_tenant_id,p_user_id) then
  raise exception 'tenant_admin_access_required' using errcode='42501';
 end if;
 with needs as (
  select n.*,o.name club_name,o.country,o.city,o.league_name
  from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id and o.tenant_id=n.tenant_id
  where n.tenant_id=p_tenant_id and n.id=p_need_id and (to_jsonb(n)->>'archived_at') is null and (to_jsonb(o)->>'archived_at') is null
  order by case n.need_type when 'confirmed' then 0 else 1 end,n.priority desc,n.expires_at nulls last,n.received_at desc

), candidate_rows as materialized (
  select pm.club_need_id,pm.id player_match_id,pm.player_id,pm.status match_status,
    pm.overall_score,pm.football_score,pm.commercial_score,pm.registration_score,pm.career_score,pm.access_score,
    pm.reasoning,pm.updated_at match_updated_at,
    coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') player_name,
    public.platform_server_career_pursuit_gate(p_tenant_id,pm.id) gate
  from djm_os.player_matches pm join needs n on n.id=pm.club_need_id
  join public.players p on p.id=pm.player_id and p.tenant_id=pm.tenant_id
  where pm.tenant_id=p_tenant_id and p.archived_at is null and coalesce(p.football_status,'active')<>'retired' and pm.status in ('suggested','reviewing','shortlisted','pitched','active')
), candidate_agg as (
  select c.club_need_id,
    count(*)::int recorded_candidates,
    count(*) filter(where c.gate->>'state' like 'open_%')::int career_open,
    count(*) filter(where c.gate->>'state' like 'review_%')::int human_review,
    count(*) filter(where not (c.gate->>'state' like 'open_%') and not (c.gate->>'state' like 'review_%'))::int held,
    coalesce(jsonb_agg(jsonb_build_object(
      'player_match_id',c.player_match_id,
      'player_id',c.player_id,
      'player_name',c.player_name,
      'match_status',c.match_status,
      'overall_score',c.overall_score,
      'football_score',c.football_score,
      'commercial_score',c.commercial_score,
      'registration_score',c.registration_score,
      'career_score',c.career_score,
      'access_score',c.access_score,
      'reasoning',coalesce(c.reasoning,'{}'::jsonb),
      'career_gate_state',c.gate->>'state',
      'career_gate_reason',c.gate->>'reason'
    ) order by
      case when c.gate->>'state' like 'open_%' then 0 when c.gate->>'state' like 'review_%' then 1 else 2 end,
      c.overall_score desc nulls last,
      c.football_score desc nulls last,
      case c.match_status when 'active' then 0 when 'pitched' then 1 when 'shortlisted' then 2 when 'reviewing' then 3 else 4 end,
      c.match_updated_at desc,
      c.player_name
    ),'[]'::jsonb) candidates
  from candidate_rows c group by c.club_need_id
), direct_access as (
  select distinct on (e.organisation_id) e.organisation_id,r.access_score,r.strength_score,r.trust_score,r.last_meaningful_at,p.full_name contact_name,e.role_title,r.team_member_id
  from djm_os.relationships r join djm_os.employments e on e.tenant_id=r.tenant_id and e.person_id=r.person_id and e.is_current=true
  join djm_os.people p on p.tenant_id=r.tenant_id and p.id=r.person_id
  where r.tenant_id=p_tenant_id
  order by e.organisation_id,r.access_score desc nulls last,r.strength_score desc nulls last,r.last_meaningful_at desc nulls last
), base as (
  select n.*,coalesce(c.recorded_candidates,0) recorded_candidates,coalesce(c.career_open,0) career_open,coalesce(c.human_review,0) human_review,coalesce(c.held,0) held,coalesce(c.candidates,'[]'::jsonb) candidates,
    coalesce(d.access_score,0)::int direct_score,coalesce(d.strength_score,0)::int direct_strength,d.contact_name,d.role_title,d.team_member_id,
    case when coalesce(d.access_score,0)<70 then public.platform_server_introduction_routes(p_tenant_id,n.organisation_id,1) else null end intro
  from needs n left join candidate_agg c on c.club_need_id=n.id left join direct_access d on d.organisation_id=n.organisation_id
), classified as (
  select b.*,
    coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0) intro_score,
    case when b.direct_score>=70 then 'direct_route'
         when coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0)>=70 and coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0)>=b.direct_score+10 then 'warm_introduction'
         when b.direct_score>0 then 'developing_direct_route'
         when coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0)>0 then 'developing_introduction'
         else 'no_recorded_route' end access_mode,
    case when b.recorded_candidates=0 then 'roster_gap'
         when b.career_open=0 and b.human_review>0 then 'career_or_human_review_required'
         when b.career_open=0 then 'career_blocked'
         when b.direct_score>=70 then 'ready_direct'
         when coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0)>=70 and coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0)>=b.direct_score+10 then 'ready_via_introduction'
         else 'access_gap' end coverage_state
  from base b
), ranked as (
  select c.*,row_number() over(order by case c.need_type when 'confirmed' then 0 else 1 end,
    case c.coverage_state when 'ready_direct' then 1 when 'ready_via_introduction' then 2 when 'access_gap' then 3 when 'career_or_human_review_required' then 4 when 'career_blocked' then 5 when 'roster_gap' then 6 else 9 end,
    c.priority desc,c.expires_at nulls last,c.club_name,c.title) rn
  from classified c
), items as (
  select r.*,case r.coverage_state
    when 'roster_gap' then jsonb_build_object('action_type','scout_or_recruit_for_need','instruction','No recorded roster match exists for this active club need. Scout or recruit against the recorded profile rather than forcing an unsuitable player.','requires_human_input',true)
    when 'career_or_human_review_required' then jsonb_build_object('action_type','resolve_pursuit_gate','instruction','A recorded candidate exists, but career-strategy or human review must be resolved before external escalation.','requires_human_input',true)
    when 'career_blocked' then jsonb_build_object('action_type','resolve_player_strategy_control','instruction','Recorded candidates exist but none are open under the player career controls.','requires_human_input',true)
    when 'ready_direct' then jsonb_build_object('action_type','open_deep_pursuit_review','instruction','A career-open candidate and strong direct route are recorded. Open the full pursuit review before any external pitch.','requires_human_input',true)
    when 'ready_via_introduction' then jsonb_build_object('action_type','open_deep_pursuit_review','instruction','A career-open candidate exists and a warm introduction is the stronger route. Open the full pursuit review before using it.','requires_human_input',true)
    else jsonb_build_object('action_type','build_club_access','instruction','A career-open candidate exists, but access is not yet strong enough. Build or source the route before spending the player relationship.','requires_human_input',true) end next_action
  from ranked r
)
select jsonb_build_object(
  'available',true,'tenant_id',p_tenant_id,'generated_at',now(),
  'summary',jsonb_build_object(
    'active_needs',(select count(*) from items),
    'ready_for_deep_pursuit_review',(select count(*) from items where coverage_state in ('ready_direct','ready_via_introduction')),
    'roster_gaps',(select count(*) from items where coverage_state='roster_gap'),
    'access_gaps',(select count(*) from items where coverage_state='access_gap'),
    'career_or_human_review',(select count(*) from items where coverage_state in ('career_or_human_review_required','career_blocked'))
  ),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'command_rank',rn,'club_need_id',id,
    'club',jsonb_build_object('organisation_id',organisation_id,'name',club_name,'country',country,'city',city,'league_name',league_name),
    'need',jsonb_build_object('status',status,'title',title,'position',position,'secondary_position',secondary_position,'preferred_foot',preferred_foot,'min_age',min_age,'max_age',max_age,'min_height_cm',min_height_cm,'transfer_type',transfer_type,'transfer_budget',transfer_budget,'salary_budget',salary_budget,'currency',currency,'salary_period',salary_period,'priority',priority,'need_type',need_type,'confidence',confidence,'prediction_probability',prediction_probability,'confirmed_at',confirmed_at,'expires_at',expires_at,'received_at',received_at),
    'coverage_state',coverage_state,
    'candidate_coverage',jsonb_build_object('recorded_candidates',recorded_candidates,'career_open',career_open,'human_review',human_review,'held',held,'candidates',candidates),
    'access',jsonb_build_object('mode',access_mode,'direct_score',direct_score,'direct_strength',direct_strength,'best_direct_contact',contact_name,'best_direct_role',role_title,'team_member_id',team_member_id,'introduction_score',intro_score,'best_introduction_route',intro->'best_route'),
    'next_action',case when status='active' and (expires_at is null or expires_at>=now()) then next_action else null end
  ) order by rn) from items),'[]'::jsonb),
  'principle','Use a compact demand-control pass for portfolio allocation, preserving player-career gates and recorded access. Open the deep pursuit model before an external pitch.',
  'truth_contract',jsonb_build_object(
    'demand','Confirmed and predicted needs remain distinct. Predicted need is not treated as confirmed club instruction.',
    'candidate','Recorded candidates are existing player-match records; no new football fit is invented by this fast control.',
    'career','Every recorded candidate still passes through the human-owned career pursuit gate.',
    'access','Direct access uses the best recorded direct relationship. Warm-introduction logic is checked only when direct access is below the operating threshold.',
    'deep_review','Fast demand control does not calculate full pursuit readiness or transfer probability. A ready state means the prerequisites for deep human review are recorded.'
  )
) into v_result;
 return jsonb_build_object('available',jsonb_array_length(v_result->'items')>0,'item',v_result#>'{items,0}');
end;
$function$;
CREATE OR REPLACE FUNCTION public.platform_server_demand_control_fast(p_tenant_id uuid, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
with needs as (
  select n.*,o.name club_name,o.country,o.city,o.league_name
  from djm_os.club_needs n join djm_os.organisations o on o.id=n.organisation_id and o.tenant_id=n.tenant_id
  where n.tenant_id=p_tenant_id and n.status='active' and (n.expires_at is null or n.expires_at>=now())
  order by case n.need_type when 'confirmed' then 0 else 1 end,n.priority desc,n.expires_at nulls last,n.received_at desc
  limit greatest(1,least(coalesce(p_limit,100),250))
), candidate_rows as materialized (
  select pm.club_need_id,pm.id player_match_id,pm.player_id,pm.status match_status,
    pm.overall_score,pm.football_score,pm.commercial_score,pm.registration_score,pm.career_score,pm.access_score,
    pm.reasoning,pm.updated_at match_updated_at,
    coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') player_name,
    public.platform_server_career_pursuit_gate(p_tenant_id,pm.id) gate
  from djm_os.player_matches pm join needs n on n.id=pm.club_need_id
  join public.players p on p.id=pm.player_id and p.tenant_id=pm.tenant_id
  where pm.tenant_id=p_tenant_id and pm.status in ('suggested','reviewing','shortlisted','pitched','active')
), candidate_agg as (
  select c.club_need_id,
    count(*)::int recorded_candidates,
    count(*) filter(where c.gate->>'state' like 'open_%')::int career_open,
    count(*) filter(where c.gate->>'state' like 'review_%')::int human_review,
    count(*) filter(where not (c.gate->>'state' like 'open_%') and not (c.gate->>'state' like 'review_%'))::int held,
    coalesce(jsonb_agg(jsonb_build_object(
      'player_match_id',c.player_match_id,
      'player_id',c.player_id,
      'player_name',c.player_name,
      'match_status',c.match_status,
      'overall_score',c.overall_score,
      'football_score',c.football_score,
      'commercial_score',c.commercial_score,
      'registration_score',c.registration_score,
      'career_score',c.career_score,
      'access_score',c.access_score,
      'reasoning',coalesce(c.reasoning,'{}'::jsonb),
      'career_gate_state',c.gate->>'state',
      'career_gate_reason',c.gate->>'reason'
    ) order by
      case when c.gate->>'state' like 'open_%' then 0 when c.gate->>'state' like 'review_%' then 1 else 2 end,
      c.overall_score desc nulls last,
      c.football_score desc nulls last,
      case c.match_status when 'active' then 0 when 'pitched' then 1 when 'shortlisted' then 2 when 'reviewing' then 3 else 4 end,
      c.match_updated_at desc,
      c.player_name
    ),'[]'::jsonb) candidates
  from candidate_rows c group by c.club_need_id
), direct_access as (
  select distinct on (e.organisation_id) e.organisation_id,r.access_score,r.strength_score,r.trust_score,r.last_meaningful_at,p.full_name contact_name,e.role_title,r.team_member_id
  from djm_os.relationships r join djm_os.employments e on e.tenant_id=r.tenant_id and e.person_id=r.person_id and e.is_current=true
  join djm_os.people p on p.tenant_id=r.tenant_id and p.id=r.person_id
  where r.tenant_id=p_tenant_id
  order by e.organisation_id,r.access_score desc nulls last,r.strength_score desc nulls last,r.last_meaningful_at desc nulls last
), base as (
  select n.*,coalesce(c.recorded_candidates,0) recorded_candidates,coalesce(c.career_open,0) career_open,coalesce(c.human_review,0) human_review,coalesce(c.held,0) held,coalesce(c.candidates,'[]'::jsonb) candidates,
    coalesce(d.access_score,0)::int direct_score,coalesce(d.strength_score,0)::int direct_strength,d.contact_name,d.role_title,d.team_member_id,
    case when coalesce(d.access_score,0)<70 then public.platform_server_introduction_routes(p_tenant_id,n.organisation_id,1) else null end intro
  from needs n left join candidate_agg c on c.club_need_id=n.id left join direct_access d on d.organisation_id=n.organisation_id
), classified as (
  select b.*,
    coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0) intro_score,
    case when b.direct_score>=70 then 'direct_route'
         when coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0)>=70 and coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0)>=b.direct_score+10 then 'warm_introduction'
         when b.direct_score>0 then 'developing_direct_route'
         when coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0)>0 then 'developing_introduction'
         else 'no_recorded_route' end access_mode,
    case when b.recorded_candidates=0 then 'roster_gap'
         when b.career_open=0 and b.human_review>0 then 'career_or_human_review_required'
         when b.career_open=0 then 'career_blocked'
         when b.direct_score>=70 then 'ready_direct'
         when coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0)>=70 and coalesce((b.intro#>>'{best_route,introduction_score}')::integer,0)>=b.direct_score+10 then 'ready_via_introduction'
         else 'access_gap' end coverage_state
  from base b
), ranked as (
  select c.*,row_number() over(order by case c.need_type when 'confirmed' then 0 else 1 end,
    case c.coverage_state when 'ready_direct' then 1 when 'ready_via_introduction' then 2 when 'access_gap' then 3 when 'career_or_human_review_required' then 4 when 'career_blocked' then 5 when 'roster_gap' then 6 else 9 end,
    c.priority desc,c.expires_at nulls last,c.club_name,c.title) rn
  from classified c
), items as (
  select r.*,case r.coverage_state
    when 'roster_gap' then jsonb_build_object('action_type','scout_or_recruit_for_need','instruction','No recorded roster match exists for this active club need. Scout or recruit against the recorded profile rather than forcing an unsuitable player.','requires_human_input',true)
    when 'career_or_human_review_required' then jsonb_build_object('action_type','resolve_pursuit_gate','instruction','A recorded candidate exists, but career-strategy or human review must be resolved before external escalation.','requires_human_input',true)
    when 'career_blocked' then jsonb_build_object('action_type','resolve_player_strategy_control','instruction','Recorded candidates exist but none are open under the player career controls.','requires_human_input',true)
    when 'ready_direct' then jsonb_build_object('action_type','open_deep_pursuit_review','instruction','A career-open candidate and strong direct route are recorded. Open the full pursuit review before any external pitch.','requires_human_input',true)
    when 'ready_via_introduction' then jsonb_build_object('action_type','open_deep_pursuit_review','instruction','A career-open candidate exists and a warm introduction is the stronger route. Open the full pursuit review before using it.','requires_human_input',true)
    else jsonb_build_object('action_type','build_club_access','instruction','A career-open candidate exists, but access is not yet strong enough. Build or source the route before spending the player relationship.','requires_human_input',true) end next_action
  from ranked r
)
select jsonb_build_object(
  'available',true,'tenant_id',p_tenant_id,'generated_at',now(),
  'summary',jsonb_build_object(
    'active_needs',(select count(*) from items),
    'ready_for_deep_pursuit_review',(select count(*) from items where coverage_state in ('ready_direct','ready_via_introduction')),
    'roster_gaps',(select count(*) from items where coverage_state='roster_gap'),
    'access_gaps',(select count(*) from items where coverage_state='access_gap'),
    'career_or_human_review',(select count(*) from items where coverage_state in ('career_or_human_review_required','career_blocked'))
  ),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'command_rank',rn,'club_need_id',id,
    'club',jsonb_build_object('organisation_id',organisation_id,'name',club_name,'country',country,'city',city,'league_name',league_name),
    'need',jsonb_build_object('title',title,'position',position,'secondary_position',secondary_position,'preferred_foot',preferred_foot,'min_age',min_age,'max_age',max_age,'min_height_cm',min_height_cm,'transfer_type',transfer_type,'transfer_budget',transfer_budget,'salary_budget',salary_budget,'currency',currency,'salary_period',salary_period,'priority',priority,'need_type',need_type,'confidence',confidence,'prediction_probability',prediction_probability,'confirmed_at',confirmed_at,'expires_at',expires_at,'received_at',received_at),
    'coverage_state',coverage_state,
    'candidate_coverage',jsonb_build_object('recorded_candidates',recorded_candidates,'career_open',career_open,'human_review',human_review,'held',held,'candidates',candidates),
    'access',jsonb_build_object('mode',access_mode,'direct_score',direct_score,'direct_strength',direct_strength,'best_direct_contact',contact_name,'best_direct_role',role_title,'team_member_id',team_member_id,'introduction_score',intro_score,'best_introduction_route',intro->'best_route'),
    'next_action',next_action
  ) order by rn) from items),'[]'::jsonb),
  'principle','Use a compact demand-control pass for portfolio allocation, preserving player-career gates and recorded access. Open the deep pursuit model before an external pitch.',
  'truth_contract',jsonb_build_object(
    'demand','Confirmed and predicted needs remain distinct. Predicted need is not treated as confirmed club instruction.',
    'candidate','Recorded candidates are existing player-match records; no new football fit is invented by this fast control.',
    'career','Every recorded candidate still passes through the human-owned career pursuit gate.',
    'access','Direct access uses the best recorded direct relationship. Warm-introduction logic is checked only when direct access is below the operating threshold.',
    'deep_review','Fast demand control does not calculate full pursuit readiness or transfer probability. A ready state means the prerequisites for deep human review are recorded.'
  )
);
$function$;
CREATE OR REPLACE FUNCTION private.platform_server_assert_agency_operator(p_tenant_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_tenant_id is null or p_user_id is null then
    raise exception 'agency_operator_access_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from platform.tenant_memberships m
    join platform.tenants t
      on t.id = m.tenant_id
     and t.status = 'active'
    where m.tenant_id = p_tenant_id
      and m.user_id = p_user_id
      and m.status = 'active'
      and m.role in ('owner', 'admin', 'agent', 'operations')
  ) then
    raise exception 'agency_operator_access_required' using errcode = '42501';
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION private.platform_server_agency_ensure_club(p_tenant_id uuid, p_name text, p_country text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_country text := nullif(btrim(coalesce(p_country, '')), '');
  v_id uuid;
begin
  if p_tenant_id is null or v_name is null or length(v_name) < 2 then
    raise exception 'club_name_required';
  end if;

  select o.id
  into v_id
  from djm_os.organisations o
  where o.tenant_id = p_tenant_id
    and o.organisation_type = 'club'
    and lower(btrim(o.name)) = lower(v_name)
  order by o.created_at
  limit 1;

  if v_id is null then
    begin
      insert into djm_os.organisations (
        tenant_id,
        name,
        organisation_type,
        country,
        canonical_key
      )
      values (
        p_tenant_id,
        v_name,
        'club',
        v_country,
        null
      )
      returning id into v_id;
    exception
      when unique_violation then
        select o.id
        into v_id
        from djm_os.organisations o
        where o.tenant_id = p_tenant_id
          and o.organisation_type = 'club'
          and lower(btrim(o.name)) = lower(v_name)
        order by o.created_at
        limit 1;
    end;
  elsif v_country is not null then
    update djm_os.organisations
    set country = coalesce(country, v_country),
        updated_at = now()
    where id = v_id
      and tenant_id = p_tenant_id;
  end if;

  if v_id is null then
    raise exception 'club_create_failed';
  end if;

  return v_id;
end;
$function$;
