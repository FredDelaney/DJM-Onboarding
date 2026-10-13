-- Include capture channel in the worker payload so approval-first behaviour can distinguish typed/voice debriefs.

CREATE OR REPLACE FUNCTION public.redream_ai_worker_claim(p_capture_id uuid DEFAULT NULL::uuid, p_worker text DEFAULT 'tell-djm-worker'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
  v_payload jsonb;
begin
  -- Old binaries identify jobs as edge: and cannot provide capture-bound lookups.
  -- Reject them from the first migration onward, including between migrations.
  if p_worker is null or p_worker not like 'redream-ai:%' then return null; end if;
  with candidate as (
    select c.id
    from djm_os.captures c
    where c.processing_version='tell_djm_v1'
      and ((c.status in ('queued','retry') and c.next_attempt_at<=now()) or (c.status='processing' and c.locked_at<now()-interval '5 minutes'))
      and (p_capture_id is null or c.id=p_capture_id)
      and exists (
        select 1 from djm_os.tell_djm_permissions p
        where p.user_id=c.submitted_by and p.tenant_id=c.tenant_id and p.is_enabled=true
          and private.user_has_staff_tenant_access(c.tenant_id,c.submitted_by)
      )
    order by case when c.id=p_capture_id then 0 else 1 end,c.created_at
    for update skip locked limit 1
  )
  update djm_os.captures c
  set status='processing',attempt_count=c.attempt_count+1,locked_at=now(),locked_by=p_worker,error_message=null
  from candidate where c.id=candidate.id returning c.id into v_id;

  if v_id is null then return null; end if;

  update djm_os.tell_djm_actions set status='superseded',updated_at=now()
  where capture_id=v_id and status in ('pending','failed');
  update djm_os.tell_djm_questions set status='superseded'
  where capture_id=v_id and status='open';

  select jsonb_build_object(
    'capture_id',c.id,'tenant_id',c.tenant_id,'submitted_by',c.submitted_by,'channel',c.channel,'capture_type',c.capture_type,
    'raw_text',c.raw_text,'source_uri',c.source_uri,'transcript_text',c.transcript_text,'extracted_json',c.extracted_json,
    'usage_json',c.usage_json,'person_id',c.person_id,'organisation_id',c.organisation_id,'player_id',c.player_id,
    'context_json',c.context_json,'created_at',c.created_at,'duration_seconds',c.audio_duration_seconds,
    'attempt_count',c.attempt_count,'timezone',coalesce(tm.timezone,'Europe/Rome'),
    'permission_scope',coalesce(p.permission_scope,'read_only'),'settings',to_jsonb(s),
    'estimated_month_spend',coalesce((
      select sum(coalesce((x.usage_json->>'estimated_cost_usd')::numeric,0))
      from djm_os.captures x
      where x.tenant_id=c.tenant_id and x.created_at>=date_trunc('month',now()) and x.processing_version='tell_djm_v1'
    ),0)
  ) into v_payload
  from djm_os.captures c
  left join djm_os.team_members tm on tm.user_id=c.submitted_by
  left join djm_os.tell_djm_permissions p on p.user_id=c.submitted_by and p.tenant_id=c.tenant_id
  cross join djm_os.tell_djm_settings s
  where c.id=v_id and s.id=1;

  perform private.tell_assert_entities((v_payload->>'tenant_id')::uuid,
    jsonb_build_object('person_id',v_payload->'person_id','organisation_id',v_payload->'organisation_id',
      'player_id',v_payload->'player_id','context',v_payload->'context_json'));
  return v_payload;
end;
$function$;


revoke all on function public.redream_ai_worker_claim(uuid,text) from public,anon,authenticated;
grant execute on function public.redream_ai_worker_claim(uuid,text) to service_role;
