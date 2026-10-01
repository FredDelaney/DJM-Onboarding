export type HomeReadState = 'loading' | 'ready' | 'error';
export const homeSources = ['operations', 'connected_work', 'meeting_aftercare'] as const;
export type HomeSource = typeof homeSources[number];
export type HomeReads = Record<HomeSource, HomeReadState>;

export function homeReadState(reads: Partial<HomeReads> | undefined, sources: readonly HomeSource[]): HomeReadState {
  if (sources.some((source) => reads?.[source] === 'error')) return 'error';
  if (sources.some((source) => reads?.[source] !== 'ready')) return 'loading';
  return 'ready';
}

// Keep successful data visible when a background refresh fails. Its read state
// still records the failure so cached evidence is never presented as current.
export function settleHomeReads(previous: Record<string, unknown>, reads: PromiseSettledResult<unknown>[]) {
  const patch: Record<string, unknown> = {};
  const states = {} as HomeReads;
  homeSources.forEach((source, index) => {
    const result = reads[index];
    states[source] = result?.status === 'fulfilled' ? 'ready' : 'error';
    patch[source] = result?.status === 'fulfilled' ? result.value : previous[source];
  });
  return { ...patch, home_reads: states };
}

export function homeConversationHref(basePath: string, item: Record<string, unknown>): string {
  for (const [field, view, param] of [
    ['player_id', 'players', 'player'],
    ['person_id', 'network', 'person'],
    ['organisation_id', 'network', 'club'],
  ]) {
    if (item[field]) return `${basePath}?view=${view}&${param}=${encodeURIComponent(String(item[field]))}`;
  }
  if (item.prospect_id) return `${basePath}?view=players&tab=recruitment&target=${encodeURIComponent(String(item.prospect_id))}`;
  return `${basePath}?view=network`;
}
