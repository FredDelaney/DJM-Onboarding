alter table djm_os.scouting_prospects
  add column if not exists whatsapp text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists signed_at timestamptz,
  add column if not exists signed_player_id uuid references public.players(id) on delete set null,
  add column if not exists recruitment_source text,
  add column if not exists last_reply_at timestamptz;

create index if not exists scouting_prospects_signed_player_idx on djm_os.scouting_prospects(signed_player_id);
create index if not exists scouting_prospects_next_action_idx on djm_os.scouting_prospects(next_action_at) where recruitment_stage not in ('signed','declined','lost');

create table if not exists djm_os.recruitment_interactions (
  id uuid primary key default gen_random_uuid(),
  prospect_id uuid not null references djm_os.scouting_prospects(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  channel text not null,
  direction text,
  summary text not null,
  occurred_at timestamptz not null default now(),
  source text not null default 'manual',
  external_ref text,
  created_at timestamptz not null default now(),
  constraint recruitment_interactions_channel_check check (channel in ('whatsapp','instagram','linkedin','email','phone','meeting','other')),
  constraint recruitment_interactions_direction_check check (direction is null or direction in ('inbound','outbound','mutual'))
);

alter table djm_os.recruitment_interactions enable row level security;

drop policy if exists recruitment_interactions_team_all on djm_os.recruitment_interactions;
create policy recruitment_interactions_team_all on djm_os.recruitment_interactions
for all to authenticated
using (exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active))
with check (exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active));

create index if not exists recruitment_interactions_prospect_time_idx on djm_os.recruitment_interactions(prospect_id, occurred_at desc);
create index if not exists recruitment_interactions_owner_idx on djm_os.recruitment_interactions(owner_user_id);

