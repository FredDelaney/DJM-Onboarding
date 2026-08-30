// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { syncTheSportsDbWeekly } from "../_shared/football-data/thesportsdb-weekly.ts";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function inBatches(values, size, worker) {
  const output = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(...(await Promise.all(values.slice(index, index + size).map(worker))));
  }
  return output;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ ok: false, error: "Server configuration is incomplete" }, 500);
  }
  const suppliedSecret = request.headers.get("x-djm-cron") || "";
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
    const [{ data: players, error: playerError }, { data: snapshots, error: snapshotError }] =
      await Promise.all([
        admin
          .from("players")
          .select(
            "id,first_name,last_name,preferred_name,date_of_birth,current_club,current_league,current_country,current_season_label,current_season_start,football_provider_ids",
          )
          .in("football_status", ["active", "free_agent", "loan", "injured"]),
        admin
          .schema("djm_os")
          .from("player_provider_stat_snapshots")
          .select("player_id,synced_at")
          .eq("provider", "thesportsdb")
          .order("synced_at", { ascending: false }),
      ]);
    if (playerError || snapshotError) throw playerError || snapshotError;

    const latest = new Map();
    for (const snapshot of snapshots || []) {
      if (!latest.has(snapshot.player_id)) {
        latest.set(snapshot.player_id, snapshot.synced_at);
      }
    }

    const orderedPlayers = (players || []).sort((left, right) =>
      String(left.id).localeCompare(String(right.id)),
    );
    const rotationPages = Math.max(1, Math.ceil(orderedPlayers.length / 10));
    const utcDay = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const rotationPage = utcDay % rotationPages;
    const selected = orderedPlayers
      .slice(rotationPage * 10, rotationPage * 10 + 10)
      .sort((left, right) =>
        String(latest.get(left.id) || "").localeCompare(
          String(latest.get(right.id) || ""),
        ),
      );

    const results = await inBatches(selected, 2, async (player) => {
      try {
        const result = await syncTheSportsDbWeekly(admin, player);
        return {
          player_id: player.id,
          ok: Boolean(result?.ok),
          conflict_kept_for_review: Boolean(result?.conflict),
          reason: result?.reason || null,
        };
      } catch (error) {
        return {
          player_id: player.id,
          ok: false,
          conflict_kept_for_review: false,
          reason: error instanceof Error ? error.message : "Refresh failed",
        };
      }
    });

    const refreshed = results.filter((result) => result.ok).length;
    return json({
      ok: true,
      strategy: "daily_rotating_stale_first_weekly_coverage",
      eligible_players: players?.length || 0,
      rotation_page: rotationPage + 1,
      rotation_pages: rotationPages,
      attempted: results.length,
      refreshed,
      needs_review: results.filter((result) => result.conflict_kept_for_review).length,
      failed: results.length - refreshed,
      results,
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Weekly refresh failed";
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
