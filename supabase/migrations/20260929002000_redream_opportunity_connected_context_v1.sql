begin;

create or replace function private.redream_latest_connected_contact(
  p_tenant_id uuid,
  p_person_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select
    case
      when i.id is null then null
      else jsonb_build_object(
        'interaction_id',i.id,
        'channel',i.channel,
        'direction',i.direction,
        'summary',i.summary,
        'occurred_at',i.occurred_at,
        'person_id',i.person_id,
        'person_name',p.full_name,
        'organisation_id',i.organisation_id,
        'organisation_name',o.name,
        'owner_user_id',i.team_member_id,
        'owner_name',coalesce(
          nullif(trim(tm.display_name),''),
          case
            when membership.user_id is not null
              then 'Agency member'
            else null
          end
        ),
        'owner_state',
          case
            when i.team_member_id is null
              then 'unassigned'
            when membership.user_id is not null
              then 'active_staff'
            else 'inactive_or_invalid_staff'
          end
      )
    end
  from (select 1) seed
  left join lateral (
    select ix.*
    from djm_os.interactions ix
    where ix.tenant_id=p_tenant_id
      and ix.person_id=p_person_id
      and ix.channel in (
        'google_email',
        'microsoft_email',
        'instagram_selected_chat',
        'whatsapp_selected_chat'
      )
    order by ix.occurred_at desc,ix.created_at desc
    limit 1
  ) i on true
  left join djm_os.people p
    on p.id=i.person_id
   and p.tenant_id=p_tenant_id
  left join djm_os.organisations o
    on o.id=i.organisation_id
   and o.tenant_id=p_tenant_id
  left join platform.tenant_memberships membership
    on membership.tenant_id=p_tenant_id
   and membership.user_id=i.team_member_id
   and membership.status='active'
   and membership.role in (
     'owner',
     'admin',
     'agent',
     'operations',
     'scout'
   )
  left join djm_os.team_members tm
    on tm.user_id=membership.user_id
   and tm.is_active;
$function$;

revoke all on function
  private.redream_latest_connected_contact(uuid,uuid)
from public,anon,authenticated;
create or replace function private.redream_need_connected_followup(
  p_tenant_id uuid,
  p_club_need_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path=''
as $function$
  select
    case
      when t.id is null then null
      else jsonb_build_object(
        'task_id',t.id,
        'title',t.title,
        'due_at',t.due_at,
        'priority',t.priority,
        'owner_user_id',t.owner_user_id,
        'owner_name',coalesce(
          nullif(trim(tm.display_name),''),
          case
            when membership.user_id is not null
              then 'Agency member'
            else null
          end
        ),
        'owner_state',
          case
            when t.owner_user_id is null
              then 'unassigned'
            when membership.user_id is not null
              then 'active_staff'
            else 'inactive_or_invalid_staff'
          end
      )
    end
  from (select 1) seed
  left join lateral (
    select tx.*
    from djm_os.tasks tx
    where tx.tenant_id=p_tenant_id
      and tx.club_need_id=p_club_need_id
      and tx.status not in (
        'done','completed','cancelled'
      )
    order by tx.due_at nulls last,tx.created_at desc
    limit 1
  ) t on true
  left join platform.tenant_memberships membership
    on membership.tenant_id=p_tenant_id
   and membership.user_id=t.owner_user_id
   and membership.status='active'
   and membership.role in (
     'owner',
     'admin',
     'agent',
     'operations',
     'scout'
   )
  left join djm_os.team_members tm
    on tm.user_id=membership.user_id
   and tm.is_active;
$function$;

revoke all on function
  private.redream_need_connected_followup(uuid,uuid)
from public,anon,authenticated;
create or replace function public.platform_server_opportunity_connected_context(
  p_tenant_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,100),250));
  v_needs jsonb:='[]'::jsonb;
  v_routes jsonb:='[]'::jsonb;
  v_deals jsonb:='[]'::jsonb;
