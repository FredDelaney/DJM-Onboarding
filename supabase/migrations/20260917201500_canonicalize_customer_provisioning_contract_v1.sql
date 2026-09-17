drop function if exists public.platform_server_provision_customer(
  text,text,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb,uuid,text,integer
);

drop function if exists public.platform_server_provision_customer(
  text,text,text,text,text,text,text,text,uuid,jsonb,jsonb,jsonb,uuid,text,integer,text
);

drop function if exists public.platform_server_seed_customer_lifecycle(
  uuid,text,integer
);

drop function if exists public.platform_server_seed_customer_lifecycle(
  uuid,text,integer,text
);


create function public.platform_server_seed_customer_lifecycle(
  p_tenant_id uuid,
  p_stage text,
  p_trial_days integer,
  p_owner_contact_email text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_tenant platform.tenants%rowtype;
  v_stage text;
  v_trial_days integer := coalesce(p_trial_days,14);
  v_is_internal boolean := false;
  v_is_synthetic boolean := false;
  v_ai_required boolean := false;
  v_billing_required boolean := true;
  v_owner_email text :=
    nullif(pg_catalog.lower(pg_catalog.btrim(p_owner_contact_email)),'');
begin
  select *
  into v_tenant
  from platform.tenants
  where id=p_tenant_id;

  if not found then
    raise exception 'tenant_not_found';
  end if;

  if v_trial_days not between 1 and 90 then
    raise exception 'invalid_trial_days';
  end if;

  v_is_internal :=
    coalesce((v_tenant.metadata->>'internal_tenant')::boolean,false);

  v_is_synthetic :=
    coalesce((v_tenant.metadata->>'synthetic_test_tenant')::boolean,false);

  v_stage := coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_stage)),''),
    case
      when v_is_internal then 'internal'
      when v_is_synthetic then 'demo'
      else 'onboarding'
    end
  );

  if v_stage not in (
    'internal',
    'demo',
    'trial',
    'onboarding',
    'live',
    'at_risk',
    'paused',
    'churned'
  ) then
    raise exception 'invalid_customer_stage';
  end if;

  select exists (
    select 1
    from platform.tenant_plan_assignments pa
    join platform.plan_features pf
      on pf.plan_key=pa.plan_key
    where pa.tenant_id=p_tenant_id
      and pa.status='active'
      and pf.feature_key='ai_assistant'
      and pf.enabled
  )
  into v_ai_required;

  select not exists (
    select 1
    from platform.tenant_plan_assignments pa
    where pa.tenant_id=p_tenant_id
      and pa.status='active'
      and pa.billing_mode='internal'
  )
  into v_billing_required;

  insert into platform.tenant_customer_lifecycle(
    tenant_id,
    stage,
    onboarding_status,
    owner_contact_email,
    trial_started_at,
    trial_ends_at,
    founding_customer,
    metadata
  )
  values (
    p_tenant_id,
    v_stage,
    case
      when v_stage='internal' then 'complete'
      else 'not_started'
    end,
    v_owner_email,
    case
      when v_stage='trial' then pg_catalog.now()
      else null
    end,
    case
      when v_stage='trial'
        then pg_catalog.now()+make_interval(days=>v_trial_days)
      else null
    end,
    v_is_internal,
    pg_catalog.jsonb_build_object(
      'seeded_by',
      'platform_server_seed_customer_lifecycle'
    )
  )
  on conflict (tenant_id) do update set
    stage=case
      when p_stage is not null
       and pg_catalog.btrim(p_stage)<>''
        then excluded.stage
      else platform.tenant_customer_lifecycle.stage
    end,
    owner_contact_email=coalesce(
      excluded.owner_contact_email,
      platform.tenant_customer_lifecycle.owner_contact_email
    ),
    trial_started_at=case
      when p_stage='trial'
       and platform.tenant_customer_lifecycle.trial_started_at is null
        then pg_catalog.now()
      else platform.tenant_customer_lifecycle.trial_started_at
    end,
    trial_ends_at=case
      when p_stage='trial'
       and platform.tenant_customer_lifecycle.trial_ends_at is null
        then pg_catalog.now()+make_interval(days=>v_trial_days)
      else platform.tenant_customer_lifecycle.trial_ends_at
    end,
    updated_at=pg_catalog.now();

  insert into platform.tenant_onboarding_tasks(
    tenant_id,
    task_key,
    category,
    title,
    description,
    required,
    sort_order
  )
  select
    p_tenant_id,
    x.task_key,
    x.category,
    x.title,
    x.description,
    x.required,
    x.sort_order
  from (
    values
      (
        'agency_profile',
        'workspace',
        'Agency profile',
        'Confirm the agency identity, workspace name and core settings.',
        true,
        10
      ),
      (
        'branding',
        'branding',
        'Brand the workspace',
        'Add the agency brand, colours, support details and player-facing identity.',
        true,
        20
      ),
      (
        'owner_access',
        'team',
        'Activate an owner or admin',
        'Make sure at least one accountable owner or administrator can access the workspace.',
        true,
        30
      ),
      (
        'privacy_profile',
        'privacy',
        'Configure privacy profile',
        'Set the agency privacy controller identity and the current player-facing privacy notice.',
        not v_is_internal,
        35
      ),
      (
        'player_import',
        'players',
        'Add the first players',
        'Import or create the first active player records.',
        true,
        40
      ),
      (
        'staff_invites',
        'team',
        'Invite the working team',
        'Add the agents, scouts or operations staff who will use the workspace.',
        false,
        50
      ),
      (
        'player_portal',
        'players',
        'Launch the player experience',
        'Connect at least one player to the branded player-facing workspace.',
        true,
        60
      ),
      (
        'first_tell_djm',
        'intelligence',
        'Capture the first Tell DJM update',
        'Prove the AI capture loop with a real agency update.',
        v_ai_required,
        70
      ),
      (
        'first_opportunity',
        'workspace',
        'Create the first opportunity',
        'Create a live player opportunity or club need and put it into the workflow.',
        true,
        80
      ),
      (
        'billing_ready',
        'commercial',
        'Confirm billing',
        'Confirm the billing account and payment route for the customer.',
        v_billing_required,
        90
      ),
      (
        'custom_domain',
        'branding',
        'Connect the custom domain',
        'Verify the agency domain when custom-domain branding is part of the rollout.',
        false,
        100
      )
  ) as x(
    task_key,
    category,
    title,
    description,
    required,
    sort_order
  )
  on conflict (tenant_id,task_key) do update set
    category=excluded.category,
    title=excluded.title,
    description=excluded.description,
    required=excluded.required,
    sort_order=excluded.sort_order,
    updated_at=pg_catalog.now();

  if v_stage='internal' then
    update platform.tenant_onboarding_tasks
    set
      status='waived',
      completed_at=coalesce(completed_at,pg_catalog.now()),
      updated_at=pg_catalog.now()
    where tenant_id=p_tenant_id
      and status not in ('complete','waived');
  end if;

  return pg_catalog.jsonb_build_object(
    'tenant_id',
    p_tenant_id,
    'stage',
    (
      select l.stage
      from platform.tenant_customer_lifecycle l
      where l.tenant_id=p_tenant_id
    ),
    'owner_contact_email',
    (
      select l.owner_contact_email
      from platform.tenant_customer_lifecycle l
      where l.tenant_id=p_tenant_id
    ),
    'task_count',
    (
      select count(*)
      from platform.tenant_onboarding_tasks ot
      where ot.tenant_id=p_tenant_id
    )
  );
