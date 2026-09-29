begin;

create or replace function public.redream_messaging_threads(p_provider text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_items jsonb;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.user_has_staff_tenant_access(v_tenant,v_user) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  if v_provider not in ('whatsapp','instagram') then raise exception 'unsupported_provider'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'provider',t.provider,'external_thread_id',t.external_thread_id,'participant_label',t.participant_label,
    'participant_username',nullif(trim(coalesce(t.metadata->>'participant_username','')),''),
    'participant_name',nullif(trim(coalesce(t.metadata->>'participant_name','')),''),
    'participant_identity_source',nullif(trim(coalesce(t.metadata->>'participant_identity_source','')),''),
    'is_selected',t.is_selected,'last_activity_at',t.last_activity_at,
    'bound_person_id',t.bound_person_id,'bound_person_name',pe.full_name,
    'bound_organisation_id',ce.organisation_id,'bound_organisation_name',o.name,
    'bound_player_id',t.bound_player_id,
    'bound_player_name',case when pl.id is null then null else coalesce(nullif(trim(pl.preferred_name),''),nullif(trim(concat_ws(' ',pl.first_name,pl.last_name)),''),'Player') end,
    'bound_player_current_club',pl.current_club,
    'bound_prospect_id',t.bound_prospect_id,'bound_prospect_name',sp.full_name,
    'bound_prospect_current_club',sp.current_club,'bound_prospect_stage',sp.recruitment_stage,
    'identity_kind',case when t.bound_player_id is not null then 'player' when t.bound_prospect_id is not null then 'recruitment_target' when t.bound_person_id is not null then 'network_person' else null end
  ) order by t.is_selected desc,t.last_activity_at desc nulls last),'[]'::jsonb)
  into v_items
  from djm_os.messaging_threads t
  left join djm_os.people pe on pe.id=t.bound_person_id and pe.tenant_id=v_tenant
  left join lateral (
    select e.organisation_id from djm_os.employments e
    where e.tenant_id=v_tenant and e.person_id=t.bound_person_id and e.is_current=true
    order by e.started_on desc nulls last,e.updated_at desc,e.id limit 1
  ) ce on true
  left join djm_os.organisations o on o.id=ce.organisation_id and o.tenant_id=v_tenant
  left join public.players pl on pl.id=t.bound_player_id and pl.tenant_id=v_tenant
  left join djm_os.scouting_prospects sp on sp.id=t.bound_prospect_id and sp.tenant_id=v_tenant
  where t.tenant_id=v_tenant and t.user_id=v_user and t.provider=v_provider;

  return jsonb_build_object('threads',v_items);
end;
$function$;

revoke all on function public.redream_messaging_threads(text) from public,anon;
grant execute on function public.redream_messaging_threads(text) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
