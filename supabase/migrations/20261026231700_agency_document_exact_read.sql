begin;

-- Exact, read-only confirmation for the existing owner/admin document editor.
-- No list limit, row lock, event, token or external action is involved.
create function public.redream_document_read(p_workspace_slug text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare tenant uuid; actor uuid:=auth.uid(); doc public.agency_documents;
begin
  if actor is null then raise exception 'Sign in to open documents' using errcode='42501'; end if;
  select id into tenant from platform.tenants where slug=p_workspace_slug and status='active';
  if tenant is null or not private.user_is_tenant_admin(tenant,actor) then
    raise exception 'Documents are available to workspace owners and admins' using errcode='42501';
  end if;
  select * into doc from public.agency_documents where id=p_id and tenant_id=tenant;
  if not found then return jsonb_build_object('tenant_id',tenant,'state','missing','document',null); end if;
  if doc.archived_at is not null then return jsonb_build_object('tenant_id',tenant,'state','archived','document',null); end if;
  return jsonb_build_object('tenant_id',tenant,'state','found','document',
    (to_jsonb(doc)-'tenant_id'-'created_by'-'created_at'-'archived_at') || jsonb_build_object(
      'opened_at',(select min(created_at) from public.agency_document_events where document_id=doc.id and tenant_id=tenant and document_revision=doc.revision and kind='opened'),
      'sent_at',(select max(created_at) from public.agency_document_events where document_id=doc.id and tenant_id=tenant and document_revision=doc.revision and kind='sent_manually'),
      'paid_at',(select max(created_at) from public.agency_document_events where document_id=doc.id and tenant_id=tenant and kind='paid_manually'),
      'active_links',(select count(*) from public.agency_document_shares where document_id=doc.id and tenant_id=tenant and revoked_at is null and expires_at>now())));
end $$;
revoke all on function public.redream_document_read(text,uuid) from public,anon;
grant execute on function public.redream_document_read(text,uuid) to authenticated,service_role;

commit;
