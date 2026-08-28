import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const cleanNumber = (value: unknown) => {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
};

const safeInt = (value: unknown) => cleanNumber(value) ?? 0;

const errorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const candidate = (error as any).message ?? (error as any).error ?? (error as any).details ?? (error as any).hint;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "Stats sync failed";
};

const seasonRank = (label: unknown) => {
  const value = String(label || "");
  const four = value.match(/(19|20)\d{2}/);
  if (four) return Number(four[0]);
  const two = value.match(/\b(\d{2})\/(\d{2})\b/);
  if (two) {
    const n = Number(two[1]);
    return n < 50 ? 2000 + n : 1900 + n;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const browserHeaders = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "en-GB,en;q=0.9",
};

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { ...browserHeaders, ...headers },
        signal: AbortSignal.timeout(12000),
      });
      if (response.ok) return await response.json();
      lastError = new Error(`Source returned HTTP ${response.status}`);
      const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
      if (!retryable) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) await sleep(300 * (attempt + 1));
  }
  throw lastError instanceof Error ? lastError : new Error("External football data provider did not respond.");
}

function lastNumericId(value: string) {
  const matches = String(value || "").match(/\d+/g);
  return matches?.length ? matches[matches.length - 1] : null;
}

const competitionMap: Record<string, string> = {
  SE1: "Allsvenskan",
  SE2: "Superettan",
  SE3N: "Ettan Norra",
  SE3S: "Ettan Södra",
  SEC: "Svenska Cupen",
};

const friendlyCompetitionValue = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  return competitionMap[text.toUpperCase()] || text;
};

const competitionLabel = (game: any, item?: any) => {
  const candidates = [
    game?.competitionName,
    game?.competition?.name,
    game?.competition?.displayName,
    game?.competition?.display,
    game?.competition?.shortName,
    item?.competition?.name,
    item?.competitionName,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return friendlyCompetitionValue(value);
  }
  return friendlyCompetitionValue(game?.competitionId);
};

async function sofaGet(path: string) {
  const bases = ["https://api.sofascore.com/api/v1", "https://www.sofascore.com/api/v1"];
  let last: unknown = null;
  for (const base of bases) {
    try {
      return await fetchJson(`${base}${path}`, { Referer: "https://www.sofascore.com/" });
    } catch (error) {
      last = error;
    }
  }
  throw last instanceof Error ? last : new Error("SofaScore request failed");
}

