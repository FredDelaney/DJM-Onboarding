create or replace function public.djm_service_global_subject_queue(p_subject_id uuid default null,p_limit integer default 5)
returns table(subject_id uuid,full_name text,date_of_birth date,nationality text,primary_position text,current_club text,current_league text,current_country text,current_season_label text,football_provider_ids jsonb,representation_status text,player_id uuid,prospect_id uuid,external_data_status text,external_data_checked_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required'; end if;
 return query select s.id,s.full_name,s.date_of_birth,s.nationality,s.primary_position,s.current_club,s.current_league,s.current_country,s.current_season_label,s.football_provider_ids,s.representation_status,s.player_id,s.prospect_id,s.external_data_status,s.external_data_checked_at from djm_os.football_intelligence_subjects s where p_subject_id is null or s.id=p_subject_id order by case when s.external_data_status in ('never','failed','enriching') then 0 else 1 end,s.external_data_checked_at nulls first,s.updated_at desc limit greatest(1,least(coalesce(p_limit,5),20));
end; $$;
revoke all on function public.djm_service_global_subject_queue(uuid,integer) from public,anon,authenticated;
grant execute on function public.djm_service_global_subject_queue(uuid,integer) to service_role;

create or replace function public.djm_service_mark_global_subject_enrichment(p_subject_id uuid,p_status text,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required'; end if;
 update djm_os.football_intelligence_subjects set external_data_status=coalesce(nullif(p_status,''),'failed'),external_data_checked_at=now(),external_data_error=p_error,updated_at=now() where id=p_subject_id;
end; $$;
revoke all on function public.djm_service_mark_global_subject_enrichment(uuid,text,text) from public,anon,authenticated;
grant execute on function public.djm_service_mark_global_subject_enrichment(uuid,text,text) to service_role;