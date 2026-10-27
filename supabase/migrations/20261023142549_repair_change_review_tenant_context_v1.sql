-- Repair the existing scheduled change-review writer, not the tenant guard.
-- Only replace the exact legacy body verified on staging and production.
do $guard$
declare v_oid oid := to_regprocedure('djm_os.queue_change_review_items()');
begin
  if v_oid is null or (select md5(prosrc) from pg_proc where oid=v_oid) <> 'bca01cd5fed1c6854f2fe394f09111ab' then
    raise exception 'Unexpected queue_change_review_items definition; review drift before applying.';
  end if;
  if has_function_privilege('anon',v_oid,'execute') or has_function_privilege('authenticated',v_oid,'execute') then
    raise exception 'Unexpected browser execute grant on queue_change_review_items.';
  end if;
end;
$guard$;

create or replace function djm_os.queue_change_review_items()
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_inserted integer := 0;
  v_unresolved integer := 0;
begin
  -- Cron and an explicit server retry must not create the same open review twice.
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('djm_os.queue_change_review_items',0)) then
    return jsonb_build_object('review_items',0,'skipped_unresolved',0,'busy',true);
  end if;

  with observations as materialized (
    select c.*,
      case when c.entity_type in ('person','organisation','player','prospect') then
        private.workspace_entity_tenant(case when c.entity_type='organisation' then 'club' else c.entity_type end,c.entity_id)
      end as resolved_tenant_id
    from djm_os.change_observations c
    where c.status='pending' and c.confidence<0.95
  ), inserted as (
    insert into djm_os.review_items(tenant_id,owner_user_id,review_type,title,detail,person_id,organisation_id,player_id,confidence,payload,status)
    select c.resolved_tenant_id,
      (select r.team_member_id from djm_os.relationships r
       join djm_os.team_members tm on tm.user_id=r.team_member_id and tm.is_active
       where c.entity_type='person' and r.person_id=c.entity_id
         and r.tenant_id=c.resolved_tenant_id
         and private.user_has_staff_tenant_access(c.resolved_tenant_id,r.team_member_id)
       order by r.strength_score desc nulls last,r.id limit 1),
      'entity_change',
      case when c.entity_type='person' then 'Possible contact change' else 'Possible data change' end,
      c.change_type||' detected from '||coalesce(c.source_name,'external source'),
      case when c.entity_type='person' then c.entity_id else null end,
      case when c.entity_type='organisation' then c.entity_id else null end,
      case when c.entity_type='player' then c.entity_id else null end,
      c.confidence,
      jsonb_build_object('change_observation_id',c.id,'entity_type',c.entity_type,'entity_id',c.entity_id,
        'previous',c.previous_value,'observed',c.observed_value,'source_uri',c.source_uri),
      'open'
    from observations c
    where c.resolved_tenant_id is not null
      and not exists(select 1 from djm_os.review_items r
        where r.tenant_id=c.resolved_tenant_id and r.review_type='entity_change'
          and r.payload->>'change_observation_id'=c.id::text and r.status='open')
    returning id
  )
  select (select count(*) from inserted),
         (select count(*) from observations where resolved_tenant_id is null)
    into v_inserted,v_unresolved;

  -- Unresolvable/deleted/unsupported subjects stay pending for deliberate repair.
  -- Never invent a tenant, silently mark them reviewed or block valid agencies.
  return jsonb_build_object('review_items',v_inserted,'skipped_unresolved',v_unresolved,'busy',false);
end;
$function$;

-- CREATE OR REPLACE preserves the existing owner and server-only execute grants.
-- No RLS policy, tenant trigger, schedule, observation or customer row is changed.
