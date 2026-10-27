export function providerConnectionState(connection?: { status?: string; last_error?: string | null }) {
  if (!connection) return { label: 'Not connected', ready: false, reconnect: true };
  const status = connection.status?.toLowerCase();
  if (['expired','revoked','disconnected','needs_reauth','reconnect_required'].includes(status || '')) return { label: status === 'expired' ? 'Expired' : 'Reconnect required', ready: false, reconnect: true };
  if (['pending','pending_verification','awaiting_verification'].includes(status || '')) return { label: 'Awaiting verification', ready: false, reconnect: true };
  if (['permission_denied','missing_permissions'].includes(status || '')) return { label: 'Missing permissions', ready: false, reconnect: true };
  if (['active','connected'].includes(status || '')) return connection.last_error
    ? { label: 'Sync failed', ready: false, reconnect: false }
    : { label: 'Connected', ready: true, reconnect: false };
  return { label: status === 'error' ? 'Connection failed' : 'Check connection', ready: false, reconnect: true };
}
