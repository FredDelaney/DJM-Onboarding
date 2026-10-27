import { UUID_PATTERN } from "./entity-context.ts";
type RecordRequest = { kind: "player" | "deal"; entityId: string };
type IntelligenceRequest = RecordRequest & { key: string; title: string; context?: string | null };
export function workspaceIntelligenceRequestFromQuery(query: string, current: IntelligenceRequest | null, canSeeDeals: boolean): IntelligenceRequest | null {
  const params = new URLSearchParams(query);
  const view = params.get('view');
  const dealId = params.get('record') || '';
  if (canSeeDeals && ['opportunities','market','deals'].includes(view || '') && params.get('tab') === 'deals' && UUID_PATTERN.test(dealId)) {
    return current?.kind === 'deal' && current.entityId === dealId ? current : { key: 'deal-war-room:' + dealId, kind: 'deal', entityId: dealId, title: 'Deal details', context: null };
  }
  if (current?.kind === 'player' && view === 'players' && params.get('player') === current.entityId) return current;
  return null;
}
const recordKeys = [
  "player",
  "profile",
  "club",
  "person",
  "target",
  "record",
  "network",
];
export function workspaceIntelligenceHref(
  basePath: string,
  query: string,
  record: RecordRequest,
): string | null {
  if (!UUID_PATTERN.test(record.entityId)) return null;
  const params = new URLSearchParams(query);
  for (const key of recordKeys) params.delete(key);
  if (record.kind === "deal") {
    params.set("view", "opportunities");
    params.set("tab", "deals");
    params.set("record", record.entityId);
  } else {
    params.set("view", "players");
    params.delete("tab");
    params.set("player", record.entityId);
    params.set("profile", "1");
  }
  return basePath + "?" + params.toString();
}
export function workspaceIntelligenceListHref(
  basePath: string,
  query: string,
  record: RecordRequest,
): string | null {
  const params = new URLSearchParams(query),
    key = record.kind === "deal" ? "record" : "player";
  if (params.get(key) !== record.entityId) return null;
  params.delete(key);
  if (record.kind === "player") params.delete("profile");
  return basePath + (params.size ? "?" + params.toString() : "");
}
