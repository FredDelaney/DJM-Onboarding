create or replace function public.platform_server_seed_demo_story(p_tenant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_meta jsonb;
  v_westhaven uuid;
  v_nordstadt uuid;
  v_riverton uuid;
  v_elias uuid;
  v_marcus uuid;
  v_leo uuid;
  v_andre uuid;
  v_need_westhaven uuid;
  v_need_nordstadt uuid;
  v_need_riverton uuid;
  v_counts jsonb;
begin
  select t.metadata into v_meta from platform.tenants t where t.id=p_tenant_id;
  if v_meta is null then raise exception 'tenant_not_found'; end if;
  if not coalesce((v_meta->>'synthetic_test_tenant')::boolean,false) then raise exception 'demo_seed_requires_synthetic_tenant'; end if;

  select o.id into v_westhaven from djm_os.organisations o where o.tenant_id=p_tenant_id and o.canonical_key='demo:westhaven-fc' limit 1;
  if v_westhaven is null then
    insert into djm_os.organisations(name,organisation_type,country,city,canonical_key,league_name,tenant_id)
    values('Westhaven FC','club','Netherlands','Rotterdam','demo:westhaven-fc','Premier Division',p_tenant_id)
    returning id into v_westhaven;
  else
    update djm_os.organisations set name='Westhaven FC',country='Netherlands',city='Rotterdam',league_name='Premier Division',updated_at=now() where id=v_westhaven;
  end if;

  select o.id into v_nordstadt from djm_os.organisations o where o.tenant_id=p_tenant_id and o.canonical_key='demo:nordstadt-04' limit 1;
  if v_nordstadt is null then
    insert into djm_os.organisations(name,organisation_type,country,city,canonical_key,league_name,tenant_id)
    values('Nordstadt 04','club','Germany','Hamburg','demo:nordstadt-04','National League',p_tenant_id)
    returning id into v_nordstadt;
  else
    update djm_os.organisations set name='Nordstadt 04',country='Germany',city='Hamburg',league_name='National League',updated_at=now() where id=v_nordstadt;
  end if;

  select o.id into v_riverton from djm_os.organisations o where o.tenant_id=p_tenant_id and o.canonical_key='demo:riverton-united' limit 1;
  if v_riverton is null then
    insert into djm_os.organisations(name,organisation_type,country,city,canonical_key,league_name,tenant_id)
    values('Riverton United','club','Belgium','Antwerp','demo:riverton-united','First Division',p_tenant_id)
    returning id into v_riverton;
  else
    update djm_os.organisations set name='Riverton United',country='Belgium',city='Antwerp',league_name='First Division',updated_at=now() where id=v_riverton;
  end if;

  select p.id into v_elias from public.players p where p.tenant_id=p_tenant_id and p.football_provider_ids->>'demo_key'='elias_novak' limit 1;
  if v_elias is null then
    insert into public.players(first_name,last_name,date_of_birth,nationalities,height_cm,preferred_foot,primary_position,secondary_positions,current_club,current_league,current_country,contract_status,contract_expiry,football_status,onboarding_status,verification_status,agency_priority,next_action,next_action_due,football_provider_ids,tenant_id)
    values('Elias','Novak',current_date-interval '22 years',array['Slovenia'],178,'Right','RW',array['LW'],'Adriatic 1919','Premier League','Slovenia','under_contract',current_date+290,'active','complete','verified','high','Send updated clips and availability to Westhaven FC',current_date-1,jsonb_build_object('demo_key','elias_novak','synthetic',true),p_tenant_id)
    returning id into v_elias;
  else
    update public.players set current_club='Adriatic 1919',current_league='Premier League',current_country='Slovenia',contract_status='under_contract',contract_expiry=current_date+290,agency_priority='high',next_action='Send updated clips and availability to Westhaven FC',next_action_due=current_date-1,updated_at=now() where id=v_elias;
  end if;

  select p.id into v_marcus from public.players p where p.tenant_id=p_tenant_id and p.football_provider_ids->>'demo_key'='marcus_bell' limit 1;
  if v_marcus is null then
    insert into public.players(first_name,last_name,date_of_birth,nationalities,height_cm,preferred_foot,primary_position,secondary_positions,current_club,current_league,current_country,contract_status,contract_expiry,football_status,onboarding_status,verification_status,agency_priority,next_action,next_action_due,football_provider_ids,tenant_id)
    values('Marcus','Bell',current_date-interval '25 years',array['England'],188,'Right','CB',array['RB'],'Harbour Athletic','Championship','England','under_contract',current_date+76,'active','complete','verified','high','Agree contract strategy with player',current_date+1,jsonb_build_object('demo_key','marcus_bell','synthetic',true),p_tenant_id)
    returning id into v_marcus;
  else
    update public.players set current_club='Harbour Athletic',current_league='Championship',current_country='England',contract_status='under_contract',contract_expiry=current_date+76,agency_priority='high',next_action='Agree contract strategy with player',next_action_due=current_date+1,updated_at=now() where id=v_marcus;
  end if;

  select p.id into v_leo from public.players p where p.tenant_id=p_tenant_id and p.football_provider_ids->>'demo_key'='leo_martin' limit 1;
  if v_leo is null then
    insert into public.players(first_name,last_name,date_of_birth,nationalities,height_cm,preferred_foot,primary_position,secondary_positions,current_club,current_league,current_country,contract_status,contract_expiry,football_status,onboarding_status,verification_status,agency_priority,next_action,next_action_due,football_provider_ids,tenant_id)
    values('Leo','Martin',current_date-interval '20 years',array['France'],181,'Left','CM',array['AM','DM'],'Riviera 1924','National 1','France','under_contract',current_date+480,'active','complete','verified','normal','Follow up after technical director review',current_date,jsonb_build_object('demo_key','leo_martin','synthetic',true),p_tenant_id)
    returning id into v_leo;
  else
    update public.players set current_club='Riviera 1924',current_league='National 1',current_country='France',contract_status='under_contract',contract_expiry=current_date+480,next_action='Follow up after technical director review',next_action_due=current_date,updated_at=now() where id=v_leo;
  end if;

  select p.id into v_andre from public.players p where p.tenant_id=p_tenant_id and p.football_provider_ids->>'demo_key'='andre_costa' limit 1;
  if v_andre is null then
    insert into public.players(first_name,last_name,date_of_birth,nationalities,height_cm,preferred_foot,primary_position,secondary_positions,current_country,contract_status,football_status,onboarding_status,verification_status,agency_priority,next_action,next_action_due,football_provider_ids,tenant_id)
    values('Andre','Costa',current_date-interval '23 years',array['Portugal'],185,'Right','ST',array['LW'],'Portugal','free_agent','free_agent','complete','verified','urgent','Refresh free-agent pack and availability',current_date+2,jsonb_build_object('demo_key','andre_costa','synthetic',true),p_tenant_id)
    returning id into v_andre;
  else
    update public.players set current_club=null,current_league=null,current_country='Portugal',contract_status='free_agent',football_status='free_agent',agency_priority='urgent',next_action='Refresh free-agent pack and availability',next_action_due=current_date+2,updated_at=now() where id=v_andre;
  end if;

  select n.id into v_need_westhaven from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.organisation_id=v_westhaven and n.title='Explosive right winger U23' limit 1;
  if v_need_westhaven is null then
    insert into djm_os.club_needs(organisation_id,title,position,max_age,transfer_type,salary_budget,currency,profile_notes,status,confidence,expires_at,priority,need_type,raw_request,source_context,tenant_id)
    values(v_westhaven,'Explosive right winger U23','RW',23,'permanent',24000,'EUR','Direct winger, attacks space, can play both sides.','active',0.96,now()+interval '5 days',5,'confirmed','Need a fast U23 right winger, ready to contribute immediately.','synthetic_demo',p_tenant_id)
    returning id into v_need_westhaven;
  else
    update djm_os.club_needs set status='active',expires_at=now()+interval '5 days',priority=5,confidence=0.96,updated_at=now() where id=v_need_westhaven;
  end if;

  select n.id into v_need_nordstadt from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.organisation_id=v_nordstadt and n.title='Left-footed centre-back' limit 1;
  if v_need_nordstadt is null then
    insert into djm_os.club_needs(organisation_id,title,position,preferred_foot,min_height_cm,transfer_type,salary_budget,currency,profile_notes,status,confidence,expires_at,priority,need_type,raw_request,source_context,tenant_id)
    values(v_nordstadt,'Left-footed centre-back','CB','Left',184,'loan_or_permanent',30000,'EUR','Ball-playing left centre-back, physically ready.','active',0.93,now()+interval '9 days',4,'confirmed','Need a left-footed centre-back, ideally 184cm+, loan or permanent.','synthetic_demo',p_tenant_id)
    returning id into v_need_nordstadt;
  else
    update djm_os.club_needs set status='active',expires_at=now()+interval '9 days',priority=4,confidence=0.93,updated_at=now() where id=v_need_nordstadt;
  end if;

  select n.id into v_need_riverton from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.organisation_id=v_riverton and n.title='Mobile striker' limit 1;
  if v_need_riverton is null then
    insert into djm_os.club_needs(organisation_id,title,position,max_age,transfer_type,salary_budget,currency,profile_notes,status,confidence,expires_at,priority,need_type,prediction_probability,prediction_basis,raw_request,source_context,tenant_id)
    values(v_riverton,'Mobile striker','ST',25,'free_or_loan',18000,'EUR','Mobile 9, presses, attacks channels.','active',0.72,now()+interval '14 days',3,'predicted',72,jsonb_build_object('basis','recent recruitment pattern and contact context','synthetic',true),'Likely to move for a mobile striker if current target falls through.','synthetic_demo',p_tenant_id)
    returning id into v_need_riverton;
  else
    update djm_os.club_needs set status='active',expires_at=now()+interval '14 days',priority=3,confidence=0.72,prediction_probability=72,updated_at=now() where id=v_need_riverton;
  end if;

  insert into djm_os.player_matches(club_need_id,player_id,overall_score,football_score,commercial_score,registration_score,career_score,access_score,reasoning,status,tenant_id)
  values(v_need_westhaven,v_elias,91,93,86,96,90,88,jsonb_build_object('summary','Strong role fit and immediate registration feasibility.','evidence',jsonb_build_array('Natural RW with LW flexibility','Age fits U23 requirement','Salary expectation within range'),'synthetic',true),'suggested',p_tenant_id)
  on conflict (club_need_id,player_id) do update set overall_score=excluded.overall_score,football_score=excluded.football_score,commercial_score=excluded.commercial_score,registration_score=excluded.registration_score,career_score=excluded.career_score,access_score=excluded.access_score,reasoning=excluded.reasoning,status='suggested',updated_at=now(),tenant_id=p_tenant_id;

  insert into djm_os.player_matches(club_need_id,player_id,overall_score,football_score,commercial_score,registration_score,career_score,access_score,reasoning,status,tenant_id)
  values(v_need_riverton,v_andre,79,84,91,88,74,56,jsonb_build_object('summary','Good football and commercial fit, but relationship access is weaker.','evidence',jsonb_build_array('Free agent','Natural striker','Salary expectation below indicated ceiling'),'synthetic',true),'suggested',p_tenant_id)
  on conflict (club_need_id,player_id) do update set overall_score=excluded.overall_score,football_score=excluded.football_score,commercial_score=excluded.commercial_score,registration_score=excluded.registration_score,career_score=excluded.career_score,access_score=excluded.access_score,reasoning=excluded.reasoning,status='suggested',updated_at=now(),tenant_id=p_tenant_id;

  if not exists(select 1 from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.title='Elias Novak to Westhaven FC') then
    insert into djm_os.deal_rooms(title,organisation_id,player_id,club_need_id,stage,status,expected_commission,currency,probability,primary_blocker,next_decision,next_action_at,last_meaningful_at,source,next_action_text,manual_probability,probability_source,probability_basis,pitch_status,transfer_fee,player_salary,salary_period,financial_notes,tenant_id)
    values('Elias Novak to Westhaven FC',v_westhaven,v_elias,v_need_westhaven,'interest','active',45000,'EUR',62,'Club wants updated medical and final availability','Confirm availability and send refreshed pack',now()-interval '12 hours',now()-interval '4 days','synthetic_demo','Send updated pack and confirm medical status',62,'manual',jsonb_build_object('basis','Demo scenario probability set manually','synthetic',true),'shared',350000,22000,'monthly','Illustrative synthetic deal values only.',p_tenant_id);
  else
    update djm_os.deal_rooms set organisation_id=v_westhaven,player_id=v_elias,club_need_id=v_need_westhaven,stage='interest',status='active',expected_commission=45000,currency='EUR',probability=62,primary_blocker='Club wants updated medical and final availability',next_decision='Confirm availability and send refreshed pack',next_action_at=now()-interval '12 hours',last_meaningful_at=now()-interval '4 days',next_action_text='Send updated pack and confirm medical status',manual_probability=62,probability_source='manual',probability_basis=jsonb_build_object('basis','Demo scenario probability set manually','synthetic',true),pitch_status='shared',transfer_fee=350000,player_salary=22000,salary_period='monthly',financial_notes='Illustrative synthetic deal values only.',updated_at=now() where tenant_id=p_tenant_id and title='Elias Novak to Westhaven FC';
  end if;

  if not exists(select 1 from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.title='Leo Martin exploratory move') then
    insert into djm_os.deal_rooms(title,organisation_id,player_id,stage,status,expected_commission,currency,probability,primary_blocker,next_decision,next_action_at,last_meaningful_at,source,next_action_text,manual_probability,probability_source,probability_basis,pitch_status,tenant_id)
    values('Leo Martin exploratory move',v_riverton,v_leo,'contacted','active',18000,'EUR',35,'Waiting on sporting director feedback','Decide whether to push or park',null,now()-interval '9 days','synthetic_demo','Set a concrete follow-up or park the opportunity',35,'manual',jsonb_build_object('basis','Demo scenario probability set manually','synthetic',true),'shared',p_tenant_id);
  else
    update djm_os.deal_rooms set organisation_id=v_riverton,player_id=v_leo,club_need_id=null,stage='contacted',status='active',expected_commission=18000,currency='EUR',probability=35,primary_blocker='Waiting on sporting director feedback',next_decision='Decide whether to push or park',next_action_at=null,last_meaningful_at=now()-interval '9 days',next_action_text='Set a concrete follow-up or park the opportunity',manual_probability=35,probability_source='manual',probability_basis=jsonb_build_object('basis','Demo scenario probability set manually','synthetic',true),pitch_status='shared',updated_at=now() where tenant_id=p_tenant_id and title='Leo Martin exploratory move';
  end if;

  delete from djm_os.tasks where tenant_id=p_tenant_id and source like 'synthetic_demo:%';
  insert into djm_os.tasks(title,task_type,player_id,club_need_id,due_at,status,priority,source,tenant_id) values
    ('Send Elias Novak updated pack to Westhaven FC','deal',v_elias,v_need_westhaven,now()-interval '12 hours','open',5,'synthetic_demo:elias_westhaven_pack',p_tenant_id),
    ('Agree Marcus Bell contract strategy','player_service',v_marcus,null,now()+interval '1 day','open',4,'synthetic_demo:marcus_contract',p_tenant_id),
    ('Refresh Andre Costa free-agent pack','player_service',v_andre,v_need_riverton,now()+interval '2 days','open',3,'synthetic_demo:andre_pack',p_tenant_id),
    ('Check Nordstadt left-CB network options','market',null,v_need_nordstadt,now()+interval '6 hours','open',4,'synthetic_demo:nordstadt_search',p_tenant_id);

  delete from djm_os.interactions where tenant_id=p_tenant_id and source_type='synthetic_demo';
  insert into djm_os.interactions(occurred_at,channel,direction,organisation_id,raw_text,summary,confidence,source_type,tenant_id) values
    (now()-interval '4 days','voice_debrief','outbound',v_westhaven,'Synthetic demo interaction: Westhaven liked Elias but wants final availability and current medical status.','Westhaven interest is live; updated pack and availability are the blocker.',0.98,'synthetic_demo',p_tenant_id),
    (now()-interval '2 days','voice_debrief','inbound',v_nordstadt,'Synthetic demo interaction: Nordstadt needs a left-footed centre-back quickly.','Confirmed left-CB need with no suitable roster fit yet.',0.97,'synthetic_demo',p_tenant_id),
    (now()-interval '1 day','voice_debrief','inbound',v_riverton,'Synthetic demo interaction: Riverton may need a mobile striker if their first option falls through.','Predicted striker demand; Andre is a plausible free-agent option.',0.82,'synthetic_demo',p_tenant_id);

  update platform.tenant_customer_lifecycle
  set stage='demo',notes='Evergreen synthetic sales demonstration tenant. All football people, clubs, opportunities and commercial values in this workspace are fictional.',metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('demo_story_version','v2','synthetic_data',true),updated_at=now()
  where tenant_id=p_tenant_id;

  select jsonb_build_object(
    'players',(select count(*) from public.players p where p.tenant_id=p_tenant_id and p.football_provider_ids->>'synthetic'='true'),
    'organisations',(select count(*) from djm_os.organisations o where o.tenant_id=p_tenant_id and o.canonical_key like 'demo:%'),
    'club_needs',(select count(*) from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.source_context='synthetic_demo'),
    'player_matches',(select count(*) from djm_os.player_matches m where m.tenant_id=p_tenant_id and m.reasoning->>'synthetic'='true'),
    'open_tasks',(select count(*) from djm_os.tasks t where t.tenant_id=p_tenant_id and t.source like 'synthetic_demo:%' and t.status='open'),
    'interactions',(select count(*) from djm_os.interactions i where i.tenant_id=p_tenant_id and i.source_type='synthetic_demo'),
    'active_deals',(select count(*) from djm_os.deal_rooms d where d.tenant_id=p_tenant_id and d.source='synthetic_demo' and d.status='active')
  ) into v_counts;

  return jsonb_build_object('tenant_id',p_tenant_id,'synthetic',true,'story_version','v2','counts',v_counts,'home',public.platform_server_agency_home(p_tenant_id,5));
end;
$function$;

revoke all on function public.platform_server_seed_demo_story(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_seed_demo_story(uuid) to service_role;

select public.platform_server_seed_demo_story(t.id)
from platform.tenants t
where coalesce((t.metadata->>'synthetic_test_tenant')::boolean,false);;