async function sofaPreview(sourceUrl: string) {
  const playerId = lastNumericId(sourceUrl);
  if (!playerId) throw new Error("Could not identify the SofaScore player ID from the saved URL.");

  const [profilePayload, seasonsPayload] = await Promise.all([
    sofaGet(`/player/${playerId}`),
    sofaGet(`/player/${playerId}/statistics/seasons`),
  ]);

  const profile = profilePayload?.player || {};
  const entries = Array.isArray(seasonsPayload?.uniqueTournamentSeasons) ? seasonsPayload.uniqueTournamentSeasons : [];
  const pairs: any[] = [];

  for (const entry of entries) {
    const tournament = entry?.uniqueTournament || {};
    for (const season of Array.isArray(entry?.seasons) ? entry.seasons : []) {
      if (!tournament?.id || !season?.id) continue;
      pairs.push({ tournament, season, rank: seasonRank(season?.year || season?.name || season?.id) });
    }
  }

  pairs.sort((a, b) => b.rank - a.rank);
  const recentYears = [...new Set(pairs.map((x) => x.rank).filter(Boolean))].slice(0, 4);
  const selected = pairs.filter((x) => recentYears.includes(x.rank)).slice(0, 18);

  const fetched = await Promise.allSettled(selected.map(async (pair) => ({
    pair,
    data: await sofaGet(`/player/${playerId}/unique-tournament/${pair.tournament.id}/season/${pair.season.id}/statistics/overall`),
  })));

  const grouped = new Map<string, any>();
  for (const item of fetched) {
    if (item.status !== "fulfilled") continue;
    const { pair, data } = item.value;
    const stats = data?.statistics || {};
    const team = data?.team || profile?.team || {};
    if (team?.national === true || safeInt(stats?.appearances) <= 0) continue;

    const season = String(pair?.season?.year || pair?.season?.name || pair?.season?.id || "").trim();
    const club = String(team?.name || "").trim();
    if (!season || !club) continue;

    const key = `${season.toLowerCase()}|${String(team?.id || club).toLowerCase()}`;
    const row = grouped.get(key) || {
      season_label: season,
      club_name: club,
      country: team?.country?.name || null,
      appearances: 0,
      starts: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
      competitions: new Set<string>(),
    };

    row.appearances += safeInt(stats?.appearances);
    row.starts += safeInt(stats?.matchesStarted);
    row.minutes += safeInt(stats?.minutesPlayed);
    row.goals += safeInt(stats?.goals);
    row.assists += safeInt(stats?.assists ?? stats?.goalAssist);
    if (pair?.tournament?.name) row.competitions.add(String(pair.tournament.name));
    grouped.set(key, row);
  }

  const rows = [...grouped.values()]
    .sort((a, b) => seasonRank(b.season_label) - seasonRank(a.season_label))
    .slice(0, 8)
    .map((row: any, index) => ({
      season_label: row.season_label,
      club_name: row.club_name,
      league: row.competitions.size === 1 ? [...row.competitions][0] : "All competitions",
      country: row.country,
      appearances: row.appearances,
      starts: row.starts,
      minutes: row.minutes,
      goals: row.goals,
      assists: row.assists,
      source_name: "SofaScore",
      source_url: sourceUrl,
      sort_order: index,
    }));

  let recent_matches: any[] = [];
  try {
    const eventsPayload = await sofaGet(`/player/${playerId}/events/last/0`);
    const events = Array.isArray(eventsPayload?.events) ? eventsPayload.events.slice(0, 6) : [];
    const currentTeamId = profile?.team?.id;
    const details = await Promise.allSettled(events.map(async (event: any) => {
      let playerStats: any = {};
      try {
        const raw = await sofaGet(`/event/${event.id}/player/${playerId}/statistics`);
        playerStats = raw?.statistics || raw || {};
      } catch {}
      const homeCurrent = currentTeamId && event?.homeTeam?.id === currentTeamId;
      const awayCurrent = currentTeamId && event?.awayTeam?.id === currentTeamId;
      const home = event?.homeScore?.current;
      const away = event?.awayScore?.current;
      return {
        date: event?.startTimestamp ? new Date(Number(event.startTimestamp) * 1000).toISOString().slice(0, 10) : null,
        competition: event?.tournament?.uniqueTournament?.name || event?.tournament?.name || null,
        club: homeCurrent ? event?.homeTeam?.name : awayCurrent ? event?.awayTeam?.name : profile?.team?.name || null,
        opponent: homeCurrent ? event?.awayTeam?.name : awayCurrent ? event?.homeTeam?.name : null,
        minutes: cleanNumber(playerStats?.minutesPlayed),
        started: typeof playerStats?.substitute === "boolean" ? !playerStats.substitute : null,
        goals: cleanNumber(playerStats?.goals),
        assists: cleanNumber(playerStats?.goalAssist ?? playerStats?.assists),
        result: home != null && away != null ? `${event?.homeTeam?.shortName || event?.homeTeam?.name || "Home"} ${home}-${away} ${event?.awayTeam?.shortName || event?.awayTeam?.name || "Away"}` : null,
      };
    }));
    recent_matches = details.filter((x): x is PromiseFulfilledResult<any> => x.status === "fulfilled").map((x) => x.value);
  } catch {}

  return {
    ok: true,
    source: "sofascore",
    source_name: "SofaScore",
    source_url: sourceUrl,
    player: { name: profile?.name || null, club: profile?.team?.name || null },
    rows,
    recent_matches,
    warnings: rows.length ? [] : ["SofaScore returned no usable season totals for this player."],
  };
}

const clubCache = new Map<string, Promise<any>>();
async function tmClub(idValue: unknown) {
  const id = String(idValue || "").trim();
  if (!id) return null;
  if (!clubCache.has(id)) {
    clubCache.set(id, fetchJson(`https://tmapi.transfermarkt.technology/club/${encodeURIComponent(id)}`)
      .then((x) => x?.data || null)
      .catch(() => null));
  }
  return await clubCache.get(id)!;
}

