create or replace function djm_os.refresh_recruitment_followups()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count int := 0;
  v_changed int := 0;
begin
  update djm_os.tasks t
  set status='cancelled', completed_at=coalesce(t.completed_at,now()), updated_at=now()
  from djm_os.scouting_prospects sp
  where t.source=('recruitment:'||sp.id::text)
    and t.status not in ('completed','cancelled')
    and sp.recruitment_stage in ('signed','declined','lost','paused');
  get diagnostics v_changed = row_count;
  v_count := v_count + v_changed;

  update djm_os.tasks t
  set title='Follow up recruitment target: '||sp.full_name,
      task_type='recruitment_followup',
      owner_user_id=coalesce(sp.owner_user_id,t.owner_user_id,(select tm.user_id from djm_os.team_members tm where tm.is_active order by tm.created_at limit 1)),
      due_at=sp.next_action_at,
      priority=least(5,greatest(1,coalesce(sp.recruitment_priority,3))),
      updated_at=now()
  from djm_os.scouting_prospects sp
  where t.source=('recruitment:'||sp.id::text)
    and t.status not in ('completed','cancelled')
    and sp.linked_player_id is null
    and sp.recruitment_stage not in ('signed','declined','lost','paused')
    and sp.next_action_at is not null;
  get diagnostics v_changed = row_count;
  v_count := v_count + v_changed;

  insert into djm_os.tasks(title,task_type,owner_user_id,due_at,status,priority,source)
  select 'Follow up recruitment target: '||sp.full_name,
         'recruitment_followup',
         coalesce(sp.owner_user_id,(select tm.user_id from djm_os.team_members tm where tm.is_active order by tm.created_at limit 1)),
         sp.next_action_at,'open',least(5,greatest(1,coalesce(sp.recruitment_priority,3))),
         'recruitment:'||sp.id::text
  from djm_os.scouting_prospects sp
  where sp.linked_player_id is null
    and sp.recruitment_stage not in ('signed','declined','lost','paused')
    and sp.next_action_at is not null
    and sp.next_action_at <= now()+interval '3 days'
    and not exists(select 1 from djm_os.tasks t where t.source=('recruitment:'||sp.id::text) and t.status not in ('completed','cancelled'));
  get diagnostics v_changed = row_count;
  v_count := v_count + v_changed;

  insert into djm_os.tasks(title,task_type,owner_user_id,due_at,status,priority,source)
  select 'Set next step: '||sp.full_name,
         'recruitment_next_step',
         coalesce(sp.owner_user_id,(select tm.user_id from djm_os.team_members tm where tm.is_active order by tm.created_at limit 1)),
         now(),'open',least(5,greatest(1,coalesce(sp.recruitment_priority,3))),
         'recruitment:'||sp.id::text
  from djm_os.scouting_prospects sp
  where sp.linked_player_id is null
    and sp.recruitment_stage not in ('signed','declined','lost','paused')
    and sp.first_contact_at is not null
    and sp.next_action_at is null
    and not exists(select 1 from djm_os.tasks t where t.source=('recruitment:'||sp.id::text) and t.status not in ('completed','cancelled'));
  get diagnostics v_changed = row_count;
  v_count := v_count + v_changed;
  return v_count;
end
$function$;

create or replace function public.djm_recruitment_set_next_action(p_prospect_id uuid,p_next_action_at timestamptz,p_note text default null)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare v_name text; v_owner uuid; v_priority smallint;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  if p_next_action_at is null then raise exception 'Next action date is required'; end if;
  select full_name,coalesce(owner_user_id,(select auth.uid())),recruitment_priority into v_name,v_owner,v_priority
  from djm_os.scouting_prospects
  where id=p_prospect_id and linked_player_id is null and recruitment_stage not in ('signed','declined','lost','paused');
  if v_name is null then raise exception 'Active recruitment target not found'; end if;
  update djm_os.scouting_prospects
  set next_action_at=p_next_action_at,
      owner_user_id=coalesce(owner_user_id,(select auth.uid())),
      recruitment_notes=case when p_note is null or trim(p_note)='' then recruitment_notes else concat_ws(E'\n',nullif(recruitment_notes,''),trim(p_note)) end,
      updated_at=now()
  where id=p_prospect_id;
  delete from djm_os.tasks where source=('recruitment:'||p_prospect_id::text) and status not in ('completed','cancelled');
  insert into djm_os.tasks(title,task_type,owner_user_id,due_at,status,priority,source)
  values('Follow up recruitment target: '||v_name,'recruitment_followup',v_owner,p_next_action_at,'open',least(5,greatest(1,coalesce(v_priority,3))),'recruitment:'||p_prospect_id::text);
  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at)
  values('RECRUITMENT_NEXT_ACTION_SET',(select auth.uid()),jsonb_build_object('prospect_id',p_prospect_id,'next_action_at',p_next_action_at,'note',nullif(trim(coalesce(p_note,'')),'')),'recruitment',1,now());
  return jsonb_build_object('prospect_id',p_prospect_id,'next_action_at',p_next_action_at);