create or replace function public.djm_recruitment_target(p_prospect_id uuid)
returns jsonb
language plpgsql
set search_path=''
as $$
declare v jsonb;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  select jsonb_build_object(
    'target', to_jsonb(sp),
    'interactions', coalesce((select jsonb_agg(x order by x.occurred_at desc) from (select ri.id,ri.channel,ri.direction,ri.summary,ri.occurred_at,ri.source,tm.display_name as owner_name from djm_os.recruitment_interactions ri left join djm_os.team_members tm on tm.user_id=ri.owner_user_id where ri.prospect_id=sp.id order by ri.occurred_at desc limit 100) x),'[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(x order by x.due_at nulls last) from (select t.id,t.title,t.status,t.priority,t.due_at,t.source from djm_os.tasks t where t.source=('recruitment:'||sp.id::text) and t.status not in ('completed','cancelled') order by t.due_at nulls last) x),'[]'::jsonb)
  ) into v
  from djm_os.scouting_prospects sp
  where sp.id=p_prospect_id and sp.linked_player_id is null;
  return v;
end $$;

grant execute on function public.djm_recruitment_target(uuid) to authenticated;

create or replace function public.djm_recruitment_log_interaction(
  p_prospect_id uuid,
  p_channel text,
  p_summary text,
  p_direction text default null,
  p_occurred_at timestamptz default now(),
  p_next_action_at timestamptz default null
)
returns jsonb
language plpgsql
set search_path=''
as $$
declare v_id uuid; v_stage text; v_name text;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  if p_channel not in ('whatsapp','instagram','linkedin','email','phone','meeting','other') then raise exception 'Unsupported channel'; end if;
  if p_direction is not null and p_direction not in ('inbound','outbound','mutual') then raise exception 'Unsupported direction'; end if;
  if length(trim(coalesce(p_summary,'')))<2 then raise exception 'Summary is required'; end if;

  select recruitment_stage,full_name into v_stage,v_name from djm_os.scouting_prospects where id=p_prospect_id and linked_player_id is null;
  if v_name is null then raise exception 'Recruitment target not found'; end if;

  insert into djm_os.recruitment_interactions(prospect_id,owner_user_id,channel,direction,summary,occurred_at,source)
  values(p_prospect_id,(select auth.uid()),p_channel,p_direction,trim(p_summary),coalesce(p_occurred_at,now()),'djm_os') returning id into v_id;

  update djm_os.scouting_prospects
  set first_contact_at=coalesce(first_contact_at,case when p_direction in ('outbound','mutual') then coalesce(p_occurred_at,now()) else first_contact_at end),
      last_contact_at=case when p_direction in ('outbound','mutual') then greatest(coalesce(last_contact_at,'epoch'::timestamptz),coalesce(p_occurred_at,now())) else last_contact_at end,
      last_reply_at=case when p_direction in ('inbound','mutual') then greatest(coalesce(last_reply_at,'epoch'::timestamptz),coalesce(p_occurred_at,now())) else last_reply_at end,
      recruitment_stage=case
        when recruitment_stage in ('identified','researching','ready_to_contact') and p_direction='outbound' then 'contacted'
        when recruitment_stage in ('identified','researching','ready_to_contact','contacted') and p_direction in ('inbound','mutual') then 'replied'
        else recruitment_stage end,
      next_action_at=coalesce(p_next_action_at,next_action_at),
      preferred_contact_channel=coalesce(preferred_contact_channel,p_channel),
      updated_at=now()
  where id=p_prospect_id;

  if p_next_action_at is not null then
    delete from djm_os.tasks where source=('recruitment:'||p_prospect_id::text) and status not in ('completed','cancelled');
    insert into djm_os.tasks(title,task_type,owner_user_id,due_at,status,priority,source)
    values('Follow up recruitment target: '||v_name,'recruitment_followup',(select auth.uid()),p_next_action_at,'open',3,'recruitment:'||p_prospect_id::text);
  end if;

  insert into djm_os.events(event_type,actor_user_id,payload,source,confidence,occurred_at)
  values('RECRUITMENT_INTERACTION_LOGGED',(select auth.uid()),jsonb_build_object('prospect_id',p_prospect_id,'channel',p_channel,'direction',p_direction,'summary',trim(p_summary)),'recruitment',1,coalesce(p_occurred_at,now()));

  return jsonb_build_object('interaction_id',v_id,'prospect_id',p_prospect_id);
end $$;

grant execute on function public.djm_recruitment_log_interaction(uuid,text,text,text,timestamptz,timestamptz) to authenticated;

create or replace function public.djm_recruitment_promote_to_signed_player(p_prospect_id uuid)
returns jsonb
language plpgsql
set search_path=''
as $$
declare sp djm_os.scouting_prospects%rowtype; v_player_id uuid; v_first text; v_last text; v_space int;
begin
  if not exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active) then raise exception 'DJM team access required'; end if;
  select * into sp from djm_os.scouting_prospects where id=p_prospect_id for update;
  if sp.id is null then raise exception 'Recruitment target not found'; end if;
  if sp.signed_player_id is not null then return jsonb_build_object('player_id',sp.signed_player_id,'already_promoted',true); end if;
  if sp.recruitment_stage <> 'signed' then raise exception 'Target must be marked signed before promotion'; end if;

  v_space:=strpos(trim(sp.full_name),' ');
  if v_space>0 then
    v_first:=left(trim(sp.full_name),v_space-1);
    v_last:=substr(trim(sp.full_name),v_space+1);
  else
    v_first:=trim(sp.full_name);
    v_last:=null;
  end if;

  insert into public.players(
    first_name,last_name,date_of_birth,nationalities,preferred_foot,primary_position,secondary_positions,current_club,current_country,contract_expiry,transfermarkt_url,wyscout_url,instagram_url,onboarding_status,verification_status,agency_priority,next_action,review_required_at,review_reason
  ) values(
    v_first,v_last,sp.date_of_birth,
    case when nullif(trim(coalesce(sp.nationality,'')),'') is null then '{}'::text[] else array[trim(sp.nationality)] end,
    sp.preferred_foot,sp.primary_position,coalesce(sp.secondary_positions,'{}'::text[]),sp.current_club,sp.current_country,sp.contract_expiry,sp.transfermarkt_url,sp.wyscout_url,sp.instagram_url,'not_started','unverified','high','Complete DJM Player onboarding',now(),'Promoted from DJM Recruitment after signing'
  ) returning id into v_player_id;

  update djm_os.scouting_prospects
  set signed_player_id=v_player_id, linked_player_id=v_player_id, signed_at=coalesce(signed_at,now()), next_action_at=null, updated_at=now()
  where id=p_prospect_id;

  update djm_os.tasks set status='completed',completed_at=now(),updated_at=now()
  where source=('recruitment:'||p_prospect_id::text) and status not in ('completed','cancelled');

  insert into djm_os.events(event_type,actor_user_id,player_id,payload,source,confidence,occurred_at)
  values('RECRUITMENT_PROMOTED_TO_SIGNED_PLAYER',(select auth.uid()),v_player_id,jsonb_build_object('prospect_id',p_prospect_id,'player_name',sp.full_name),'recruitment',1,now());

  return jsonb_build_object('player_id',v_player_id,'prospect_id',p_prospect_id,'already_promoted',false,'onboarding_status','not_started');
end $$;

grant execute on function public.djm_recruitment_promote_to_signed_player(uuid) to authenticated;

create or replace function djm_os.refresh_recruitment_followups()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_count int:=0;
begin
  insert into djm_os.tasks(title,task_type,owner_user_id,due_at,status,priority,source)
  select 'Follow up recruitment target: '||sp.full_name,'recruitment_followup',coalesce(sp.owner_user_id,(select tm.user_id from djm_os.team_members tm where tm.is_active order by tm.created_at limit 1)),sp.next_action_at,'open',3,'recruitment:'||sp.id::text
  from djm_os.scouting_prospects sp
  where sp.linked_player_id is null
    and sp.recruitment_stage not in ('signed','declined','lost','paused')
    and sp.next_action_at is not null
    and sp.next_action_at <= now()+interval '3 days'
    and not exists(select 1 from djm_os.tasks t where t.source=('recruitment:'||sp.id::text) and t.status not in ('completed','cancelled'));
  get diagnostics v_count=row_count;
  return v_count;
end $$;

revoke all on function djm_os.refresh_recruitment_followups() from public,anon,authenticated;

select cron.unschedule(jobid) from cron.job where jobname='djm-recruitment-followups';
select cron.schedule('djm-recruitment-followups','17 */3 * * *','select djm_os.refresh_recruitment_followups();');
