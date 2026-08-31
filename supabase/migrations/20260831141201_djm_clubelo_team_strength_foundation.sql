create table if not exists djm_os.football_team_strength_snapshots(
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  snapshot_date date not null,
  team_name text not null,
  team_key text not null,
  country_code text,
  level_tier integer,
  elo numeric,
  rank integer,
  provider_from date,
  provider_to date,
  source_url text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider,snapshot_date,team_key)
);
create index if not exists football_team_strength_latest_idx on djm_os.football_team_strength_snapshots(provider,snapshot_date desc,country_code,level_tier);
alter table djm_os.football_team_strength_snapshots enable row level security;
revoke all on djm_os.football_team_strength_snapshots from anon,authenticated;
grant all on djm_os.football_team_strength_snapshots to service_role;

create or replace function djm_os.normalise_team_key(p_name text)
returns text language sql immutable set search_path='' as $$
 select nullif(trim(regexp_replace(lower(coalesce(p_name,'')),'[^a-z0-9]+',' ','g')),'');
$$;

create or replace function public.djm_upsert_clubelo_snapshot(p_snapshot_date date,p_rows jsonb,p_source_url text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare row jsonb; v_count integer:=0;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service role required'; end if;
 if p_snapshot_date is null then raise exception 'snapshot date required'; end if;
 if jsonb_typeof(p_rows)<>'array' then raise exception 'rows must be array'; end if;
 for row in select * from jsonb_array_elements(p_rows) loop
   if nullif(trim(row->>'team_name'),'') is null then continue; end if;
   insert into djm_os.football_team_strength_snapshots(provider,snapshot_date,team_name,team_key,country_code,level_tier,elo,rank,provider_from,provider_to,source_url,observed_at,updated_at)
   values('clubelo',p_snapshot_date,row->>'team_name',djm_os.normalise_team_key(row->>'team_name'),nullif(row->>'country_code',''),nullif(row->>'level_tier','')::integer,nullif(row->>'elo','')::numeric,nullif(row->>'rank','')::integer,nullif(row->>'provider_from','')::date,nullif(row->>'provider_to','')::date,p_source_url,now(),now())
   on conflict(provider,snapshot_date,team_key) do update set team_name=excluded.team_name,country_code=excluded.country_code,level_tier=excluded.level_tier,elo=excluded.elo,rank=excluded.rank,provider_from=excluded.provider_from,provider_to=excluded.provider_to,source_url=excluded.source_url,observed_at=now(),updated_at=now();
   v_count:=v_count+1;
 end loop;
 return jsonb_build_object('ok',true,'snapshot_date',p_snapshot_date,'rows',v_count);
end;$$;
revoke all on function public.djm_upsert_clubelo_snapshot(date,jsonb,text) from public,anon,authenticated;
grant execute on function public.djm_upsert_clubelo_snapshot(date,jsonb,text) to service_role;

create or replace function djm_os.subject_team_context(p_subject_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s djm_os.football_intelligence_subjects%rowtype; t djm_os.football_team_strength_snapshots%rowtype; v_avg numeric; v_score numeric; v_quality numeric:=0; v_age integer;
begin
 select * into s from djm_os.football_intelligence_subjects where id=p_subject_id;
 if not found or djm_os.normalise_team_key(s.current_club) is null then return jsonb_build_object('score',null,'quality',0,'reason','club_unknown'); end if;
 select * into t from djm_os.football_team_strength_snapshots x where x.provider='clubelo' and x.team_key=djm_os.normalise_team_key(s.current_club) order by x.snapshot_date desc limit 1;
 if not found or t.elo is null then return jsonb_build_object('score',null,'quality',0,'reason','clubelo_not_matched'); end if;
 select avg(x.elo) into v_avg from djm_os.football_team_strength_snapshots x where x.provider='clubelo' and x.snapshot_date=t.snapshot_date and x.country_code=t.country_code and x.level_tier=t.level_tier and x.elo is not null;
 if v_avg is null then return jsonb_build_object('score',null,'quality',0,'reason','league_average_unavailable'); end if;
 v_score:=greatest(20::numeric,least(80::numeric,50+(t.elo-v_avg)/5.0));
 v_age:=greatest(0,current_date-t.snapshot_date);
 v_quality:=case when v_age<=3 then .95 when v_age<=10 then .88 when v_age<=30 then .72 when v_age<=90 then .50 else .30 end;
 return jsonb_build_object('score',round(v_score,2),'quality',v_quality,'club_elo',t.elo,'league_level_average_elo',round(v_avg,2),'elo_delta',round(t.elo-v_avg,2),'snapshot_date',t.snapshot_date,'provider','clubelo','source_url',t.source_url);
end;$$;