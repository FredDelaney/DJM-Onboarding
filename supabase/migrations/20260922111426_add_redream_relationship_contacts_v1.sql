begin;

create or replace function public.platform_server_relationship_contacts(
  p_tenant_id uuid,
  p_limit integer default 250,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_limit integer :=
    greatest(1, least(coalesce(p_limit, 250), 500));

  v_search text :=
    nullif(lower(trim(coalesce(p_search, ''))), '');

  v_items jsonb;
  v_total integer := 0;
  v_live_business integer := 0;
  v_confirmed_demand integer := 0;
  v_strong_direct integer := 0;
  v_follow_up integer := 0;
begin
  if not exists (
    select 1
    from platform.tenants t
    where t.id = p_tenant_id
      and t.status = 'active'
  ) then
    raise exception 'tenant_not_found';
  end if;

  with current_employment_ranked as (
    select
      e.person_id,
      e.organisation_id,
      e.role_title,
      e.department,
      e.started_on,
      e.last_verified_at,
      row_number() over (
        partition by e.person_id
        order by
          e.started_on desc nulls last,
          e.updated_at desc,
          e.id
      ) as rn
    from djm_os.employments e
    where e.tenant_id = p_tenant_id
      and e.is_current = true
  ),
  current_employment as (
    select
      person_id,
      organisation_id,
      role_title,
      department,
      started_on,
      last_verified_at
    from current_employment_ranked
    where rn = 1
  ),
  interaction_facts as (
    select
      i.person_id,
      max(i.occurred_at) as last_interaction_at,
      count(*) filter (
        where i.occurred_at >= now() - interval '30 days'
      )::integer as interactions_30d,
      count(*) filter (
        where i.occurred_at >= now() - interval '180 days'
      )::integer as interactions_180d
    from djm_os.interactions i
    where i.tenant_id = p_tenant_id
      and i.person_id is not null
    group by i.person_id
  ),
  relationship_candidates as (
    select
      r.person_id,
      r.team_member_id,
      tm.display_name as relationship_owner_name,
      coalesce(r.strength_score, 0)::integer as strength_score,
      coalesce(r.access_score, 0)::integer as access_score,
      coalesce(r.trust_score, 0)::integer as trust_score,
      greatest(
        r.last_meaningful_at,
        ix.last_interaction_at
      ) as last_meaningful_at,
      round(
        coalesce(r.strength_score, 0)::numeric * 0.30 +
        coalesce(r.access_score, 0)::numeric * 0.25 +
        coalesce(r.trust_score, 0)::numeric * 0.20 +
        platform.access_recency_score(
          greatest(
            r.last_meaningful_at,
            ix.last_interaction_at
          )
        )::numeric * 0.15 +
        platform.access_role_relevance(
          ce.role_title
        )::numeric * 0.10
      )::integer as route_score,
      row_number() over (
        partition by r.person_id
        order by
          round(
            coalesce(r.strength_score, 0)::numeric * 0.30 +
            coalesce(r.access_score, 0)::numeric * 0.25 +
            coalesce(r.trust_score, 0)::numeric * 0.20 +
            platform.access_recency_score(
              greatest(
                r.last_meaningful_at,
                ix.last_interaction_at
              )
            )::numeric * 0.15 +
            platform.access_role_relevance(
              ce.role_title
            )::numeric * 0.10
          ) desc,
          greatest(
            r.last_meaningful_at,
            ix.last_interaction_at
          ) desc nulls last,
          r.updated_at desc
      ) as rn
    from djm_os.relationships r
    join platform.tenant_memberships membership
      on membership.tenant_id = p_tenant_id
     and membership.user_id = r.team_member_id
     and membership.status = 'active'
     and membership.role in (
       'owner',
       'admin',
       'agent',
       'scout',
       'operations'
     )
    left join djm_os.team_members tm
      on tm.user_id = r.team_member_id
    left join current_employment ce
      on ce.person_id = r.person_id
    left join interaction_facts ix
      on ix.person_id = r.person_id
    where r.tenant_id = p_tenant_id
  ),
  best_relationship as (
    select
      person_id,
      team_member_id,
      relationship_owner_name,
      strength_score,
      access_score,
      trust_score,
      last_meaningful_at,
      route_score
    from relationship_candidates
    where rn = 1
  ),
  need_facts as (
    select
      n.organisation_id,
      count(*) filter (
        where n.status in ('active', 'open', 'confirmed')
      )::integer as active_needs,
      count(*) filter (
        where n.status in ('active', 'open', 'confirmed')
          and (
            n.need_type = 'confirmed'
            or n.status = 'confirmed'
          )
      )::integer as confirmed_needs,
      min(n.expires_at) filter (
        where n.status in ('active', 'open', 'confirmed')
          and n.expires_at is not null
      ) as earliest_expiry
    from djm_os.club_needs n
    where n.tenant_id = p_tenant_id
      and n.organisation_id is not null
    group by n.organisation_id
  ),
  deal_facts as (
    select
      d.organisation_id,
      count(*) filter (
        where d.status = 'active'
      )::integer as active_deals,
      count(*) filter (
        where d.status = 'active'
          and (
            d.next_action_at is null
            or d.next_action_at < now()
          )
      )::integer as deals_needing_action
    from djm_os.deal_rooms d
    where d.tenant_id = p_tenant_id
      and d.organisation_id is not null
    group by d.organisation_id
  ),
  task_facts as (
    select
      t.person_id,
      count(*) filter (
        where t.status not in (
          'done',
          'completed',
          'cancelled'
        )
      )::integer as open_tasks,
      count(*) filter (
        where t.status not in (
          'done',
          'completed',
          'cancelled'
        )
          and t.due_at is not null
          and t.due_at < now()
      )::integer as overdue_tasks,
      min(t.due_at) filter (
        where t.status not in (
          'done',
          'completed',
          'cancelled'
        )
          and t.due_at is not null
      ) as next_task_due
    from djm_os.tasks t
    where t.tenant_id = p_tenant_id
      and t.person_id is not null
    group by t.person_id
  ),
  contact_rows as (
    select
      p.id as person_id,
      p.full_name,
      p.preferred_name,
      p.person_type,
      p.country as person_country,
      p.city as person_city,
      p.photo_url,
      p.linkedin_url,

      ce.role_title,
      ce.department,

      o.id as organisation_id,
      o.name as organisation_name,
      o.country as organisation_country,
      o.city as organisation_city,
      o.league_name,

      br.team_member_id as relationship_owner_user_id,
      br.relationship_owner_name,
      coalesce(br.strength_score, 0) as strength_score,
      coalesce(br.access_score, 0) as access_score,
      coalesce(br.trust_score, 0) as trust_score,
      coalesce(br.route_score, 0) as route_score,
      br.last_meaningful_at,

      ix.last_interaction_at,
      coalesce(ix.interactions_30d, 0) as interactions_30d,
      coalesce(ix.interactions_180d, 0) as interactions_180d,

      coalesce(nf.active_needs, 0) as active_needs,
      coalesce(nf.confirmed_needs, 0) as confirmed_needs,
      nf.earliest_expiry,

      coalesce(df.active_deals, 0) as active_deals,
      coalesce(
        df.deals_needing_action,
        0
      ) as deals_needing_action,

      coalesce(tf.open_tasks, 0) as open_tasks,
      coalesce(tf.overdue_tasks, 0) as overdue_tasks,
      tf.next_task_due,

      whatsapp.value as whatsapp,
      email.value as email,

      case
        when coalesce(df.active_deals, 0) > 0
          and coalesce(tf.open_tasks, 0) > 0
          then 'protect_live_business'
        when coalesce(df.active_deals, 0) > 0
          then 'live_business'
        when coalesce(nf.confirmed_needs, 0) > 0
          then 'confirmed_demand'
        when coalesce(nf.active_needs, 0) > 0
          then 'live_demand'
        when coalesce(br.route_score, 0) >= 75
          then 'strong_relationship'
        when ix.last_interaction_at >=
          now() - interval '90 days'
          then 'active_relationship'
        else 'relationship_development'
      end as operating_state
    from djm_os.people p
    join current_employment ce
      on ce.person_id = p.id
    join djm_os.organisations o
      on o.id = ce.organisation_id
     and o.tenant_id = p_tenant_id
    left join best_relationship br
      on br.person_id = p.id
    left join interaction_facts ix
      on ix.person_id = p.id
    left join need_facts nf
      on nf.organisation_id = o.id
    left join deal_facts df
      on df.organisation_id = o.id
    left join task_facts tf
      on tf.person_id = p.id
    left join lateral (
      select cm.value
      from djm_os.contact_methods cm
      where cm.tenant_id = p_tenant_id
        and cm.person_id = p.id
        and cm.channel = 'whatsapp'
      order by
        cm.is_primary desc,
        cm.is_verified desc nulls last,
        cm.updated_at desc
      limit 1
    ) whatsapp on true
    left join lateral (
      select cm.value
      from djm_os.contact_methods cm
      where cm.tenant_id = p_tenant_id
        and cm.person_id = p.id
        and cm.channel = 'email'
      order by
        cm.is_primary desc,
        cm.is_verified desc nulls last,
        cm.updated_at desc
      limit 1
    ) email on true
    where p.tenant_id = p_tenant_id
      and (
        o.organisation_type = 'club'
        or p.person_type = 'club_contact'
      )
      and (
        v_search is null
        or lower(
          concat_ws(
            ' ',
            p.full_name,
            p.preferred_name,
            ce.role_title,
            ce.department,
            o.name,
            o.country,
            o.city,
            p.country,
            p.city
          )
        ) like '%' || v_search || '%'
      )
  ),
  ranked as (
    select
      contact_rows.*,
      row_number() over (
        order by
          case operating_state
            when 'protect_live_business' then 1
            when 'live_business' then 2
            when 'confirmed_demand' then 3
            when 'live_demand' then 4
            when 'strong_relationship' then 5
            when 'active_relationship' then 6
            else 7
          end,
          overdue_tasks desc,
          active_deals desc,
          confirmed_needs desc,
          route_score desc,
          last_interaction_at desc nulls last,
          full_name
      ) as contact_rank
    from contact_rows
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'rank',
          contact_rank,

          'person_id',
          person_id,

          'person',
          jsonb_build_object(
            'full_name',
            full_name,
            'preferred_name',
            preferred_name,
            'person_type',
            person_type,
            'country',
            person_country,
            'city',
            person_city,
            'photo_url',
            photo_url,
            'linkedin_url',
            linkedin_url
          ),

          'employment',
          jsonb_build_object(
            'organisation_id',
            organisation_id,
            'organisation_name',
            organisation_name,
            'role_title',
            role_title,
            'department',
            department,
            'organisation_country',
            organisation_country,
            'organisation_city',
            organisation_city,
            'league_name',
            league_name
          ),

          'contact',
          jsonb_build_object(
            'whatsapp',
            whatsapp,
            'email',
            email
          ),

          'relationship',
          jsonb_build_object(
            'owner_user_id',
            relationship_owner_user_id,
            'owner_name',
            relationship_owner_name,
            'strength_score',
            strength_score,
            'access_score',
            access_score,
            'trust_score',
            trust_score,
            'route_score',
            route_score,
            'route_state',
            case
              when relationship_owner_user_id is null
                then 'not_recorded'
              when route_score >= 75
                then 'warm'
              when route_score >= 60
                then 'usable'
              when route_score >= 45
                then 'developing'
              else 'cold'
            end,
            'last_meaningful_at',
            last_meaningful_at
          ),

          'activity',
          jsonb_build_object(
            'last_interaction_at',
            last_interaction_at,
            'interactions_30d',
            interactions_30d,
            'interactions_180d',
            interactions_180d
          ),

          'club_context',
          jsonb_build_object(
            'active_deals',
            active_deals,
            'deals_needing_action',
            deals_needing_action,
            'active_needs',
            active_needs,
            'confirmed_needs',
            confirmed_needs,
            'earliest_need_expiry',
            earliest_expiry
          ),

          'work',
          jsonb_build_object(
            'open_tasks',
            open_tasks,
            'overdue_tasks',
            overdue_tasks,
            'next_task_due',
            next_task_due
          ),

          'operating_state',
          operating_state
        )
        order by contact_rank
      ) filter (
        where contact_rank <= v_limit
      ),
      '[]'::jsonb
    ),

    count(*)::integer,

    count(*) filter (
      where active_deals > 0
    )::integer,

    count(*) filter (
      where confirmed_needs > 0
    )::integer,

    count(*) filter (
      where route_score >= 75
    )::integer,

    count(*) filter (
      where open_tasks > 0
    )::integer
  into
    v_items,
    v_total,
    v_live_business,
    v_confirmed_demand,
    v_strong_direct,
    v_follow_up
  from ranked;

  return jsonb_build_object(
    'available',
    true,

    'tenant_id',
    p_tenant_id,

    'generated_at',
    now(),

    'summary',
    jsonb_build_object(
      'club_contacts',
      v_total,

      'visible_contacts',
      jsonb_array_length(v_items),

      'hidden_by_limit',
      greatest(
        v_total - jsonb_array_length(v_items),
        0
      ),

      'contacts_at_live_business_clubs',
      v_live_business,

      'contacts_at_confirmed_demand_clubs',
      v_confirmed_demand,

      'strong_recorded_direct_relationships',
      v_strong_direct,

      'contacts_with_open_follow_up',
      v_follow_up
    ),

    'contacts',
    v_items,

    'truth_contract',
    jsonb_build_object(
      'relationship',
      'Relationship scores describe recorded agency evidence. They are not predictions of influence, response or deal success.',

      'activity',
      'Interaction recency reflects activity recorded in the agency. Offline conversations that were not captured remain invisible.',

      'club_context',
      'Live deals and club needs explain current commercial relevance. They do not imply that every contact at the club is involved in that business.',

      'ownership',
      'Relationship ownership identifies the strongest recorded agency route to the contact. It does not assign exclusive ownership of the person.'
    )
  );
