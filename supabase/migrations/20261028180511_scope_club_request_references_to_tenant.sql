begin;
set local lock_timeout='5s';set local statement_timeout='30s';
-- Preserve canonical models and delete behaviour; include tenant identity in the references.
-- This protects direct authenticated writes as well as the reviewed RPCs.
do $preflight$
declare spec record; actual text;
begin
 for spec in select * from (values
  ('club_needs_organisation_id_fkey','FOREIGN KEY (organisation_id) REFERENCES djm_os.organisations(id) ON DELETE CASCADE'),
  ('club_needs_source_person_id_fkey','FOREIGN KEY (source_person_id) REFERENCES djm_os.people(id) ON DELETE SET NULL'),
  ('club_needs_source_organisation_id_fkey','FOREIGN KEY (source_organisation_id) REFERENCES djm_os.organisations(id) ON DELETE SET NULL')
 ) x(name,expected) loop
  select pg_get_constraintdef(oid) into actual from pg_constraint where conrelid='djm_os.club_needs'::regclass and conname=spec.name and convalidated;
  if actual is distinct from spec.expected then raise exception 'Unreviewed club-request reference %',spec.name;end if;
 end loop;
 if exists(select 1 from djm_os.club_needs n left join djm_os.organisations o on o.id=n.organisation_id left join djm_os.people p on p.id=n.source_person_id left join djm_os.organisations s on s.id=n.source_organisation_id
  where o.id is null or o.tenant_id is distinct from n.tenant_id or (n.source_person_id is not null and (p.id is null or p.tenant_id is distinct from n.tenant_id)) or (n.source_organisation_id is not null and (s.id is null or s.tenant_id is distinct from n.tenant_id))) then
  raise exception 'Existing request references require deliberate review; no rows were changed';
 end if;
end $preflight$;
create unique index organisations_request_tenant_identity_uidx on djm_os.organisations(tenant_id,id);
create unique index people_request_tenant_identity_uidx on djm_os.people(tenant_id,id);
create index club_needs_tenant_club_reference_idx on djm_os.club_needs(organisation_id,tenant_id);
create index club_needs_tenant_person_reference_idx on djm_os.club_needs(source_person_id,tenant_id);
-- The preceding source-organisation index already covers that reference.
alter table djm_os.club_needs
 drop constraint club_needs_organisation_id_fkey,
 drop constraint club_needs_source_person_id_fkey,
 drop constraint club_needs_source_organisation_id_fkey,
 add constraint club_needs_organisation_id_fkey foreign key(tenant_id,organisation_id) references djm_os.organisations(tenant_id,id) on delete cascade,
 add constraint club_needs_source_person_id_fkey foreign key(tenant_id,source_person_id) references djm_os.people(tenant_id,id) on delete set null (source_person_id),
 add constraint club_needs_source_organisation_id_fkey foreign key(tenant_id,source_organisation_id) references djm_os.organisations(tenant_id,id) on delete set null (source_organisation_id);
commit;
