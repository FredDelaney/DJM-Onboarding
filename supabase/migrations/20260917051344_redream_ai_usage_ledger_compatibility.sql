-- ReDream AI usage metering compatibility.
-- Uses the capture's stored tenant, prevents retry double-counting,
-- and safely bridges legacy Tell DJM and canonical ReDream request IDs.

create or replace function private.redream_ai_record_usage_from_capture(
  p_capture_id uuid,
  p_feature_key text,
  p_model text,
  p_status text,
  p_input_tokens bigint default 0,
  p_cached_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_estimated_cost_micros bigint default 0,
  p_latency_ms integer default null,
  p_prompt_version text default null,
  p_event_suffix text default 'model',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_tenant_id uuid;
  v_processing_version text;
  v_event_suffix text;
  v_redream_request_id text;
  v_legacy_request_id text;
  v_external_request_id text;
begin
  select c.submitted_by, c.tenant_id, c.processing_version
  into v_user_id, v_tenant_id, v_processing_version
  from djm_os.captures c
  where c.id = p_capture_id;

  if v_user_id is null or v_tenant_id is null then
    raise exception 'capture_not_found';
  end if;

  if v_processing_version <> 'tell_djm_v1' then
    raise exception 'unsupported_capture_processing_version';
  end if;

  if p_status not in ('succeeded','failed','cancelled','blocked','cached') then
    raise exception 'invalid_ai_usage_status';
  end if;

  v_event_suffix := coalesce(nullif(trim(p_event_suffix),''),'model');

  v_redream_request_id :=
    'redream:' || p_capture_id::text || ':' || v_event_suffix;

  v_legacy_request_id :=
    'tell-djm:' || p_capture_id::text || ':' || v_event_suffix;

  select e.external_request_id
  into v_external_request_id
  from platform.ai_usage_events e
  where e.tenant_id = v_tenant_id
    and e.external_request_id in (
      v_redream_request_id,
      v_legacy_request_id
    )
  order by
    case
      when e.external_request_id = v_redream_request_id then 0
      else 1
    end
  limit 1;

  v_external_request_id :=
    coalesce(v_external_request_id, v_redream_request_id);

  return public.platform_server_record_ai_usage(
    p_tenant_id := v_tenant_id,
    p_user_id := v_user_id,
    p_feature_key := p_feature_key,
    p_provider := 'openai',
    p_model := p_model,
    p_status := p_status,
    p_input_tokens := greatest(coalesce(p_input_tokens,0),0),
    p_cached_input_tokens := greatest(coalesce(p_cached_input_tokens,0),0),
    p_output_tokens := greatest(coalesce(p_output_tokens,0),0),
    p_estimated_cost_micros :=
      greatest(coalesce(p_estimated_cost_micros,0),0),
    p_actual_cost_micros := null,
    p_latency_ms :=
      case
        when p_latency_ms is null then null
        else greatest(p_latency_ms,0)
      end,
    p_prompt_version := p_prompt_version,
    p_source_fingerprint := p_capture_id::text,
    p_external_request_id := v_external_request_id,
    p_idempotency_key := v_external_request_id,
    p_error_code := null,
    p_metadata :=
      jsonb_build_object(
        'capture_id', p_capture_id,
        'surface', 'redream',
        'processing_version', v_processing_version
      )
      || coalesce(p_metadata,'{}'::jsonb)
  );
end;
$function$;

grant usage on schema private to service_role;

revoke all on function private.redream_ai_record_usage_from_capture(
  uuid,text,text,text,bigint,bigint,bigint,bigint,
  integer,text,text,jsonb
) from public, anon, authenticated;

grant execute on function private.redream_ai_record_usage_from_capture(
  uuid,text,text,text,bigint,bigint,bigint,bigint,
  integer,text,text,jsonb
) to service_role;


create or replace function public.redream_ai_record_ai_usage_from_capture(
  p_capture_id uuid,
  p_feature_key text,
  p_model text,
  p_status text,
  p_input_tokens bigint default 0,
  p_cached_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_estimated_cost_micros bigint default 0,
  p_latency_ms integer default null,
  p_prompt_version text default null,
  p_event_suffix text default 'model',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language sql
set search_path to ''
as $function$
  select private.redream_ai_record_usage_from_capture(
    p_capture_id,
    p_feature_key,
    p_model,
    p_status,
    p_input_tokens,
    p_cached_input_tokens,
    p_output_tokens,
    p_estimated_cost_micros,
    p_latency_ms,
    p_prompt_version,
    p_event_suffix,
    p_metadata
  )
$function$;

revoke all on function public.redream_ai_record_ai_usage_from_capture(
  uuid,text,text,text,bigint,bigint,bigint,bigint,
  integer,text,text,jsonb
) from public, anon, authenticated;

grant execute on function public.redream_ai_record_ai_usage_from_capture(
  uuid,text,text,text,bigint,bigint,bigint,bigint,
  integer,text,text,jsonb
) to service_role;


create or replace function public.djm_tell_record_ai_usage_from_capture(
  p_capture_id uuid,
  p_feature_key text,
  p_model text,
  p_status text,
  p_input_tokens bigint default 0,
  p_cached_input_tokens bigint default 0,
  p_output_tokens bigint default 0,
  p_estimated_cost_micros bigint default 0,
  p_latency_ms integer default null,
  p_prompt_version text default null,
  p_event_suffix text default 'model',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language sql
set search_path to ''
as $function$select public.redream_ai_record_ai_usage_from_capture(
    p_capture_id,
    p_feature_key,
    p_model,
    p_status,
    p_input_tokens,
    p_cached_input_tokens,
    p_output_tokens,
    p_estimated_cost_micros,
    p_latency_ms,
    p_prompt_version,
    p_event_suffix,
    p_metadata
  )
$function$;

revoke all on function public.djm_tell_record_ai_usage_from_capture(
  uuid,text,text,text,bigint,bigint,bigint,bigint,
  integer,text,text,jsonb
) from public, anon, authenticated;

grant execute on function public.djm_tell_record_ai_usage_from_capture(
  uuid,text,text,text,bigint,bigint,bigint,bigint,
  integer,text,text,jsonb
) to service_role;


create or replace function public.redream_ai_worker_store_transcript(
  p_capture_id uuid,
  p_transcript text,
  p_usage jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_capture_type text;
  v_cost_micros bigint := 0;
  v_latency_ms integer := null;
begin
  if coalesce(length(trim(p_transcript)),0)=0 then
    raise exception 'Transcript cannot be empty';
  end if;

  update djm_os.captures
  set
    transcript_text = p_transcript,
    raw_text = coalesce(raw_text,p_transcript),
    usage_json =
      coalesce(usage_json,'{}'::jsonb)
      || coalesce(p_usage,'{}'::jsonb)
  where id = p_capture_id
  returning capture_type into v_capture_type;

  if not found then
    raise exception 'Capture not found';
  end if;

  if
    v_capture_type = 'audio'
    and p_usage ? 'transcription_cost_usd'
  then
    v_cost_micros :=
      round(
        coalesce(
          nullif(p_usage->>'transcription_cost_usd','')::numeric,
          0
        ) * 1000000
      )::bigint;

    v_latency_ms :=
      nullif(p_usage->>'transcription_ms','')::integer;

    perform private.redream_ai_record_usage_from_capture(
      p_capture_id := p_capture_id,
      p_feature_key := 'speech_capture',
      p_model := 'gpt-transcribe',
      p_status := 'succeeded',
      p_input_tokens := 0,
      p_cached_input_tokens := 0,
      p_output_tokens := 0,
      p_estimated_cost_micros := v_cost_micros,
      p_latency_ms := v_latency_ms,
      p_prompt_version := 'redream-transcribe-v1',
      p_event_suffix := 'transcription',
      p_metadata := jsonb_build_object(
        'transcription_seconds',
        p_usage->'transcription_seconds'
      )
    );
  end if;

  return jsonb_build_object(
    'capture_id',p_capture_id,
    'stored',true
  );
end;
$function$;


create or replace function public.redream_ai_worker_store_plan(
  p_capture_id uuid,
  p_transcript text,
  p_plan jsonb,
  p_usage jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_cost_micros bigint := 0;
  v_latency_ms integer := null;
  v_input_tokens bigint := 0;
  v_cached_input_tokens bigint := 0;
  v_output_tokens bigint := 0;
  v_model text := null;
begin
  update djm_os.captures
  set
    transcript_text = p_transcript,
    raw_text = coalesce(raw_text,p_transcript),
    extracted_json =
      jsonb_set(
        coalesce(extracted_json,'{}'::jsonb),
        '{tell_djm_plan}',
        coalesce(p_plan,'{}'::jsonb),
        true
      ),
    usage_json =
      coalesce(usage_json,'{}'::jsonb)
      || coalesce(p_usage,'{}'::jsonb)
  where id = p_capture_id;

  if not found then
    raise exception 'Capture not found';
  end if;

  v_model :=
    nullif(p_usage->>'interpretation_model','');

  if v_model is not null then
    v_cost_micros :=
      round(
        coalesce(
          nullif(p_usage->>'interpretation_cost_usd','')::numeric,
          0
        ) * 1000000
      )::bigint;

    v_latency_ms :=
      nullif(p_usage->>'interpretation_ms','')::integer;

    v_input_tokens :=
      coalesce(
        nullif(p_usage->>'input_tokens','')::bigint,
        0
      );

    v_cached_input_tokens :=
      coalesce(
        nullif(p_usage->>'cached_input_tokens','')::bigint,
        0
      );

    v_output_tokens :=
      coalesce(
        nullif(p_usage->>'output_tokens','')::bigint,
        0
      );

    perform private.redream_ai_record_usage_from_capture(
      p_capture_id := p_capture_id,
      p_feature_key := 'ai_assistant',
      p_model := v_model,
      p_status := 'succeeded',
      p_input_tokens := v_input_tokens,
      p_cached_input_tokens := v_cached_input_tokens,
      p_output_tokens := v_output_tokens,
      p_estimated_cost_micros := v_cost_micros,
      p_latency_ms := v_latency_ms,
      p_prompt_version := 'redream-v8',
      p_event_suffix := 'interpretation',
      p_metadata := jsonb_build_object(
        'tier',
        p_usage->'interpretation_tier'
      )
    );
  end if;

  return jsonb_build_object(
    'capture_id',p_capture_id,
    'stored',true
  );
end;
$function$;


revoke all on function public.redream_ai_worker_store_transcript(
  uuid,text,jsonb
) from public, anon, authenticated;

grant execute on function public.redream_ai_worker_store_transcript(
  uuid,text,jsonb
) to service_role;

revoke all on function public.redream_ai_worker_store_plan(
  uuid,text,jsonb,jsonb
) from public, anon, authenticated;

grant execute on function public.redream_ai_worker_store_plan(
  uuid,text,jsonb,jsonb
) to service_role;


create or replace function public.djm_tell_worker_store_transcript(
  p_capture_id uuid,
  p_transcript text,
  p_usage jsonb default '{}'::jsonb
)
returns jsonb
language sql
set search_path to ''
as $function$select public.redream_ai_worker_store_transcript(
    p_capture_id,
    p_transcript,
    p_usage
  )
$function$;


create or replace function public.djm_tell_worker_store_plan(
  p_capture_id uuid,
  p_transcript text,
  p_plan jsonb,
  p_usage jsonb default '{}'::jsonb
)
returns jsonb
language sql
set search_path to ''
as $function$select public.redream_ai_worker_store_plan(
    p_capture_id,
    p_transcript,
    p_plan,
    p_usage
  )
$function$;


revoke all on function public.djm_tell_worker_store_transcript(
  uuid,text,jsonb
) from public, anon, authenticated;

grant execute on function public.djm_tell_worker_store_transcript(
  uuid,text,jsonb
) to service_role;

revoke all on function public.djm_tell_worker_store_plan(
  uuid,text,jsonb,jsonb
) from public, anon, authenticated;

grant execute on function public.djm_tell_worker_store_plan(
  uuid,text,jsonb,jsonb
) to service_role;
