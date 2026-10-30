begin;
set local lock_timeout='5s';set local statement_timeout='30s';
-- Lead with the tenant key, matching the composite references and scoped reads.
-- Keep applied migrations immutable; replace only the three reviewed child indexes.
do $preflight$
declare spec record; actual text;
begin
 for spec in select * from (values
  ('club_needs_tenant_club_reference_idx','CREATE INDEX club_needs_tenant_club_reference_idx ON djm_os.club_needs USING btree (organisation_id, tenant_id)'),
  ('club_needs_tenant_person_reference_idx','CREATE INDEX club_needs_tenant_person_reference_idx ON djm_os.club_needs USING btree (source_person_id, tenant_id)'),
  ('club_needs_source_organisation_idx','CREATE INDEX club_needs_source_organisation_idx ON djm_os.club_needs USING btree (source_organisation_id, tenant_id)')
 ) x(name,expected) loop
  select pg_get_indexdef(to_regclass('djm_os.'||spec.name)) into actual;
  if actual is distinct from spec.expected then raise exception 'Unreviewed request reference index %',spec.name;end if;
 end loop;
end $preflight$;
drop index djm_os.club_needs_tenant_club_reference_idx;
drop index djm_os.club_needs_tenant_person_reference_idx;
drop index djm_os.club_needs_source_organisation_idx;
create index club_needs_tenant_club_reference_idx on djm_os.club_needs(tenant_id,organisation_id);
create index club_needs_tenant_person_reference_idx on djm_os.club_needs(tenant_id,source_person_id);
create index club_needs_source_organisation_idx on djm_os.club_needs(tenant_id,source_organisation_id);
commit;
