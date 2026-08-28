create or replace function public.djm_network_capture_asset(
  p_storage_path text,
  p_capture_type text,
  p_channel text default 'whatsapp',
  p_person_id uuid default null,
  p_organisation_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_capture_id uuid;
begin
  if p_storage_path is null or length(trim(p_storage_path)) < 2 then
    raise exception 'Storage path is required';
  end if;
  if p_capture_type not in ('image','audio','document','video') then
    raise exception 'Unsupported capture type';
  end if;

  insert into djm_os.captures(
    submitted_by, channel, capture_type, source_uri, person_id, organisation_id, status, confidence
  ) values (
    auth.uid(), coalesce(nullif(trim(p_channel),''),'whatsapp'), p_capture_type,
    trim(p_storage_path), p_person_id, p_organisation_id, 'queued', null
  ) returning id into v_capture_id;

  insert into djm_os.events(
    event_type, actor_user_id, person_id, organisation_id, payload, source, confidence, occurred_at
  ) values (
    'CAPTURE_QUEUED', auth.uid(), p_person_id, p_organisation_id,
    jsonb_build_object('capture_id',v_capture_id,'capture_type',p_capture_type,'storage_path',trim(p_storage_path)),
    'djm_capture', 1, now()
  );

  return jsonb_build_object('capture_id',v_capture_id,'status','queued');
end;
$$;

revoke execute on function public.djm_network_capture_asset(text, text, text, uuid, uuid) from public, anon;
grant execute on function public.djm_network_capture_asset(text, text, text, uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
