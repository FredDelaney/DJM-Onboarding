type Stat = {label: string; value: string | number};
type Source = Record<string, unknown>;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

// Public football evidence only. Never spread a career row or private preparation object.
export function withProfileStatEvidence(stat: Stat, source: Source) {
  const result: Stat & Record<string, string | number> = {label: stat.label, value: stat.value};
  for (const field of ['season_label','club_name','league'] as const) {
    const value = text(source[field]);
    if (value) result[field] = value;
  }
  const name = text(source.source_name) || text(source.source_provider) || text(source.provider);
  if (name) result.source_name = name;
  for (const field of ['source_reviewed_at','source_synced_at','checked_at'] as const) {
    const value = text(source[field]);
    if (/^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))) result[field] = value;
  }
  return result;
}
