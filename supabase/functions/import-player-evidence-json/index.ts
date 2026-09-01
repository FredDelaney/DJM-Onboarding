import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const ALLOWED_POSITIONS = new Set([
  "GK", "CB", "FB_WB", "DM", "CM", "AM", "W", "ST", "UNKNOWN",
]);

const PERCENTILE_FIELDS = [
  "overall_performance_percentile",
  "attacking_percentile",
  "creativity_percentile",
  "progression_percentile",
  "possession_percentile",
  "defending_percentile",
  "aerial_percentile",
  "goalkeeping_percentile",
  "physical_percentile",
  "discipline_percentile",
] as const;

type MetricRule = { aliases: string[]; weight: number; inverse?: boolean };

const CATEGORY_METRICS: Record<string, MetricRule[]> = {
  attacking: [
    { aliases: ["non_penalty_goals_per90", "npg_per90", "goals_per90"], weight: .30 },
    { aliases: ["xg_per90", "expected_goals_per90"], weight: .25 },
    { aliases: ["shots_on_target_per90", "sot_per90"], weight: .20 },
    { aliases: ["shots_per90"], weight: .10 },
    { aliases: ["touches_box_per90", "touches_in_box_per90"], weight: .15 },
  ],
  creativity: [
    { aliases: ["assists_per90"], weight: .25 },
    { aliases: ["xa_per90", "expected_assists_per90"], weight: .30 },
    { aliases: ["key_passes_per90", "shot_assists_per90"], weight: .30 },
    { aliases: ["through_passes_per90", "smart_passes_per90"], weight: .15 },
  ],
  progression: [
    { aliases: ["progressive_passes_per90"], weight: .30 },
    { aliases: ["progressive_carries_per90", "progressive_runs_per90"], weight: .25 },
    { aliases: ["passes_final_third_per90", "passes_into_final_third_per90"], weight: .25 },
    { aliases: ["successful_dribbles_per90", "dribbles_per90"], weight: .20 },
  ],
  possession: [
    { aliases: ["pass_accuracy", "pass_accuracy_pct"], weight: .35 },
    { aliases: ["passes_per90"], weight: .25 },
    { aliases: ["received_passes_per90"], weight: .15 },
    { aliases: ["duel_win_pct", "duels_won_pct"], weight: .15 },
    { aliases: ["turnovers_per90", "possessions_lost_per90"], weight: .10, inverse: true },
  ],
  defending: [
    { aliases: ["tackles_per90"], weight: .20 },
    { aliases: ["interceptions_per90"], weight: .25 },
    { aliases: ["blocks_per90"], weight: .15 },
    { aliases: ["defensive_duels_won_pct", "defensive_duel_win_pct"], weight: .25 },
    { aliases: ["recoveries_per90", "ball_recoveries_per90"], weight: .15 },
  ],
  aerial: [
    { aliases: ["aerial_duels_won_pct", "aerial_duel_win_pct"], weight: .60 },
    { aliases: ["aerial_duels_won_per90"], weight: .40 },
  ],
  goalkeeping: [
    { aliases: ["save_pct", "save_percentage"], weight: .40 },
    { aliases: ["goals_prevented_per90", "post_shot_xg_minus_goals_per90"], weight: .30 },
    { aliases: ["clean_sheet_pct"], weight: .15 },
    { aliases: ["crosses_stopped_pct", "cross_claim_pct"], weight: .15 },
  ],
  physical: [
    { aliases: ["top_speed", "max_speed"], weight: .35 },
    { aliases: ["sprints_per90"], weight: .35 },
    { aliases: ["distance_per90", "distance_km_per90"], weight: .30 },
  ],
  discipline: [
    { aliases: ["yellow_cards_per90"], weight: .45, inverse: true },
    { aliases: ["red_cards_per90"], weight: .35, inverse: true },
    { aliases: ["fouls_per90", "fouls_committed_per90"], weight: .20, inverse: true },
  ],
};


