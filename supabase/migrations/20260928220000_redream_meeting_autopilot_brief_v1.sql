begin;

create or replace function public.platform_server_meeting_brief(
  p_tenant_id uuid,
  p_user_id uuid,
  p_meeting_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_meeting record;
  v_relationship jsonb;
  v_club_account jsonb;
begin
  if p_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.user_has_staff_tenant_access(p_tenant_id, p_user_id) then
    raise exception 'workspace_access_denied';
  end if;
  select
    m.id, m.title, m.starts_at, m.ends_at, m.timezone,
    m.provider, m.meeting_url, m.status,
    m.person_id, p.full_name as person_name,
    m.organisation_id, o.name as organisation_name,
    o.country as organisation_country
  into v_meeting
  from djm_os.meetings m
  left join djm_os.people p
    on p.id=m.person_id and p.tenant_id=m.tenant_id
  left join djm_os.organisations o
    on o.id=m.organisation_id and o.tenant_id=m.tenant_id
  where m.id=p_meeting_id
    and m.tenant_id=p_tenant_id
    and m.owner_user_id=p_user_id
    and m.status<>'cancelled'
  limit 1;

  if v_meeting.id is null then
    raise exception 'meeting_not_found';
  end if;

  if v_meeting.person_id is not null then
    v_relationship:=public.platform_server_relationship_person(
      p_tenant_id, v_meeting.person_id
    );
  end if;
  if v_meeting.organisation_id is not null then
    v_club_account:=public.platform_server_club_account(
      p_tenant_id, v_meeting.organisation_id
    );
  end if;

  return jsonb_build_object(
    'contract_version','redream_meeting_autopilot_brief_v1',
    'generated_at',now(),
    'meeting',jsonb_build_object(
      'meeting_id',v_meeting.id,
      'title',v_meeting.title,
      'starts_at',v_meeting.starts_at,
      'ends_at',v_meeting.ends_at,
      'timezone',v_meeting.timezone,
      'provider',v_meeting.provider,
      'meeting_url',v_meeting.meeting_url,
      'status',v_meeting.status,
      'person_id',v_meeting.person_id,
      'person_name',v_meeting.person_name,
      'organisation_id',v_meeting.organisation_id,
      'organisation_name',v_meeting.organisation_name,
      'organisation_country',v_meeting.organisation_country
    ),
    'contact',case when v_relationship is null then null else
      jsonb_build_object(
        'person',v_relationship->'person',
        'reach',v_relationship->'reach',
        'employment',v_relationship->'employment'
      ) end,
    'relationship_memory',case when v_relationship is null then null
      else v_relationship->'relationship_memory' end,
    'club',case when v_club_account is null then null
      else v_club_account->'club' end,
    'demand',case when v_club_account is null then
      jsonb_build_object('active_needs',0,'confirmed_needs',0,'items','[]'::jsonb)
      else v_club_account->'demand' end,
    'commercial',case when v_club_account is null then
      jsonb_build_object('active_deals',0,'by_currency','[]'::jsonb,'deals','[]'::jsonb)
      else v_club_account->'commercial' end,
    'pursuits',case when v_club_account is null then '[]'::jsonb
      else coalesce(v_club_account->'pursuits','[]'::jsonb) end,
    'open_work',case when v_club_account is null then
      jsonb_build_object('tasks','[]'::jsonb,'commitments','[]'::jsonb)
      else v_club_account->'open_work' end,
    'truth_contract',jsonb_build_object(
      'meeting','This brief uses only the signed-in user''s recorded meeting and current tenant evidence.',
      'relationship','Relationship context reflects recorded agency history and may omit offline conversations.',
      'calendar','A scheduled calendar event does not prove that the meeting happened or that anyone attended.',
      'commercial','Club demand, pursuits and commercial work are recorded ReDream evidence. They are not predictions of deal success.'
    )
  );
end;
$function$;

create or replace function public.redream_meeting_brief(p_meeting_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  return public.platform_server_meeting_brief(v_tenant,v_user,p_meeting_id);
end;
$function$;
revoke all on function public.platform_server_meeting_brief(uuid,uuid,uuid)
from public,anon,authenticated;
grant execute on function public.platform_server_meeting_brief(uuid,uuid,uuid)
to postgres,service_role;

revoke all on function public.redream_meeting_brief(uuid)
from public,anon;
grant execute on function public.redream_meeting_brief(uuid)
to authenticated,service_role;

revoke all on function public.djm_network_meeting_brief(uuid)
from public,anon,authenticated;

notify pgrst, 'reload schema';

commit;
