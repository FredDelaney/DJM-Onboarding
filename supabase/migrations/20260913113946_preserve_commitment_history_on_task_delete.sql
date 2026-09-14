alter table platform.agency_commitments
  alter column task_id drop not null;

alter table platform.agency_commitments
  drop constraint if exists agency_commitments_task_id_fkey;

alter table platform.agency_commitments
  add constraint agency_commitments_task_id_fkey
  foreign key (task_id) references djm_os.tasks(id) on delete set null;

update platform.agency_commitments c
set metadata=c.metadata||jsonb_build_object('task_title',t.title,'task_source',t.source)
from djm_os.tasks t
where c.task_id=t.id
  and (c.metadata->>'task_title') is null;

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
        jsonb_build_object(
          'action_type',new.action_type,'source','agency_os','target_type',new.target_type,'target_id',new.target_id,
          'task_title',v_task.title,'task_source',v_task.source
        )
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
    'task_title',coalesce(x.task_title,x.metadata->>'task_title'),'action_type',x.action_type,'created_at',x.created_at
  ) order by case x.status when 'overdue' then 0 when 'active' then 1 when 'completed' then 2 else 3 end,x.due_at nulls last),'[]'::jsonb)
  into v_items
  from (
    select c.*,t.title as task_title,p.action_type
    from platform.agency_commitments c
    left join djm_os.tasks t on t.id=c.task_id
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
