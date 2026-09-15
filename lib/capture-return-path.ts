// Only capture routes can supply a post-login return path; never an external URL.
export function captureReturnPath(value: string | null): string | null {
  if (!value || /[\\\r\n]/.test(value)) return null;
  if (!/^\/(?:tell(?:\?|$)|workspace\/[a-z0-9][a-z0-9-]*\/capture(?:\?|$))/.test(value)) return null;
  return value;
}
