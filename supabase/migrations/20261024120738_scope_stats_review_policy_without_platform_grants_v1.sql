-- Browser sessions deliberately have no platform schema/table access. Evaluate
-- proposal-read permission through a small boolean boundary, not broader grants.
do $guard$
begin
 if not exists(select 1 from pg_policy where polname='player_stats_proposal_tenant_boundary' and polrelid='public.player_source_refreshes'::regclass and md5(pg_get_expr(polqual,polrelid))='e57392b5c4ce25557c4cad2e72481db4')
  or to_regprocedure('private.can_read_player_stats_proposal(uuid)') is not null then raise exception 'Unexpected stats review policy boundary'; end if;
end;
$guard$;

create function private.can_read_player_stats_proposal(p_player_id uuid)
returns boolean language sql stable security definer set search_path='' as $function$
 select exists(
  select 1 from public.players p
  join platform.tenants t on t.id=p.tenant_id and t.status='active'
  join platform.tenant_memberships m on m.tenant_id=p.tenant_id and m.user_id=(select auth.uid()) and m.status='active'
  where p.id=p_player_id and (
   m.role in ('owner','admin') or (
    m.role in ('agent','operations') and exists(select 1 from public.staff_player_access a where a.player_id=p.id and a.staff_user_id=m.user_id and a.can_edit)
   )
  )
 );
$function$;
revoke all on function private.can_read_player_stats_proposal(uuid) from public,anon;
grant execute on function private.can_read_player_stats_proposal(uuid) to authenticated,service_role;

alter policy player_stats_proposal_tenant_boundary on public.player_source_refreshes
 using (provider<>'agency_stats_proposal_v1' or private.can_read_player_stats_proposal(player_id))
 with check (provider<>'agency_stats_proposal_v1');
