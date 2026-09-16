create table if not exists platform.agency_command_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  command_id text not null,
  command_type text not null,
  source_type text not null,
  source_id uuid,
  feedback_type text not null,
  snoozed_until timestamptz,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint agency_command_feedback_type_check
    check (feedback_type in ('shown','accepted','dismissed','snoozed','completed','not_relevant')),
  constraint agency_command_feedback_command_id_check
    check (char_length(trim(command_id)) between 3 and 200),
  constraint agency_command_feedback_snooze_check
    check ((feedback_type='snoozed' and snoozed_until is not null) or feedback_type<>'snoozed')
);

alter table platform.agency_command_feedback enable row level security;
revoke all on platform.agency_command_feedback from public, anon, authenticated;

create index if not exists agency_command_feedback_tenant_command_idx
  on platform.agency_command_feedback(tenant_id,command_id,created_at desc);
create index if not exists agency_command_feedback_tenant_type_idx
  on platform.agency_command_feedback(tenant_id,feedback_type,created_at desc);

create or replace function public.platform_server_record_command_feedback(
  p_tenant_id uuid,
  p_command_id text,
  p_command_type text,
  p_source_type text,
  p_source_id uuid,
  p_feedback_type text,
  p_actor_user_id uuid default null,
  p_snoozed_until timestamptz default null,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_feedback text := lower(trim(coalesce(p_feedback_type,'')));
begin
  if not exists (select 1 from platform.tenants t where t.id=p_tenant_id) then raise exception 'tenant_not_found'; end if;
  if trim(coalesce(p_command_id,''))='' then raise exception 'command_id_required'; end if;
  if trim(coalesce(p_command_type,''))='' then raise exception 'command_type_required'; end if;
  if trim(coalesce(p_source_type,''))='' then raise exception 'source_type_required'; end if;
  if v_feedback not in ('shown','accepted','dismissed','snoozed','completed','not_relevant') then raise exception 'invalid_feedback_type'; end if;
  if v_feedback='snoozed' and (p_snoozed_until is null or p_snoozed_until <= now()) then raise exception 'future_snooze_required'; end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object' then raise exception 'metadata_must_be_object'; end if;
  if p_actor_user_id is not null and not exists(select 1 from auth.users u where u.id=p_actor_user_id) then raise exception 'actor_user_not_found'; end if;

  insert into platform.agency_command_feedback(
    tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,snoozed_until,reason,metadata
  ) values (
    p_tenant_id,p_actor_user_id,trim(p_command_id),trim(p_command_type),trim(p_source_type),p_source_id,v_feedback,p_snoozed_until,nullif(trim(coalesce(p_reason,'')),''),coalesce(p_metadata,'{}'::jsonb)
  ) returning id into v_id;

  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata)
  values(
    p_tenant_id,p_actor_user_id,case when p_actor_user_id is null then 'system' else 'user' end,
    'agency_command.feedback','agency_command',p_command_id,
    jsonb_build_object('feedback_type',v_feedback,'command_type',p_command_type,'source_type',p_source_type,'source_id',p_source_id,'snoozed_until',p_snoozed_until),
    jsonb_build_object('feedback_id',v_id)
  );

  return jsonb_build_object('feedback_id',v_id,'feedback_type',v_feedback,'recorded_at',now());
end;
$function$;

revoke all on function public.platform_server_record_command_feedback(uuid,text,text,text,uuid,text,uuid,timestamptz,text,jsonb) from public, anon, authenticated;
grant execute on function public.platform_server_record_command_feedback(uuid,text,text,text,uuid,text,uuid,timestamptz,text,jsonb) to service_role;

create or replace function public.platform_server_command_quality(p_tenant_id uuid,p_window_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_days integer := coalesce(p_window_days,30);
  v_result jsonb;
begin
  if v_days not between 1 and 366 then raise exception 'invalid_window_days'; end if;
  if not exists(select 1 from platform.tenants t where t.id=p_tenant_id) then raise exception 'tenant_not_found'; end if;

  with f as (
    select * from platform.agency_command_feedback
    where tenant_id=p_tenant_id and created_at >= now()-make_interval(days=>v_days)
  ), grouped as (
    select command_type,
      count(*) filter(where feedback_type='shown') as shown,
      count(*) filter(where feedback_type='accepted') as accepted,
      count(*) filter(where feedback_type='dismissed') as dismissed,
      count(*) filter(where feedback_type='not_relevant') as not_relevant,
      count(*) filter(where feedback_type='completed') as completed,
      count(*) filter(where feedback_type='snoozed') as snoozed
    from f group by command_type
  )
  select jsonb_build_object(
    'tenant_id',p_tenant_id,
    'window_days',v_days,
    'events',(select count(*) from f),
    'overall',jsonb_build_object(
      'shown',(select count(*) from f where feedback_type='shown'),
      'accepted',(select count(*) from f where feedback_type='accepted'),
      'dismissed',(select count(*) from f where feedback_type='dismissed'),
      'not_relevant',(select count(*) from f where feedback_type='not_relevant'),
      'completed',(select count(*) from f where feedback_type='completed'),
      'snoozed',(select count(*) from f where feedback_type='snoozed')
    ),
    'by_command_type',coalesce((select jsonb_agg(jsonb_build_object(
      'command_type',command_type,'shown',shown,'accepted',accepted,'dismissed',dismissed,'not_relevant',not_relevant,'completed',completed,'snoozed',snoozed
    ) order by command_type) from grouped),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.platform_server_command_quality(uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_command_quality(uuid,integer) to service_role;;