async function transfermarktPreview(sourceUrl: string) {
  const idMatch = sourceUrl.match(/\/spieler\/(\d+)/i);
  const playerId = idMatch?.[1] || lastNumericId(sourceUrl);
  if (!playerId) throw new Error("Could not identify the Transfermarkt player ID from the saved URL.");

  const payload = await fetchJson(`https://tmapi.transfermarkt.technology/player/${encodeURIComponent(playerId)}/performance-game`);
  const performances = Array.isArray(payload?.data?.performance) ? payload.data.performance : [];
  if (!performances.length) throw new Error("Transfermarkt returned no match performance data for this player.");

  const grouped = new Map<string, any>();
  for (const item of performances) {
    const game = item?.gameInformation || {};
    const stats = item?.statistics || {};
    const general = stats?.generalStatistics || {};
    const playing = stats?.playingTimeStatistics || {};
    const goal = stats?.goalStatistics || {};
    if (game?.isNationalGame === true || game?.competitionId === "FS") continue;
    if (general?.participationState && general.participationState !== "played") continue;
    const minutes = safeInt(playing?.playedMinutes);
    if (!general?.participationState && minutes <= 0) continue;
    const clubId = item?.clubsInformation?.club?.clubId;
    if (!clubId) continue;
    const season = String(game?.season?.nonCyclicalName || game?.season?.display || game?.seasonId || "").trim();
    if (!season) continue;

    const key = `${season.toLowerCase()}|${clubId}`;
    const row = grouped.get(key) || {
      season_label: season,
      club_id: String(clubId),
      appearances: 0,
      starts: 0,
      minutes: 0,
      goals: 0,
      assists: 0,
      competitions: new Set<string>(),
    };
    row.appearances += 1;
    row.starts += playing?.isStarting ? 1 : 0;
    row.minutes += minutes;
    row.goals += safeInt(goal?.goalsScoredTotalOfficial ?? goal?.goalsScoredTotal);
    row.assists += safeInt(goal?.assistsOfficial ?? goal?.assists);
    const competition = competitionLabel(game, item);
    if (competition) row.competitions.add(competition);
    grouped.set(key, row);
  }

  const groupedRows = [...grouped.values()]
    .sort((a, b) => seasonRank(b.season_label) - seasonRank(a.season_label))
    .slice(0, 8);

  const recentRaw = [...performances]
    .filter((item: any) => item?.gameInformation?.isNationalGame !== true && safeInt(item?.statistics?.playingTimeStatistics?.playedMinutes) > 0)
    .sort((a: any, b: any) => String(b?.gameInformation?.date?.dateTimeUTC || "").localeCompare(String(a?.gameInformation?.date?.dateTimeUTC || "")))
    .slice(0, 6);

  const clubIds = new Set<string>();
  groupedRows.forEach((x: any) => clubIds.add(x.club_id));
  recentRaw.forEach((x: any) => {
    const clubs = x?.clubsInformation || {};
    if (clubs?.club?.clubId) clubIds.add(String(clubs.club.clubId));
    if (clubs?.opponent?.clubId) clubIds.add(String(clubs.opponent.clubId));
  });
  await Promise.all([...clubIds].map((id) => tmClub(id)));

  const rows = await Promise.all(groupedRows.map(async (row: any, index) => {
    const club = await tmClub(row.club_id);
    return {
      season_label: row.season_label,
      club_name: club?.name || row.club_id,
      league: row.competitions.size === 1 ? [...row.competitions][0] : "All competitions",
      country: null,
      appearances: row.appearances,
      starts: row.starts,
      minutes: row.minutes,
      goals: row.goals,
      assists: row.assists,
      source_name: "Transfermarkt",
      source_url: sourceUrl,
      sort_order: index,
    };
  }));

  const recent_matches = await Promise.all(recentRaw.map(async (item: any) => {
    const game = item?.gameInformation || {};
    const stats = item?.statistics || {};
    const playing = stats?.playingTimeStatistics || {};
    const goal = stats?.goalStatistics || {};
    const clubs = item?.clubsInformation || {};
    const club = clubs?.club?.clubId ? await tmClub(clubs.club.clubId) : null;
    const opponent = clubs?.opponent?.clubId ? await tmClub(clubs.opponent.clubId) : null;
    return {
      date: String(game?.date?.dateTimeUTC || "").slice(0, 10) || null,
      competition: competitionLabel(game, item),
      club: club?.name || null,
      opponent: opponent?.name || null,
      minutes: cleanNumber(playing?.playedMinutes),
      started: typeof playing?.isStarting === "boolean" ? playing.isStarting : null,
      goals: cleanNumber(goal?.goalsScoredTotalOfficial ?? goal?.goalsScoredTotal),
      assists: cleanNumber(goal?.assistsOfficial ?? goal?.assists),
      result: null,
    };
  }));

  return {
    ok: true,
    source: "transfermarkt",
    source_name: "Transfermarkt",
    source_url: sourceUrl,
    player: { name: null, club: rows?.[0]?.club_name || null },
    rows,
    recent_matches,
    warnings: ["Transfermarkt data should be reviewed before applying. DJM approval records the source and review time."],
  };
}

