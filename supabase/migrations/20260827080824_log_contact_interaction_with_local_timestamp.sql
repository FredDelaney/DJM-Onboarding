create or replace function public.djm_network_log_contact_interaction_local(
  p_person_id uuid,
  p_channel text,
  p_summary text,
  p_organisation_id uuid default null,
  p_occurred_date date default current_date,
  p_occurred_time time without time zone default localtime,
  p_timezone text default 'Europe/Rome',
  p_create_followup_at timestamptz default null,
  p_followup_title text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_occurred_at timestamptz;
  v_result jsonb;
begin
  if p_occurred_date is null or p_occurred_time is null then
    raise exception 'Conversation date and time are required';
  end if;

  if p_timezone is null or not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then
    raise exception 'Invalid timezone: %', coalesce(p_timezone, 'null');
  end if;

  v_occurred_at := pg_catalog.make_timestamptz(
    extract(year from p_occurred_date)::int,
    extract(month from p_occurred_date)::int,
    extract(day from p_occurred_date)::int,
    extract(hour from p_occurred_time)::int,
    extract(minute from p_occurred_time)::int,
    extract(second from p_occurred_time)::double precision,
    p_timezone
  );

  select public.djm_network_log_contact_interaction(
    p_person_id,
    p_channel,
    p_summary,
    p_organisation_id,
    v_occurred_at,
    p_create_followup_at,
    p_followup_title
  ) into v_result;

  return v_result || pg_catalog.jsonb_build_object(
    'occurred_at', v_occurred_at,
    'occurred_date', p_occurred_date,
    'occurred_time', p_occurred_time,
    'timezone', p_timezone
  );
end
$function$;

revoke all on function public.djm_network_log_contact_interaction_local(uuid,text,text,uuid,date,time without time zone,text,timestamptz,text) from public, anon;
grant execute on function public.djm_network_log_contact_interaction_local(uuid,text,text,uuid,date,time without time zone,text,timestamptz,text) to authenticated;
