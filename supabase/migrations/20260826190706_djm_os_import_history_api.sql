create or replace function public.djm_import_history(p_limit int default 50)
returns table(batch_id uuid,source_type text,source_name text,status text,total_rows int,processed_rows int,created_people int,updated_people int,duplicate_rows int,error_rows int,summary jsonb,created_at timestamptz,completed_at timestamptz)
language sql security invoker set search_path='' as $$
select b.id,b.source_type,b.source_name,b.status,b.total_rows,b.processed_rows,b.created_people,b.updated_people,b.duplicate_rows,b.error_rows,b.summary,b.created_at,b.completed_at
from djm_os.import_batches b
where b.submitted_by=(select auth.uid()) and exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active)
order by b.created_at desc limit greatest(1,least(coalesce(p_limit,50),200))
$$;
revoke all on function public.djm_import_history(int) from public,anon;
grant execute on function public.djm_import_history(int) to authenticated;

create or replace function public.djm_import_detail(p_batch_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
select jsonb_build_object(
 'batch',to_jsonb(b),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('row_number',r.row_number,'status',r.status,'action',r.action,'person_id',r.person_id,'organisation_id',r.organisation_id,'match_confidence',r.match_confidence,'error_message',r.error_message,'processed_at',r.processed_at) order by r.row_number) from djm_os.import_rows r where r.batch_id=b.id),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'thread_id',m.thread_id,'sent_at',m.sent_at,'direction',m.direction,'sender_label',m.sender_label,'message_type',m.message_type,'processing_status',m.processing_status) order by m.sent_at) from djm_os.messages m where m.import_batch_id=b.id),'[]'::jsonb)
)
from djm_os.import_batches b where b.id=p_batch_id and b.submitted_by=(select auth.uid()) and exists(select 1 from djm_os.team_members tm where tm.user_id=(select auth.uid()) and tm.is_active)
$$;
revoke all on function public.djm_import_detail(uuid) from public,anon;
grant execute on function public.djm_import_detail(uuid) to authenticated;
