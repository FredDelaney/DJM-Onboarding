create or replace function private.djm_assert_player_tenant_access(p_player_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_tenant_id uuid;
  v_user_id uuid := auth.uid();
begin
  select p.tenant_id into v_tenant_id
  from public.players p
  where p.id = p_player_id;

  if v_tenant_id is null then
    raise exception 'Player not found';
  end if;

  if coalesce(auth.role(),'') = 'service_role' then
    return v_tenant_id;
  end if;

  if v_user_id is null or not exists (
    select 1
    from platform.tenant_memberships m
    join platform.tenants t on t.id=m.tenant_id and t.status='active'
    where m.tenant_id=v_tenant_id
      and m.user_id=v_user_id
      and m.status='active'
      and m.role in ('owner','admin','agent','scout','operations')
  ) then
    raise exception 'Player tenant access required';
  end if;

  return v_tenant_id;
end;
$function$;

revoke all on function private.djm_assert_player_tenant_access(uuid) from public, anon, authenticated;

grant execute on function private.djm_assert_player_tenant_access(uuid) to service_role;

create or replace function public.djm_player_global_intelligence(p_player_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare v_subject_id uuid;
begin
  perform private.djm_assert_player_tenant_access(p_player_id);

  select s.id into v_subject_id
  from djm_os.football_intelligence_subjects s
  where s.player_id=p_player_id
  limit 1;

  if v_subject_id is null then
    return jsonb_build_object('available',false,'reason','global_subject_not_initialised','player_id',p_player_id);
  end if;

  return public.djm_subject_global_intelligence(v_subject_id);
end;
$function$;

create or replace function public.djm_refresh_player_global_intelligence(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_subject_id uuid;
begin
  perform private.djm_assert_player_tenant_access(p_player_id);

  select s.id into v_subject_id
  from djm_os.football_intelligence_subjects s
  where s.player_id=p_player_id
  limit 1;

  if v_subject_id is null then
    return jsonb_build_object('available',false,'reason','global_subject_not_initialised','player_id',p_player_id);
  end if;

  return public.djm_refresh_subject_global_intelligence(v_subject_id);
end;
$function$;

create or replace function public.djm_player_comparison(p_player_id uuid, p_compare_competition_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_base jsonb;
  v_intel jsonb;
  v_score jsonb;
  v_projection jsonb;
begin
  perform private.djm_assert_player_tenant_access(p_player_id);

  v_base := public.djm_player_comparison_legacy_v5(p_player_id,p_compare_competition_id);
  v_intel := public.djm_player_global_intelligence(p_player_id);
  v_score := coalesce(v_intel -> 'scorecard','{}'::jsonb);
  v_projection := coalesce(v_intel -> 'projection','{}'::jsonb);
  v_base := jsonb_set(v_base,'{scorecard}',v_score || jsonb_build_object(
    'potential_score',nullif(v_projection ->> 'forecast_score','')::numeric,
    'projection',v_projection
  ),true);
  v_base := jsonb_set(v_base,'{projection}',v_projection,true);
  v_base := jsonb_set(v_base,'{semantics,current_level}',to_jsonb('DJM Global Score V7.1 current demonstrated level'::text),true);
  v_base := jsonb_set(v_base,'{semantics,potential}',to_jsonb('Five-year uncertainty-aware development forecast. Not a calibrated probability of career success.'::text),true);
  return v_base;
end;
$function$;

create or replace function public.djm_player_scorecard(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_intel jsonb;
  v_score jsonb;
  v_projection jsonb;
  v_tier text;
  v_display numeric;
begin
  perform private.djm_assert_player_tenant_access(p_player_id);

  v_intel := public.djm_refresh_player_global_intelligence(p_player_id);
  v_score := coalesce(v_intel -> 'scorecard','{}'::jsonb);
  v_projection := coalesce(v_intel -> 'projection','{}'::jsonb);
  v_tier := coalesce(v_score ->> 'score_tier','unavailable');
  v_display := nullif(v_score ->> 'display_score','')::numeric;
  return v_score || jsonb_build_object(
    'display_score',v_display,
    'model_score',case when v_tier='full' then v_display else null end,
    'provisional_score',case when v_tier<>'full' then v_display else null end,
    'provisional_confidence',nullif(v_score ->> 'confidence','')::numeric,
    'potential_score',nullif(v_projection ->> 'forecast_score','')::numeric,
    'potential_model_score',nullif(v_projection ->> 'forecast_score','')::numeric,
    'model_status',coalesce(v_score ->> 'score_state',v_tier),
    'basis',jsonb_build_object(
      'evidence_band',v_score -> 'evidence_band',
      'effective_evidence_coverage',v_score -> 'data_coverage',
      'global_model',true,
      'projection',v_projection
    )
  );
end;
$function$;

revoke execute on function public.djm_subject_global_intelligence(uuid) from public, anon, authenticated;
revoke execute on function public.djm_refresh_subject_global_intelligence(uuid) from public, anon, authenticated;
revoke execute on function public.djm_football_subject_score_v6(uuid) from public, anon, authenticated;
revoke execute on function public.djm_football_subject_comparison(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.djm_football_subject_scores() from public, anon, authenticated;

grant execute on function public.djm_subject_global_intelligence(uuid) to service_role;
grant execute on function public.djm_refresh_subject_global_intelligence(uuid) to service_role;
grant execute on function public.djm_football_subject_score_v6(uuid) to service_role;
grant execute on function public.djm_football_subject_comparison(uuid,uuid) to service_role;
grant execute on function public.djm_football_subject_scores() to service_role;;
