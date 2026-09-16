alter table djm_os.relationship_edges add column if not exists tenant_id uuid;
alter table djm_os.relationship_edges
  add constraint relationship_edges_tenant_id_fkey foreign key (tenant_id) references platform.tenants(id) on delete cascade;
alter table djm_os.relationship_edges alter column tenant_id set not null;
alter table djm_os.relationship_edges drop constraint if exists relationship_edges_from_type_from_id_to_type_to_id_relation_key;
alter table djm_os.relationship_edges
  add constraint relationship_edges_tenant_path_relation_key unique(tenant_id,from_type,from_id,to_type,to_id,relation_type);
create index if not exists relationship_edges_tenant_status_idx on djm_os.relationship_edges(tenant_id,status);
create index if not exists relationship_edges_tenant_from_idx on djm_os.relationship_edges(tenant_id,from_type,from_id) where status='active';
create index if not exists relationship_edges_tenant_to_idx on djm_os.relationship_edges(tenant_id,to_type,to_id) where status='active';;
