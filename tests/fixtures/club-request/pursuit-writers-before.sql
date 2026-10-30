-- Exact installed staging source captured before the salary constraint migration.
CREATE OR REPLACE FUNCTION djm_os.refresh_need_matches(p_need_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  n djm_os.club_needs%rowtype;
  v_country text;
begin
  select * into n from djm_os.club_needs where id = p_need_id;
  if not found then return; end if;
  select country into v_country from djm_os.organisations where id = n.organisation_id;

  if n.status not in ('active', 'open', 'confirmed') then
    delete from djm_os.player_matches where tenant_id=n.tenant_id and club_need_id = p_need_id and status = 'suggested';
    return;
  end if;

  delete from djm_os.player_matches m using public.players p
  where m.tenant_id=n.tenant_id and m.club_need_id = p_need_id and m.player_id = p.id and m.status = 'suggested'
    and not (
      djm_os.position_matches_player(n.position, p.primary_position, p.secondary_positions)
      and (n.preferred_foot is null or p.preferred_foot is null or lower(p.preferred_foot) = lower(n.preferred_foot))
      and (n.min_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) >= n.min_age)
      and (n.max_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) <= n.max_age)
      and (n.min_height_cm is null or p.height_cm is null or p.height_cm >= n.min_height_cm)
    );

  insert into djm_os.player_matches(
    tenant_id, club_need_id, player_id, overall_score, football_score, commercial_score,
    registration_score, career_score, access_score, reasoning, status
  )
  select
    n.tenant_id, n.id, p.id,
    round((s.football_score * .45 + s.commercial_score * .10 + s.registration_score * .15 + s.career_score * .20 + s.availability_score * .10)::numeric, 1),
    s.football_score, s.commercial_score, s.registration_score, s.career_score, null::numeric,
    jsonb_build_object(
      'source', 'djm_fit_prediction_v3',
      'model', 'ReDream fit model v3',
      'coverage', s.coverage,
      'components', jsonb_build_object(
        'football_fit', s.football_score,
        'commercial_fit', s.commercial_score,
        'registration_fit', s.registration_score,
        'career_fit', s.career_score,
        'availability', s.availability_score
      ),
      'strengths', to_jsonb(array_remove(array[
        'Primary or secondary position fits the requested role',
        case when n.preferred_foot is not null and p.preferred_foot is not null then 'Preferred foot matches' end,
        case when n.min_height_cm is not null and p.height_cm is not null then 'Minimum height is met' end,
        case when n.min_age is not null or n.max_age is not null then 'Recorded age is within range' end
      ], null)),
      'concerns', '[]'::jsonb,
      'hard_blockers', '[]'::jsonb,
      'missing_information', to_jsonb(array_remove(array[
        case when p.date_of_birth is null and (n.min_age is not null or n.max_age is not null) then 'Player date of birth is not recorded' end,
        case when p.preferred_foot is null and n.preferred_foot is not null then 'Player preferred foot is not recorded' end,
        case when p.height_cm is null and n.min_height_cm is not null then 'Player height is not recorded' end,
        case when nullif(trim(coalesce(f.salary_expectation, '')), '') is null and n.salary_budget is not null then 'Player salary expectation is not recorded' end,
        case when nullif(trim(coalesce(n.passport_requirements, n.registration_notes, '')), '') is not null and cardinality(coalesce(f.passports_held, '{}')) = 0 then 'Passport evidence is not recorded' end
      ], null)),
      'sample', jsonb_build_object('career_minutes', coalesce(c.minutes, 0), 'career_appearances', coalesce(c.appearances, 0)),
      'calculated_at', now()
    ),
    'suggested'
  from public.players p
  left join djm_os.player_market_facts f on f.player_id = p.id
  left join lateral (
    select coalesce(sum(ce.minutes), 0)::numeric as minutes, coalesce(sum(ce.appearances), 0)::numeric as appearances
    from public.career_entries ce where ce.player_id = p.id
  ) c on true
  cross join lateral (
    select
      least(100, 70
        + case when n.preferred_foot is null then 6 when p.preferred_foot is null then 3 else 10 end
        + case when n.min_age is null and n.max_age is null then 6 when p.date_of_birth is null then 3 else 8 end
        + case when n.min_height_cm is null then 5 when p.height_cm is null then 2 else 7 end)::numeric as football_score,
      case when n.salary_budget is null then 72 when nullif(trim(coalesce(f.salary_expectation, '')), '') is null then 55 else 68 end::numeric as commercial_score,
      djm_os.registration_fit_score(coalesce(n.passport_requirements, n.registration_notes), f.work_rights, f.passports_held, v_country)::numeric as registration_score,
      least(100, 45 + least(35, coalesce(c.minutes, 0) / 180) + least(20, coalesce(c.appearances, 0) / 5))::numeric as career_score,
      case when lower(coalesce(p.football_status, '')) in ('free_agent', 'free agent', 'available') then 95 when lower(coalesce(p.football_status, '')) = 'active' then 82 when lower(coalesce(p.football_status, '')) = 'injured' then 30 else 60 end::numeric as availability_score,
      round((
        1
        + case when n.preferred_foot is null or p.preferred_foot is not null then 1 else 0 end
        + case when (n.min_age is null and n.max_age is null) or p.date_of_birth is not null then 1 else 0 end
        + case when n.min_height_cm is null or p.height_cm is not null then 1 else 0 end
        + case when n.salary_budget is null or nullif(trim(coalesce(f.salary_expectation, '')), '') is not null then 1 else 0 end
        + case when nullif(trim(coalesce(n.passport_requirements, n.registration_notes, '')), '') is null or cardinality(coalesce(f.passports_held, '{}')) > 0 then 1 else 0 end
      )::numeric / 6 * 100)::int as coverage
  ) s
  where p.tenant_id=n.tenant_id and djm_os.position_matches_player(n.position, p.primary_position, p.secondary_positions)
    and (n.preferred_foot is null or p.preferred_foot is null or lower(p.preferred_foot) = lower(n.preferred_foot))
    and (n.min_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) >= n.min_age)
    and (n.max_age is null or p.date_of_birth is null or date_part('year', age(current_date, p.date_of_birth)) <= n.max_age)
    and (n.min_height_cm is null or p.height_cm is null or p.height_cm >= n.min_height_cm)
  on conflict (club_need_id, player_id) do update set
    overall_score = excluded.overall_score,
    football_score = excluded.football_score,
    commercial_score = excluded.commercial_score,
    registration_score = excluded.registration_score,
    career_score = excluded.career_score,
    reasoning = excluded.reasoning,
    updated_at = now()
  where djm_os.player_matches.status = 'suggested';
