begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

-- Extend the existing administrator-only workspace response. Keep its signature,
-- owner, access grants, and all existing fields. Refuse unexpected deployed source.
do $migration$
declare
  routine regprocedure := 'public.platform_server_player_workspace(uuid,uuid)'::regprocedure;
  definition text;
  anchor constant text := '    ''service'',v_service,';
  fields constant text := $fields$
    'current_club_link', (
      select jsonb_build_object('organisation_id',o.id,'name',o.name,'country',o.country)
      from djm_os.player_club_links l
      join djm_os.organisations o on o.tenant_id=l.tenant_id and o.id=l.organisation_id
      where l.tenant_id=p_tenant_id and l.player_id=v_player.id
        and o.organisation_type='club' and o.archived_at is null
    ),
    'open_tasks', (
      select jsonb_build_object(
        'total',coalesce(max(t.total),0),
        'items',coalesce(jsonb_agg(jsonb_build_object(
          'id',t.id,'title',t.title,'due_at',t.due_at
        ) order by t.due_at nulls last,t.id),'[]'::jsonb)
      )
      from (
        select w.id,w.title,w.due_at,count(*) over () as total
        from djm_os.tasks w
        where w.tenant_id=p_tenant_id and w.player_id=v_player.id and w.status='open'
        order by w.due_at nulls last,w.id
        limit 20
      ) t
    ),
$fields$;
begin
  select pg_get_functiondef(p.oid) into definition
  from pg_proc p
  where p.oid=routine and md5(p.prosrc)='6482a97b42785099023a154fbdb96fbe'
    and p.prosecdef and p.provolatile='s'
    and not has_function_privilege('anon',p.oid,'execute')
    and not has_function_privilege('authenticated',p.oid,'execute')
    and has_function_privilege('service_role',p.oid,'execute');

  if definition is null or length(definition)-length(replace(definition,anchor,''))<>length(anchor) then
    raise exception 'Unexpected player workspace definition or grants';
  end if;

  execute replace(definition,anchor,fields||anchor);
end;
$migration$;

notify pgrst, 'reload schema';
commit;
