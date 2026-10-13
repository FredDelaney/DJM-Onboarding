/** Missing, blank and non-numeric values must never become recorded evidence. */
export function hasRecordedNumber(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}