end $function$;

CREATE OR REPLACE FUNCTION public.platform_server_create_pitch_draft(p_tenant_id uuid, p_player_match_id uuid, p_actor_user_id uuid, p_input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

CREATE OR REPLACE FUNCTION public.platform_server_publish_pitch_link(p_tenant_id uuid, p_share_id uuid, p_actor_user_id uuid, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

CREATE OR REPLACE FUNCTION public.platform_server_convert_pursuit_to_deal(p_tenant_id uuid, p_player_match_id uuid, p_actor_user_id uuid, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_match djm_os.player_matches%rowtype;
  v_need djm_os.club_needs%rowtype;
  v_gate jsonb;
  v_existing djm_os.deal_rooms%rowtype;
  v_deal djm_os.deal_rooms%rowtype;
  v_stage text:=nullif(trim(p_input->>'stage'),'');
  v_probability int;
  v_owner uuid:=coalesce(nullif(trim(p_input->>'owner_user_id'),'')::uuid,p_actor_user_id);
  v_title text:=nullif(trim(p_input->>'title'),'');
  v_expected numeric;
  v_currency text:=upper(coalesce(nullif(trim(p_input->>'currency'),''),'EUR'));
  v_blocker text:=nullif(trim(p_input->>'primary_blocker'),'');
  v_decision text:=nullif(trim(p_input->>'next_decision'),'');
  v_next_text text:=nullif(trim(p_input->>'next_action_text'),'');
  v_next_at timestamptz;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
  where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','agent','operations') limit 1;
  if v_role is null then raise exception 'agency_operator_access_required'; end if;
  if not exists(select 1 from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=v_owner and m.status='active') then raise exception 'deal_owner_not_active_tenant_member'; end if;

  select * into v_match from djm_os.player_matches pm where pm.id=p_player_match_id and pm.tenant_id=p_tenant_id;
  if not found then raise exception 'player_match_not_found_for_tenant'; end if;
  select * into v_need from djm_os.club_needs n where n.id=v_match.club_need_id and n.tenant_id=p_tenant_id;
  if not found then raise exception 'club_need_not_found_for_tenant'; end if;
  v_gate:=public.platform_server_career_pursuit_gate(p_tenant_id,p_player_match_id);
  if coalesce(v_gate->>'state','') not in ('open_aligned','open_approved_exception') then raise exception 'career_control_gate_not_open'; end if;

  select * into v_existing from djm_os.deal_rooms d
  where d.tenant_id=p_tenant_id and d.player_id=v_match.player_id and d.organisation_id=v_need.organisation_id and d.status in ('active','paused')
  order by d.created_at desc limit 1;
  if found then return jsonb_build_object('created',false,'existing',true,'deal_room_id',v_existing.id,'deal',to_jsonb(v_existing),'truth_contract',jsonb_build_object('duplicates','An existing active/paused player-club deal was reused rather than duplicated.')); end if;

  if v_stage not in ('qualifying','contacted','interest','negotiating','offer') then raise exception 'human_stage_required_for_new_deal'; end if;
  if nullif(trim(p_input->>'probability'),'') is null then raise exception 'human_probability_required_for_new_deal'; end if;
  v_probability:=(p_input->>'probability')::int;
  if v_probability<0 or v_probability>100 then raise exception 'probability_must_be_0_to_100'; end if;
  if nullif(trim(p_input->>'expected_commission'),'') is not null then
    v_expected:=(p_input->>'expected_commission')::numeric;
    if v_expected<0 then raise exception 'expected_commission_cannot_be_negative'; end if;
  end if;
  if nullif(trim(p_input->>'next_action_at'),'') is not null then v_next_at:=(p_input->>'next_action_at')::timestamptz; end if;
  if v_title is null then v_title:=coalesce(nullif(trim(v_need.title),''),'Player pursuit')||' - '||coalesce((select o.name from djm_os.organisations o where o.id=v_need.organisation_id),'Club'); end if;

  insert into djm_os.deal_rooms(
    title,organisation_id,player_id,club_need_id,owner_user_id,stage,status,expected_commission,currency,probability,manual_probability,model_probability,probability_source,probability_basis,primary_blocker,next_decision,next_action_at,next_action_text,last_meaningful_at,source,tenant_id
  ) values(
    v_title,v_need.organisation_id,v_match.player_id,v_match.club_need_id,v_owner,v_stage,'active',v_expected,v_currency,v_probability,v_probability,null,'manual',jsonb_build_object('source','human_pursuit_conversion','player_match_id',p_player_match_id,'recorded_by',p_actor_user_id),v_blocker,v_decision,v_next_at,v_next_text,now(),'pursuit_conversion',p_tenant_id
  ) returning * into v_deal;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','deal.created_from_pursuit','deal_room',v_deal.id::text,to_jsonb(v_deal),jsonb_build_object('player_match_id',p_player_match_id,'club_need_id',v_match.club_need_id));

  return jsonb_build_object(
    'created',true,'existing',false,'deal_room_id',v_deal.id,'deal',to_jsonb(v_deal),
    'next_controls',jsonb_build_array(
      jsonb_build_object('api_action','deal_origin_save','instruction','Confirm how this deal actually originated. DJM does not infer origin from the pursuit-conversion workflow.'),
      jsonb_build_object('api_action','deal_war_room','instruction','Use the Deal War Room for execution control after creation.')
    ),
    'truth_contract',jsonb_build_object(
      'probability','The recorded probability is human-supplied. Pursuit readiness is not converted into deal probability.',
      'origin','Creating a deal from a pursuit does not establish the historical origin of the deal.',
      'career','Conversion requires an open human-owned career gate.',
      'external','Creating a Deal Room is internal tracking only and does not contact the club or player.'
    )
  );
end;
$function$;

