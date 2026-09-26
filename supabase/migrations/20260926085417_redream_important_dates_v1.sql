create or replace function public.redream_autopilot_operations(
  p_horizon_days integer default 90,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_horizon integer := greatest(1,least(coalesce(p_horizon_days,90),366));
  v_limit integer := greatest(1,least(coalesce(p_limit,30),100));
  v_tenant uuid := private.redream_request_tenant();
  v_deadlines jsonb;
  v_birthdays jsonb;
  v_capacity jsonb;
  v_receivables jsonb;
  v_renewals jsonb;
  v_roi jsonb;
  v_learning jsonb;
begin
  v_deadlines := public.platform_server_execution_deadline_command(
    v_tenant,
    v_horizon,
    v_limit
  );

  with birthday_base as (
    select
      p.id as player_id,
      coalesce(
        nullif(trim(p.preferred_name),''),
        nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
        'Player'
      ) as player_name,
      p.date_of_birth,
      extract(year from current_date)::integer as current_year
    from public.players p
    where p.tenant_id=v_tenant
      and p.date_of_birth is not null
      and coalesce(p.football_status,'active') not in ('retired','inactive')
  ),
  birthday_this_year as (
    select
      b.*,
      case
        when extract(month from b.date_of_birth)=2
          and extract(day from b.date_of_birth)=29
          and not (
            b.current_year%400=0
            or (b.current_year%4=0 and b.current_year%100<>0)
          )
          then make_date(b.current_year,2,28)
        else make_date(
          b.current_year,
          extract(month from b.date_of_birth)::integer,
          extract(day from b.date_of_birth)::integer
        )
      end as this_birthday
    from birthday_base b
  ),
  birthday_next as (
    select
      b.*,
      case
        when b.this_birthday>=current_date
          then b.this_birthday
        when extract(month from b.date_of_birth)=2
          and extract(day from b.date_of_birth)=29
          and not (
            (b.current_year+1)%400=0
            or (
              (b.current_year+1)%4=0
              and (b.current_year+1)%100<>0
            )
          )
          then make_date(b.current_year+1,2,28)
        else make_date(
          b.current_year+1,
          extract(month from b.date_of_birth)::integer,
          extract(day from b.date_of_birth)::integer
        )
      end as next_birthday
    from birthday_this_year b
  ),
  bounded_birthdays as (
    select
      b.player_id,
      b.player_name,
      b.date_of_birth,
      b.next_birthday,
      (
        extract(year from b.next_birthday)::integer
        - extract(year from b.date_of_birth)::integer
      ) as turns_age,
      (b.next_birthday-current_date)::integer as days_until,
      case
        when b.next_birthday=current_date then 'today'
        when b.next_birthday<=current_date+7 then 'next_7_days'
        when b.next_birthday<=current_date+30 then 'next_30_days'
        else 'later_in_horizon'
      end as date_state
    from birthday_next b
    where b.next_birthday between current_date
      and current_date+v_horizon
  )
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'birthdays_in_horizon',count(*)::integer,
      'today',count(*) filter(where date_state='today')::integer,
      'next_7_days',count(*) filter(
        where next_birthday<=current_date+7
      )::integer,
      'next_30_days',count(*) filter(
        where next_birthday<=current_date+30
      )::integer
    ),
    'items',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'item_id',
          player_id::text||':birthday:'||
            extract(year from next_birthday)::integer::text,
          'date_type','birthday',
          'date_at',next_birthday,
          'date_only',true,
          'date_state',date_state,
          'days_until',days_until,
          'player_id',player_id,
          'player_name',player_name,
          'turns_age',turns_age,
          'title',player_name||'''s birthday',
          'detail','Turns '||turns_age::text,
          'destination',jsonb_build_object(
            'view','players',
            'player_id',player_id,
            'label','Open player'
          )
        )
        order by next_birthday,player_name
      ),
      '[]'::jsonb
    ),
    'truth_contract',jsonb_build_object(
      'source',
      'Birthdays are calculated only from the recorded player date of birth.',
      'leap_day',
      'A 29 February birthday is shown on 28 February in a non-leap year.',
      'action',
      'A birthday is a relationship moment, not a contractual deadline or automatic outreach instruction.'
    )
  )
  into v_birthdays
  from bounded_birthdays;

  v_capacity := public.platform_server_team_capacity(v_tenant);
  v_receivables := public.platform_server_receivables_command(
    v_tenant,
    v_horizon,
    v_limit
  );
  v_renewals := public.platform_server_representation_renewal_command(
    v_tenant,
    least(greatest(v_horizon,30),365),
    v_limit
  );
  v_roi := public.platform_server_agency_roi_proof(v_tenant,30);
  v_learning := public.platform_server_learning_center(v_tenant);

  return jsonb_build_object(
    'contract_version','redream_operations_autopilot_v2',
    'generated_at',now(),
    'deadlines',v_deadlines,
    'important_dates',jsonb_build_object(
      'birthdays',v_birthdays
    ),
    'team_capacity',v_capacity,
    'receivables',v_receivables,
    'representation_renewal',v_renewals,
    'value_proof',v_roi,
    'learning',jsonb_build_object(
      'maturity_state',v_learning->>'maturity_state',
      'next_learning_action',v_learning->'next_learning_action',
      'data_flywheel',v_learning->'data_flywheel'
    )
  );
end;
$function$;

revoke all on function public.redream_autopilot_operations(
  integer,
  integer
) from public,anon;

grant execute on function public.redream_autopilot_operations(
  integer,
  integer
) to authenticated,service_role;
