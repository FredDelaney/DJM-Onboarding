export type BirthdayFilters = { players: boolean; contacts: boolean; staff: boolean };
export function calendarDateKey(value: string | Date, dateOnly = false): string {
  if (dateOnly && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function monthDays(value: string): string[] {
  const date = new Date(`${value}T12:00:00`);
  const length = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  return Array.from({ length }, (_, i) => `${value.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`);
}
export function shiftMonth(value: string, amount: number): string {
  const date = new Date(`${value}T12:00:00`);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + amount);
  date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  return calendarDateKey(date);
}
export function calendarPreferences(raw: string | null): BirthdayFilters {
  let saved: any;
  try { saved = JSON.parse(raw || '{}'); } catch { saved = {}; }
  return { players: typeof saved?.players === 'boolean' ? saved.players : true,
    contacts: saved?.contacts === true, staff: typeof saved?.staff === 'boolean' ? saved.staff : true };
}
