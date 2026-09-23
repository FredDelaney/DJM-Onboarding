export function recoveryReturnPath(value: string | null): string | null {
  if (!value || /[\\\r\n]/.test(value)) return null;

  if (
    /^\/activate\/[a-z0-9][a-z0-9-]*(?:\?|$)/.test(value) ||
    /^\/workspace\/[a-z0-9][a-z0-9-]*(?:\?|$)/.test(value)
  ) {
    return value;
  }

  return null;
}