async function previewForPlayer(admin: any, playerId: string, requestedSource: string) {
  const { data: player, error } = await admin
    .from("players")
    .select("id,stats_url,transfermarkt_url")
    .eq("id", playerId)
    .maybeSingle();
  if (error) throw error;
  if (!player) throw new Error("Player not found");

  const statsUrl = String(player.stats_url || "").trim();
  const tmUrl = String(player.transfermarkt_url || "").trim();
  const hasSofa = /sofascore\./i.test(statsUrl);
  const hasTm = /transfermarkt\./i.test(tmUrl);
  const explicit = ["sofascore", "transfermarkt"].includes(requestedSource) ? requestedSource : null;

  if (explicit === "sofascore") {
    if (!hasSofa) throw new Error("Add the player's SofaScore profile URL in the Statistics field first.");
    return await sofaPreview(statsUrl);
  }
  if (explicit === "transfermarkt") {
    if (!hasTm) throw new Error("Add the player's Transfermarkt profile URL first.");
    return await transfermarktPreview(tmUrl);
  }

  const failures: string[] = [];
  if (hasSofa) {
    try { return await sofaPreview(statsUrl); }
    catch (error) { failures.push(`SofaScore: ${errorMessage(error)}`); }
  }
  if (hasTm) {
    try { return await transfermarktPreview(tmUrl); }
    catch (error) { failures.push(`Transfermarkt: ${errorMessage(error)}`); }
  }
  if (!hasSofa && !hasTm) throw new Error("Add a SofaScore or Transfermarkt player URL before refreshing stats.");
  throw new Error(`Could not refresh from the saved sources. ${failures.join(" · ")}`);
}

const standardLabels = new Set([
  "apps", "app", "appearances", "appearance", "starts", "start", "minutes", "minute", "mins", "min",
  "goals", "goal", "assists", "assist", "g+a", "g + a", "ga", "goal contributions", "goal contribution",
]);

const normaliseLabel = (value: unknown) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

const manualCustomStats = (value: any) => (Array.isArray(value) ? value : [])
  .filter((item: any) => item && typeof item === "object")
  .filter((item: any) => !standardLabels.has(normaliseLabel(item?.label ?? item?.name)))
  .map((item: any) => ({
    label: String(item?.label ?? item?.name ?? "").trim(),
    value: String(item?.value ?? item?.stat ?? "").trim(),
  }))
  .filter((item: any) => item.label && item.value);

const positionGroup = (position: unknown) => {
  const value = String(position || "").toLowerCase();
  if (value.includes("goalkeep") || value === "gk") return "goalkeeper";
  if (value.includes("winger") || value.includes("forward") || value.includes("striker") || value.includes("attacking") || ["rw", "lw", "cf", "st"].includes(value)) return "attacking";
  if (value.includes("defender") || value.includes("centre-back") || value.includes("center-back") || value.includes("full-back") || ["cb", "lb", "rb", "lcb", "rcb"].includes(value)) return "defensive";
  return "general";
};

