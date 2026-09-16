create or replace function public.djm_tell_worker_store_transcript(
  p_capture_id uuid,
  p_transcript text,
  p_usage jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_cost_micros bigint := 0;
  v_latency_ms integer := null;
  v_capture_type text := null;
begin
  if coalesce(length(trim(p_transcript)),0)=0 then
    raise exception 'Transcript cannot be empty';
  end if;

  select c.capture_type
  into v_capture_type
  from djm_os.captures c
  where c.id = p_capture_id;

  if v_capture_type is null then
    raise exception 'Capture not found';
  end if;

  update djm_os.captures
  set transcript_text=p_transcript,
      raw_text=coalesce(raw_text,p_transcript),
      usage_json=coalesce(usage_json,'{}'::jsonb)||coalesce(p_usage,'{}'::jsonb)
  where id=p_capture_id;

  if not found then raise exception 'Capture not found'; end if;

  if v_capture_type = 'audio' then
    v_cost_micros := round(
      coalesce(nullif(p_usage->>'transcription_cost_usd','')::numeric,0) * 1000000
    )::bigint;
    v_latency_ms := nullif(p_usage->>'transcription_ms','')::integer;

    perform public.djm_tell_record_ai_usage_from_capture(
      p_capture_id := p_capture_id,
      p_feature_key := 'speech_capture',
      p_model := 'gpt-transcribe',
      p_status := 'succeeded',
      p_input_tokens := 0,
      p_cached_input_tokens := 0,
      p_output_tokens := 0,
      p_estimated_cost_micros := v_cost_micros,
      p_latency_ms := v_latency_ms,
      p_prompt_version := 'tell-djm-transcribe-v1',
      p_event_suffix := 'transcription',
      p_metadata := jsonb_build_object(
        'transcription_seconds', p_usage->'transcription_seconds'
      )
    );
  end if;

  return jsonb_build_object('capture_id',p_capture_id,'stored',true);
end;
$function$;

delete from platform.ai_usage_events a
using djm_os.captures c
where c.id = (a.metadata->>'capture_id')::uuid
  and c.capture_type <> 'audio'
  and a.feature_key = 'speech_capture'
  and a.external_request_id =
    'tell-djm:' || c.id::text || ':transcription';
