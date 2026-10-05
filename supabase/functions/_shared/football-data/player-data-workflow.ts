export const PLAYER_STAT_FIELDS = ['appearances', 'starts', 'minutes', 'goals', 'assists'] as const;
export type PlayerStatField = typeof PLAYER_STAT_FIELDS[number];
export type SeasonDraft = {
 row_id: string; expected_updated_at: string;
 season_label: string; club_name: string; league: string; country: string;
 appearances: string; starts: string; minutes: string; goals: string; assists: string;
 source_name: string; source_url: string; source_confirmed: boolean;
};
const text = (value: unknown) => String(value ?? '').trim();
const norm = (value: unknown) => text(value).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const clubKey = (value: unknown) => norm(value).replace(/\b(fc|football club)\b/g, '').replace(/\b(reserves?|b|2)\b/g, 'ii').replace(/\s+/g, ' ').trim();
const seasonKey = (value: unknown) => {
 const label = text(value).replace(/\s/g, '').replaceAll('/', '-');
 const match = label.match(/^((?:19|20)\d{2})-(\d{2}|\d{4})$/);
 if (!match) return label;
 return match[1] + '-' + match[2].slice(-2);
};
const timestamp = (value: unknown) => { const ms = Date.parse(text(value)); return Number.isFinite(ms) ? ms : 0; };
export function matchesCurrentSeasonContext(row: any, player: any): boolean {
 const season = seasonKey(player?.current_season_label), club = clubKey(player?.current_club), league = norm(player?.current_league);
 return Boolean(season && club && league && seasonKey(row?.season_label) === season && clubKey(row?.club_name) === club && norm(row?.league) === league);
}
export function selectCurrentSeasonEvidence(rows: any[], player: any): any | null {
 return [...rows].filter(row =>
  matchesCurrentSeasonContext(row, player) &&
  PLAYER_STAT_FIELDS.some(key => row[key] !== null && row[key] !== undefined && row[key] !== '')
 ).sort((left,right) =>
  Number(Boolean(right.source_reviewed_at)) - Number(Boolean(left.source_reviewed_at)) ||
  PLAYER_STAT_FIELDS.filter(key => right[key] != null && right[key] !== '').length - PLAYER_STAT_FIELDS.filter(key => left[key] != null && left[key] !== '').length ||
  Math.max(timestamp(right.source_reviewed_at),timestamp(right.source_synced_at)) - Math.max(timestamp(left.source_reviewed_at),timestamp(left.source_synced_at))
 )[0] || null;
}
export function safeSourceUrl(value: unknown): string | null {
 try { const url = new URL(text(value)); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function seasonDraft(player: any, row?: any): SeasonDraft {
 const draft: SeasonDraft = {row_id:text(row?.id),expected_updated_at:text(row?.updated_at),
  season_label:text(row?.season_label || player?.current_season_label),club_name:text(row?.club_name || player?.current_club),
  league:text(row?.league || player?.current_league),country:text(row?.country || player?.current_country),
  appearances:'',starts:'',minutes:'',goals:'',assists:'',source_name:text(row?.source_name),source_url:text(row?.source_url),source_confirmed:false};
 for (const key of PLAYER_STAT_FIELDS) draft[key] = row?.[key] == null ? '' : String(row[key]);
 return draft;
}
export function validateSeasonDraft(draft: SeasonDraft): string | null {
 if (!draft.season_label.trim()) return 'Add the current season.';
 if (!draft.club_name.trim()) return 'Add the club for these statistics.';
 if (!draft.league.trim()) return 'Add the competition so league and cup figures stay separate.';
 if (!draft.source_name.trim() || !safeSourceUrl(draft.source_url)) return 'Add a source name and a valid http or https source link.';
 for (const key of PLAYER_STAT_FIELDS) {
  const value = draft[key].trim();
  if (value && (!/^\d+$/.test(value) || Number(value) > 2147483647)) return key[0].toUpperCase() + key.slice(1) + ' must be a whole number of 0 or more.';
 }
 if (!PLAYER_STAT_FIELDS.some(key => draft[key].trim() !== '')) return 'Add at least one recorded figure. Leave unknown figures blank.';
 if (draft.appearances.trim() && draft.starts.trim() && Number(draft.starts) > Number(draft.appearances)) return 'Starts cannot exceed appearances.';
 if (!draft.source_confirmed) return 'Confirm that you checked these figures against the source.';
 return null;
}
export type RefreshOutcome = {status: 'applied' | 'failed'; message: string; checked_at: string | null; changed_fields: string[];};
export function refreshOutcome(payload: any, completedAt = new Date().toISOString()): RefreshOutcome {
 const fields = Array.isArray(payload?.ai?.fields_filled) ? payload.ai.fields_filled.filter((field: string) => PLAYER_STAT_FIELDS.includes(field as PlayerStatField)) : [];
 if (payload?.refresh_ok !== true || payload?.error || payload?.ai?.timed_out) {
  return {status:'failed',message:'The update could not confirm reliable new statistics. Recorded figures are still available. You can review the source or add corrections.',checked_at:null,changed_fields:[]};
 }
 return {status:'applied',
  message:fields.length ? 'Statistics updated. Review the recorded figures before verifying the player.' : payload?.skipped ? 'Recent figures are already available. Recorded statistics were retained.' : 'Source check completed. Recorded figures were retained where no reliable change was found.',
  checked_at:payload?.skipped ? payload?.checked_at || null : completedAt,changed_fields:fields};
}
