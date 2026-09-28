begin;

revoke all on function
  private.email_outbox_tenant_id(uuid,jsonb)
from
  public,
  anon,
  authenticated;

grant execute on function
  private.email_outbox_tenant_id(uuid,jsonb)
to
  postgres,
  service_role;

commit;
