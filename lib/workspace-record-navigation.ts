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
  "source_deal",
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
export function workspaceProfileFromDealHref(basePath:string,query:string,playerId:string,dealId:string):string|null {
  if(!UUID_PATTERN.test(playerId)||!UUID_PATTERN.test(dealId))return null;
  const href=workspaceIntelligenceHref(basePath,query,{kind:'player',entityId:playerId.toLowerCase()});
  if(!href)return null;
  const params=new URLSearchParams(href.slice(href.indexOf('?')+1));
  params.set('source_deal',dealId.toLowerCase());
  return basePath+'?'+params.toString();
}

export type ProfileDealContext={id:string;title:string;organisation_id:string;club_name:string;status:'active'};
/** The exact tenant-scoped deal reader establishes the relationship, never the URL or a limited list. */
export function profileDealContextFromWarRoom(value:unknown,dealId:string,playerId:string):ProfileDealContext|null {
  if(!UUID_PATTERN.test(dealId)||!UUID_PATTERN.test(playerId)||!value||typeof value!=='object')return null;
  const room=value as Record<string,any>;
  if(room.available===false||typeof room.deal_room_id!=='string'||room.deal_room_id.toLowerCase()!==dealId.toLowerCase()||
    typeof room.player?.player_id!=='string'||room.player.player_id.toLowerCase()!==playerId.toLowerCase()||
    typeof room.club?.organisation_id!=='string'||!UUID_PATTERN.test(room.club.organisation_id)||room.deal?.status!=='active'||
    typeof room.deal?.title!=='string'||!room.deal.title.trim()||typeof room.club?.name!=='string'||!room.club.name.trim())return null;
  return {id:dealId.toLowerCase(),title:room.deal.title.trim(),organisation_id:room.club.organisation_id.toLowerCase(),club_name:room.club.name.trim(),status:'active'};
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
  params.delete('source_deal');
  if (record.kind === "player") params.delete("profile");
  return basePath + (params.size ? "?" + params.toString() : "");
}
