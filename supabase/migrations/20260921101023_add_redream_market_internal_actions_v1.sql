
create or replace function public.redream_market_create_pitch_draft(
  p_player_match_id uuid,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  if auth.uid() is null then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;

  return public.platform_server_create_pitch_draft(
    v_tenant,
    p_player_match_id,
    auth.uid(),
    coalesce(p_input,'{}'::jsonb)
  );
end;
$function$;

create or replace function public.redream_market_convert_pursuit_to_deal(
  p_player_match_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  if auth.uid() is null then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;

  if jsonb_typeof(coalesce(p_input,'{}'::jsonb)) <> 'object' then
    raise exception 'input_must_be_object';
  end if;

  return public.platform_server_convert_pursuit_to_deal(
    v_tenant,
    p_player_match_id,
    auth.uid(),
    coalesce(p_input,'{}'::jsonb)
  );
end;
$function$;

create or replace function public.redream_market_create_dossier_draft(
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  if auth.uid() is null then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;

  return public.platform_server_create_external_dossier_draft(
    v_tenant,
    p_player_id,
    auth.uid()
  );
end;
$function$;

create or replace function public.redream_market_update_dossier_draft(
  p_player_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  if auth.uid() is null then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;

  if jsonb_typeof(coalesce(p_patch,'{}'::jsonb)) <> 'object' then
    raise exception 'invalid_patch';
  end if;

  return public.platform_server_update_external_dossier(
    v_tenant,
    p_player_id,
    auth.uid(),
    coalesce(p_patch,'{}'::jsonb)
  );
end;
$function$;

create or replace function public.redream_market_prepare_pitch_response(
  p_share_id uuid,
  p_input jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
begin
  if auth.uid() is null then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;

  return public.platform_server_prepare_pitch_response_action(
    v_tenant,
    p_share_id,
    auth.uid(),
    coalesce(p_input,'{}'::jsonb)
  );
end;
$function$;

create or replace function public.redream_market_execute_pitch_response(
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
  v_proposal_tenant uuid;
begin
  if auth.uid() is null then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;

  select p.tenant_id
    into v_proposal_tenant
  from platform.agency_action_proposals p
  where p.id=p_proposal_id
    and p.action_type='review_pitch_response';

  if v_proposal_tenant is null or v_proposal_tenant is distinct from v_tenant then
    raise exception 'Action access denied' using errcode='42501';
  end if;

  return public.platform_server_execute_pitch_response_action(
    v_tenant,
    p_proposal_id,
    auth.uid()
  );
end;
$function$;

create or replace function public.redream_market_undo_pitch_response(
  p_proposal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid := private.redream_request_tenant();
  v_proposal_tenant uuid;
begin
  if auth.uid() is null then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;

  select p.tenant_id
    into v_proposal_tenant
  from platform.agency_action_proposals p
  where p.id=p_proposal_id
    and p.action_type='review_pitch_response';

  if v_proposal_tenant is null or v_proposal_tenant is distinct from v_tenant then
    raise exception 'Action access denied' using errcode='42501';
  end if;

  return public.platform_server_undo_pitch_response_action(
    v_tenant,
    p_proposal_id,
    auth.uid()
  );
end;
$function$;

revoke all on function public.redream_market_create_pitch_draft(uuid,jsonb) from public,anon;
revoke all on function public.redream_market_convert_pursuit_to_deal(uuid,jsonb) from public,anon;
revoke all on function public.redream_market_create_dossier_draft(uuid) from public,anon;
revoke all on function public.redream_market_update_dossier_draft(uuid,jsonb) from public,anon;
revoke all on function public.redream_market_prepare_pitch_response(uuid,jsonb) from public,anon;
revoke all on function public.redream_market_execute_pitch_response(uuid) from public,anon;
revoke all on function public.redream_market_undo_pitch_response(uuid) from public,anon;

grant execute on function public.redream_market_create_pitch_draft(uuid,jsonb) to authenticated,service_role;
grant execute on function public.redream_market_convert_pursuit_to_deal(uuid,jsonb) to authenticated,service_role;
grant execute on function public.redream_market_create_dossier_draft(uuid) to authenticated,service_role;
grant execute on function public.redream_market_update_dossier_draft(uuid,jsonb) to authenticated,service_role;
grant execute on function public.redream_market_prepare_pitch_response(uuid,jsonb) to authenticated,service_role;
grant execute on function public.redream_market_execute_pitch_response(uuid) to authenticated,service_role;
grant execute on function public.redream_market_undo_pitch_response(uuid) to authenticated,service_role;

comment on function public.redream_market_create_pitch_draft(uuid,jsonb) is
  'Creates a private, inactive pitch draft for the current ReDream tenant. It cannot create external outreach.';
comment on function public.redream_market_convert_pursuit_to_deal(uuid,jsonb) is
  'Creates internal deal tracking from a career-cleared pursuit using human-supplied commercial inputs.';
comment on function public.redream_market_create_dossier_draft(uuid) is
  'Creates a private tenant-branded external dossier draft from the current tenant player record.';
comment on function public.redream_market_update_dossier_draft(uuid,jsonb) is
  'Updates only the approved private dossier presentation fields for the current tenant.';
comment on function public.redream_market_prepare_pitch_response(uuid,jsonb) is
  'Prepares internal review work for an explicit club pitch response without contacting the responder or changing deal state.';
