create or replace function public.platform_server_customer_go_live_readiness(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
with base as (
  select
    t.id,
    coalesce(
      l.stage,
      case
        when coalesce((t.metadata->>'internal_tenant')::boolean,false)
          then 'internal'
        else 'onboarding'
      end
    ) stage,
    coalesce((t.metadata->>'internal_tenant')::boolean,false) is_internal,
    (
      select count(*)::int
      from platform.tenant_memberships m
      where m.tenant_id=t.id
        and m.status='active'
        and m.role='owner'
    ) owner_count,
    (
      select count(*)::int
      from platform.tenant_owner_invites i
      where i.tenant_id=t.id
        and i.status='pending'
        and i.expires_at>pg_catalog.now()
    ) pending_owner_invites,
    (
      select max(i.first_sent_at)
      from platform.tenant_owner_invites i
      where i.tenant_id=t.id
        and i.status='pending'
        and i.expires_at>pg_catalog.now()
    ) owner_invite_sent_at,
    (
      select max(i.first_opened_at)
      from platform.tenant_owner_invites i
      where i.tenant_id=t.id
        and i.status='pending'
        and i.expires_at>pg_catalog.now()
    ) owner_invite_opened_at,
    (
      select count(*)::int
      from public.players p
      where p.tenant_id=t.id
    ) roster_player_count,
    b.display_name,
    b.short_name,
    b.portal_name,
    b.logo_asset,
    b.compact_logo_asset,
    b.light_logo_asset,
    b.favicon_asset,
    b.primary_color,
    b.secondary_color,
    b.accent_color,
    b.support_email,
    (
      select d.hostname
      from platform.tenant_domains d
      where d.tenant_id=t.id
        and d.is_primary
        and d.status in ('verified','active')
      order by d.verified_at desc nulls last,d.created_at desc
      limit 1
    ) primary_hostname,
    public.platform_server_tenant_privacy_readiness(t.id) privacy_readiness,
    l.go_live_at
  from platform.tenants t
  left join platform.tenant_branding b
    on b.tenant_id=t.id
  left join platform.tenant_customer_lifecycle l
    on l.tenant_id=t.id
  where t.id=p_tenant_id
),
gates as (
  select
    10 priority,
    'owner_access'::text gate_key,
    'Owner access'::text label,
    true required,
    (b.owner_count>0) complete,
    case
      when b.owner_count>0 then 'none'
      when b.pending_owner_invites>0 then 'agency_owner'
      else 'redream'
    end responsible_party,
    case
      when b.owner_count>0
        then 'Owner access is active.'
      when b.pending_owner_invites>0 and b.owner_invite_opened_at is not null
        then 'The owner opened the invitation but has not activated access.'
      when b.pending_owner_invites>0 and b.owner_invite_sent_at is not null
        then 'The owner invitation was sent but has not been accepted.'
      when b.pending_owner_invites>0
        then 'A secure owner invitation exists but still needs to be shared.'
      else 'No active owner or pending owner invitation exists.'
    end reason,
    case
      when b.owner_count>0
        then 'No action required.'
      when b.pending_owner_invites>0 and b.owner_invite_opened_at is not null
        then 'Follow up with the owner and remove any activation blocker.'
      when b.pending_owner_invites>0
        then 'Send or resend the secure owner invitation.'
      else 'Generate a secure owner invitation.'
    end operator_action
  from base b

  union all

  select
    20,
    'brand_identity',
    'Customer-facing brand',
    true,
    (
      nullif(pg_catalog.btrim(b.display_name),'') is not null
      and nullif(pg_catalog.btrim(b.short_name),'') is not null
      and nullif(pg_catalog.btrim(b.portal_name),'') is not null
      and coalesce(b.primary_color ~* '^#[0-9a-f]{6}$',false)
      and coalesce(b.secondary_color ~* '^#[0-9a-f]{6}$',false)
      and coalesce(b.accent_color ~* '^#[0-9a-f]{6}$',false)
      and nullif(pg_catalog.btrim(b.support_email),'') is not null
      and nullif(pg_catalog.btrim(b.logo_asset),'') is not null
      and nullif(pg_catalog.btrim(b.compact_logo_asset),'') is not null
      and nullif(pg_catalog.btrim(b.light_logo_asset),'') is not null
      and nullif(pg_catalog.btrim(b.favicon_asset),'') is not null
      and coalesce(
        (
          (
            pg_catalog.left(pg_catalog.btrim(b.logo_asset),1)='/'
            and pg_catalog.left(pg_catalog.btrim(b.logo_asset),2)<>'//'
          )
          or pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(b.logo_asset),8))='https://'
        )
        and (
          (
            pg_catalog.left(pg_catalog.btrim(b.compact_logo_asset),1)='/'
            and pg_catalog.left(pg_catalog.btrim(b.compact_logo_asset),2)<>'//'
          )
          or pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(b.compact_logo_asset),8))='https://'
        )
        and (
          (
            pg_catalog.left(pg_catalog.btrim(b.light_logo_asset),1)='/'
            and pg_catalog.left(pg_catalog.btrim(b.light_logo_asset),2)<>'//'
          )
          or pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(b.light_logo_asset),8))='https://'
        )
        and (
          (
            pg_catalog.left(pg_catalog.btrim(b.favicon_asset),1)='/'
            and pg_catalog.left(pg_catalog.btrim(b.favicon_asset),2)<>'//'
          )
          or pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(b.favicon_asset),8))='https://'
        ),
        false
      )
    ),
    'redream',
    case
      when nullif(pg_catalog.btrim(b.display_name),'') is null
        or nullif(pg_catalog.btrim(b.short_name),'') is null
        or nullif(pg_catalog.btrim(b.portal_name),'') is null
        then 'The customer-facing workspace identity is incomplete.'
      when not coalesce(
        b.primary_color ~* '^#[0-9a-f]{6}$'
        and b.secondary_color ~* '^#[0-9a-f]{6}$'
        and b.accent_color ~* '^#[0-9a-f]{6}$',
        false
      )
        then 'The workspace brand colours are invalid.'
      when nullif(pg_catalog.btrim(b.support_email),'') is null
        then 'A customer support email is missing.'
      when nullif(pg_catalog.btrim(b.logo_asset),'') is null
        or nullif(pg_catalog.btrim(b.compact_logo_asset),'') is null
        or nullif(pg_catalog.btrim(b.light_logo_asset),'') is null
        or nullif(pg_catalog.btrim(b.favicon_asset),'') is null
        then 'The customer-facing logo or PWA assets are incomplete.'
      when not coalesce(
        (
          (
            pg_catalog.left(pg_catalog.btrim(b.logo_asset),1)='/'
            and pg_catalog.left(pg_catalog.btrim(b.logo_asset),2)<>'//'
          )
          or pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(b.logo_asset),8))='https://'
        )
        and (
          (
            pg_catalog.left(pg_catalog.btrim(b.compact_logo_asset),1)='/'
            and pg_catalog.left(pg_catalog.btrim(b.compact_logo_asset),2)<>'//'
          )
          or pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(b.compact_logo_asset),8))='https://'
        )
        and (
          (
            pg_catalog.left(pg_catalog.btrim(b.light_logo_asset),1)='/'
            and pg_catalog.left(pg_catalog.btrim(b.light_logo_asset),2)<>'//'
          )
          or pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(b.light_logo_asset),8))='https://'
        )
        and (
          (
            pg_catalog.left(pg_catalog.btrim(b.favicon_asset),1)='/'
            and pg_catalog.left(pg_catalog.btrim(b.favicon_asset),2)<>'//'
          )
          or pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(b.favicon_asset),8))='https://'
        ),
        false
      )
        then 'One or more brand assets use an unsafe or unsupported location.'
      else 'The customer-facing brand is configured for launch.'
    end,
    case
      when nullif(pg_catalog.btrim(b.display_name),'') is null
        or nullif(pg_catalog.btrim(b.short_name),'') is null
        or nullif(pg_catalog.btrim(b.portal_name),'') is null
        then 'Complete the agency display, short and portal names.'
      when not coalesce(
        b.primary_color ~* '^#[0-9a-f]{6}$'
        and b.secondary_color ~* '^#[0-9a-f]{6}$'
        and b.accent_color ~* '^#[0-9a-f]{6}$',
        false
      )
        then 'Set valid six-digit hex values for the primary, secondary and accent colours.'
      when nullif(pg_catalog.btrim(b.support_email),'') is null
        then 'Add the agency support email.'
      when nullif(pg_catalog.btrim(b.logo_asset),'') is null
        or nullif(pg_catalog.btrim(b.compact_logo_asset),'') is null
        or nullif(pg_catalog.btrim(b.light_logo_asset),'') is null
        or nullif(pg_catalog.btrim(b.favicon_asset),'') is null
        then 'Upload or assign the primary, compact, light and favicon assets before launch.'
      when not coalesce(
        (
          (
            pg_catalog.left(pg_catalog.btrim(b.logo_asset),1)='/'
            and pg_catalog.left(pg_catalog.btrim(b.logo_asset),2)<>'//'
          )
          or pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(b.logo_asset),8))='https://'
        )
        and (
          (
            pg_catalog.left(pg_catalog.btrim(b.compact_logo_asset),1)='/'
            and pg_catalog.left(pg_catalog.btrim(b.compact_logo_asset),2)<>'//'
          )
          or pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(b.compact_logo_asset),8))='https://'
        )
        and (
          (
            pg_catalog.left(pg_catalog.btrim(b.light_logo_asset),1)='/'
            and pg_catalog.left(pg_catalog.btrim(b.light_logo_asset),2)<>'//'
          )
          or pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(b.light_logo_asset),8))='https://'
        )
        and (
          (
            pg_catalog.left(pg_catalog.btrim(b.favicon_asset),1)='/'
            and pg_catalog.left(pg_catalog.btrim(b.favicon_asset),2)<>'//'
          )
          or pg_catalog.lower(pg_catalog.left(pg_catalog.btrim(b.favicon_asset),8))='https://'
        ),
        false
      )
        then 'Use a local workspace asset path or HTTPS URL for every brand asset.'
      else 'No action required.'
    end
  from base b

  union all

  select
    30,
    'privacy_profile',
    'Privacy and controller identity',
    not b.is_internal,
    (
      b.is_internal
      or coalesce(
        (b.privacy_readiness->>'ready_for_player_invites')::boolean,
        false
      )
    ),
    case when b.is_internal then 'none' else 'agency_owner' end,
    case
      when b.is_internal
        then 'Internal tenant uses the existing internal privacy route.'
      when coalesce(
        (b.privacy_readiness->>'ready_for_player_invites')::boolean,
        false
      )
        then 'The agency controller and current privacy notice are configured.'
      else 'The agency cannot activate external player accounts until its privacy profile is current.'
    end,
    case
      when b.is_internal
        then 'No action required.'
      else 'Ask the agency owner to confirm controller identity and the current player-facing privacy notice, or assist them in ReDream.'
    end
  from base b

  union all

  select
    40,
    'workspace_route',
    'Verified workspace address',
    true,
    (b.primary_hostname is not null),
    'redream',
    case
      when b.primary_hostname is not null
        then 'A verified primary workspace hostname is active.'
      else 'No verified primary workspace hostname is available.'
    end,
    case
      when b.primary_hostname is not null
        then 'No action required.'
      else 'Connect and verify the agency workspace hostname before launch.'
    end
  from base b

  union all

  select
    50,
    'first_player',
    'First player loaded',
    true,
    (b.roster_player_count>0),
    'agency_owner',
    case
      when b.roster_player_count>0
        then 'The agency roster contains at least one player.'
      else 'The agency has no player record yet.'
    end,
    case
      when b.roster_player_count>0
        then 'No action required.'
      else 'Help the agency load its first real player so the workspace has immediate working value.'
    end
  from base b
),
stats as (
  select
    b.*,
    count(*) filter(where g.required)::int required_total,
    count(*) filter(where g.required and g.complete)::int required_complete,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'key',g.gate_key,
          'label',g.label,
          'required',g.required,
          'complete',g.complete,
          'responsible_party',g.responsible_party,
          'reason',g.reason,
          'operator_action',g.operator_action,
          'priority',g.priority
        )
        order by g.priority
      ),
      '[]'::jsonb
    ) gates,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'key',g.gate_key,
          'label',g.label,
          'responsible_party',g.responsible_party,
          'reason',g.reason,
          'operator_action',g.operator_action,
          'priority',g.priority
        )
        order by g.priority
      ) filter(where g.required and not g.complete),
      '[]'::jsonb
    ) blockers,
    (
      select jsonb_build_object(
        'key',g2.gate_key,
        'label',g2.label,
        'responsible_party',g2.responsible_party,
        'reason',g2.reason,
        'operator_action',g2.operator_action,
        'priority',g2.priority
      )
      from gates g2
      where g2.required
        and not g2.complete
      order by g2.priority
      limit 1
    ) next_blocker
  from base b
  cross join gates g
  group by
    b.id,
    b.stage,
    b.is_internal,
    b.owner_count,
    b.pending_owner_invites,
    b.owner_invite_sent_at,
    b.owner_invite_opened_at,
    b.roster_player_count,
    b.display_name,
    b.short_name,
    b.portal_name,
    b.logo_asset,
    b.compact_logo_asset,
    b.light_logo_asset,
    b.favicon_asset,
    b.primary_color,
    b.secondary_color,
    b.accent_color,
    b.support_email,
    b.primary_hostname,
    b.privacy_readiness,
    b.go_live_at
)
select jsonb_build_object(
  'ready',(required_total=required_complete),
  'status',
    case
      when required_total=required_complete then 'ready'
      else 'blocked'
    end,
  'readiness_pct',
    case
      when required_total=0 then 100
      else round(
        (required_complete::numeric/required_total::numeric)*100
      )::int
    end,
  'required_total',required_total,
  'required_complete',required_complete,
  'blocker_count',jsonb_array_length(blockers),
  'next_blocker',next_blocker,
  'gates',gates,
  'blockers',blockers,
  'primary_hostname',primary_hostname,
  'go_live_at',go_live_at
)
from stats;
$function$;
