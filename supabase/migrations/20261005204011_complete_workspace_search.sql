-- Search the tenant's complete recorded index, not capped operating summaries.
create or replace function public.platform_server_workspace_search(
  p_tenant_id uuid, p_user_id uuid, p_query text, p_limit integer default 30
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare
  v_query text := lower(regexp_replace(pg_catalog.normalize(left(trim(coalesce(p_query,'')),200),'NFKD'),U&'[\0300-\036f]','','g'));
  v_tokens text[];
  v_limit integer := greatest(1,least(coalesce(p_limit,30),30));
  v_result jsonb;
begin
  if not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then
    raise exception 'staff_tenant_access_required' using errcode='42501';
  end if;
  if v_query='' then return jsonb_build_object('items','[]'::jsonb,'total',0,'has_more',false); end if;
  v_tokens := regexp_split_to_array(v_query,'\s+');
  with records as (
    select p.id,'player'::text kind,
      coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player') title,
      concat_ws(' · ',nullif(p.current_club,''),nullif(p.primary_position,''),nullif(p.current_country,'')) subtitle
    from public.players p where p.tenant_id=p_tenant_id and p.archived_at is null and coalesce(p.football_status,'active')<>'retired'
    union all
    select s.id,'recruitment',coalesce(nullif(s.full_name,''),'Recruitment target'),
      concat_ws(' · ',nullif(s.current_club,''),nullif(s.primary_position,''),nullif(s.current_country,''))
    from djm_os.scouting_prospects s where s.tenant_id=p_tenant_id and (to_jsonb(s)->>'archived_at') is null
    union all
    select o.id,'club',coalesce(nullif(o.name,''),'Club'),concat_ws(' · ',nullif(o.country,''),nullif(o.league_name,''))
    from djm_os.organisations o where o.tenant_id=p_tenant_id and o.organisation_type='club' and (to_jsonb(o)->>'archived_at') is null
    union all
    select p.id,'contact',coalesce(nullif(p.full_name,''),nullif(p.preferred_name,''),'Contact'),
      concat_ws(' · ',nullif(e.organisation_name,''),nullif(e.role_title,''))
    from djm_os.people p
    left join lateral (
      select o.name organisation_name,e.role_title from djm_os.employments e
      left join djm_os.organisations o on o.id=e.organisation_id and o.tenant_id=p_tenant_id
      where e.person_id=p.id and e.tenant_id=p_tenant_id and e.is_current=true
      order by e.started_on desc nulls last,e.updated_at desc,e.id limit 1
    ) e on true
    where p.tenant_id=p_tenant_id and coalesce(p.person_type,'contact')<>'player' and p.archived_at is null
    union all
    select n.id,'opportunity',coalesce(nullif(n.title,''),nullif(n.position,''),'Club need'),
      concat_ws(' · ',nullif(o.name,''),nullif(n.position,''))
    from djm_os.club_needs n
    left join djm_os.organisations o on o.id=n.organisation_id and o.tenant_id=p_tenant_id
    where n.tenant_id=p_tenant_id and (to_jsonb(n)->>'archived_at') is null
    union all
    select d.id,'deal',coalesce(nullif(d.title,''),'Deal'),concat_ws(' · ',nullif(o.name,''),nullif(d.stage,''))
    from djm_os.deal_rooms d
    left join djm_os.organisations o on o.id=d.organisation_id and o.tenant_id=p_tenant_id
    where d.tenant_id=p_tenant_id and (to_jsonb(d)->>'archived_at') is null
  ), normalised as (
    select r.*,
      lower(regexp_replace(pg_catalog.normalize(r.title,'NFKD'),U&'[\0300-\036f]','','g')) normal_title,
      lower(regexp_replace(pg_catalog.normalize(concat_ws(' ',r.title,r.subtitle,r.kind),'NFKD'),U&'[\0300-\036f]','','g')) searchable
    from records r
  ), matched as (
    select n.*,case when normal_title=v_query then 100 when strpos(normal_title,v_query)=1 then 80 when strpos(normal_title,v_query)>0 then 60 else 20 end score
    from normalised n where not exists(select 1 from unnest(v_tokens) token where strpos(n.searchable,token)=0)
  ), ranked as (
    select m.*,row_number() over(order by score desc,normal_title,kind,id) rn from matched m
  )
  select jsonb_build_object(
    'items',coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'title',title,'subtitle',subtitle) order by rn) filter(where rn<=v_limit),'[]'::jsonb),
    'total',count(*),'has_more',count(*)>v_limit
  ) into v_result from ranked;
  return v_result;
end $function$;
revoke all on function public.platform_server_workspace_search(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.platform_server_workspace_search(uuid,uuid,text,integer) to service_role;
notify pgrst,'reload schema';
