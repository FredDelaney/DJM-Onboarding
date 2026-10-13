-- Allow the service-role AI worker to resolve a spoken task owner without granting broad platform-table access.

CREATE OR REPLACE FUNCTION public.redream_ai_resolve_team_member(p_capture_id uuid, p_spoken_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant uuid;
  v_name text := lower(trim(coalesce(p_spoken_name,'')));
  v_exact_count integer := 0;
  v_candidate_count integer := 0;
  v_user_id uuid;
  v_display_name text;
  v_candidates jsonb := '[]'::jsonb;
begin
  if v_name='' then
    return jsonb_build_object('resolved',false,'candidates','[]'::jsonb);
  end if;

  select c.tenant_id into v_tenant
  from djm_os.captures c
  where c.id=p_capture_id and c.processing_version='tell_djm_v1';

  if v_tenant is null then raise exception 'Capture not found'; end if;

  select count(*) into v_exact_count
  from platform.tenant_memberships m
  join djm_os.team_members tm on tm.user_id=m.user_id
  where m.tenant_id=v_tenant and m.status='active' and tm.is_active
    and lower(trim(tm.display_name))=v_name;

  if v_exact_count=1 then
    select m.user_id,tm.display_name into v_user_id,v_display_name
    from platform.tenant_memberships m
    join djm_os.team_members tm on tm.user_id=m.user_id
    where m.tenant_id=v_tenant and m.status='active' and tm.is_active
      and lower(trim(tm.display_name))=v_name
    limit 1;
    return jsonb_build_object(
      'resolved',true,
      'user_id',v_user_id,
      'display_name',v_display_name,
      'candidates',jsonb_build_array(jsonb_build_object(
        'user_id',v_user_id,'label',v_display_name
      ))
    );
  end if;

  with matches as (
    select m.user_id,tm.display_name
    from platform.tenant_memberships m
    join djm_os.team_members tm on tm.user_id=m.user_id
    where m.tenant_id=v_tenant and m.status='active' and tm.is_active
      and (
        lower(split_part(trim(tm.display_name),' ',1))=v_name
        or lower(trim(tm.display_name)) like v_name||' %'
      )
    order by tm.display_name
    limit 6
  )
  select count(*),
         coalesce(jsonb_agg(jsonb_build_object(
           'user_id',user_id,'label',display_name
         ) order by display_name),'[]'::jsonb)
  into v_candidate_count,v_candidates
  from matches;

  if v_candidate_count=1 then
    select (v_candidates->0->>'user_id')::uuid,
           v_candidates->0->>'label'
    into v_user_id,v_display_name;
    return jsonb_build_object(
      'resolved',true,
      'user_id',v_user_id,
      'display_name',v_display_name,
      'candidates',v_candidates
    );
  end if;

  return jsonb_build_object(
    'resolved',false,
    'candidates',v_candidates
  );
end;
$function$;

revoke all on function public.redream_ai_resolve_team_member(uuid,text) from public,anon,authenticated;
grant execute on function public.redream_ai_resolve_team_member(uuid,text) to service_role;
