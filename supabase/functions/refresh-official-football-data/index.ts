// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-djm-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const clean = (value: unknown) => { const text = String(value ?? "").replace(/\u00a0/g, " ").trim(); return text || null; };
const norm = (value: unknown) => String(value || "").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const integer = (value: unknown) => { if (value == null || value === "") return null; const n = Number(String(value).replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null; };
const per90 = (value: number | null, minutes: number | null) => value != null && minutes != null && minutes > 0 ? value * 90 / minutes : null;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const stripMarkdown = (value: unknown) => String(value || "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
const tableCells = (line: string) => { const raw = line.trim(); if (!raw.includes("|")) return []; const parts = raw.split("|").map((cell) => stripMarkdown(cell.trim())); if (parts[0] === "") parts.shift(); if (parts.at(-1) === "") parts.pop(); return parts; };
const playerIdFrom = (value: unknown) => String(value || "").match(/\/pelaajat\/(\d+)\//i)?.[1] || null;
const matchIdFrom = (value: unknown) => String(value || "").match(/\/ottelut\/(\d+)\//i)?.[1] || null;
const finnishDate = (value: unknown) => { const m = String(value || "").trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/); return m ? `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}` : null; };

function officialRole(value: unknown) {
  const n = norm(value);
  if (!n) return null;
  if (/maalivahti|goalkeeper|(^| )gk($| )/.test(n)) return "goalkeeper";
  if (/puolustaja|defender|centre back|center back|left back|right back|(^| )(cb|lb|rb|lwb|rwb|df)($| )/.test(n)) return "defender";
  if (/keskikentta|midfielder|midfield|(^| )(cm|dm|cdm|am|cam|lm|rm|mf)($| )/.test(n)) return "midfielder";
  if (/hyokkaaja|forward|striker|winger|attacker|(^| )(cf|st|lw|rw|fw)($| )/.test(n)) return "attacker";
  return null;
}
const positionGroup = (role: string | null) => role === "goalkeeper" ? "GK" : role === "defender" ? "DEF" : role === "midfielder" ? "MID" : role === "attacker" ? "ATT" : null;
function trustedOfficialUrl(raw: unknown) {
  try { const url = new URL(String(raw || "")); const host = url.hostname.toLowerCase().replace(/^www\./, ""); if (host !== "veikkausliiga.com" || !url.pathname.startsWith("/pelaajat/")) return null; return url; }
  catch { return null; }
}
async function reader(targetUrl: string) {
  const response = await fetch(`https://r.jina.ai/${targetUrl}`, { headers: { "Accept": "text/plain", "User-Agent": "DJM-Sports-Management/1.0" }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Official-source transport returned HTTP ${response.status}`);
  const body = await response.text();
  if (body.length < 100) throw new Error("Official-source transport returned an empty page");
  return body;
}
function competitionSection(line: string) {
  const match = line.match(/^##\s+(.+?)\s*$/);
  return match ? norm(match[1]) : null;
}
function matchContext(value: unknown, clubName: unknown) {
  const label = stripMarkdown(value).replace(/\s*\([^)]*\)\s*$/, "").trim();
  const sides = label.split(/\s+-\s+/);
  if (sides.length !== 2) return { opponent: null, homeAway: null };
  if (norm(sides[0]) === norm(clubName)) return { opponent: sides[1], homeAway: "home" };
  if (norm(sides[1]) === norm(clubName)) return { opponent: sides[0], homeAway: "away" };
  return { opponent: null, homeAway: null };
}

function parsePlayerPage(markdown: string, season: string, sourceUrl: string) {
  const providerPlayerId = playerIdFrom(sourceUrl);
  const birth = markdown.match(/Syntynyt\s+(\d{1,2}\.\d{1,2}\.\d{4})/i)?.[1] || null;
  const height = integer(markdown.match(/Pituus\s+(\d{2,3})\s*cm/i)?.[1]);
  const nationality = clean(markdown.match(/Kansalaisuus\s+([A-Z]{2,3})\b/i)?.[1]);
  const positionRaw = clean(markdown.match(/Pelipaikka\s+(Maalivahti|Puolustaja|Keskikenttä|Hyökkääjä)/i)?.[1]);
  const role = officialRole(positionRaw);
  // The official player page renders Veikkausliiga first without a section heading.
  let activeCompetition = "veikkausliiga";
  let seasonRow: any = null;
  let latestSeasonRow: any = null;
  const matches: any[] = [];

  for (const line of markdown.split(/\r?\n/)) {
    const section = competitionSection(line);
    if (section != null) { activeCompetition = section; continue; }
    if (activeCompetition !== "veikkausliiga") continue;

    const values = tableCells(line);
    const rowSeason = String(values[0] || "").trim();
    if (/^20\d{2}$/.test(rowSeason) && values.length >= 15) {
      const candidate = {
        season_label: rowSeason, club_name: clean(values[1]), appearances: integer(values[2]), minutes: integer(values[3]), goals: integer(values[4]), assists: integer(values[5]), starts: integer(values[6]), sub_in: integer(values[7]), sub_out: integer(values[8]), fouls: integer(values[9]), yellow_cards: integer(values[10]), red_cards: integer(values[11]), offsides: integer(values[12]), penalties: integer(values[13]), penalty_goals: integer(values[14]),
      };
      if (!latestSeasonRow || Number(rowSeason) > Number(latestSeasonRow.season_label)) latestSeasonRow = candidate;
      if (rowSeason === season) seasonRow = candidate;
      continue;
    }
    const date = finnishDate(values[0]);
    if (!date || values.length < 15) continue;
    matches.push({ provider_match_id: matchIdFrom(line) || `${date}:${norm(values[1])}`, match_date: date, match_label: clean(values[1]), minutes: integer(values[3]), goals: integer(values[4]), assists: integer(values[5]), starts: integer(values[6]), sub_in: integer(values[7]), sub_out: integer(values[8]), fouls: integer(values[9]), yellow_cards: integer(values[10]), red_cards: integer(values[11]), offsides: integer(values[12]), penalties: integer(values[13]), penalty_goals: integer(values[14]) });
  }
  seasonRow ||= latestSeasonRow;
  if (!seasonRow) throw new Error("Official Veikkausliiga section has no published season row");
  return {
    providerPlayerId,
    bio: { birth, height_cm: height, nationality, position_raw: positionRaw, role },
    season: seasonRow,
    matches: matches.filter((match) => String(match.match_date || "").startsWith(seasonRow.season_label)),
  };
}
function parseLeaguePage(markdown: string) {
  const rows: any[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const values = tableCells(line);
    if (values.length < 16 || !/^\d+$/.test(String(values[0] || "").trim())) continue;
    const providerPlayerId = playerIdFrom(line) || `row:${norm(values[1])}:${norm(values[2])}`;
    const minutes = integer(values[4]) || 0, goals = integer(values[5]) || 0, assists = integer(values[6]) || 0;
    rows.push({ provider_player_id: providerPlayerId, provider_team_id: norm(values[2]).replace(/\s+/g, "-"), player_name: clean(values[1]), team_name: clean(values[2]), provider_position: null, minutes, metrics: { apps: integer(values[3]), goals90: per90(goals, minutes), assists90: per90(assists, minutes), starts: integer(values[7]), subIn: integer(values[8]), subOut: integer(values[9]), fouls90: per90(integer(values[10]) || 0, minutes), yellow90: per90(integer(values[11]) || 0, minutes), red90: per90(integer(values[12]) || 0, minutes), offsides: integer(values[13]), penalties: integer(values[14]), penaltyGoals: integer(values[15]) } });
  }
  return rows;
}
function parseTeamRoles(markdown: string) {
  const roles = new Map<string, string>();
  const matches = [...markdown.matchAll(/\/pelaajat\/(\d+)\/[\w\-\u00c0-\u024f]*/gi)];
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index], next = matches[index + 1];
    const chunk = markdown.slice(current.index, next?.index || Math.min(markdown.length, current.index + 1400));
    const role = officialRole(chunk.match(/Pelipaikka\s+(Maalivahti|Puolustaja|Keskikenttä|Hyökkääjä)/i)?.[1]);
    if (role) roles.set(current[1], role);
  }
  return roles;
}
async function inBatches<T, R>(values: T[], size: number, worker: (value: T) => Promise<R>) { const output: R[] = []; for (let i = 0; i < values.length; i += size) output.push(...await Promise.all(values.slice(i, i + size).map(worker))); return output; }
const TEAM_SLUGS = ["ac-oulu", "fc-inter", "fc-lahti", "ff-jaro", "hjk", "if-gnistan", "ifk-mariehamn", "ilves", "kups", "sjk", "tps", "vps"];
async function buildLeagueContext(season: string) {
  const leagueUrl = `https://www.veikkausliiga.com/tilastot/${season}/veikkausliiga/pelaajat/`;
  const rows = parseLeaguePage(await reader(leagueUrl));
  if (rows.length < 20) throw new Error(`Official league parser found only ${rows.length} player rows`);
  const roleMaps = await inBatches(TEAM_SLUGS, 4, async (slug) => { try { return parseTeamRoles(await reader(`https://www.veikkausliiga.com/joukkueet/${slug}/`)); } catch { return new Map<string, string>(); } });
  const roles = new Map<string, string>();
  for (const map of roleMaps) for (const [id, role] of map.entries()) roles.set(id, role);
  return { leagueUrl, rows, roles };
}
async function authorise(request: Request, admin: any) {
  const suppliedSecret = request.headers.get("x-djm-cron") || "";
  if (suppliedSecret) { const { data: expectedSecret } = await admin.rpc("get_push_scheduler_secret"); if (expectedSecret && suppliedSecret === expectedSecret) return true; }
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data: authData, error } = await admin.auth.getUser(token);
  if (error || !authData?.user) return false;
  const { data: profile } = await admin.from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
  return profile?.role === "admin";
}

async function syncSubject(admin: any, subject: any, contexts: Map<string, any>) {
  const sourceUrl = trustedOfficialUrl(subject.stats_url);
  if (!sourceUrl) return { ok: false, subject_id: subject.subject_id, reason: "No supported official stats URL" };
  const requestedSeason = String(subject.current_season_label || new Date().getUTCFullYear());
  const parsed = parsePlayerPage(await reader(sourceUrl.toString()), requestedSeason, sourceUrl.toString());
  const season = String(parsed.season.season_label);
  let context = contexts.get(season);
  if (!context) {
    context = await buildLeagueContext(season);
    contexts.set(season, context);
  }
  const providerPlayerId = parsed.providerPlayerId || `page:${norm(subject.full_name)}`;
  const role = parsed.bio.role || officialRole(subject.primary_position) || context.roles.get(providerPlayerId) || null;
  if (providerPlayerId && role) context.roles.set(providerPlayerId, role);
  const clubName = parsed.season.club_name || subject.current_club;
  const now = new Date().toISOString();
  const currentSeason = { role, minutes: parsed.season.minutes, apps: parsed.season.appearances, goals: parsed.season.goals, assists: parsed.season.assists, goals90: per90(parsed.season.goals, parsed.season.minutes), assists90: per90(parsed.season.assists, parsed.season.minutes), starts: parsed.season.starts, subIn: parsed.season.sub_in, subOut: parsed.season.sub_out, fouls: parsed.season.fouls, yellowCards: parsed.season.yellow_cards, redCards: parsed.season.red_cards, offsides: parsed.season.offsides, penalties: parsed.season.penalties, penaltyGoals: parsed.season.penalty_goals };
  const peers = context.rows.map((row: any) => { const peerRole = context.roles.get(row.provider_player_id) || null; return { ...row, provider_position: peerRole, metrics: { ...row.metrics, role: peerRole }, observed_at: now, metric_schema_version: "djm_official_basic_v2", data_depth: "basic_official", confidence: 0.99, request_metadata: { source_url: context.leagueUrl, source_domain: "veikkausliiga.com", transport: "jina_reader", method: "official_public_html_readthrough" } }; });
  const snapshot = { provider_player_id: providerPlayerId, provider_team_id: norm(clubName).replace(/\s+/g, "-"), provider_competition_id: "veikkausliiga", provider_season_id: season, season_label: season, club_name: clubName, competition_name: "Veikkausliiga", metrics: { current_season: currentSeason, role, bio: parsed.bio, source: { name: "Veikkausliiga official statistics", url: sourceUrl.toString() } }, metric_schema_version: "djm_official_basic_v2", data_depth: "basic_official", confidence: 0.99, observed_at: now, provenance: { source_url: sourceUrl.toString(), source_domain: "veikkausliiga.com", transport: "jina_reader", evidence_type: "official_league" } };
  const matches = parsed.matches.map((match: any) => { const ctx = matchContext(match.match_label, clubName); return { provider_match_id: match.provider_match_id, provider_team_id: norm(clubName).replace(/\s+/g, "-"), provider_opponent_id: ctx.opponent ? norm(ctx.opponent).replace(/\s+/g, "-") : null, competition_id: subject.current_competition_id || null, season_label: season, match_date: match.match_date, team_name: clubName, opponent_name: ctx.opponent, home_away: ctx.homeAway, position_group: positionGroup(role), provider_position: role, started: match.starts == null ? null : match.starts > 0, minutes: match.minutes, metrics: { goals: match.goals, assists: match.assists, starts: match.starts, subIn: match.sub_in, subOut: match.sub_out, fouls: match.fouls, yellowCards: match.yellow_cards, redCards: match.red_cards, offsides: match.offsides, penalties: match.penalties, penaltyGoals: match.penalty_goals, matchLabel: match.match_label }, metric_schema_version: "djm_official_match_basic_v2", data_depth: "basic_official", confidence: 0.99, observed_at: now, provenance: { source_url: sourceUrl.toString(), source_domain: "veikkausliiga.com", transport: "jina_reader" }, request_metadata: { source_url: sourceUrl.toString() } }; });
  const { data: writer, error } = await admin.rpc("djm_service_replace_official_subject_evidence", { p_subject_id: subject.subject_id, p_snapshot: snapshot, p_peers: peers, p_matches: matches });
  if (error) throw error;
  return { ok: true, subject_id: subject.subject_id, player_id: subject.player_id, prospect_id: subject.prospect_id, provider_player_id: providerPlayerId, season, league_peer_rows: peers.length, same_role_peers_180_min: role ? peers.filter((row: any) => row.provider_position === role && row.minutes >= 180).length : 0, match_rows: matches.length, writer, advanced_metrics_fabricated: false };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ ok: false, error: "Server configuration incomplete" }, 500);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  if (!(await authorise(request, admin))) return json({ ok: false, error: "Unauthorized" }, 401);
  try {
    const body = await request.json().catch(() => ({}));
    const mode = String(body?.mode || "refresh_subject").toLowerCase();
    if (mode === "status") return json({ ok: true, provider: "official_league", adapters: ["veikkausliiga"], subject_model: "universal", section_aware_parser: true, advanced_metrics_fabricated: false });
    const subjectId = String(body?.subject_id || "").trim() || null;
    const limit = mode === "refresh_all" ? 100 : 1;
    const { data: rows, error: queueError } = await admin.rpc("djm_service_official_subject_queue", { p_subject_id: subjectId, p_limit: limit });
    if (queueError) throw queueError;
    const subjects = (rows || []).filter((row: any) => trustedOfficialUrl(row.stats_url));
    const contexts = new Map<string, any>();
    const results = [];
    for (const subject of subjects) {
      try { results.push(await syncSubject(admin, subject, contexts)); }
      catch (error) { results.push({ ok: false, subject_id: subject.subject_id, reason: errorText(error) }); }
    }
    return json({ ok: true, provider: "official_league", attempted: results.length, refreshed: results.filter((row: any) => row.ok).length, failed: results.filter((row: any) => !row.ok).length, results, completed_at: new Date().toISOString() });
  } catch (error) {
    console.error(JSON.stringify({ operation: "refresh_official_football_data", error: errorText(error) }));
    return json({ ok: false, error: errorText(error) }, 500);
  }
});
