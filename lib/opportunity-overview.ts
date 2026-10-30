/** Read-only, evidence-bound projection for the agency Opportunities overview.
 *  Never infers club interest, transfer readiness, value or record relationships.
 */
export type OpportunityKind = 'need' | 'route' | 'deal';
export type OpportunityItem = {
  key: string;
  id: string;
  kind: OpportunityKind;
  title: string;
  detail: string;
  context: string;
  nextAction: string | null;
  attention: boolean;
  attentionReason: string | null;
  linkedNeedId: string | null;
  source: any;
};

const items = (value: unknown): any[] => Array.isArray(value) ? value : [];
const word = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const label = (value: unknown): string => word(value).replaceAll('_',' ').replace(/\b\w/g, c => c.toUpperCase());
const exactId = (value: unknown): string => word(value);
const financialBrief = (need: any): string => {
  const amount = word(need?.salary_budget);
  if (!/^\d{1,12}(?:\.\d{1,4})?$/.test(amount)) return '';
  const [whole, fraction] = amount.split('.');
  const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction : '');
  const code = word(need?.currency).toUpperCase();
  const money = `${/^[A-Z]{3}$/.test(code) ? code : 'Currency unconfirmed'} ${formatted}`;
  const period = need?.salary_period === 'monthly' ? '/month' : need?.salary_period === 'weekly' ? '/week' : need?.salary_period === 'annual' ? '/year' : ' · period unknown';
  const tax = need?.salary_tax_basis === 'gross' ? 'gross' : need?.salary_tax_basis === 'net' ? 'net' : 'basis unknown';
  return `${money}${period} · ${tax}`;
};
const validDate = (value: unknown): number | null => {
  const raw = word(value);
  if (!raw) return null;
  const time = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T23:59:59Z' : raw);
  return Number.isFinite(time) ? time : null;
};

export function opportunityOverview(
  source: {needs?: unknown; routes?: unknown; deals?: unknown},
  now: number = Date.now(),
): {needs: OpportunityItem[]; routes: OpportunityItem[]; deals: OpportunityItem[]; attention: OpportunityItem[]; other: OpportunityItem[]; byNeed: Map<string, OpportunityItem[]>} {
  const needs = items(source.needs).filter(raw => exactId(raw?.club_need_id)).map(raw => {
    const id = exactId(raw.club_need_id);
    const club = word(raw?.club?.name) || 'Club not recorded';
    const name = word(raw?.need?.title) || word(raw?.need?.position) || 'Player requirement';
    const expiry = validDate(raw?.need?.expires_at);
    const active = !raw?.need?.status || raw.need.status === 'active';
    const close = active && expiry !== null && expiry >= now && expiry - now <= 7 * 86_400_000;
    const expired = active && expiry !== null && expiry < now;
    const next = word(raw?.next_action?.instruction);
    return {
      key: `need:${id}`, id, kind: 'need' as const,
      title: `${club} · ${name}`,
      detail: [word(raw?.club?.country), word(raw?.need?.position), financialBrief(raw?.need)].filter(Boolean).join(' · ') || 'Club request',
      context: !active ? `Request ${label(raw.need.status).toLowerCase()}` : expired ? 'Request expiry passed' : 'Club requirement',
      nextAction: next || null,
      attention: close || expired,
      attentionReason: close ? 'Deadline approaching' : expired ? 'Expiry needs review' : null,
      linkedNeedId: null, source: raw,
    };
  });
  const routes = items(source.routes).filter(raw => exactId(raw?.player_match_id)).map(raw => {
    const id = exactId(raw.player_match_id);
    const state = word(raw?.career_strategy_gate?.state);
    const review = state.startsWith('review_') || state.startsWith('hold_');
    const next = word(raw?.career_strategy_gate?.next_action?.instruction);
    const needId = exactId(raw?.club_need_id || raw?.need?.club_need_id || raw?.need?.id);
    return {
      key: `route:${id}`, id, kind: 'route' as const,
      title: `${word(raw?.player?.name) || 'Player not recorded'} → ${word(raw?.club?.name) || 'Club not recorded'}`,
      detail: word(raw?.need?.title) || word(raw?.best_access_route?.person_name) || 'Player opportunity',
      context: state ? label(state) : 'Status not recorded',
      nextAction: next || null,
      attention: review,
      attentionReason: review ? 'Player direction needs review' : null,
      linkedNeedId: needId || null, source: raw,
    };
  });
  const deals = items(source.deals).filter(raw => exactId(raw?.deal_room_id)).map(raw => {
    const id = exactId(raw.deal_room_id);
    const fix = word(raw?.next_control_fix?.instruction);
    return {
      key: `deal:${id}`, id, kind: 'deal' as const,
      title: word(raw?.title) || 'Recorded deal',
      detail: word(raw?.organisation) || 'Club not recorded',
      context: word(raw?.stage) ? label(raw.stage) : 'Stage not recorded',
      nextAction: fix || word(raw?.next_best_move?.instruction) || word(raw?.next_decision) || null,
      attention: Boolean(fix),
      attentionReason: fix ? 'Deal needs attention' : null,
      linkedNeedId: null, source: raw,
    };
  });
  const seen = new Set<string>();
  const unique = (values: OpportunityItem[]) => values.filter(value => {
    if (seen.has(value.key)) return false;
    seen.add(value.key); return true;
  });
  const all = unique([...needs, ...routes, ...deals]);
  const byNeed = new Map<string,OpportunityItem[]>();
  for (const route of routes) if (route.linkedNeedId) {
    const current = byNeed.get(route.linkedNeedId) || [];
    if (!current.some(item => item.id === route.id)) current.push(route);
    byNeed.set(route.linkedNeedId, current);
  }
  return {needs, routes, deals, attention: all.filter(x => x.attention), other: all.filter(x => !x.attention), byNeed};
}
