export const FIFA_TRANSFER_WINDOWS = 'https://inside.fifa.com/transfer-system/player-transfers';
export const windowCategories = ["Men's professional", "Women's professional", 'Amateur'] as const;
export type WindowCategory = typeof windowCategories[number];
export type TransferWindow = {start: string; end: string};
export type TransferAssociation = {
  code: string;
  name: string;
  flag: string;
  windows: Partial<Record<WindowCategory, TransferWindow[]>>;
};

export function parseFifaTransferWindows(html: string): TransferAssociation[] {
  const embedded = /<script\b[^>]*\bid="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!embedded) throw new Error('FIFA registration data is unavailable.');
  function find(value: unknown): unknown[] | undefined {
    if (Array.isArray(value) && value.some(item => item?.associationId && item?.country && Array.isArray(item?.data))) return value;
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) {
        const found = find(child);
        if (found) return found;
      }
    }
  }
  const associations = find(JSON.parse(embedded[1]));
  if (!associations) throw new Error('FIFA registration data could not be read.');
  const validDate = (date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  const parsed = new Map<string, TransferAssociation>();
  for (const raw of associations) {
    const row = raw as {associationId?: unknown; country?: unknown; data?: unknown[]};
    const code = row?.associationId;
    if (typeof code !== 'string' || !/^[A-Z]{3}$/.test(code) || typeof row.country !== 'string' || !row.country.trim()) continue;
    const windows: TransferAssociation['windows'] = {};
    for (const rawCategory of Array.isArray(row.data) ? row.data : []) {
      const category = rawCategory as {type: WindowCategory; timelineItems?: unknown[]};
      if (!category || !windowCategories.includes(category.type) || !Array.isArray(category.timelineItems)) continue;
      const periods = new Map<string, TransferWindow>();
      for (const rawEvent of category.timelineItems) {
        const event = rawEvent as {itemType?: string; startDate?: string; endDate?: string};
        if (event?.itemType !== 'event') continue;
        const start = typeof event.startDate === 'string' ? event.startDate.slice(0, 10) : null;
        const end = typeof event.endDate === 'string' ? event.endDate.slice(0, 10) : null;
        if (validDate(start) && validDate(end) && end >= start) periods.set(start + end, {start, end});
      }
      windows[category.type] = [...periods.values()].sort((a, b) => a.start.localeCompare(b.start));
    }
    parsed.set(code, {code, name: row.country, flag: 'https://api.fifa.com/api/v3/picture/flags-sq-5/' + code, windows});
  }
  if (![...parsed.values()].some(row => Object.values(row.windows).some(windows => windows.length))) {
    throw new Error('FIFA returned no usable registration periods.');
  }
  return [...parsed.values()];
}
