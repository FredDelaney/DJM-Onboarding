begin;

create or replace function public.platform_server_deal_portfolio_v4(
  p_tenant_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_base jsonb;
  v_deals jsonb:='[]'::jsonb;
  v_item jsonb;
  v_readiness jsonb;
  v_advantage jsonb;
  v_owner_user_id uuid;
  v_owner_name text;
  v_owner_role_title text;
  v_owner_state text;
  v_ready integer:=0;
  v_prepare integer:=0;
  v_strong integer:=0;
  v_exposed integer:=0;
begin
  v_base:=
    public.platform_server_deal_portfolio_v2(
      p_tenant_id,
      p_limit
    );

  for v_item in
    select x.value
    from jsonb_array_elements(
      coalesce(
        v_base->'deals',
        '[]'::jsonb
      )
    ) x
  loop
    v_readiness:=
      public.platform_server_negotiation_readiness(
        p_tenant_id,
        (v_item->>'deal_room_id')::uuid
      );

    v_advantage:=
      public.platform_server_deal_advantage_fast(
        p_tenant_id,
        (v_item->>'deal_room_id')::uuid
      );

    select
      d.owner_user_id,
      coalesce(
        nullif(
          trim(tm.display_name),
          ''
        ),
        case
          when membership.user_id is not null
            then 'Agency member'
          else null
        end
      ),
      coalesce(
        nullif(
          trim(tm.role_title),
          ''
        ),
        case
          when membership.user_id is not null
            then initcap(membership.role)
          else null
        end
      ),
      case
        when d.owner_user_id is null
          then 'unassigned'
        when membership.user_id is not null
          then 'active_staff'
        else 'inactive_or_invalid_staff'
      end
    into
      v_owner_user_id,
      v_owner_name,
      v_owner_role_title,
      v_owner_state
    from djm_os.deal_rooms d
    left join platform.tenant_memberships membership
      on membership.tenant_id=d.tenant_id
     and membership.user_id=d.owner_user_id
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
     and tm.is_active
    where d.id=(v_item->>'deal_room_id')::uuid
      and d.tenant_id=p_tenant_id
    limit 1;
    if coalesce(
      (v_readiness->>'score')::integer,
      0
    )>=80 then
      v_ready:=v_ready+1;
    else
      v_prepare:=v_prepare+1;
    end if;

    if v_advantage->>'state'=
      'strong_operating_position' then
      v_strong:=v_strong+1;
    end if;

    if v_advantage->>'state' in (
      'exposed_but_workable',
      'weak_recorded_position'
    ) then
      v_exposed:=v_exposed+1;
    end if;

    v_deals:=
      v_deals ||
      jsonb_build_array(
        v_item ||
        jsonb_build_object(
          'owner_user_id',
          v_owner_user_id,
          'owner_name',
          v_owner_name,
          'owner_role_title',
          v_owner_role_title,
          'owner_state',
          v_owner_state,
          'negotiation_readiness_score',
          v_readiness->'score',
          'negotiation_readiness_state',
          v_readiness->'state',
          'deal_advantage_score',
          v_advantage->'operating_advantage_score',
          'deal_advantage_state',
          v_advantage->'state',
          'deal_advantage_edges',
          v_advantage->'edges',
          'deal_advantage_exposures',
          v_advantage->'exposures'
        )
      );
  end loop;
  return
    v_base ||
    jsonb_build_object(
      'deals',
      v_deals,
      'summary',
      (v_base->'summary') ||
      jsonb_build_object(
        'negotiation_ready_or_strong_count',
        v_ready,
        'negotiation_preparation_required_count',
        v_prepare,
        'strong_operating_position_count',
        v_strong,
        'exposed_operating_position_count',
        v_exposed
      ),
      'principle',
      'Attention, probability, control, momentum, negotiation preparation, deal advantage and ownership remain separate operating dimensions.',
      'ownership_truth',
      'Deal ownership reflects the recorded accountable active staff member. It is not a performance score.'
    );
end;
$function$;

revoke all on function
  public.platform_server_deal_portfolio_v4(uuid,integer)
from
  public,
  anon,
  authenticated;

grant execute on function
  public.platform_server_deal_portfolio_v4(uuid,integer)
to
  service_role;

commit;
