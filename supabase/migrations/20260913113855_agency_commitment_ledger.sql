create table if not exists platform.agency_commitments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  proposal_id uuid not null unique references platform.agency_action_proposals(id) on delete cascade,
  command_id text not null,
  task_id uuid not null unique references djm_os.tasks(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check(status in ('active','overdue','completed','cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  completion_feedback_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table platform.agency_commitments enable row level security;
revoke all on platform.agency_commitments from public, anon, authenticated, service_role;

create index if not exists agency_commitments_tenant_status_due_idx
  on platform.agency_commitments(tenant_id,status,due_at);
create index if not exists agency_commitments_owner_idx
  on platform.agency_commitments(owner_user_id) where owner_user_id is not null;

create or replace function platform.sync_commitment_from_proposal()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_task djm_os.tasks%rowtype;
  v_status text;
begin
  if new.action_type in ('create_search_task','create_player_task')
     and new.status='applied'
     and new.result_target_id is not null then
    select * into v_task from djm_os.tasks where id=new.result_target_id and tenant_id=new.tenant_id;
    if found then
      v_status := case
        when v_task.status='completed' then 'completed'
        when v_task.due_at is not null and v_task.due_at<now() then 'overdue'
        else 'active'
      end;
      insert into platform.agency_commitments(
        tenant_id,proposal_id,command_id,task_id,owner_user_id,status,due_at,completed_at,metadata
      ) values(
        new.tenant_id,new.id,new.command_id,v_task.id,coalesce(new.approved_by,new.requested_by),v_status,
        v_task.due_at,v_task.completed_at,
        jsonb_build_object('action_type',new.action_type,'source','agency_os','target_type',new.target_type,'target_id',new.target_id)
      )
      on conflict (proposal_id) do update set
        task_id=excluded.task_id,
        owner_user_id=excluded.owner_user_id,
        status=excluded.status,
        due_at=excluded.due_at,
        completed_at=excluded.completed_at,
        metadata=platform.agency_commitments.metadata||excluded.metadata,
        updated_at=now();
    end if;
  elsif new.action_type in ('create_search_task','create_player_task') and new.status='undone' then
    update platform.agency_commitments
    set status='cancelled',updated_at=now(),metadata=metadata||jsonb_build_object('cancelled_by_undo',true,'cancelled_at',now())
    where proposal_id=new.id and status<>'cancelled';
  end if;
  return new;
end;
$function$;

drop trigger if exists agency_commitment_proposal_sync on platform.agency_action_proposals;
create trigger agency_commitment_proposal_sync
after insert or update of status,result_target_id,approved_by,applied_at,undone_at
on platform.agency_action_proposals
for each row execute function platform.sync_commitment_from_proposal();

create or replace function platform.reconcile_commitment_for_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_c platform.agency_commitments%rowtype;
  v_t djm_os.tasks%rowtype;
  v_new_status text;
  v_feedback_needed boolean := false;
begin
  select * into v_c from platform.agency_commitments where task_id=p_task_id for update;
  if not found then return; end if;
  select * into v_t from djm_os.tasks where id=p_task_id and tenant_id=v_c.tenant_id;
  if not found then
    update platform.agency_commitments
    set status='cancelled',updated_at=now(),metadata=metadata||jsonb_build_object('task_missing',true,'reconciled_at',now())
    where id=v_c.id;
    return;
  end if;

  v_new_status := case
    when v_t.status='completed' then 'completed'
    when v_t.status='open' and v_t.due_at is not null and v_t.due_at<now() then 'overdue'
    when v_t.status='open' then 'active'
    else 'cancelled'
  end;
  v_feedback_needed := v_new_status='completed' and v_c.completion_feedback_at is null;

  update platform.agency_commitments
  set status=v_new_status,
      due_at=v_t.due_at,
      completed_at=case when v_new_status='completed' then v_t.completed_at else null end,
      completion_feedback_at=case when v_feedback_needed then now() else completion_feedback_at end,
      updated_at=now(),
      metadata=metadata||jsonb_build_object('last_reconciled_at',now(),'task_status',v_t.status)
  where id=v_c.id;

  if v_feedback_needed then
    insert into platform.agency_command_feedback(
      tenant_id,actor_user_id,command_id,command_type,source_type,source_id,feedback_type,metadata
    )
    select p.tenant_id,v_c.owner_user_id,p.command_id,p.command_type,p.target_type,p.target_id,'completed',
      jsonb_build_object('proposal_id',p.id,'action_type',p.action_type,'operating_state','delegated_work_completed','task_id',v_t.id,'commitment_id',v_c.id)
    from platform.agency_action_proposals p where p.id=v_c.proposal_id;
  end if;
end;
$function$;

create or replace function platform.sync_commitment_from_task()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform platform.reconcile_commitment_for_task(new.id);
  return new;
end;
$function$;

drop trigger if exists agency_commitment_task_sync on djm_os.tasks;
create trigger agency_commitment_task_sync
after update of status,due_at,completed_at
on djm_os.tasks
for each row execute function platform.sync_commitment_from_task();

create or replace function public.platform_server_reconcile_commitments(p_tenant_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_r record;
  v_checked integer := 0;
begin
  for v_r in
    select c.task_id
    from platform.agency_commitments c
    where (p_tenant_id is null or c.tenant_id=p_tenant_id)
      and c.status in ('active','overdue')
  loop
    perform platform.reconcile_commitment_for_task(v_r.task_id);
    v_checked := v_checked+1;
  end loop;
  return jsonb_build_object('tenant_id',p_tenant_id,'checked',v_checked,'reconciled_at',now());
end;
$function$;

revoke all on function public.platform_server_reconcile_commitments(uuid) from public, anon, authenticated;
grant execute on function public.platform_server_reconcile_commitments(uuid) to service_role;

create or replace function public.platform_server_commitment_summary(p_tenant_id uuid, p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_limit integer := greatest(1,least(coalesce(p_limit,10),50));
  v_items jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'commitment_id',x.id,'proposal_id',x.proposal_id,'command_id',x.command_id,'task_id',x.task_id,
    'owner_user_id',x.owner_user_id,'status',x.status,'due_at',x.due_at,'completed_at',x.completed_at,
    'task_title',x.task_title,'action_type',x.action_type,'created_at',x.created_at
  ) order by case x.status when 'overdue' then 0 when 'active' then 1 when 'completed' then 2 else 3 end,x.due_at nulls last),'[]'::jsonb)
  into v_items
  from (
    select c.*,t.title as task_title,p.action_type
    from platform.agency_commitments c
    join djm_os.tasks t on t.id=c.task_id
    join platform.agency_action_proposals p on p.id=c.proposal_id
    where c.tenant_id=p_tenant_id
    order by case c.status when 'overdue' then 0 when 'active' then 1 when 'completed' then 2 else 3 end,c.due_at nulls last
    limit v_limit
  ) x;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'active_count',(select count(*) from platform.agency_commitments where tenant_id=p_tenant_id and status='active'),
    'overdue_count',(select count(*) from platform.agency_commitments where tenant_id=p_tenant_id and status='overdue'),
    'completed_count',(select count(*) from platform.agency_commitments where tenant_id=p_tenant_id and status='completed'),
    'cancelled_count',(select count(*) from platform.agency_commitments where tenant_id=p_tenant_id and status='cancelled'),
    'items',v_items
  );
end;
$function$;

revoke all on function public.platform_server_commitment_summary(uuid,integer) from public, anon, authenticated;
grant execute on function public.platform_server_commitment_summary(uuid,integer) to service_role;;
