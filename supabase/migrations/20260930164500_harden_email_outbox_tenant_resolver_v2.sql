-- Harden the internal email-outbox tenant resolver for already-migrated projects.
-- Browser roles do not need direct execution of this private helper.

revoke all on function private.email_outbox_tenant_id(uuid, jsonb)
from public, anon, authenticated;

grant execute on function private.email_outbox_tenant_id(uuid, jsonb)
to postgres, service_role;
