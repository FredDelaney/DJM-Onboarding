-- Expose read-only preparation metadata through the existing tenant/author-scoped receipt.
-- The existing invoker security and grants are preserved; no draft, roster or share is written.
CREATE OR REPLACE FUNCTION public.redream_ai_receipt(p_capture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
begin
  perform private.tell_assert_capture(p_capture_id,false);
  perform private.tell_request_tenant();

  select jsonb_build_object(
    'capture',jsonb_build_object(
      'id',c.id,
      'status',c.status,
      'summary',c.summary,
      'transcript_text',c.transcript_text,
      'created_at',c.created_at,
      'completed_at',c.completed_at,
      'error_message',c.error_message,
      'approval_required',exists(
        select 1 from djm_os.tell_djm_actions pa
        where pa.capture_id=c.id and pa.status='pending'
      )
    ),
    'preparations',case when jsonb_typeof(c.extracted_json->'tell_djm_plan'->'preparations')='array'
      then c.extracted_json->'tell_djm_plan'->'preparations' else '[]'::jsonb end,
    'actions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,
        'action_type',a.action_type,
        'status',a.status,
        'confidence',a.confidence,
        'evidence',a.evidence,
        'proposed_payload',a.proposed_payload,
        'resolved_payload',a.resolved_payload,
        'target_type',a.target_type,
        'target_id',a.target_id,
        'verification',a.verification_json,
        'undo_supported',a.undo_supported,
        'error_message',a.error_message
      ) order by a.action_index,a.created_at)
      from djm_os.tell_djm_actions a
      where a.capture_id=c.id and a.status<>'superseded'
    ),'[]'::jsonb),
    'questions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',q.id,
        'field_key',q.field_key,
        'prompt',q.prompt,
        'reason',q.reason,
        'candidates',q.candidates,
        'status',q.status
      ) order by q.created_at)
      from djm_os.tell_djm_questions q
      where q.capture_id=c.id and q.status<>'superseded'
    ),'[]'::jsonb)
  )
  into v_result
  from djm_os.captures c
  where c.id=p_capture_id
    and c.tenant_id=private.tell_request_tenant();

  if v_result is null then raise exception 'Capture not found'; end if;
  return v_result;
end;
$function$
;
