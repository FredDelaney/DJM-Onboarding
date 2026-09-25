do $$
declare
  r record;
begin
  for r in
    select
      p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname = 'djm_command_center'
        or p.proname = 'djm_universal_search'
        or p.proname like 'djm_network_%'
        or p.proname like 'djm_market_%'
        or p.proname like 'djm_opportunit%'
        or p.proname like 'djm_recruitment_%'
        or p.proname like 'djm_scout_%'
        or p.proname like 'djm_intelligence_%'
        or p.proname like 'djm_deal_room%'
        or p.proname = 'platform_server_agency_create_options'
        or p.proname = 'platform_server_agency_create_player'
        or p.proname = 'platform_server_agency_create_club_need'
        or p.proname = 'platform_server_agency_create_contact'
        or p.proname = 'platform_server_agency_create_deal'
      )
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      r.signature
    );

    execute format(
      'grant execute on function %s to service_role',
      r.signature
    );
  end loop;
end
$$;

comment on schema djm_os is
  'Legacy compatibility schema. It is not an agency authorisation boundary. Active agency access is tenant membership based.';
