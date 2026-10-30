/** Evidence-bound read model for one agency's Opportunities overview.
 * Never turns a contact interaction into proof of club interest in a player.
 * Task ownership and due dates are read from confirmed, need-scoped task records.
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
  nextActionLabel: 'Recorded follow-up' | 'Suggested next step' | null;
  ownerName: string | null;
  dueAt: string | null;
  attention: boolean;
  attentionReason: string | null;
  attentionRank: number;
  linkedNeedId: string | null;
  source: any;
};

const items = (value: unknown): any[] => Array.isArray(value) ? value : [];
const word = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
const label = (value: unknown): string => word(value).replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
const exactId = (value: unknown): string => word(value);
const DAY = 86_400_000;
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const day = new Date(raw + 'T00:00:00Z');
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== raw) return null;
    return day.getTime() + DAY - 1; // Date-only deadlines finish at the end of that calendar date.
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw)) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : null;
};
const unique = (values: OpportunityItem[]): OpportunityItem[] => {
  const seen = new Set<string>();
  return values.filter(item => item.key && !seen.has(item.key) && !!seen.add(item.key));
};
const contextMap = (value: unknown, idName: string) => new Map<string, any>(
  items(value).filter(raw => exactId(raw?.[idName])).map(raw => [exactId(raw[idName]), raw]),
);
const ranked = (a: OpportunityItem, b: OpportunityItem) =>
  a.attentionRank - b.attentionRank ||
  (a.dueAt ? validDate(a.dueAt) ?? Infinity : Infinity) - (b.dueAt ? validDate(b.dueAt) ?? Infinity : Infinity) ||
  a.title.localeCompare(b.title);

export function opportunityOverview(
  source: {needs?: unknown; routes?: unknown; deals?: unknown; connectedNeeds?: unknown; connectedDeals?: unknown},
  now: number = Date.now(),
): {needs: OpportunityItem[]; routes: OpportunityItem[]; deals: OpportunityItem[]; attention: OpportunityItem[]; other: OpportunityItem[]; byNeed: Map<string, OpportunityItem[]>} {
  const needContext = contextMap(source.connectedNeeds, 'club_need_id');
  const dealContext = contextMap(source.connectedDeals, 'deal_room_id');
  const needs = unique(items(source.needs).filter(raw => exactId(raw?.club_need_id)).map(raw => {
    const id = exactId(raw.club_need_id);
    const club = word(raw?.club?.name) || 'Club not recorded';
    const name = word(raw?.need?.title) || word(raw?.need?.position) || 'Player requirement';
    const expiry = validDate(raw?.need?.expires_at);
    const active = !raw?.need?.status || ['active', 'confirmed'].includes(raw.need.status);
    const close = active && expiry !== null && expiry >= now && expiry - now <= 7 * DAY;
    const expired = active && expiry !== null && expiry < now;
    const context = needContext.get(id);
    // The server guarantees open_followup belongs to this exact club_need_id.
    const followUp = context?.open_followup || null;
    const dueAt = validDate(followUp?.due_at) !== null ? word(followUp?.due_at) : null;
    const due = validDate(dueAt);
    const missingOwner = !!followUp && followUp.owner_state !== 'active_staff';
    const overdue = active && due !== null && due < now;
    const dueSoon = active && due !== null && due >= now && due - now <= DAY;
    let attentionReason: string | null = null;
    let attentionRank = 99;
    if (active && missingOwner) { attentionReason = 'Follow-up needs an active owner'; attentionRank = 0; }
    else if (overdue) { attentionReason = 'Follow-up overdue'; attentionRank = 1; }
    else if (expired) { attentionReason = 'Request expiry passed'; attentionRank = 1; }
    else if (dueSoon) { attentionReason = 'Follow-up due soon'; attentionRank = 2; }
    else if (close) { attentionReason = 'Request deadline approaching'; attentionRank = 3; }
    const confirmedNext = word(followUp?.title);
    const suggestion = word(raw?.next_action?.instruction);
    return {
      key: `need:${id}`, id, kind: 'need' as const,
      title: `${club} · ${name}`,
      detail: [word(raw?.club?.country), word(raw?.need?.position), financialBrief(raw?.need)].filter(Boolean).join(' · ') || 'Club request',
      context: !active ? `Request ${label(raw.need.status).toLowerCase()}` : expired ? 'Request expiry passed' : 'Club requirement',
      nextAction: confirmedNext || suggestion || null,
      nextActionLabel: confirmedNext ? 'Recorded follow-up' as const : suggestion ? 'Suggested next step' as const : null,
      ownerName: word(context?.need_owner_name) || null,
      dueAt,
      attention: attentionRank < 99,
      attentionReason,
      attentionRank,
      linkedNeedId: null, source: raw,
    };
  }));
  const routes = unique(items(source.routes).filter(raw => exactId(raw?.player_match_id)).map(raw => {
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
      nextActionLabel: next ? 'Suggested next step' as const : null,
      ownerName: null, // A source contact or club access route is NOT an accountable agent.
      dueAt: null,
      attention: review,
      attentionReason: review ? 'Player direction needs review' : null,
      attentionRank: review ? 2 : 99,
      linkedNeedId: needId || null, source: raw,
    };
  }));
  const deals = unique(items(source.deals).filter(raw => exactId(raw?.deal_room_id)).map(raw => {
    const id = exactId(raw.deal_room_id);
    const fix = word(raw?.next_control_fix?.instruction);
    const next = fix || word(raw?.next_best_move?.instruction) || word(raw?.next_decision);
    const context = dealContext.get(id);
    return {
      key: `deal:${id}`, id, kind: 'deal' as const,
      title: word(raw?.title) || 'Recorded deal',
      detail: word(raw?.organisation) || 'Club not recorded',
      context: word(raw?.stage) ? label(raw.stage) : 'Stage not recorded',
      nextAction: next || null,
      nextActionLabel: next ? 'Suggested next step' as const : null,
      ownerName: word(context?.deal_owner_name) || null,
      dueAt: null,
      attention: Boolean(fix),
      attentionReason: fix ? 'Deal control needs review' : null,
      attentionRank: fix ? 2 : 99,
      linkedNeedId: null, source: raw,
    };
  }));
  const all = [...needs, ...routes, ...deals];
  const byNeed = new Map<string, OpportunityItem[]>();
  for (const route of routes) if (route.linkedNeedId) {
    const current = byNeed.get(route.linkedNeedId) || [];
    if (!current.some(item => item.id === route.id)) current.push(route);
    byNeed.set(route.linkedNeedId, current);
  }
  for (const children of byNeed.values()) children.sort(ranked);
  return {
    needs, routes, deals,
    attention: all.filter(x => x.attention).sort(ranked),
    other: all.filter(x => !x.attention).sort(ranked),
    byNeed,
  };
}