const authoritativeStats = (row: any, position: unknown) => {
  if (!row) return [];
  const apps = cleanNumber(row.appearances);
  const starts = cleanNumber(row.starts);
  const minutes = cleanNumber(row.minutes);
  const goals = cleanNumber(row.goals);
  const assists = cleanNumber(row.assists);
  const ga = goals !== null || assists !== null ? (goals || 0) + (assists || 0) : null;
  const values: Record<string, string | null> = {
    Apps: apps === null ? null : String(apps),
    Starts: starts === null ? null : String(starts),
    Minutes: minutes === null ? null : minutes.toLocaleString("en-GB"),
    Goals: goals === null ? null : String(goals),
    Assists: assists === null ? null : String(assists),
    "G + A": ga === null ? null : String(ga),
  };
  const group = positionGroup(position);
  const order = group === "goalkeeper"
    ? ["Starts", "Apps", "Minutes"]
    : group === "defensive"
      ? ["Starts", "Minutes", "Apps", "Goals"]
      : group === "attacking"
        ? ["Apps", "Goals", "Assists", "G + A", "Minutes"]
        : ["Apps", "Starts", "Minutes", "Goals", "Assists"];
  return order
    .filter((label) => values[label] !== null)
    .slice(0, 4)
    .map((label) => ({ label, value: values[label]! }));
};

const timelineRow = (row: any) => ({
  club_name: row.club_name,
  country: row.country,
  league: row.league,
  season_label: row.season_label,
  start_date: row.start_date,
  end_date: row.end_date,
  appearances: row.appearances,
  starts: row.starts,
  minutes: row.minutes,
  goals: row.goals,
  assists: row.assists,
  is_international: row.is_international,
  source_name: row.source_name,
  source_url: row.source_url,
  source_reviewed_at: row.source_reviewed_at,
  sort_order: row.sort_order,
});

