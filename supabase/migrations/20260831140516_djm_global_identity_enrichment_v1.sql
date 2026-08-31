alter table djm_os.football_intelligence_subjects
  add column if not exists identity_confidence numeric,
  add column if not exists identity_provider text,
  add column if not exists identity_verified_at timestamptz;

create table if not exists djm_os.football_subject_identity_evidence(
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references djm_os.football_intelligence_subjects(id) on delete cascade,
  provider text not null,
  provider_player_id text not null,
  confidence numeric not null check(confidence between 0 and 1),
  observed_data jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subject_id,provider,provider_player_id)
);
alter table djm_os.football_subject_identity_evidence enable row level security;
revoke all on djm_os.football_subject_identity_evidence from anon,authenticated;
grant all on djm_os.football_subject_identity_evidence to service_role;

create or replace function public.djm_global_enrichment_batch(p_limit integer default 20)
returns table(subject_id uuid,full_name text,date_of_birth date,nationality text,current_club text,current_country text,primary_position text,football_provider_ids jsonb,current_confidence smallint,attempts integer)
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required'; end if;
  return query
  select s.id,s.full_name,s.date_of_birth,s.nationality,s.current_club,s.current_country,s.primary_position,s.football_provider_ids,q.current_confidence,q.attempts
  from djm_os.football_intelligence_enrichment_queue q
  join djm_os.football_intelligence_subjects s on s.id=q.subject_id
  where q.status in ('queued','blocked') and q.current_confidence<q.target_confidence and q.next_attempt_at<=now()
  order by q.priority asc,q.current_confidence asc,q.updated_at asc
  limit greatest(1,least(coalesce(p_limit,20),25));
end;$$;
revoke all on function public.djm_global_enrichment_batch(integer) from public,anon,authenticated;
grant execute on function public.djm_global_enrichment_batch(integer) to service_role;

create or replace function public.djm_global_apply_identity(p_subject_id uuid,p_provider text,p_provider_player_id text,p_confidence numeric,p_observed_data jsonb,p_observed_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare s djm_os.football_intelligence_subjects%rowtype; v_conf numeric:=greatest(0,least(1,coalesce(p_confidence,0)));
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required'; end if;
  select * into s from djm_os.football_intelligence_subjects where id=p_subject_id;
  if not found then raise exception 'subject not found'; end if;
  insert into djm_os.football_subject_identity_evidence(subject_id,provider,provider_player_id,confidence,observed_data,observed_at,updated_at)
  values(p_subject_id,p_provider,p_provider_player_id,v_conf,coalesce(p_observed_data,'{}'::jsonb),coalesce(p_observed_at,now()),now())
  on conflict(subject_id,provider,provider_player_id) do update set confidence=excluded.confidence,observed_data=excluded.observed_data,observed_at=excluded.observed_at,updated_at=now();
  update djm_os.football_intelligence_subjects set
    football_provider_ids=coalesce(football_provider_ids,'{}'::jsonb)||jsonb_build_object(p_provider,p_provider_player_id),
    date_of_birth=coalesce(date_of_birth,nullif(p_observed_data->>'date_of_birth','')::date),
    nationality=coalesce(nationality,nullif(p_observed_data->>'nationality','')),
    primary_position=coalesce(primary_position,nullif(p_observed_data->>'position','')),
    identity_confidence=greatest(coalesce(identity_confidence,0),v_conf),
    identity_provider=case when v_conf>=coalesce(identity_confidence,0) then p_provider else identity_provider end,
    identity_verified_at=case when v_conf>=coalesce(identity_confidence,0) then coalesce(p_observed_at,now()) else identity_verified_at end,
    external_data_status=case when v_conf>=.80 then 'identity_verified' else external_data_status end,
    external_data_checked_at=now(),external_data_error=null,updated_at=now()
  where id=p_subject_id;
  update djm_os.football_intelligence_enrichment_queue set attempts=attempts+1,last_attempt_at=now(),next_attempt_at=now()+interval '12 hours',status='queued',last_error=null,updated_at=now() where subject_id=p_subject_id;
  perform djm_os.refresh_football_subject_scorecard(p_subject_id);
  return jsonb_build_object('ok',true,'subject_id',p_subject_id,'provider',p_provider,'provider_player_id',p_provider_player_id,'identity_confidence',v_conf);
end;$$;
revoke all on function public.djm_global_apply_identity(uuid,text,text,numeric,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.djm_global_apply_identity(uuid,text,text,numeric,jsonb,timestamptz) to service_role;

create or replace function public.djm_global_enrichment_fail(p_subject_id uuid,p_error text,p_delay_hours integer default 12)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
 if coalesce(auth.role(),'') <> 'service_role' then raise exception 'service role required'; end if;
 update djm_os.football_intelligence_enrichment_queue set attempts=attempts+1,last_attempt_at=now(),next_attempt_at=now()+make_interval(hours=>greatest(1,least(coalesce(p_delay_hours,12),168))),status=case when attempts>=5 then 'blocked' else 'queued' end,last_error=left(p_error,500),updated_at=now() where subject_id=p_subject_id;
 update djm_os.football_intelligence_subjects set external_data_checked_at=now(),external_data_error=left(p_error,500),updated_at=now() where id=p_subject_id;
end;$$;
revoke all on function public.djm_global_enrichment_fail(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.djm_global_enrichment_fail(uuid,text,integer) to service_role;