end;
$function$;

revoke all on function
  public.platform_server_relationship_contacts(
    uuid,
    integer,
    text
  )
from public, anon, authenticated;

grant execute on function
  public.platform_server_relationship_contacts(
    uuid,
    integer,
    text
  )
to service_role;


create or replace function public.redream_autopilot_relationships(
  p_limit integer default 100,
  p_contact_limit integer default 250
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_tenant uuid :=
    private.redream_request_tenant();

  v_clubs jsonb;
  v_contacts jsonb;
begin
  v_clubs :=
    public.redream_autopilot_clubs(
      greatest(
        1,
        least(
          coalesce(p_limit, 100),
          100
        )
      )
    );

  v_contacts :=
    public.platform_server_relationship_contacts(
      v_tenant,
      greatest(
        1,
        least(
          coalesce(p_contact_limit, 250),
          500
        )
      ),
      null
    );

  return jsonb_build_object(
    'contract_version',
    'redream_relationship_autopilot_v1',

    'generated_at',
    now(),

    'next_club_action',
    v_clubs->'next_club_action',

    'portfolio',
    v_clubs->'portfolio',

    'accounts',
    v_clubs->'accounts',

    'contacts',
    jsonb_build_object(
      'summary',
      coalesce(
        v_contacts->'summary',
        '{}'::jsonb
      ),

      'items',
      coalesce(
        v_contacts->'contacts',
        '[]'::jsonb
      )
    ),

    'truth_contract',
    coalesce(
      v_clubs->'truth_contract',
      '{}'::jsonb
    ) ||
    jsonb_build_object(
      'contacts',
      'People are ranked by current recorded commercial context, follow-up, direct relationship evidence and interaction recency. This is operating priority, not predicted influence or response probability.'
    )
  );
end;
$function$;

revoke all on function
  public.redream_autopilot_relationships(
    integer,
    integer
  )
from public, anon;

grant execute on function
  public.redream_autopilot_relationships(
    integer,
    integer
  )
to authenticated, service_role;

comment on function
  public.platform_server_relationship_contacts(
    uuid,
    integer,
    text
  )
is
  'Tenant-scoped relationship contact operating read model. Combines canonical people, club employment, recorded agency relationship evidence, interactions, contact methods, live club demand, deals and follow-up without predicting influence or outcomes.';

comment on function
  public.redream_autopilot_relationships(
    integer,
    integer
  )
is
  'Authenticated tenant-native Relationships workspace contract combining club accounts and club contacts.';

commit;