end
$function$;
grant execute on function public.djm_recruitment_set_next_action(uuid,timestamptz,text) to authenticated;

create or replace function public.djm_recruitment_log_interaction(p_prospect_id uuid,p_channel text,p_summary text,p_direction text default null,p_occurred_at timestamptz default now(),p_next_action_at timestamptz default null)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare v_id uuid; v_stage text; v_name text; v_owner uuid; v_priority smallint;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  if p_channel not in ('whatsapp','instagram','linkedin','email','phone','meeting','other') then raise exception 'Unsupported channel'; end if;
  if p_direction is not null and p_direction not in ('inbound','outbound','mutual') then raise exception 'Unsupported direction'; end if;
  if length(trim(coalesce(p_summary,'')))<2 then raise exception 'Summary is required'; end if;
  select recruitment_stage,full_name,coalesce(owner_user_id,(select auth.uid())),recruitment_priority into v_stage,v_name,v_owner,v_priority
  from djm_os.scouting_prospects where id=p_prospect_id and linked_player_id is null;
  if v_name is null then raise exception 'Recruitment target not found'; end if;
  insert into djm_os.recruitment_interactions(prospect_id,owner_user_id,channel,direction,summary,occurred_at,source)
  values(p_prospect_id,(select auth.uid()),p_channel,p_direction,trim(p_summary),coalesce(p_occurred_at,now()),'djm_os') returning id into v_id;
  update djm_os.scouting_prospects
  set first_contact_at=coalesce(first_contact_at,case when p_direction in ('outbound','mutual') then coalesce(p_occurred_at,now()) else first_contact_at end),
      last_contact_at=case when p_direction in ('outbound','mutual') then greatest(coalesce(last_contact_at,'epoch'::timestamptz),coalesce(p_occurred_at,now())) else last_contact_at end,
      last_reply_at=case when p_direction in ('inbound','mutual') then greatest(coalesce(last_reply_at,'epoch'::timestamptz),coalesce(p_occurred_at,now())) else last_reply_at end,
      recruitment_stage=case when recruitment_stage in ('identified','researching','ready_to_contact') and p_direction='outbound' then 'contacted' when recruitment_stage in ('identified','researching','ready_to_contact','contacted') and p_direction in ('inbound','mutual') then 'replied' else recruitment_stage end,
      next_action_at=case when p_next_action_at is not null then p_next_action_at else next_action_at end,
      owner_user_id=coalesce(owner_user_id,(select auth.uid())),
      preferred_contact_channel=coalesce(preferred_contact_channel,p_channel),updated_at=now()
  where id=p_prospect_id;
  delete from djm_os.tasks where source=('recruitment:'||p_prospect_id::text) and status not in ('completed','cancelled');
  if p_next_action_at is not null then
    insert into djm_os.tasks(title,task_type,owner_user_id,due_at,status,priority,source)
    values('Follow up recruitment target: '||v_name,'recruitment_followup',v_owner,p_next_action_at,'open',least(5,greatest(1,coalesce(v_priority,3))),'recruitment:'||p_prospect_id::text);
  else
    insert into djm_os.tasks(title,task_type,owner_user_id,due_at,status,priority,source)
    values('Set next step: '||v_name,'recruitment_next_step',v_owner,now(),'open',least(5,greatest(1,coalesce(v_priority,3))),'recruitment:'||p_prospect_id::text);
  end if;
  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at)
  values('RECRUITMENT_INTERACTION_LOGGED',(select auth.uid()),jsonb_build_object('prospect_id',p_prospect_id,'channel',p_channel,'direction',p_direction,'summary',trim(p_summary),'next_action_at',p_next_action_at),'recruitment',1,coalesce(p_occurred_at,now()));
  return jsonb_build_object('interaction_id',v_id,'prospect_id',p_prospect_id,'next_action_required',p_next_action_at is null);
end
$function$;

