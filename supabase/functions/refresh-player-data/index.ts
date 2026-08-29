import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const cleanText = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const cleanNumber = (value: unknown) => {
  if (value == null || value === "") return null;
  const number = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : null;
};

const wholeNumber = (value: unknown) => {
  const number = cleanNumber(value);
  return number == null ? null : Math.max(0, Math.round(number));
};

const normalise = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const lastNameSearch = (player: any) => {
  const last = String(player?.last_name || "").trim();
  if (last.length >= 3) return last;
  const full = [player?.first_name, player?.last_name].filter(Boolean).join(" ").trim();
  if (full.length >= 3) return full;
  return String(player?.preferred_name || "").trim();
};

const apiBase = "https://v3.football.api-sports.io";

async function apiFootball(path: string, params: Record<string, string | number>) {
  const key = String(Deno.env.get("API_FOOTBALL_KEY") || "").trim();
  if (!key) throw new Error("Free API-Football key is not configured.");
  const query = new URLSearchParams();
  Object.entries(params).forEach(([name, value]) => query.set(name, String(value)));
  const response = await fetch(`${apiBase}${path}?${query.toString()}`, {
    headers: { "x-apisports-key": key },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`API-Football returned HTTP ${response.status}.`);
  const payload = await response.json();
  const errors = payload?.errors;
  if (errors && typeof errors === "object" && Object.keys(errors).length) {
    const message = Object.values(errors).map(String).filter(Boolean).join("; ");
    throw new Error(message || "API-Football returned an error.");
  }
  return payload;
}

function candidateScore(candidate: any, player: any) {
  const profile = candidate?.player || {};
  const fullName = normalise([player?.first_name, player?.last_name].filter(Boolean).join(" "));
  const preferred = normalise(player?.preferred_name);
  const candidateName = normalise(profile?.name);
  let score = 0;
  if (fullName && candidateName === fullName) score += 7;
  else if (preferred && candidateName === preferred) score += 6;
  else if (fullName && (candidateName.includes(fullName) || fullName.includes(candidateName))) score += 3;

  const dob = String(player?.date_of_birth || "").slice(0, 10);
  const candidateDob = String(profile?.birth?.date || "").slice(0, 10);
  if (dob && candidateDob && dob === candidateDob) score += 12;

  const nationality = normalise(Array.isArray(player?.nationalities) ? player.nationalities[0] : null);
  if (nationality && normalise(profile?.nationality) === nationality) score += 2;

  const club = normalise(player?.current_club);
  if (club) {
    const teamMatch = (candidate?.statistics || []).some((item: any) => {
      const team = normalise(item?.team?.name);
      return team && (team === club || team.includes(club) || club.includes(team));
    });
    if (teamMatch) score += 5;
  }
  return score;
}

function chooseCandidate(candidates: any[], player: any) {
  const ranked = candidates
    .map((candidate) => ({ candidate, score: candidateScore(candidate, player) }))
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  const top = ranked[0];
  const second = ranked[1];
  if (top.score < 7 && second && second.score === top.score) {
    throw new Error("DJM found multiple players with the same name. Add date of birth or current club and try again.");
  }
  if (top.score < 5) {
    throw new Error("DJM could not confidently identify this player in API-Football.");
  }
  return top.candidate;
}

function seasonCandidates(player: any) {
  const currentYear = new Date().getUTCFullYear();
  const stored = String(player?.current_season_start || "").slice(0, 4);
  const storedYear = /^\d{4}$/.test(stored) ? Number(stored) : null;
  const values = [storedYear, currentYear, currentYear - 1]
    .filter((value): value is number => Number.isInteger(value));
  return [...new Set(values)].slice(0, 2);
}

function mappedSeasonRows(item: any, requestedSeason: number) {
  const rows: any[] = [];
  for (const stat of Array.isArray(item?.statistics) ? item.statistics : []) {
    const appearances = wholeNumber(stat?.games?.appearences);
    const minutes = wholeNumber(stat?.games?.minutes);
    if ((appearances ?? 0) <= 0 && (minutes ?? 0) <= 0) continue;
    const leagueName = cleanText(stat?.league?.name);
    const teamName = cleanText(stat?.team?.name);
    if (!teamName) continue;
    rows.push({
      season_label: String(stat?.league?.season ?? requestedSeason),
      club_name: teamName,
      league: leagueName,
      country: cleanText(stat?.league?.country),
      appearances,
      starts: wholeNumber(stat?.games?.lineups),
      minutes,
      goals: wholeNumber(stat?.goals?.total),
      assists: wholeNumber(stat?.goals?.assists),
      provider_team_id: stat?.team?.id == null ? null : String(stat.team.id),
      provider_competition_id: stat?.league?.id == null ? null : String(stat.league.id),
      provider_season_id: String(stat?.league?.season ?? requestedSeason),
      raw_metrics: {
        games: stat?.games ?? null,
        substitutes: stat?.substitutes ?? null,
        shots: stat?.shots ?? null,
        goals: stat?.goals ?? null,
        passes: stat?.passes ?? null,
        tackles: stat?.tackles ?? null,
        duels: stat?.duels ?? null,
        dribbles: stat?.dribbles ?? null,
        fouls: stat?.fouls ?? null,
        cards: stat?.cards ?? null,
        penalty: stat?.penalty ?? null,
      },
    });
  }
  return rows;
}

function parseHeight(value: unknown) {
  const number = cleanNumber(value);
  if (number == null || number < 140 || number > 220) return null;
  return Math.round(number);
}

async function loadPlayerSeasons(player: any) {
  const seasons = seasonCandidates(player);
  const providerIds = player?.football_provider_ids && typeof player.football_provider_ids === "object"
    ? player.football_provider_ids
    : {};
  let providerPlayerId = cleanText(providerIds?.api_football);
  let resolvedProfile: any = null;
  const results: Array<{ season: number; item: any }> = [];

  if (!providerPlayerId) {
    const search = lastNameSearch(player);
    if (!search || search.length < 3) throw new Error("Player name is too short to resolve automatically.");
    for (const season of seasons) {
      const payload = await apiFootball("/players", { search, season });
      const candidate = chooseCandidate(Array.isArray(payload?.response) ? payload.response : [], player);
      if (!candidate) continue;
      providerPlayerId = String(candidate?.player?.id || "").trim();
      if (!providerPlayerId) continue;
      resolvedProfile = candidate?.player || null;
      results.push({ season, item: candidate });
      break;
    }
  }

  if (!providerPlayerId) throw new Error("Player was not found in the free API-Football coverage.");

  for (const season of seasons) {
    if (results.some((item) => item.season === season)) continue;
    try {
      const payload = await apiFootball("/players", { id: providerPlayerId, season });
      const item = Array.isArray(payload?.response) ? payload.response[0] : null;
      if (item) {
        resolvedProfile = resolvedProfile || item?.player || null;
        results.push({ season, item });
      }
    } catch {
      // Free plans expose limited historical seasons. A missing older season must not fail the current refresh.
    }
  }

  return { providerPlayerId, profile: resolvedProfile, results };
}

async function syncRows(admin: any, playerId: string, providerPlayerId: string, results: Array<{ season: number; item: any }>) {
  const allRows = results.flatMap(({ season, item }) => mappedSeasonRows(item, season));
  const { data: existing, error } = await admin
    .from("career_entries")
    .select("id,season_label,club_name,league,source_name,source_reviewed_at,source_provider")
    .eq("player_id", playerId);
  if (error) throw error;

  let inserted = 0;
  let updated = 0;
  let conflicts = 0;
  const now = new Date().toISOString();

  for (const row of allRows) {
    const exact = (existing || []).find((entry: any) =>
      normalise(entry?.season_label) === normalise(row.season_label) &&
      normalise(entry?.club_name) === normalise(row.club_name) &&
      normalise(entry?.league) === normalise(row.league)
    );
    const ownedByProvider = exact && (
      normalise(exact?.source_provider) === "api football" ||
      normalise(exact?.source_name) === "api football"
    );
    if (exact && exact?.source_reviewed_at && !ownedByProvider) {
      conflicts += 1;
      continue;
    }

    const payload = {
      player_id: playerId,
      season_label: row.season_label,
      club_name: row.club_name,
      league: row.league,
      country: row.country,
      appearances: row.appearances,
      starts: row.starts,
      minutes: row.minutes,
      goals: row.goals,
      assists: row.assists,
      source_name: "API-Football",
      source_url: "https://www.api-football.com/",
      source_reviewed_at: now,
      source_provider: "api_football",
      source_acceptance_method: "licensed_sync",
      source_provider_player_id: providerPlayerId,
      source_synced_at: now,
    };

    if (exact?.id) {
      const { error: updateError } = await admin.from("career_entries").update(payload).eq("id", exact.id);
      if (updateError) throw updateError;
      updated += 1;
    } else {
      const { error: insertError } = await admin.from("career_entries").insert(payload);
      if (insertError) throw insertError;
      inserted += 1;
    }

    const snapshot = {
      player_id: playerId,
      provider: "api_football",
      provider_player_id: providerPlayerId,
      provider_team_id: row.provider_team_id,
      provider_competition_id: row.provider_competition_id,
      provider_season_id: row.provider_season_id,
      season_label: row.season_label,
      club_name: row.club_name,
      competition_name: row.league,
      metrics: row.raw_metrics,
      observed_at: now,
      synced_at: now,
    };
    const { error: snapshotError } = await admin
      .schema("djm_os")
      .from("player_provider_stat_snapshots")
      .upsert(snapshot, {
        onConflict: "player_id,provider,provider_season_id,provider_competition_id,provider_team_id",
      });
    if (snapshotError) throw snapshotError;
  }

  return { rows: allRows, inserted, updated, conflicts };
}

function bestCurrentRow(rows: any[]) {
  return [...rows].sort((a, b) =>
    Number(b?.provider_season_id || 0) - Number(a?.provider_season_id || 0) ||
    Number(b?.minutes || 0) - Number(a?.minutes || 0)
  )[0] || null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) return json({ ok: false, error: "Unauthorized" }, 401);
    const { data: profile } = await admin.from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
    if (profile?.role !== "admin") return json({ ok: false, error: "Admin access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "refresh").toLowerCase();
    const configured = Boolean(String(Deno.env.get("API_FOOTBALL_KEY") || "").trim());
    if (mode === "status") {
      return json({
        ok: true,
        provider: "api_football",
        configured,
        plan: "free_supported",
        daily_request_budget: 100,
      });
    }
    if (!configured) return json({ ok: false, error: "Free API-Football key is not configured." }, 503);

    const playerId = String(body?.player_id || "").trim();
    if (!playerId) return json({ ok: false, error: "Player is required" }, 400);

    const { data: player, error: playerError } = await admin
      .from("players")
      .select("id,first_name,last_name,preferred_name,date_of_birth,nationalities,height_cm,primary_position,current_club,current_league,current_country,current_season_start,football_provider_ids")
      .eq("id", playerId)
      .maybeSingle();
    if (playerError) throw playerError;
    if (!player) return json({ ok: false, error: "Player not found" }, 404);

    const resolved = await loadPlayerSeasons(player);
    const synced = await syncRows(admin, playerId, resolved.providerPlayerId, resolved.results);
    const current = bestCurrentRow(synced.rows);
    const remote = resolved.profile || {};
    const nextProviderIds = {
      ...(player.football_provider_ids && typeof player.football_provider_ids === "object" ? player.football_provider_ids : {}),
      api_football: resolved.providerPlayerId,
    };
    const patch: Record<string, unknown> = { football_provider_ids: nextProviderIds };
    if (!player.height_cm) patch.height_cm = parseHeight(remote?.height);
    if ((!Array.isArray(player.nationalities) || !player.nationalities.length) && remote?.nationality) {
      patch.nationalities = [String(remote.nationality)];
    }
    if (!player.current_club && current?.club_name) patch.current_club = current.club_name;
    if (!player.current_league && current?.league) patch.current_league = current.league;
    if (!player.current_country && current?.country) patch.current_country = current.country;
    if (!player.primary_position && cleanText(current?.raw_metrics?.games?.position)) {
      patch.primary_position = cleanText(current.raw_metrics.games.position);
    }
    const { error: patchError } = await admin.from("players").update(patch).eq("id", playerId);
    if (patchError) throw patchError;

    let scoreResult: unknown = null;
    try {
      const { data } = await admin.rpc("djm_player_scorecard", { p_player_id: playerId });
      scoreResult = data;
    } catch {
      // Score V2 may not be installed yet in a preview environment. Data sync still succeeds independently.
    }

    return json({
      ok: true,
      provider: "API-Football",
      provider_player_id: resolved.providerPlayerId,
      seasons_checked: resolved.results.map((item) => item.season),
      rows_found: synced.rows.length,
      rows_inserted: synced.inserted,
      rows_updated: synced.updated,
      conflicts_kept_for_review: synced.conflicts,
      score_result: scoreResult,
      message: synced.conflicts
        ? `Player data refreshed. ${synced.conflicts} existing reviewed season record${synced.conflicts === 1 ? " was" : "s were"} left untouched.`
        : "Player data refreshed from API-Football.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Player data refresh failed";
    console.error(JSON.stringify({ provider: "api_football", operation: "refresh_player", result_status: "failed", error: message }));
    return json({ ok: false, error: message, existing_data_changed: false }, 500);
  }
});