function normalisePositionGroup(value: unknown): string {
  const text = String(value ?? "").trim().toUpperCase().replace(/[\s/-]+/g, "_");
  const aliases: Record<string, string> = {
    GOALKEEPER: "GK",
    CENTRE_BACK: "CB", CENTER_BACK: "CB", CENTREBACK: "CB", CENTERBACK: "CB",
    LEFT_BACK: "FB_WB", RIGHT_BACK: "FB_WB", FULL_BACK: "FB_WB", FULLBACK: "FB_WB",
    LEFT_WING_BACK: "FB_WB", RIGHT_WING_BACK: "FB_WB", WING_BACK: "FB_WB", WINGBACK: "FB_WB",
    LB: "FB_WB", RB: "FB_WB", LWB: "FB_WB", RWB: "FB_WB",
    DEFENSIVE_MIDFIELD: "DM", DEFENSIVE_MIDFIELDER: "DM", CDM: "DM",
    CENTRAL_MIDFIELD: "CM", CENTRAL_MIDFIELDER: "CM",
    ATTACKING_MIDFIELD: "AM", ATTACKING_MIDFIELDER: "AM", CAM: "AM", NO_10: "AM", NUMBER_10: "AM",
    LEFT_WINGER: "W", RIGHT_WINGER: "W", WINGER: "W", LW: "W", RW: "W",
    STRIKER: "ST", CENTRE_FORWARD: "ST", CENTER_FORWARD: "ST", CF: "ST",
  };
  const resolved = aliases[text] || text;
  return ALLOWED_POSITIONS.has(resolved) ? resolved : "UNKNOWN";
}

function cleanText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function intOrNull(value: unknown): number | null {
  const number = numberOrNull(value);
  return number == null ? null : Math.max(0, Math.round(number));
}

function bounded(value: unknown, min: number, max: number): number | null {
  const number = numberOrNull(value);
  if (number == null) return null;
  if (number < min || number > max) {
    throw new Error(`Numeric value ${number} is outside the allowed ${min}-${max} range.`);
  }
  return number;
}