end;
$function$;


create function public.platform_server_seed_customer_lifecycle(
  p_tenant_id uuid,
  p_stage text default null,
  p_trial_days integer default 14
)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select public.platform_server_seed_customer_lifecycle(
    p_tenant_id,
    p_stage,
    p_trial_days,
    null::text
  );
$function$;


revoke all on function
  public.platform_server_seed_customer_lifecycle(
    uuid,text,integer,text
  )
from public,anon,authenticated;

revoke all on function
  public.platform_server_seed_customer_lifecycle(
    uuid,text,integer
  )
from public,anon,authenticated;

grant execute on function
  public.platform_server_seed_customer_lifecycle(
    uuid,text,integer,text
  )
to service_role;

grant execute on function
  public.platform_server_seed_customer_lifecycle(
    uuid,text,integer
  )
to service_role;


create function public.platform_server_provision_customer(
  p_slug text,
  p_display_name text,
  p_plan_key text,
  p_hostname text,
  p_domain_type text,
  p_tenant_type text,
  p_legal_name text,
  p_billing_mode text,
  p_owner_user_id uuid,
  p_branding jsonb,
  p_settings jsonb,
  p_metadata jsonb,
  p_actor_user_id uuid,
  p_customer_stage text,
  p_trial_days integer,
  p_owner_contact_email text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_provision jsonb;
  v_tenant_id uuid;
begin
  v_provision :=
    public.platform_server_provision_tenant(
      p_slug,
      p_display_name,
      p_plan_key,
      p_hostname,
      p_domain_type,
      p_tenant_type,
      p_legal_name,
      p_billing_mode,
      p_owner_user_id,
      p_branding,
      p_settings,
      p_metadata,
      p_actor_user_id
    );

  v_tenant_id :=
    (v_provision->>'tenant_id')::uuid;

  perform public.platform_server_seed_customer_lifecycle(
    v_tenant_id,
    p_customer_stage,
    p_trial_days,
    p_owner_contact_email
  );

  return
    v_provision
    || pg_catalog.jsonb_build_object(
      'customer_stage',
      p_customer_stage,
      'owner_contact_email',
      nullif(
        pg_catalog.lower(
          pg_catalog.btrim(p_owner_contact_email)
        ),
        ''
      )
    );
end;
$function$;


revoke all on function
  public.platform_server_provision_customer(
    text,text,text,text,text,text,text,text,
    uuid,jsonb,jsonb,jsonb,uuid,text,integer,text
  )
from public,anon,authenticated;

grant execute on function
  public.platform_server_provision_customer(
    text,text,text,text,text,text,text,text,
    uuid,jsonb,jsonb,jsonb,uuid,text,integer,text
  )
to service_role;