async function applyRows(admin: any, caller: any, playerId: string, rows: any[], sourceName: string, sourceUrl: string | null) {
  if (!playerId || !rows.length) throw new Error("Missing player or stats rows");

  const [{ data: playerBefore, error: playerError }, { data: publicBefore }, { data: cvBefore }] = await Promise.all([
    admin.from("players").select("id,primary_position,verification_status,verified_at").eq("id", playerId).maybeSingle(),
    admin.from("player_public_profiles").select("player_id,published,key_stats,verified_at").eq("player_id", playerId).maybeSingle(),
    admin.from("player_cv_settings").select("player_id,key_stats").eq("player_id", playerId).maybeSingle(),
  ]);

  if (playerError) throw playerError;
  if (!playerBefore) throw new Error("Player not found");

  const wasVerified = playerBefore.verification_status === "verified" && !!playerBefore.verified_at;
  const wasLive = !!publicBefore?.published && wasVerified;
  const reviewedAt = new Date().toISOString();

  const cleanRows = rows.map((row: any, index: number) => ({
    season_label: String(row?.season_label || "").trim(),
    club_name: String(row?.club_name || "").trim(),
    league: friendlyCompetitionValue(row?.league),
    country: String(row?.country || "").trim() || null,
    appearances: cleanNumber(row?.appearances),
    starts: cleanNumber(row?.starts),
    minutes: cleanNumber(row?.minutes),
    goals: cleanNumber(row?.goals),
    assists: cleanNumber(row?.assists),
    source_name: String(row?.source_name || sourceName || "DJM reviewed source").trim() || "DJM reviewed source",
    source_url: String(row?.source_url || sourceUrl || "").trim() || null,
    sort_order: cleanNumber(row?.sort_order) ?? index,
  })).filter((row: any) => row.season_label && row.club_name);

  if (!cleanRows.length) throw new Error("Every approved row needs at least a season and club");

  const { data: existing, error: existingError } = await caller
    .from("career_entries")
    .select("id,season_label,club_name,league,country")
    .eq("player_id", playerId);
  if (existingError) throw existingError;

  let inserted = 0;
  let updated = 0;

  for (const row of cleanRows) {
    const candidates = (existing || []).filter((entry: any) =>
      String(entry.season_label || "").toLowerCase() === row.season_label.toLowerCase() &&
      String(entry.club_name || "").toLowerCase() === row.club_name.toLowerCase()
    );
    const exact = candidates.find((entry: any) =>
      String(entry.league || "").toLowerCase() === String(row.league || "").toLowerCase()
    );
    const match = exact || candidates[0];
    const payload = {
      player_id: playerId,
      season_label: row.season_label,
      club_name: row.club_name,
      league: row.league && row.league !== "All competitions" ? row.league : String(match?.league || "").trim() || row.league,
      country: row.country || String(match?.country || "").trim() || null,
      appearances: row.appearances,
      starts: row.starts,
      minutes: row.minutes,
      goals: row.goals,
      assists: row.assists,
      source_name: row.source_name,
      source_url: row.source_url,
      source_reviewed_at: reviewedAt,
      sort_order: row.sort_order,
    };

    if (match?.id) {
      const { error } = await caller.from("career_entries").update(payload).eq("id", match.id);
      if (error) throw error;
      updated++;
    } else {
      const { error } = await caller.from("career_entries").insert(payload);
      if (error) throw error;
      inserted++;
    }
  }

  const { data: career, error: careerError } = await caller
    .from("career_entries")
    .select("*")
    .eq("player_id", playerId)
    .order("sort_order", { ascending: true })
    .order("start_date", { ascending: false });
  if (careerError) throw careerError;

  const careerRows = Array.isArray(career) ? career : [];
  const latestReviewed = [...careerRows]
    .filter((row: any) => !!row.source_reviewed_at)
    .sort((a: any, b: any) => seasonRank(b.season_label) - seasonRank(a.season_label) || Number(a.sort_order || 0) - Number(b.sort_order || 0))[0] || null;

  const custom = manualCustomStats(cvBefore?.key_stats?.length ? cvBefore.key_stats : publicBefore?.key_stats);
  const standard = authoritativeStats(latestReviewed, playerBefore.primary_position);
  const mergedKeyStats = [...standard, ...custom];
  const timeline = careerRows.map(timelineRow);

  if (cvBefore?.player_id) {
    const { error } = await caller
      .from("player_cv_settings")
      .update({ key_stats: mergedKeyStats })
      .eq("player_id", playerId);
    if (error) throw error;
  }

  let verificationRestored = false;
  if (wasVerified) {
    const { error } = await caller
      .from("players")
      .update({
        verification_status: "verified",
        verified_at: reviewedAt,
        review_required_at: null,
        review_reason: null,
      })
      .eq("id", playerId);
    if (error) throw error;
    verificationRestored = true;
  }

  let dossierRefreshed = false;
  let keptLive = false;
  if (publicBefore?.player_id) {
    const { error } = await caller
      .from("player_public_profiles")
      .update({
        career_timeline: timeline,
        key_stats: mergedKeyStats,
        verified_at: wasVerified ? reviewedAt : null,
        published: wasLive,
      })
      .eq("player_id", playerId);
    if (error) throw error;
    dossierRefreshed = true;
    keptLive = wasLive;
  }

  return {
    ok: true,
    inserted,
    updated,
    total: cleanRows.length,
    dossier_refreshed: dossierRefreshed,
    pdf_refreshed: dossierRefreshed,
    verification_restored: verificationRestored,
    kept_live: keptLive,
    key_stats: mergedKeyStats,
    message: keptLive
      ? "Sporting record reviewed. Player dossier and PDF data refreshed; live club profile kept live."
      : dossierRefreshed
        ? "Sporting record reviewed. Player dossier and PDF data refreshed."
        : "Sporting record reviewed and saved.",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const callerKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceKey;
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) return json({ ok: false, error: "Unauthorized" }, 401);

    const { data: profile } = await admin.from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
    if (profile?.role !== "admin") return json({ ok: false, error: "Admin access required" }, 403);

    const caller = createClient(url, callerKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "preview").toLowerCase();
    const playerId = String(body?.player_id || "").trim();

    if (mode === "preview") {
      if (!playerId) return json({ ok: false, error: "Missing player" });
      try {
        return json(await previewForPlayer(admin, playerId, String(body?.source || "auto").toLowerCase()));
      } catch (error) {
        console.error("import-player-stats preview", error);
        return json({ ok: false, error: errorMessage(error) });
      }
    }

    if (mode === "apply") {
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      const sourceName = String(body?.source_name || "DJM reviewed source").trim();
      const sourceUrl = String(body?.source_url || "").trim() || null;
      try {
        return json(await applyRows(admin, caller, playerId, rows, sourceName, sourceUrl));
      } catch (error) {
        console.error("import-player-stats apply", error);
        return json({ ok: false, error: errorMessage(error) });
      }
    }

    return json({ ok: false, error: "Unknown mode" });
  } catch (error) {
    console.error("import-player-stats fatal", error);
    return json({ ok: false, error: errorMessage(error) }, 500);
  }
});