function dateText(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid date: ${text}`);
  return date.toISOString().slice(0, 10);
}

function normaliseKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function flattenMetrics(value: unknown): Record<string, number> {
  const output: Record<string, number> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return output;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [subKey, subRaw] of Object.entries(raw as Record<string, unknown>)) {
        const number = numberOrNull(subRaw);
        if (number != null) output[normaliseKey(`${key}_${subKey}`)] = number;
      }
    } else {
      const number = numberOrNull(raw);
      if (number != null) output[normaliseKey(key)] = number;
    }
  }
  return output;
}

function firstMetric(metrics: Record<string, number>, aliases: string[]) {
  for (const alias of aliases) {
    const key = normaliseKey(alias);
    if (metrics[key] != null) return metrics[key];
  }
  return null;
}

function empiricalPercentile(playerValue: number, peerValues: number[], inverse = false) {
  const peers = peerValues.filter(Number.isFinite);
  if (peers.length < 5) return null;
  let below = 0;
  let equal = 0;
  for (const value of peers) {
    if (value < playerValue) below += 1;
    else if (value === playerValue) equal += 1;
  }
  const percentile = ((below + .5 * equal) / peers.length) * 100;
  return Math.max(0, Math.min(100, inverse ? 100 - percentile : percentile));
}

function categoryPercentile(
  category: string,
  playerMetrics: Record<string, number>,
  peerMetrics: Record<string, number>[],
) {
  let total = 0;
  let weight = 0;
  const detail: Record<string, unknown> = {};
  for (const rule of CATEGORY_METRICS[category] || []) {
    const playerValue = firstMetric(playerMetrics, rule.aliases);
    if (playerValue == null) continue;
    const peerValues = peerMetrics
      .map((peer) => firstMetric(peer, rule.aliases))
      .filter((value): value is number => value != null);
    const percentile = empiricalPercentile(playerValue, peerValues, Boolean(rule.inverse));
    if (percentile == null) continue;
    total += percentile * rule.weight;
    weight += rule.weight;
    detail[rule.aliases[0]] = {
      value: playerValue,
      percentile: Math.round(percentile),
      peers: peerValues.length,
    };
  }
  return weight < .45
    ? { percentile: null, detail }
    : { percentile: Math.round(total / weight), detail };
}

function buildPercentiles(row: any) {
  const percentiles: Record<string, number | null> = {};
  const nested = row?.percentiles && typeof row.percentiles === "object" ? row.percentiles : {};
  for (const field of PERCENTILE_FIELDS) {
    const short = field.replace(/_percentile$/, "");
    percentiles[field] = bounded(row?.[field] ?? nested?.[field] ?? nested?.[short], 0, 100);
  }
  if (Object.values(percentiles).some((value) => value != null)) {
    return { percentiles, derived: false, derivation: null };
  }

  const playerMetrics = flattenMetrics(row?.metrics ?? row?.raw_metrics ?? row?.player_metrics);
  const peers = Array.isArray(row?.peer_cohort)
    ? row.peer_cohort
        .map((peer: unknown) => flattenMetrics((peer as any)?.metrics ?? peer))
        .filter((metrics: Record<string, number>) => Object.keys(metrics).length)
    : [];
  if (!Object.keys(playerMetrics).length || peers.length < 5) {
    return {
      percentiles,
      derived: false,
      derivation: { reason: "No direct percentiles and fewer than five usable peers." },
    };
  }

  const mapping: Record<string, string> = {
    attacking_percentile: "attacking",
    creativity_percentile: "creativity",
    progression_percentile: "progression",
    possession_percentile: "possession",
    defending_percentile: "defending",
    aerial_percentile: "aerial",
    goalkeeping_percentile: "goalkeeping",
    physical_percentile: "physical",
    discipline_percentile: "discipline",
  };
  const detail: Record<string, unknown> = {};
  for (const [field, category] of Object.entries(mapping)) {
    const result = categoryPercentile(category, playerMetrics, peers);
    percentiles[field] = result.percentile;
    detail[category] = result.detail;
  }
  return {
    percentiles,
    derived: true,
    derivation: { method: "empirical_peer_percentile_v1", peer_count: peers.length, detail },
  };
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
}

async function globalScore(caller: any, playerId: string) {
  const { data, error } = await caller.rpc("djm_refresh_player_global_intelligence", {
    p_player_id: playerId,
  });
  if (error) throw error;
  return data;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ ok: false, error: "Method not allowed" }, 405);

  try {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply({ ok: false, error: "Unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const publicKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceKey;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const caller = createClient(url, publicKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) return reply({ ok: false, error: "Unauthorized" }, 401);
    const { data: profile } = await admin.from("profiles").select("role").eq("id", authData.user.id).maybeSingle();
    if (profile?.role !== "admin") return reply({ ok: false, error: "Admin access required" }, 403);

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return reply({ ok: false, error: "A JSON payload is required" }, 400);
    const playerId = cleanText((body as any).player_id);
    const payload = (body as any).payload;
    const fileName = cleanText((body as any).file_name);
    if (!playerId) return reply({ ok: false, error: "player_id is required" }, 400);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return reply({ ok: false, error: "payload must be a JSON object" }, 400);
    }

    const encoded = stableStringify(payload);
    if (encoded.length > 2_000_000) {
      return reply({ ok: false, error: "JSON file is too large. Maximum canonical payload size is 2 MB." }, 413);
    }

    const { data: player, error: playerError } = await admin
      .from("players")
      .select("id,first_name,last_name,date_of_birth,primary_position,current_club,current_league,current_country,current_competition_id,current_season_label")
      .eq("id", playerId)
      .maybeSingle();
    if (playerError) throw playerError;
    if (!player) return reply({ ok: false, error: "Player not found" }, 404);

    const declaredPlayerId = cleanText(payload?.player?.id ?? payload?.player_id);
    if (declaredPlayerId && declaredPlayerId !== playerId) {
      return reply({ ok: false, error: "The JSON player ID does not match the open DJM player." }, 409);
    }

    const source = payload?.source && typeof payload.source === "object" ? payload.source : {};
    const sourceName = cleanText(source?.name ?? payload?.source_name) || "Admin JSON import";
    const sourceUrl = cleanText(source?.url ?? payload?.source_url);
    const sourceReference = cleanText(source?.reference ?? payload?.source_reference) || fileName || "json-import";
    const sourceConfidence = Math.min(.95, Math.max(.35, numberOrNull(source?.confidence ?? payload?.confidence) ?? .75));
    const schemaVersion = cleanText(payload?.schema_version) || "djm_player_evidence_v1";
    const payloadHash = await sha256(encoded);

    const { data: existingImport } = await admin
      .schema("djm_os")
      .from("player_score_json_imports")
      .select("id,import_status")
      .eq("player_id", playerId)
      .eq("payload_hash", payloadHash)
      .maybeSingle();

    if (existingImport?.import_status?.startsWith("completed")) {
      const intelligence = await globalScore(caller, playerId);
      return reply({
        ok: true,
        duplicate: true,
        import_id: existingImport.id,
        intelligence,
        message: "This exact JSON evidence file was already imported. Global Intelligence was refreshed without duplicating evidence.",
      });
    }

    let importId = existingImport?.id || null;
    if (!importId) {
      const { data: created, error: createError } = await admin
        .schema("djm_os")
        .from("player_score_json_imports")
        .insert({
          player_id: playerId,
          payload_hash: payloadHash,
          schema_version: schemaVersion,
          source_name: sourceName,
          source_url: sourceUrl,
          source_reference: sourceReference,
          file_name: fileName,
          payload,
          import_status: "received",
          result: {},
          created_by: authData.user.id,
        })
        .select("id")
        .single();
      if (createError) throw createError;
      importId = created.id;
    }

    const conflicts: any[] = [];
    let careerWritten = 0;
    let performanceWritten = 0;
    const now = new Date().toISOString();

    const careerRows = Array.isArray(payload?.career)
      ? payload.career
      : Array.isArray(payload?.career_entries)
        ? payload.career_entries
        : [];
    if (careerRows.length > 50) throw new Error("JSON contains more than 50 career rows.");

    for (const raw of careerRows) {
      if (!raw || typeof raw !== "object") continue;
      const seasonLabel = cleanText(raw.season_label ?? raw.season);
      const clubName = cleanText(raw.club_name ?? raw.club) || player.current_club;
      const league = cleanText(raw.league ?? raw.competition) || player.current_league;
      if (!seasonLabel || !clubName) continue;

      const row: any = {
        player_id: playerId,
        season_label: seasonLabel,
        club_name: clubName,
        league,
        country: cleanText(raw.country) || player.current_country,
        start_date: dateText(raw.start_date),
        end_date: dateText(raw.end_date),
        appearances: intOrNull(raw.appearances ?? raw.apps),
        starts: intOrNull(raw.starts),
        minutes: intOrNull(raw.minutes),
        goals: intOrNull(raw.goals),
        assists: intOrNull(raw.assists),
        source_name: sourceName,
        source_url: sourceUrl,
        source_reviewed_at: now,
        source_acceptance_method: "admin_json_import",
        source_provider: "json_import",
        source_provider_player_id: cleanText(payload?.player?.provider_id ?? payload?.provider_player_id),
        source_synced_at: now,
        notes: cleanText(raw.notes) || `Imported from ${fileName || sourceReference}.`,
      };
      Object.keys(row).forEach((key) => row[key] == null && delete row[key]);

      const { data: exact, error: exactError } = await admin
        .from("career_entries")
        .select("id,source_reviewed_at,source_provider,source_name")
        .eq("player_id", playerId)
        .eq("season_label", seasonLabel)
        .ilike("club_name", clubName)
        .limit(1)
        .maybeSingle();
      if (exactError) throw exactError;

      const owned = exact && (
        String(exact.source_provider || "").toLowerCase() === "json_import" ||
        String(exact.source_name || "").toLowerCase() === sourceName.toLowerCase()
      );
      if (exact?.source_reviewed_at && !owned) {
        conflicts.push({
          type: "career",
          season_label: seasonLabel,
          club_name: clubName,
          reason: "Reviewed evidence from another source was preserved.",
        });
        continue;
      }

      const operation = exact?.id
        ? admin.from("career_entries").update(row).eq("id", exact.id)
        : admin.from("career_entries").insert(row);
      const { error } = await operation;
      if (error) throw error;
      careerWritten += 1;
    }

    const performanceRows = Array.isArray(payload?.performance)
      ? payload.performance
      : Array.isArray(payload?.performance_snapshots)
        ? payload.performance_snapshots
        : [];
    if (performanceRows.length > 20) throw new Error("JSON contains more than 20 performance snapshots.");

    for (let index = 0; index < performanceRows.length; index += 1) {
      const raw = performanceRows[index];
      if (!raw || typeof raw !== "object") continue;
      const positionGroup = normalisePositionGroup(
        cleanText(raw.position_group ?? raw.position) || cleanText(player.primary_position) || "UNKNOWN",
      );
      const evidenceDate = dateText(raw.evidence_date ?? raw.observed_at ?? raw.date) || now.slice(0, 10);
      const minutes = intOrNull(raw.minutes);
      if (minutes == null || minutes < 180) {
        conflicts.push({ type: "performance", index, reason: "Performance snapshot needs at least 180 minutes." });
        continue;
      }

      const built = buildPercentiles(raw);
      if (!Object.values(built.percentiles).some((value) => value != null)) {
        conflicts.push({
          type: "performance",
          index,
          reason: "No defensible performance percentiles could be supplied or derived. Include category percentiles or player metrics plus at least five peer rows.",
        });
        continue;
      }

      const competitionId = cleanText(raw.competition_id) || player.current_competition_id || null;
      const peerDescription = cleanText(raw.peer_group_description ?? raw.peer_group) ||
        (built.derived ? `Empirical peer cohort from ${sourceName}` : `Peer percentiles supplied by ${sourceName}`);
      const providerConfidence = Math.min(sourceConfidence, Math.max(.35, numberOrNull(raw.confidence) ?? sourceConfidence));
      const rowReference = cleanText(raw.source_reference) || `${sourceReference}:${index + 1}`;

      const { error: deleteError } = await admin
        .schema("djm_os")
        .from("player_performance_snapshots")
        .delete()
        .eq("player_id", playerId)
        .eq("provider", "json_import")
        .eq("source_reference", rowReference);
      if (deleteError) throw deleteError;

      const row: any = {
        player_id: playerId,
        competition_id: competitionId,
        season_label: cleanText(raw.season_label ?? raw.season) || player.current_season_label,
        position_group: positionGroup,
        evidence_date: evidenceDate,
        minutes,
        starts: intOrNull(raw.starts),
        appearances: intOrNull(raw.appearances ?? raw.apps),
        possible_minutes: intOrNull(raw.possible_minutes),
        peer_group_description: peerDescription,
        provider: "json_import",
        source_name: sourceName,
        source_url: sourceUrl,
        source_reference: rowReference,
        observed_at: cleanText(raw.observed_at) || now,
        verified_at: now,
        verified_by: authData.user.id,
        confidence: providerConfidence,
        raw_metrics: raw.metrics ?? raw.raw_metrics ?? {},
        metadata: {
          import_id: importId,
          file_name: fileName,
          schema_version: schemaVersion,
          percentile_derivation: built.derivation,
          percentiles_supplied_directly: !built.derived,
          peer_cohort_size: Array.isArray(raw.peer_cohort) ? raw.peer_cohort.length : null,
          verification_method: "admin_json_import",
        },
        ...built.percentiles,
      };
      Object.keys(row).forEach((key) => row[key] == null && delete row[key]);
      const { error: insertError } = await admin.schema("djm_os").from("player_performance_snapshots").insert(row);
      if (insertError) throw insertError;
      performanceWritten += 1;
    }

    const providerSeason = cleanText(payload?.season_label ?? payload?.season ?? player.current_season_label) || "json";
    const { error: rawError } = await admin
      .schema("djm_os")
      .from("player_provider_stat_snapshots")
      .upsert({
        player_id: playerId,
        provider: "json_import",
        provider_player_id: cleanText(payload?.player?.provider_id ?? payload?.provider_player_id) || playerId,
        provider_team_id: cleanText(payload?.team?.provider_id ?? payload?.provider_team_id) || "",
        provider_competition_id: cleanText(payload?.competition?.provider_id ?? payload?.provider_competition_id) || String(player.current_competition_id || ""),
        provider_season_id: providerSeason,
        season_label: providerSeason,
        club_name: cleanText(payload?.team?.name) || player.current_club,
        competition_name: cleanText(payload?.competition?.name) || player.current_league,
        metrics: payload,
        observed_at: now,
        synced_at: now,
      }, { onConflict: "player_id,provider,provider_season_id,provider_competition_id,provider_team_id" });
    if (rawError) throw rawError;

    const intelligence = await globalScore(caller, playerId);
    const status = conflicts.length ? "completed_with_conflicts" : "completed";
    const score = intelligence?.scorecard || {};
    const projection = intelligence?.projection || {};
    const result = {
      career_rows_written: careerWritten,
      performance_snapshots_written: performanceWritten,
      conflicts,
      global_score: score?.display_score ?? null,
      confidence: score?.confidence ?? null,
      data_coverage: score?.data_coverage ?? null,
      model_version: score?.model_version ?? null,
      projection_available: Boolean(projection?.available),
      projection_y5: projection?.forecast_y5 ?? null,
    };

    const { error: finishError } = await admin
      .schema("djm_os")
      .from("player_score_json_imports")
      .update({ import_status: status, result, updated_at: new Date().toISOString() })
      .eq("id", importId);
    if (finishError) throw finishError;

    return reply({
      ok: true,
      import_id: importId,
      import_status: status,
      career_rows_written: careerWritten,
      performance_snapshots_written: performanceWritten,
      conflicts,
      intelligence,
      message: `JSON evidence imported. Global Intelligence ${score?.display_score ?? "updated"} is now authoritative${projection?.available ? ` with a ${projection.forecast_y5} five-year outlook` : ""}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ operation: "import_player_evidence_json", result_status: "failed", error: message }));
    return reply({ ok: false, error: message }, 500);
  }
});
