create or replace function public.djm_recruitment_apply_transfermarkt_enrichment(
  p_prospect_id uuid,
  p_source_url text,
  p_status text,
  p_observed_at timestamptz,
  p_fields jsonb default '{}'::jsonb,
  p_http_status integer default null,
  p_blocked boolean default false,
  p_parser_version text default 'tm_v6'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_fields jsonb := coalesce(p_fields, '{}'::jsonb);
begin
  if not exists (
    select 1
    from djm_os.team_members tm
    where tm.user_id = (select auth.uid())
      and tm.is_active
  ) then
    raise exception 'DJM team access required';
  end if;

  if p_source_url is null or btrim(p_source_url) = '' then
    raise exception 'Transfermarkt URL is required';
  end if;

  v_status := case lower(coalesce(p_status, 'failed'))
    when 'complete' then 'verified'
    when 'verified' then 'verified'
    when 'partial' then 'review'
    when 'review' then 'review'
    when 'blocked' then 'queued'
    when 'pending' then 'queued'
    when 'queued' then 'queued'
    when 'never' then 'never'
    else 'failed'
  end;

  update djm_os.scouting_prospects sp
  set
    transfermarkt_url = p_source_url,
    transfermarkt_enrichment_status = v_status,
    transfermarkt_checked_at = coalesce(p_observed_at, now()),
    transfermarkt_snapshot = jsonb_build_object(
      'source_url', p_source_url,
      'observed_at', coalesce(p_observed_at, now()),
      'parser_version', coalesce(nullif(btrim(p_parser_version), ''), 'tm_v6'),
      'fields', v_fields,
      'http_status', p_http_status,
      'blocked', coalesce(p_blocked, false)
    ),
    source = case when not coalesce(p_blocked, false) then 'transfermarkt' else sp.source end,
    source_confidence = case when not coalesce(p_blocked, false) then 0.92 else sp.source_confidence end,
    last_verified_at = case when v_status = 'verified' then coalesce(p_observed_at, now()) else sp.last_verified_at end,
    full_name = case when v_fields ? 'full_name' and nullif(btrim(v_fields->>'full_name'), '') is not null then btrim(v_fields->>'full_name') else sp.full_name end,
    date_of_birth = case when v_fields ? 'date_of_birth' and nullif(v_fields->>'date_of_birth','') is not null then (v_fields->>'date_of_birth')::date else sp.date_of_birth end,
    nationality = case when v_fields ? 'nationality' and nullif(btrim(v_fields->>'nationality'), '') is not null then btrim(v_fields->>'nationality') else sp.nationality end,
    current_club = case when v_fields ? 'current_club' and nullif(btrim(v_fields->>'current_club'), '') is not null then btrim(v_fields->>'current_club') else sp.current_club end,
    current_country = case when v_fields ? 'current_country' and nullif(btrim(v_fields->>'current_country'), '') is not null then btrim(v_fields->>'current_country') else sp.current_country end,
    primary_position = case when v_fields ? 'primary_position' and nullif(btrim(v_fields->>'primary_position'), '') is not null then btrim(v_fields->>'primary_position') else sp.primary_position end,
    secondary_positions = case
      when jsonb_typeof(v_fields->'secondary_positions') = 'array'
      then array(select jsonb_array_elements_text(v_fields->'secondary_positions'))
      else sp.secondary_positions
    end,
    preferred_foot = case when v_fields ? 'preferred_foot' and nullif(btrim(v_fields->>'preferred_foot'), '') is not null then btrim(v_fields->>'preferred_foot') else sp.preferred_foot end,
    contract_expiry = case when v_fields ? 'contract_expiry' and nullif(v_fields->>'contract_expiry','') is not null then (v_fields->>'contract_expiry')::date else sp.contract_expiry end,
    market_value = case when v_fields ? 'market_value' and nullif(v_fields->>'market_value','') is not null then (v_fields->>'market_value')::numeric else sp.market_value end,
    market_value_currency = case when v_fields ? 'market_value_currency' and nullif(btrim(v_fields->>'market_value_currency'), '') is not null then btrim(v_fields->>'market_value_currency') else sp.market_value_currency end,
    market_value_verified_at = case when v_fields ? 'market_value' and nullif(v_fields->>'market_value','') is not null then coalesce(p_observed_at, now()) else sp.market_value_verified_at end,
    agent_status = case when v_fields ? 'agent_status' and nullif(btrim(v_fields->>'agent_status'), '') is not null then btrim(v_fields->>'agent_status') else sp.agent_status end,
    agent_name = case
      when v_fields ? 'agent_name' then nullif(btrim(v_fields->>'agent_name'), '')
      when v_fields->>'agent_status' = 'not_listed' then null
      else sp.agent_name
    end,
    updated_at = now()
  where sp.id = p_prospect_id
    and sp.linked_player_id is null;

  if not found then
    raise exception 'Recruitment target not found or already signed';
  end if;

  if not coalesce(p_blocked, false) then
    update djm_os.freshness_queue fq
    set status = 'completed',
        completed_at = coalesce(p_observed_at, now()),
        locked_at = null,
        updated_at = now()
    where fq.entity_type = 'recruitment_target'
      and fq.entity_id = p_prospect_id
      and fq.check_type = 'transfermarkt_profile';
  end if;

  return jsonb_build_object(
    'persisted', true,
    'prospect_id', p_prospect_id,
    'status', v_status,
    'blocked', coalesce(p_blocked, false)
  );
end;
$$;

revoke all on function public.djm_recruitment_apply_transfermarkt_enrichment(uuid,text,text,timestamptz,jsonb,integer,boolean,text) from public;
revoke all on function public.djm_recruitment_apply_transfermarkt_enrichment(uuid,text,text,timestamptz,jsonb,integer,boolean,text) from anon;
grant execute on function public.djm_recruitment_apply_transfermarkt_enrichment(uuid,text,text,timestamptz,jsonb,integer,boolean,text) to authenticated;
