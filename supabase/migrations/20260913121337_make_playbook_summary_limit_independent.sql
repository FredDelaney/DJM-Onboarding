alter function public.platform_server_agency_playbook(uuid,integer) rename to platform_server_agency_playbook_core;

create or replace function public.platform_server_agency_playbook(p_tenant_id uuid, p_limit integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,8),20));
  v_full jsonb;
  v_visible jsonb;
  v_total integer;
begin
  v_full:=public.platform_server_agency_playbook_core(p_tenant_id,20);
  v_total:=jsonb_array_length(coalesce(v_full->'plays','[]'::jsonb));

  select coalesce(jsonb_agg(x.value order by x.ordinality),'[]'::jsonb)
  into v_visible
  from jsonb_array_elements(coalesce(v_full->'plays','[]'::jsonb)) with ordinality x(value,ordinality)
  where x.ordinality<=v_limit;

  return jsonb_set(v_full,'{plays}',v_visible,true)
    || jsonb_build_object(
      'summary',coalesce(v_full->'summary','{}'::jsonb)||jsonb_build_object(
        'total_play_count',v_total,
        'visible_play_count',jsonb_array_length(v_visible),
        'hidden_by_limit',greatest(v_total-jsonb_array_length(v_visible),0),
        'summary_scope','all_ranked_plays'
      )
    );
end;
$$;

revoke all on function public.platform_server_agency_playbook_core(uuid,integer) from public,anon,authenticated;
revoke all on function public.platform_server_agency_playbook(uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_agency_playbook_core(uuid,integer) to service_role;
grant execute on function public.platform_server_agency_playbook(uuid,integer) to service_role;;
