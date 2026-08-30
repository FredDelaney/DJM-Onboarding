// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PITCH_BASE = "https://api.pitchapi.dev";

const CODE_COUNTRIES = {
  ENG: "England", SCO: "Scotland", WAL: "Wales", IRL: "Republic of Ireland",
  ITA: "Italy", ESP: "Spain", GER: "Germany", FRA: "France", POR: "Portugal",
  NED: "Netherlands", BEL: "Belgium", AUT: "Austria", SUI: "Switzerland", DEN: "Denmark",
  NOR: "Norway", SWE: "Sweden", FIN: "Finland", POL: "Poland", CRO: "Croatia",
  SRB: "Serbia", ROU: "Romania", GRE: "Greece", TUR: "Turkey", ISR: "Israel",
  JPN: "Japan", KOR: "South Korea", AUS: "Australia", NZL: "New Zealand",
  THA: "Thailand", MAS: "Malaysia", IDN: "Indonesia", SGP: "Singapore", USA: "United States",
  BRA: "Brazil", ARG: "Argentina", MEX: "Mexico", KSA: "Saudi Arabia", UAE: "United Arab Emirates", QAT: "Qatar"
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const clean = (value) => {
  const result = String(value ?? "").trim();
  return result || null;
};
const num = (value) => {
  if (value == null || value === "") return null;
  const result = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(result) ? result : null;
};
const norm = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function secretCandidates() {
  return [
    clean(Deno.env.get("PITCH_API_KEY")),
    clean(Deno.env.get("API_FOOTBALL_KEY")),
  ].filter((value, index, all) => value && all.indexOf(value) === index);
}

async function probePitch(key) {
  try {
    const response = await fetch(`${PITCH_BASE}/v1/leagues`, {
      headers: { "X-API-KEY": key },
      signal: AbortSignal.timeout(8000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function resolvePitchKey() {
  for (const key of secretCandidates()) {
    if (await probePitch(key)) return key;
  }
  return null;
}

async function pitch(path, key) {
  const response = await fetch(`${PITCH_BASE}${path}`, {
    headers: { "X-API-KEY": key },
    signal: AbortSignal.timeout(18000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.error) {
    throw new Error(
      payload?.error?.message || payload?.error || `PitchAPI returned HTTP ${response.status}.`,
    );
  }
  return payload?.data ?? payload;
}

async function inBatches(values, size, worker) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(...(await Promise.all(values.slice(index, index + size).map(worker))));
  }
  return output;
}

function finishedMatch(match) {
  return (
    match?.status === "finished" ||
    match?.finished === true ||
    (match?.score_home != null && match?.score_away != null)
  );
}

function pitchRole(positionId) {
  return positionId === 1
    ? "goalkeeper"
    : positionId === 2
      ? "defender"
      : positionId === 3
        ? "midfielder"
        : positionId === 4
          ? "attacker"
          : "unknown";
}

function flattenPitchBasic(line) {
  const flat = {};
  for (const group of line?.stats || []) {
    for (const entry of Object.values(group?.stats || {})) {
      const key = entry?.key;
      const stat = entry?.stat || {};
      if (!key) continue;
      flat[key] = stat?.value ?? null;
      if (stat?.total != null) flat[`${key}_total`] = stat.total;
      if (stat?.percentage != null) flat[`${key}_percentage`] = stat.percentage;
    }
  }
  return flat;
}

function findFlat(flat, keys) {
  for (const key of keys) {
    const value = num(flat?.[key]);
    if (value != null) return value;
  }
  return null;
}

function mergePitchMatchPlayers(basicData, advancedData, match) {
  const basics = Array.isArray(basicData) ? basicData : [];
  const advanced = advancedData?.players || [];
  const rows = new Map();

  for (const basic of basics) {
    const id = String(basic?.player?.id || "");
    if (!id) continue;
    rows.set(id, {
      provider_player_id: id,
      provider_team_id: String(basic?.team_id || ""),
      player_name: clean(basic?.player?.name),
      provider_position_id: basic?.player?.position_id ?? basic?.position_id ?? null,
      provider_position: pitchRole(basic?.player?.position_id ?? basic?.position_id),
      basic: flattenPitchBasic(basic),
      advanced: null,
      match_id: match.id,
    });
  }

  for (const advancedRow of advanced) {
    const id = String(advancedRow?.player?.id || "");
    if (!id) continue;
    const existing = rows.get(id) || {
      provider_player_id: id,
      provider_team_id: String(advancedRow?.team_id || ""),
      player_name: clean(advancedRow?.player?.name),
      provider_position_id: advancedRow?.player?.position_id ?? null,
      provider_position: pitchRole(advancedRow?.player?.position_id),
      basic: {},
      advanced: null,
      match_id: match.id,
    };
    existing.advanced = advancedRow;
    if (!existing.provider_team_id) existing.provider_team_id = String(advancedRow?.team_id || "");
    rows.set(id, existing);
  }

  return [...rows.values()];
}

function aggregatePitch(rows) {
  const players = new Map();

  for (const row of rows) {
    let aggregate = players.get(row.provider_player_id);
    if (!aggregate) {
      aggregate = {
        id: row.provider_player_id,
        teamId: row.provider_team_id,
        name: row.player_name,
        role: row.provider_position,
        minutes: 0,
        matches: new Set(),
        goals: 0,
        assists: 0,
        xg: 0,
        xa: 0,
        ratingWeighted: 0,
        ratingMinutes: 0,
        passes: 0,
        keyPasses: 0,
        progressivePasses: 0,
        passesIntoBox: 0,
        passAccuracyWeighted: 0,
        passAccuracyWeight: 0,
        progressiveCarries: 0,
        carriesIntoFinalThird: 0,
        carriesIntoBox: 0,
        takeOns: 0,
        takeOnsWon: 0,
        sca: 0,
        gca: 0,
        xag: 0,
        tackles: 0,
        interceptions: 0,
        blocks: 0,
        clearances: 0,
        duelsWon: 0,
        aerials: 0,
        aerialsWon: 0,
        xt: 0,
        vaep: 0,
        vaepOff: 0,
        vaepDef: 0,
        claims: 0,
        claimsWon: 0,
        sweeperActions: 0,
        distributions: 0,
        distributionAccuracyWeighted: 0,
        distributionWeight: 0,
        distance: 0,
        sprints: 0,
        topSpeedMax: null,
      };
      players.set(row.provider_player_id, aggregate);
    }

    const basic = row.basic || {};
    const advanced = row.advanced || {};
    const minutes = num(advanced?.minutes_played) ?? findFlat(basic, ["minutes_played", "minutes"]) ?? 0;
    aggregate.minutes += minutes;
    aggregate.matches.add(row.match_id);
    if (row.provider_team_id) aggregate.teamId = row.provider_team_id;
    if (row.provider_position && row.provider_position !== "unknown") aggregate.role = row.provider_position;
    aggregate.goals += findFlat(basic, ["goals"]) ?? 0;
    aggregate.assists += findFlat(basic, ["assists"]) ?? 0;
    aggregate.xg += findFlat(basic, ["expected_goals", "xg"]) ?? 0;
    aggregate.xa += findFlat(basic, ["expected_assists", "xa"]) ?? 0;
    const rating = findFlat(basic, ["rating_title", "rating"]);
    if (rating != null && minutes > 0) {
      aggregate.ratingWeighted += rating * minutes;
      aggregate.ratingMinutes += minutes;
    }

    const passing = advanced?.passing || {};
    const carrying = advanced?.carrying || {};
    const creation = advanced?.creation || {};
    const defending = advanced?.defending || {};
    const possession = advanced?.possession_value || {};
    const goalkeeping = advanced?.goalkeeping || {};

    aggregate.passes += num(passing.passes) ?? 0;
    aggregate.keyPasses += num(passing.key_passes) ?? 0;
    aggregate.progressivePasses += num(passing.progressive_passes) ?? 0;
    aggregate.passesIntoBox += num(passing.passes_into_box) ?? 0;
    if (num(passing.pass_accuracy) != null && num(passing.passes) != null) {
      aggregate.passAccuracyWeighted += num(passing.pass_accuracy) * Math.max(1, num(passing.passes));
      aggregate.passAccuracyWeight += Math.max(1, num(passing.passes));
    }
    aggregate.progressiveCarries += num(carrying.progressive_carries) ?? 0;
    aggregate.carriesIntoFinalThird += num(carrying.carries_into_final_third) ?? 0;
    aggregate.carriesIntoBox += num(carrying.carries_into_box) ?? 0;
    aggregate.takeOns += num(carrying.take_ons) ?? 0;
    aggregate.takeOnsWon += num(carrying.take_ons_won) ?? 0;
    aggregate.sca += num(creation.sca) ?? 0;
    aggregate.gca += num(creation.gca) ?? 0;
    aggregate.xag += num(creation.xag) ?? 0;
    aggregate.tackles += num(defending.tackles) ?? 0;
    aggregate.interceptions += num(defending.interceptions) ?? 0;
    aggregate.blocks += num(defending.blocks) ?? 0;
    aggregate.clearances += num(defending.clearances) ?? 0;
    aggregate.duelsWon += num(defending.duels_won) ?? 0;
    aggregate.aerials += num(defending.aerials) ?? 0;
    aggregate.aerialsWon += num(defending.aerials_won) ?? 0;
    aggregate.xt += num(possession.xt_total) ?? 0;
    aggregate.vaep += num(possession.vaep_total) ?? 0;
    aggregate.vaepOff += num(possession.vaep_offensive) ?? 0;
    aggregate.vaepDef += num(possession.vaep_defensive) ?? 0;
    aggregate.claims += num(goalkeeping.claims) ?? 0;
    aggregate.claimsWon += num(goalkeeping.claims_won) ?? 0;
    aggregate.sweeperActions += num(goalkeeping.sweeper_actions) ?? 0;
    aggregate.distributions += num(goalkeeping.distributions) ?? 0;
    if (num(goalkeeping.distribution_accuracy) != null && num(goalkeeping.distributions) != null) {
      aggregate.distributionAccuracyWeighted += num(goalkeeping.distribution_accuracy) * Math.max(1, num(goalkeeping.distributions));
      aggregate.distributionWeight += Math.max(1, num(goalkeeping.distributions));
    }
    aggregate.distance += findFlat(basic, ["distance_covered", "distance"]) ?? 0;
    aggregate.sprints += findFlat(basic, ["sprints"]) ?? 0;
    const topSpeed = findFlat(basic, ["top_speed"]);
    if (topSpeed != null) aggregate.topSpeedMax = aggregate.topSpeedMax == null ? topSpeed : Math.max(aggregate.topSpeedMax, topSpeed);
  }

  return [...players.values()].map((row) => {
    const per90 = (value) => (row.minutes > 0 ? (value * 90) / row.minutes : null);
    return {
      ...row,
      apps: row.matches.size,
      rating: row.ratingMinutes ? row.ratingWeighted / row.ratingMinutes : null,
      goals90: per90(row.goals),
      assists90: per90(row.assists),
      xg90: per90(row.xg),
      xa90: per90(row.xa),
      passes90: per90(row.passes),
      keyPasses90: per90(row.keyPasses),
      progressivePasses90: per90(row.progressivePasses),
      passesIntoBox90: per90(row.passesIntoBox),
      passAccuracy: row.passAccuracyWeight ? row.passAccuracyWeighted / row.passAccuracyWeight : null,
      progressiveCarries90: per90(row.progressiveCarries),
      carriesIntoFinalThird90: per90(row.carriesIntoFinalThird),
      carriesIntoBox90: per90(row.carriesIntoBox),
      takeOnRate: row.takeOns ? (row.takeOnsWon / row.takeOns) * 100 : null,
      sca90: per90(row.sca),
      gca90: per90(row.gca),
      xag90: per90(row.xag),
      tackles90: per90(row.tackles),
      interceptions90: per90(row.interceptions),
      blocks90: per90(row.blocks),
      clearances90: per90(row.clearances),
      duelsWon90: per90(row.duelsWon),
      aerialWinRate: row.aerials ? (row.aerialsWon / row.aerials) * 100 : null,
      aerialsWon90: per90(row.aerialsWon),
      xt90: per90(row.xt),
      vaep90: per90(row.vaep),
      vaepOff90: per90(row.vaepOff),
      vaepDef90: per90(row.vaepDef),
      claimRate: row.claims ? (row.claimsWon / row.claims) * 100 : null,
      sweeper90: per90(row.sweeperActions),
      distributionAccuracy: row.distributionWeight ? row.distributionAccuracyWeighted / row.distributionWeight : null,
      distance90: per90(row.distance),
      sprints90: per90(row.sprints),
    };
  });
}

async function resolveCompetitionFromPlayer(admin, playerId) {
  const { data: provider, error } = await admin.rpc("djm_peer_refresh_context", {
    p_mode: "player",
    p_player_id: playerId,
  });
  if (error) throw error;
  if (!provider?.provider_competition_id || !provider?.provider_season_id) {
    throw new Error("Update player data first so DJM can resolve a current PitchAPI competition and season.");
  }
  return {
    providerCompetitionId: String(provider.provider_competition_id),
    seasonId: String(provider.provider_season_id),
    competitionName: provider.competition_name || null,
    targetRole: provider?.metrics?.current_window?.role || provider?.metrics?.current_season?.role || null,
    providerPlayerId: provider.provider_player_id || null,
  };
}

async function resolveCompetitionFromProvider(admin, providerCompetitionId, requestedName, requestedCountryCode, userId, key) {
  const catalog = await pitch("/v1/leagues", key);
  const league = (catalog?.leagues || []).find((row) => String(row?.id) === String(providerCompetitionId));
  if (!league) throw new Error("PitchAPI competition was not found in the current provider catalogue.");
  const detail = await pitch(`/v1/leagues/${providerCompetitionId}`, key);
  const season = detail?.season || league?.seasons?.[0] || detail?.seasons?.[0];
  if (!season) throw new Error("PitchAPI returned no current season for this competition.");

  const displayName = clean(requestedName) || clean(league?.name) || `PitchAPI ${providerCompetitionId}`;
  const countryCode = clean(requestedCountryCode) || clean(league?.country_code);
  const country = CODE_COUNTRIES[countryCode] || countryCode || null;
  const { data: resolved, error } = await admin.rpc("djm_peer_refresh_context", {
    p_mode: "provider",
    p_provider_competition_id: String(providerCompetitionId),
    p_display_name: displayName,
    p_country: country,
    p_user_id: userId,
  });
  if (error) throw error;

  return {
    competitionId: resolved?.competition_id || null,
    providerCompetitionId: String(providerCompetitionId),
    seasonId: String(season),
    competitionName: displayName,
    targetRole: null,
    providerPlayerId: null,
  };
}

async function resolveCompetitionFromDjm(admin, competitionId, key) {
  const { data: competition, error } = await admin.rpc("djm_peer_refresh_context", {
    p_mode: "competition",
    p_competition_id: competitionId,
  });
  if (error) throw error;
  if (!competition) throw new Error("DJM competition not found.");
  const providerCompetitionId = clean(competition?.provider_competition_id);
  if (!providerCompetitionId) {
    throw new Error("This competition does not yet have a verified PitchAPI identity in DJM.");
  }

  const detail = await pitch(`/v1/leagues/${providerCompetitionId}`, key);
  const season = detail?.season || detail?.seasons?.[0];
  if (!season) throw new Error("PitchAPI returned no current season for this competition.");
  return {
    providerCompetitionId: String(providerCompetitionId),
    seasonId: String(season),
    competitionName: competition.display_name,
    targetRole: null,
    providerPlayerId: null,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!url || !serviceKey) return json({ ok: false, error: "Server configuration is incomplete" }, 500);
    if (!token) return json({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) return json({ ok: false, error: "Unauthorized" }, 401);

    const { data: profile } = await admin.from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
    if (profile?.role !== "admin") return json({ ok: false, error: "Admin access required" }, 403);

    const body = await request.json().catch(() => ({}));
    const playerId = clean(body?.player_id);
    const competitionId = clean(body?.competition_id);
    const providerCompetitionId = clean(body?.provider_competition_id);
    const mode = clean(body?.mode);

    const key = await resolvePitchKey();
    if (!key) return json({ ok: false, error: "PitchAPI is not configured" }, 422);

    if (mode === "catalog") {
      const catalog = await pitch("/v1/leagues", key);
      const leagues = (catalog?.leagues || [])
        .map((row) => ({
          id: String(row?.id || ""),
          name: clean(row?.name),
          country_code: clean(row?.country_code),
          country: CODE_COUNTRIES[clean(row?.country_code)] || clean(row?.country_code),
          seasons: Array.isArray(row?.seasons) ? row.seasons.slice(0, 3) : [],
        }))
        .filter((row) => row.id && row.name)
        .sort((left, right) => `${left.country || ""} ${left.name}`.localeCompare(`${right.country || ""} ${right.name}`));
      return json({ ok: true, provider: "PitchAPI", leagues, count: leagues.length });
    }

    if (!playerId && !competitionId && !providerCompetitionId) {
      return json({ ok: false, error: "Player or competition is required" }, 400);
    }

    const context = playerId
      ? await resolveCompetitionFromPlayer(admin, playerId)
      : competitionId
        ? await resolveCompetitionFromDjm(admin, competitionId, key)
        : await resolveCompetitionFromProvider(
            admin,
            providerCompetitionId,
            body?.competition_name,
            body?.country_code,
            authData.user.id,
            key,
          );

    const matchPayload = await pitch(
      `/v1/leagues/${context.providerCompetitionId}/matches?season=${encodeURIComponent(context.seasonId)}`,
      key,
    );
    const matches = (matchPayload?.matches || [])
      .filter(finishedMatch)
      .sort((left, right) => String(right.date || right.time_utc || "").localeCompare(String(left.date || left.time_utc || "")))
      .slice(0, 36);
    if (!matches.length) throw new Error("PitchAPI has no finished matches for this current competition sample.");

    const teamNames = new Map();
    for (const match of matches) {
      for (const team of [match.home_team, match.away_team]) {
        if (team?.id != null && team?.name) teamNames.set(String(team.id), String(team.name));
      }
    }

    let matchesWithBasicStats = 0;
    let matchesWithAdvancedStats = 0;
    const nested = await inBatches(matches, 6, async (match) => {
      const [basic, advanced] = await Promise.all([
        pitch(`/v1/matches/${match.id}/players`, key).catch(() => []),
        pitch(`/v1/matches/${match.id}/advanced/players`, key).catch(() => ({ players: [] })),
      ]);
      if (Array.isArray(basic) && basic.length) matchesWithBasicStats += 1;
      if (Array.isArray(advanced?.players) && advanced.players.length) {
        matchesWithAdvancedStats += 1;
      }
      return mergePitchMatchPlayers(basic, advanced, match);
    });

    const aggregated = aggregatePitch(nested.flat()).filter(
      (row) => row.minutes >= 180 && row.role && row.role !== "unknown",
    );
    if (aggregated.length < 6) {
      return json(
        {
          ok: false,
          error: `PitchAPI returned ${aggregated.length} players with a trustworthy 180-minute sample for ${context.competitionName || "this competition"}. DJM requires at least six.`,
          peer_count: aggregated.length,
          competition_id: context.competitionId || competitionId || null,
          provider_competition_id: context.providerCompetitionId,
          provider_season_id: context.seasonId,
          match_window: matches.length,
          matches_with_basic_stats: matchesWithBasicStats,
          matches_with_advanced_stats: matchesWithAdvancedStats,
        },
        422,
      );
    }

    const now = new Date().toISOString();
    const rows = aggregated.map((row) => ({
      provider: "pitchapi",
      provider_competition_id: context.providerCompetitionId,
      provider_season_id: context.seasonId,
      provider_player_id: String(row.id),
      provider_team_id: String(row.teamId || ""),
      player_name: row.name,
      team_name: teamNames.get(String(row.teamId || "")) || null,
      provider_position: row.role,
      minutes: Math.round(row.minutes),
      metrics: {
        apps: row.apps,
        rating: row.rating,
        goals90: row.goals90,
        assists90: row.assists90,
        xg90: row.xg90,
        xa90: row.xa90,
        passes90: row.passes90,
        keyPasses90: row.keyPasses90,
        progressivePasses90: row.progressivePasses90,
        passesIntoBox90: row.passesIntoBox90,
        passAccuracy: row.passAccuracy,
        progressiveCarries90: row.progressiveCarries90,
        carriesIntoFinalThird90: row.carriesIntoFinalThird90,
        carriesIntoBox90: row.carriesIntoBox90,
        takeOnRate: row.takeOnRate,
        sca90: row.sca90,
        gca90: row.gca90,
        xag90: row.xag90,
        tackles90: row.tackles90,
        interceptions90: row.interceptions90,
        blocks90: row.blocks90,
        clearances90: row.clearances90,
        duelsWon90: row.duelsWon90,
        aerialWinRate: row.aerialWinRate,
        aerialsWon90: row.aerialsWon90,
        xt90: row.xt90,
        vaep90: row.vaep90,
        vaepOff90: row.vaepOff90,
        vaepDef90: row.vaepDef90,
        claimRate: row.claimRate,
        sweeper90: row.sweeper90,
        distributionAccuracy: row.distributionAccuracy,
        distance90: row.distance90,
        sprints90: row.sprints90,
        topSpeedMax: row.topSpeedMax,
      },
      observed_at: now,
      synced_at: now,
    }));

    const { error: cacheError } = await admin.rpc("djm_replace_provider_peer_cache", {
      p_provider_competition_id: context.providerCompetitionId,
      p_provider_season_id: context.seasonId,
      p_rows: rows,
    });
    if (cacheError) throw cacheError;

    const roleCount = context.targetRole
      ? rows.filter((row) => row.provider_position === context.targetRole).length
      : null;

    return json({
      ok: true,
      provider: "PitchAPI",
      competition_id: context.competitionId || competitionId || null,
      provider_competition_id: context.providerCompetitionId,
      provider_season_id: context.seasonId,
      competition_name: context.competitionName,
      peer_count: rows.length,
      target_role: context.targetRole,
      target_role_peer_count: roleCount,
      minimum_minutes: 180,
      match_window: matches.length,
      methodology: "observed_pitchapi_peer_cache_v1",
      synthetic_players: false,
      completed_at: now,
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : clean(error?.message) || clean(error?.error_description) || "Peer refresh failed";
    console.error(JSON.stringify({ operation: "refresh_player_peer_data", result_status: "failed", error: message }));
    return json({ ok: false, error: message }, 500);
  }
});