create or replace function private.djm_queue_player_birthday_emails(p_today date default null,p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public','djm_os','private','pg_catalog'
as $function$
declare
  v_today date := coalesce(p_today,(now() at time zone 'Europe/Rome')::date);
  v_local_hour integer := extract(hour from (now() at time zone 'Europe/Rome'))::integer;
  v_delivery_enabled boolean := false;
  v_candidate_count integer := 0;
  v_recipient_count integer := 0;
  v_queued integer := 0;
  v_row record; v_recipient record; v_target_date date; v_phase text; v_age integer; v_title text; v_body text;
begin
  if p_today is null and not p_dry_run and v_local_hour <> 8 then
    return jsonb_build_object('local_date',v_today,'local_hour',v_local_hour,'skipped','outside_birthday_delivery_hour','queued',0,'dry_run',false);
  end if;
  select coalesce(c.enabled,false) and c.api_key is not null and c.from_address is not null into v_delivery_enabled
  from private.djm_email_config c where c.singleton=true;
  select count(*) into v_recipient_count from djm_os.team_members tm join auth.users au on au.id=tm.user_id where tm.is_active and nullif(trim(coalesce(au.email,'')),'') is not null;
  for v_row in
    select p.id,trim(concat_ws(' ',coalesce(nullif(trim(p.preferred_name),''),nullif(trim(p.first_name),'')),nullif(trim(p.last_name),''))) as display_name,p.date_of_birth,p.current_club
    from public.players p
    where p.date_of_birth is not null and p.football_status in ('active','free_agent','loan','injured')
      and ((extract(month from p.date_of_birth)=extract(month from v_today) and extract(day from p.date_of_birth)=extract(day from v_today))
        or (extract(month from p.date_of_birth)=extract(month from (v_today+1)) and extract(day from p.date_of_birth)=extract(day from (v_today+1))))
  loop
    if extract(month from v_row.date_of_birth)=extract(month from v_today) and extract(day from v_row.date_of_birth)=extract(day from v_today) then v_target_date:=v_today; v_phase:='today'; else v_target_date:=v_today+1; v_phase:='tomorrow'; end if;
    v_age:=extract(year from v_target_date)::integer-extract(year from v_row.date_of_birth)::integer;
    v_candidate_count:=v_candidate_count+1;
    if v_phase='today' then
      v_title:='Birthday today: '||v_row.display_name||' turns '||v_age::text;
      v_body:=v_row.display_name||' has a birthday today and turns '||v_age::text||'.'||case when nullif(trim(coalesce(v_row.current_club,'')),'') is not null then ' Current club: '||v_row.current_club||'.' else '' end||' A quick personal message from DJM is worth sending.';
    else
      v_title:='Tomorrow: '||v_row.display_name||' turns '||v_age::text;
      v_body:=v_row.display_name||' has a birthday tomorrow and turns '||v_age::text||'.'||case when nullif(trim(coalesce(v_row.current_club,'')),'') is not null then ' Current club: '||v_row.current_club||'.' else '' end||' This is an early reminder so DJM can be ready.';
    end if;
    if p_dry_run or not v_delivery_enabled then continue; end if;
    for v_recipient in select tm.user_id from djm_os.team_members tm join auth.users au on au.id=tm.user_id where tm.is_active and nullif(trim(coalesce(au.email,'')),'') is not null loop
      insert into public.email_outbox(user_id,kind,title,body,url,payload,dedupe_key,status)
      values(v_recipient.user_id,'player_birthday_'||v_phase,v_title,v_body,'/admin/players/'||v_row.id::text,
        jsonb_build_object('player_id',v_row.id,'player_name',v_row.display_name,'birthday',v_row.date_of_birth,'turning_age',v_age,'phase',v_phase,'target_date',v_target_date,'critical_agency_alert',true),
        'player-birthday:'||v_recipient.user_id::text||':'||v_row.id::text||':'||extract(year from v_target_date)::integer::text||':'||v_phase,'pending')
      on conflict(dedupe_key) do nothing;
      if found then v_queued:=v_queued+1; end if;
    end loop;
  end loop;
  return jsonb_build_object('local_date',v_today,'local_hour',v_local_hour,'delivery_configured',v_delivery_enabled,'birthday_candidates',v_candidate_count,'active_email_recipients',v_recipient_count,'queued',v_queued,'dry_run',p_dry_run);
end
$function$;
revoke all on function private.djm_queue_player_birthday_emails(date,boolean) from public,anon,authenticated;

select cron.alter_job(job_id:=31,command:=$cron$
  select private.djm_queue_smart_reminders();
  select private.djm_queue_player_birthday_emails();
  select net.http_post(url:='https://xogoigaaskmuspiehkba.supabase.co/functions/v1/dispatch-player-push',headers:=jsonb_build_object('Content-Type','application/json','x-djm-cron',(select decrypted_secret from vault.decrypted_secrets where name='djm_push_cron_secret' limit 1)),body:=jsonb_build_object('source','smart-reminders-hourly'),timeout_milliseconds:=10000);
  select net.http_post(url:='https://xogoigaaskmuspiehkba.supabase.co/functions/v1/dispatch-djm-email',headers:=jsonb_build_object('Content-Type','application/json','x-djm-cron',(select decrypted_secret from vault.decrypted_secrets where name='djm_push_cron_secret' limit 1)),body:=jsonb_build_object('source','smart-reminders-hourly'),timeout_milliseconds:=10000);
$cron$);
