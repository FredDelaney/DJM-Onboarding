// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { syncTheSportsDbWeekly } from "../_shared/football-data/thesportsdb-weekly.ts";

const FIELDS = ["appearances", "starts", "minutes", "goals", "assists"];
const FRESHNESS_MS = 20 * 60 * 60 * 1000;
const BATCH_LIMIT = 10;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const norm = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const stamp = (value) => {
  const milliseconds = value ? Date.parse(String(value)) : 0;
  return Number.isFinite(milliseconds) ? milliseconds : 0;
};

const freshest = (...values) =>
  values.map(stamp).reduce((latest, value) => Math.max(latest, value), 0);

const isFresh = (milliseconds) =>
  Boolean(milliseconds && Date.now() - milliseconds <= FRESHNESS_MS);

function reserve(value) {
  return /\b(reserves?|reserve|ii|2|b|u23|u21|academy|youth)\b/.test(
    norm(value),
  );
}

function baseClub(value) {
  return norm(value)
    .replace(
      /\b(fc|football club|reserves?|reserve|ii|2|b|u23|u21|academy|youth)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function sameClub(left, right, league = "") {
  const a = norm(left);
  const b = norm(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  const aBase = baseClub(left);
  const bBase = baseClub(right);
  if (!aBase || aBase !== bBase) return false;
  if (reserve(left) && reserve(right)) return true;

  return (
    /\b(central league|northern league|southern league|npl|national premier league)\b/.test(
      norm(league),
    ) && (reserve(left) || reserve(right))
  );
}

function sameLeague(left, right) {
  const a = norm(left);
  const b = norm(right);
  if (!a || !b) return true;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  const stop = new Set(["the", "men", "mens", "dettol", "premier"]);
  const aTokens = new Set(
    a.split(" ").filter((token) => token.length > 1 && !stop.has(token)),
  );
  const bTokens = new Set(
    b.split(" ").filter((token) => token.length > 1 && !stop.has(token)),
  );
  if (!aTokens.size || !bTokens.size) return false;

  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length;
  return overlap >= 2 && overlap / Math.min(aTokens.size, bTokens.size) >= 0.6;
}

function currentRow(rows, player) {
  const season = norm(
    player.current_season_label || String(new Date().getUTCFullYear()),
  );

  return (rows || [])
    .filter(
      (row) =>
        (!season || norm(row.season_label) === season) &&
        sameClub(row.club_name, player.current_club, player.current_league) &&
        sameLeague(row.league, player.current_league),
    )
    .sort((left, right) => {
      const completeness =
        FIELDS.filter((field) => right[field] != null).length -
        FIELDS.filter((field) => left[field] != null).length;
      if (completeness) return completeness;

      return (
        freshest(right.source_synced_at, right.source_reviewed_at) -
        freshest(left.source_synced_at, left.source_reviewed_at)
      );
    })[0] || null;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ ok: false, error: "Server configuration incomplete" }, 500);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const suppliedSecret = request.headers.get("x-djm-cron") || "";
  const { data: expectedSecret, error: secretError } = await admin.rpc(
    "get_push_scheduler_secret",
  );

  if (
    secretError ||
    !expectedSecret ||
    !suppliedSecret ||
    suppliedSecret !== expectedSecret
  ) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  try {
    const { data: players, error: playerError } = await admin
      .from("players")
      .select(
        "id,first_name,last_name,preferred_name,date_of_birth,current_club,current_league,current_country,current_season_label,current_season_start,football_provider_ids,transfermarkt_url,stats_url",
      )
      .in("football_status", ["active", "free_agent", "loan", "injured"]);
    if (playerError) throw playerError;

    const eligible = players || [];
    const playerIds = eligible.map((player) => player.id);
    const latestCheck = new Map();

    if (playerIds.length) {
      const [careerEvidence, refreshEvidence] = await Promise.all([
        admin
          .from("career_entries")
          .select("player_id,source_synced_at,source_reviewed_at")
          .in("player_id", playerIds),
        admin
          .from("player_source_refreshes")
          .select("player_id,fresh_at,status")
          .in("player_id", playerIds)
          .eq("status", "applied")
          .order("fresh_at", { ascending: false }),
      ]);

      if (careerEvidence.error) throw careerEvidence.error;
      if (refreshEvidence.error) throw refreshEvidence.error;

      for (const row of careerEvidence.data || []) {
        const checkedAt = freshest(row.source_synced_at, row.source_reviewed_at);
        if (checkedAt > (latestCheck.get(row.player_id) || 0)) {
          latestCheck.set(row.player_id, checkedAt);
        }
      }

      for (const row of refreshEvidence.data || []) {
        const checkedAt = stamp(row.fresh_at);
        if (checkedAt > (latestCheck.get(row.player_id) || 0)) {
          latestCheck.set(row.player_id, checkedAt);
        }
      }
    }

    const selected = [...eligible]
      .sort(
        (left, right) =>
          (latestCheck.get(left.id) || 0) -
            (latestCheck.get(right.id) || 0) ||
          String(left.id).localeCompare(String(right.id)),
      )
      .slice(0, BATCH_LIMIT);

    const results = [];
    const workerCalls = [];

    for (const player of selected) {
      let freeResult;
      try {
        freeResult = await syncTheSportsDbWeekly(admin, player);
      } catch (error) {
        freeResult = {
          ok: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }

      const { data: rows, error: rowError } = await admin
        .from("career_entries")
        .select(
          "season_label,club_name,league,appearances,starts,minutes,goals,assists,source_provider,source_synced_at,source_reviewed_at",
        )
        .eq("player_id", player.id);
      if (rowError) throw rowError;

      const current = currentRow(rows || [], player);
      const checkedAt = freshest(
        current?.source_synced_at,
        current?.source_reviewed_at,
        latestCheck.get(player.id),
      );
      const freeApplied = Boolean(freeResult?.ok && !freeResult?.conflict);

      if (freeApplied) {
        results.push({
          player_id: player.id,
          free_api_ok: true,
          ai_dispatched: false,
          current_data: Boolean(current),
          fresh: true,
          checked_at: new Date().toISOString(),
        });
        continue;
      }

      if (current && isFresh(checkedAt)) {
        results.push({
          player_id: player.id,
          free_api_ok: Boolean(freeResult?.ok),
          ai_dispatched: false,
          current_data: true,
          fresh: true,
          checked_at: new Date(checkedAt).toISOString(),
          reason: "Recent verified check retained",
        });
        continue;
      }

      if (
        !player.current_club ||
        ["soon", "tbc", "unknown"].includes(norm(player.current_club))
      ) {
        results.push({
          player_id: player.id,
          free_api_ok: Boolean(freeResult?.ok),
          ai_dispatched: false,
          current_data: Boolean(current),
          fresh: false,
          checked_at: checkedAt ? new Date(checkedAt).toISOString() : null,
          reason: "Current club context missing or placeholder",
        });
        continue;
      }

      const call = fetch(
        url + "/functions/v1/refresh-player-stats-ai-worker",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-djm-cron": suppliedSecret,
          },
          body: JSON.stringify({
            player_id: player.id,
            source: "scheduled-stale-refresh",
            force: true,
          }),
        },
      )
        .then(async (response) => ({
          player_id: player.id,
          status: response.status,
          ok: response.ok,
          body: await response.text().catch(() => ""),
        }))
        .catch((error) => ({
          player_id: player.id,
          status: 0,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }));

      workerCalls.push(call);
      results.push({
        player_id: player.id,
        free_api_ok: Boolean(freeResult?.ok),
        ai_dispatched: true,
        current_data: Boolean(current),
        fresh: false,
        checked_at: checkedAt ? new Date(checkedAt).toISOString() : null,
      });
    }

    if (workerCalls.length) {
      EdgeRuntime.waitUntil(
        Promise.all(workerCalls)
          .then((workerResults) =>
            console.log(
              JSON.stringify({
                operation: "weekly_ai_workers_completed",
                results: workerResults.map((result) => ({
                  player_id: result.player_id,
                  status: result.status,
                  ok: result.ok,
                })),
              }),
            ),
          )
          .catch((error) =>
            console.error(
              JSON.stringify({
                operation: "weekly_ai_workers_failed",
                error: error instanceof Error ? error.message : String(error),
              }),
            ),
          ),
      );
    }

    return json({
      ok: true,
      strategy: "daily_stale_first_provider_then_cross_checked_web",
      freshness_hours: FRESHNESS_MS / 3600000,
      eligible_players: eligible.length,
      attempted: selected.length,
      ai_dispatched: results.filter((result) => result.ai_dispatched).length,
      results,
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Weekly refresh failed";
    console.error(
      JSON.stringify({
        operation: "weekly_player_refresh",
        result_status: "failed",
        error: message,
      }),
    );
    return json({ ok: false, error: message }, 500);
  }
});
