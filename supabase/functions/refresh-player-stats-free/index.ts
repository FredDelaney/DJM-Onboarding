// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { syncTheSportsDbWeekly } from "../_shared/football-data/thesportsdb-weekly.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const clean = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const sevenDaysAgo = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");

    if (!url || !serviceKey || !token) {
      return json({ ok: false, error: "Server configuration is incomplete" }, 500);
    }

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;
    if (profile?.role !== "admin") {
      return json({ ok: false, error: "Admin access required" }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const playerId = clean(body?.player_id);

    if (!playerId) {
      return json({ ok: false, error: "Player is required" }, 400);
    }

    const { data: player, error: playerError } = await admin
      .from("players")
      .select(
        "id,first_name,last_name,preferred_name,date_of_birth,current_club,current_league,current_country,current_season_label,current_season_start,football_provider_ids",
      )
      .eq("id", playerId)
      .maybeSingle();

    if (playerError) throw playerError;
    if (!player) return json({ ok: false, error: "Player not found" }, 404);

    let theSportsDb = null;
    try {
      theSportsDb = await syncTheSportsDbWeekly(admin, player);
    } catch (error) {
      theSportsDb = {
        ok: false,
        reason: error instanceof Error ? error.message : "TheSportsDB refresh failed",
      };
    }

    const apiFootballConfigured = Boolean(clean(Deno.env.get("API_FOOTBALL_KEY")));
    let apiFootball = {
      ok: false,
      skipped: true,
      reason: apiFootballConfigured
        ? "Existing API-Football evidence is still fresh."
        : "API-Football free key is not configured.",
    };

    if (apiFootballConfigured) {
      const { data: latestApiRows, error: latestApiError } = await admin
        .from("career_entries")
        .select("source_synced_at")
        .eq("player_id", playerId)
        .eq("source_provider", "api_football")
        .not("source_synced_at", "is", null)
        .order("source_synced_at", { ascending: false })
        .limit(1);

      if (latestApiError) throw latestApiError;

      const latestApiSync = latestApiRows?.[0]?.source_synced_at || null;
      const apiNeedsRefresh = !latestApiSync || latestApiSync < sevenDaysAgo();

      if (apiNeedsRefresh) {
        if (!anonKey) {
          apiFootball = {
            ok: false,
            skipped: true,
            reason: "SUPABASE_ANON_KEY is not configured for the internal refresh call.",
          };
        } else {
          const response = await fetch(`${url}/functions/v1/refresh-player-data`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: anonKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              mode: "free_stats",
              player_id: playerId,
            }),
            signal: AbortSignal.timeout(30000),
          });

          const payload = await response.json().catch(() => ({}));
          apiFootball = {
            ...payload,
            ok: Boolean(response.ok && payload?.ok),
            skipped: false,
          };
        }
      }
    }

    const freshApiEvidence = apiFootball?.skipped && apiFootballConfigured;
    const ok = Boolean(theSportsDb?.ok || apiFootball?.ok || freshApiEvidence);

    return json({
      ok,
      strategy: "free_first_stats_only",
      score_refresh: false,
      comparison_refresh: false,
      thesportsdb: theSportsDb,
      api_football: apiFootball,
      completed_at: new Date().toISOString(),
      error: ok ? null : "No free source returned usable player stats.",
    }, ok ? 200 : 422);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Free stats refresh failed";
    console.error(
      JSON.stringify({
        operation: "refresh_player_stats_free",
        result_status: "failed",
        error: message,
      }),
    );
    return json({ ok: false, error: message }, 500);
  }
});
