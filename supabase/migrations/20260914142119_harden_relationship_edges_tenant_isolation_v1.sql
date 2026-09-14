begin;

drop policy if exists team_relationship_edges_all
  on djm_os.relationship_edges;

create policy team_relationship_edges_all
  on djm_os.relationship_edges
  for all
  to authenticated
  using (
    private.user_has_staff_tenant_access(tenant_id)
  )
  with check (
    private.user_has_staff_tenant_access(tenant_id)
  );

comment on policy team_relationship_edges_all
  on djm_os.relationship_edges
  is 'Restricts staff relationship graph access to active staff members of the row tenant.';

commit;