begin
  if not exists(
    select 1
    from platform.tenants t
    where t.id=p_tenant_id
      and t.status='active'
  ) then
    raise exception 'tenant_not_found';
  end if;

  select coalesce(
    jsonb_agg(item order by updated_at desc),
    '[]'::jsonb
  )
  into v_needs
  from (
    select
      jsonb_build_object(
        'club_need_id',cn.id,
        'scope','need_source_contact',
        'source_person_id',cn.source_person_id,
        'source_person_name',p.full_name,
        'latest_contact',
          private.redream_latest_connected_contact(
            p_tenant_id,
            cn.source_person_id
          ),
        'open_followup',
          private.redream_need_connected_followup(
            p_tenant_id,
            cn.id
          ),
        'need_owner_user_id',cn.owner_user_id,
        'need_owner_name',coalesce(
          nullif(trim(tm.display_name),''),
          case
            when cn.owner_user_id is not null
              then 'Agency member'
            else null
          end
        )
      ) as item,
      cn.updated_at
    from djm_os.club_needs cn
    left join djm_os.people p
      on p.id=cn.source_person_id
     and p.tenant_id=cn.tenant_id
    left join djm_os.team_members tm
      on tm.user_id=cn.owner_user_id
     and tm.is_active
    where cn.tenant_id=p_tenant_id
      and cn.status in ('active','confirmed')
      and cn.source_person_id is not null
    order by cn.updated_at desc
    limit v_limit
  ) q;
  select coalesce(
    jsonb_agg(item order by updated_at desc),
    '[]'::jsonb
  )
  into v_routes
  from (
    select
      jsonb_build_object(
        'player_match_id',pm.id,
        'club_need_id',pm.club_need_id,
        'scope','need_source_contact',
        'source_person_id',cn.source_person_id,
        'source_person_name',p.full_name,
        'latest_contact',
          private.redream_latest_connected_contact(
            p_tenant_id,
            cn.source_person_id
          )
      ) as item,
      pm.updated_at
    from djm_os.player_matches pm
    join djm_os.club_needs cn
      on cn.id=pm.club_need_id
     and cn.tenant_id=pm.tenant_id
    left join djm_os.people p
      on p.id=cn.source_person_id
     and p.tenant_id=cn.tenant_id
    where pm.tenant_id=p_tenant_id
      and pm.status not in ('rejected','closed','withdrawn')
      and cn.source_person_id is not null
    order by pm.updated_at desc
    limit v_limit
  ) q;

  select coalesce(
    jsonb_agg(item order by updated_at desc),
    '[]'::jsonb
  )
  into v_deals
  from (
    select
      jsonb_build_object(
        'deal_room_id',d.id,
        'scope',
          case
            when d.source_person_id is not null
              then 'deal_source_contact'
            when cn.source_person_id is not null
              then 'need_source_contact'
            else null
          end,
        'source_person_id',
          coalesce(
            d.source_person_id,
            cn.source_person_id
          ),
        'source_person_name',p.full_name,
        'latest_contact',
          private.redream_latest_connected_contact(
            p_tenant_id,
            coalesce(
              d.source_person_id,
              cn.source_person_id
            )
          ),
        'deal_owner_user_id',d.owner_user_id,
        'deal_owner_name',coalesce(
          nullif(trim(owner_tm.display_name),''),
          case
            when d.owner_user_id is not null
              then 'Agency member'
            else null
          end
        )
      ) as item,
      d.updated_at
    from djm_os.deal_rooms d
    left join djm_os.club_needs cn
      on cn.id=d.club_need_id
     and cn.tenant_id=d.tenant_id
    left join djm_os.people p
      on p.id=coalesce(
        d.source_person_id,
        cn.source_person_id
      )
     and p.tenant_id=d.tenant_id
    left join djm_os.team_members owner_tm
      on owner_tm.user_id=d.owner_user_id
     and owner_tm.is_active
    where d.tenant_id=p_tenant_id
      and d.status='active'
      and coalesce(
        d.source_person_id,
        cn.source_person_id
      ) is not null
    order by d.updated_at desc
    limit v_limit
  ) q;
  return jsonb_build_object(
    'contract_version',
      'redream_opportunity_connected_context_v1',
    'generated_at',now(),
    'needs',v_needs,
    'routes',v_routes,
    'deals',v_deals,
    'truth_contract',jsonb_build_object(
      'need_scope',
        'Club-need communication is anchored to the recorded source person for that need.',
      'route_scope',
        'Player-route communication reflects the source contact for the underlying club need, not proof that the player was discussed.',
      'deal_scope',
        'Deal communication uses the recorded deal source person, falling back only to the linked club-need source person.',
      'absence',
        'No connected context is shown when there is no defensible source person.',
      'ownership',
        'Communication owner and opportunity owner remain separate recorded facts.',
      'external_action',
        'Connected context never sends an external message automatically.'
    )
  );
end;
$function$;

create or replace function public.redream_opportunity_connected_context(
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  if not private.user_has_staff_tenant_access(
    v_tenant,
    v_user
  ) then
    raise exception 'workspace_access_denied';
  end if;

  return public.platform_server_opportunity_connected_context(
    v_tenant,
    p_limit
  );
end;
$function$;
revoke all on function
  public.platform_server_opportunity_connected_context(uuid,integer)
from public,anon,authenticated;

grant execute on function
  public.platform_server_opportunity_connected_context(uuid,integer)
to postgres,service_role;

revoke all on function
  public.redream_opportunity_connected_context(integer)
from public,anon;

grant execute on function
  public.redream_opportunity_connected_context(integer)
to authenticated,service_role;

notify pgrst,'reload schema';

commit;
