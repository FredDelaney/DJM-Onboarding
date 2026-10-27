
create or replace function public.redream_ai_resolve_team_member(
  p_capture_id uuid,
  p_spoken_name text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_name text := lower(trim(regexp_replace(coalesce(p_spoken_name,''),'[^[:alnum:] ]+',' ','g')));
  v_candidate_count integer := 0;
  v_user_id uuid;
  v_display_name text;
  v_candidates jsonb := '[]'::jsonb;
begin
  v_name:=trim(regexp_replace(v_name,'[[:space:]]+',' ','g'));
  if v_name='' then
    return jsonb_build_object('resolved',false,'candidates','[]'::jsonb);
  end if;

  select c.tenant_id into v_tenant
  from djm_os.captures c
  where c.id=p_capture_id and c.processing_version='tell_djm_v1';

  if v_tenant is null then raise exception 'Capture not found'; end if;

  with members as (
    select
      m.user_id,
      coalesce(nullif(trim(tm.display_name),''),nullif(trim(p.display_name),''),'Team member') as display_name
    from platform.tenant_memberships m
    join djm_os.team_members tm on tm.user_id=m.user_id
    left join public.profiles p on p.id=m.user_id
    where m.tenant_id=v_tenant and m.status='active' and tm.is_active
  ),
  matches as (
    select user_id,display_name
    from members
    where lower(trim(display_name))=v_name
       or lower(split_part(trim(display_name),' ',1))=v_name
    order by display_name
    limit 6
  )
  select count(*),
         coalesce(jsonb_agg(jsonb_build_object(
           'kind','team_member',
           'user_id',user_id,
           'label',display_name
         ) order by display_name),'[]'::jsonb)
  into v_candidate_count,v_candidates
  from matches;

  if v_candidate_count=1 then
    v_user_id:=(v_candidates->0->>'user_id')::uuid;
    v_display_name:=v_candidates->0->>'label';
    return jsonb_build_object(
      'resolved',true,
      'matched_by','exact',
      'user_id',v_user_id,
      'display_name',v_display_name,
      'candidates',v_candidates
    );
  elsif v_candidate_count>1 then
    return jsonb_build_object(
      'resolved',false,
      'matched_by','ambiguous_exact',
      'candidates',v_candidates
    );
  end if;

  if char_length(regexp_replace(v_name,' ','','g'))>=4 then
    with members as (
      select
        m.user_id,
        coalesce(nullif(trim(tm.display_name),''),nullif(trim(p.display_name),''),'Team member') as display_name
      from platform.tenant_memberships m
      join djm_os.team_members tm on tm.user_id=m.user_id
      left join public.profiles p on p.id=m.user_id
      where m.tenant_id=v_tenant and m.status='active' and tm.is_active
    ),
    matches as (
      select user_id,display_name
      from members
      where private.redream_name_edit_distance_one(
              v_name,
              lower(split_part(trim(display_name),' ',1))
            )
         or private.redream_name_edit_distance_one(
              regexp_replace(v_name,' ','','g'),
              regexp_replace(lower(trim(display_name)),' ','','g')
            )
      order by display_name
      limit 6
    )
    select count(*),
           coalesce(jsonb_agg(jsonb_build_object(
             'kind','team_member',
             'user_id',user_id,
             'label',display_name
           ) order by display_name),'[]'::jsonb)
    into v_candidate_count,v_candidates
    from matches;

    if v_candidate_count=1 then
      v_user_id:=(v_candidates->0->>'user_id')::uuid;
      v_display_name:=v_candidates->0->>'label';
      return jsonb_build_object(
        'resolved',true,
        'matched_by','single_edit',
        'user_id',v_user_id,
        'display_name',v_display_name,
        'candidates',v_candidates
      );
    elsif v_candidate_count>0 then
      return jsonb_build_object(
        'resolved',false,
        'matched_by','ambiguous_single_edit',
        'candidates',v_candidates
      );
    end if;
  end if;

  return jsonb_build_object(
    'resolved',false,
    'matched_by','none',
    'candidates','[]'::jsonb
  );
end;
$$;

revoke all on function public.redream_ai_resolve_team_member(uuid,text)
from public,anon,authenticated;
grant execute on function public.redream_ai_resolve_team_member(uuid,text)
to service_role;

