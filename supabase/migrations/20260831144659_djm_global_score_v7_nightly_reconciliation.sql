create or replace function djm_os.refresh_global_scorecards_batch(p_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare r record; v_ok integer:=0; v_failed integer:=0; v_errors jsonb:='[]'::jsonb;
begin
  for r in select id from djm_os.football_intelligence_subjects order by updated_at desc limit greatest(1,least(coalesce(p_limit,1000),5000)) loop
    begin
      perform djm_os.refresh_football_subject_scorecard(r.id);
      v_ok:=v_ok+1;
    exception when others then
      v_failed:=v_failed+1;
      if jsonb_array_length(v_errors)<20 then v_errors:=v_errors||jsonb_build_array(jsonb_build_object('subject_id',r.id,'error',sqlerrm)); end if;
    end;
  end loop;
  return jsonb_build_object('ok',v_failed=0,'refreshed',v_ok,'failed',v_failed,'errors',v_errors,'completed_at',now());
end;
$$;

do $$ declare v_job integer; begin
  select jobid into v_job from cron.job where jobname='djm-global-score-v7-nightly-reconciliation' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('djm-global-score-v7-nightly-reconciliation','25 5 * * *','select djm_os.refresh_global_scorecards_batch(1000);');
end $$;