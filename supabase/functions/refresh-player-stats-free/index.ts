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

const whole = (value) => {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
};

const normalise = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const sevenDaysAgo = () =>
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

function sameClub(a, b) {
  const left = normalise(a);
  const right = normalise(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const aliases = (value) =>
    value
      .replace(/\bfc\b/g, "")
      .replace(/\breserves?\b/g, "ii")
      .replace(/\bb\b/g, "ii")
      .replace(/\s+/g, " ")
      .trim();
  return aliases(left) === aliases(right);
}

function sameLeague(a, b) {
  const left = normalise(a);
  const right = normalise(b);
  if (!left || !right) return true;
  return left === right || left.includes(right) || right.includes(left);
}

function outputText(response) {
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return "";
}

function sourceKey(value) {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

function sourceHost(value) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function webSources(response) {
  const sources = [];
  for (const item of response?.output || []) {
    if (!String(item?.type || "").includes("web_search")) continue;
    for (const source of item?.action?.sources || []) {
      const url = clean(source?.url);
      if (!url) continue;
      sources.push({
        url,
        title: clean(source?.title) || sourceHost(url) || "Web source",
      });
    }
  }
  const seen = new Set();
  return sources.filter((source) => {
    const key = sourceKey(source.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const evidenceSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    identity_match: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string" },
    rows: {
      type: "array",
      maxItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          season_label: { type: "string", minLength: 1 },
          club_name: { type: "string", minLength: 1 },
          league: { type: ["string", "null"] },
          country: { type: ["string", "null"] },
          appearances: { type: ["integer", "null"], minimum: 0 },
          starts: { type: ["integer", "null"], minimum: 0 },
          minutes: { type: ["integer", "null"], minimum: 0 },
          goals: { type: ["integer", "null"], minimum: 0 },
          assists: { type: ["integer", "null"], minimum: 0 },
          source_urls: {
            type: "array",
            minItems: 2,
            maxItems: 6,
            items: { type: "string", minLength: 8 },
          },
        },
        required: [
          "season_label",
          "club_name",
          "league",
          "country",
          "appearances",
          "starts",
          "minutes",
          "goals",
          "assists",
          "source_urls",
        ],
      },
    },
  },
  required: ["identity_match", "confidence", "reason", "rows"],
};

async function researchCurrentPublicStats(openAiKey, player) {
  if (!openAiKey) {
    return {
      ok: false,
      skipped: true,
      reason: "OPENAI_API_KEY is not configured for public evidence fallback.",
      confidence: 0,
      row: null,
      sources: [],
    };
  }

  const identity = {
    name: [player.first_name, player.last_name].filter(Boolean).join(" "),
    preferred_name: player.preferred_name,
    date_of_birth: player.date_of_birth,
    current_club: player.current_club,
    current_league: player.current_league,
    current_country: player.current_country,
    current_season_label: player.current_season_label,
    current_season_start: player.current_season_start,
    transfermarkt_url: player.transfermarkt_url,
    stats_url: player.stats_url,
    football_provider_ids: player.football_provider_ids,
  };

  const prompt = [
    "Research the exact player's CURRENT domestic league season statistics using live public web search.",
    "The current club/current league/current season below are the target. Do not return a senior-team row if the current club is the reserve/B/II side, and do not return historical seasons.",
    "Accuracy is more important than filling every field.",
    "First establish identity using full name plus date of birth and/or the exact club/profile IDs.",
    "Return at most one current domestic league row. Exclude cups, friendlies, international matches, youth matches, OFC/continental matches, and totals that mix competitions.",
    "Appearances must be supported by at least two independent websites. Use the freshest sources available.",
    "For starts, minutes, goals and assists: if only one of the supporting detailed sources publishes the field, it may be returned only when the other sources do not contradict it. If there is a contradiction, return null for that field unless stronger evidence resolves it.",
    "When sources disagree, prefer in this order: official competition/federation/club records and detailed match logs; competition-specific specialist databases; detailed established football databases; general summary aggregators. A detailed match-by-match total beats a conflicting summary total.",
    "Never use two language mirrors of the same website as two independent sources.",
    "Every source_urls item must directly support either the current row or exact player identity and must be a URL found through the web search.",
    "Do not invent a statistic, competition, season, URL, or provider ID. Return no row if the current line cannot be established safely.",
    `Player identity and target context: ${JSON.stringify(identity)}`,
    `Current date: ${new Date().toISOString().slice(0, 10)}`,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-5.6-luna",
      reasoning: { effort: "low" },
      store: false,
      tools: [{ type: "web_search" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You are DJM's conservative football statistics researcher. Find the current club/current league row only. Never infer missing numbers.",
            },
          ],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "djm_current_public_stats_evidence",
          strict: true,
          schema: evidenceSchema,
        },
      },
    }),
    signal: AbortSignal.timeout(45000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        payload?.message ||
        `Public stats research returned HTTP ${response.status}.`,
    );
  }

  const raw = outputText(payload);
  if (!raw) throw new Error("Public stats research returned no structured output.");

  let plan;
  try {
    plan = JSON.parse(raw);
  } catch {
    throw new Error("Public stats research returned invalid structured output.");
  }

  const sources = webSources(payload);
  const row = Array.isArray(plan?.rows) ? plan.rows[0] || null : null;

  return {
    ok: Boolean(plan?.identity_match && Number(plan?.confidence || 0) >= 0.88 && row),
    skipped: false,
    reason: clean(plan?.reason) || "Current public stats research completed.",
    confidence: Number(plan?.confidence || 0),
    row,
    sources,
  };
}

function monotonic(existing, incoming) {
  const oldValue = whole(existing);
  const newValue = whole(incoming);
  if (newValue == null) return oldValue;
  if (oldValue != null && newValue < oldValue) return oldValue;
  return newValue;
}

async function persistCurrentPublicStats(admin, player, research) {
  if (!research?.ok || !research?.row) {
    return {
      ok: false,
      reason: research?.reason || "Current public evidence did not meet the confidence threshold.",
      confidence: research?.confidence || 0,
      rows_inserted: 0,
      rows_updated: 0,
      conflicts: 0,
      rejected_rows: research?.row ? 1 : 0,
      sources: research?.sources || [],
    };
  }

  const candidate = research.row;
  if (!sameClub(candidate.club_name, player.current_club)) {
    return {
      ok: false,
      reason: "The researched row did not match the player's current club.",
      confidence: research.confidence,
      rows_inserted: 0,
      rows_updated: 0,
      conflicts: 0,
      rejected_rows: 1,
      sources: research.sources || [],
    };
  }

  if (player.current_season_label && normalise(candidate.season_label) !== normalise(player.current_season_label)) {
    return {
      ok: false,
      reason: "The researched row did not match the player's current season.",
      confidence: research.confidence,
      rows_inserted: 0,
      rows_updated: 0,
      conflicts: 0,
      rejected_rows: 1,
      sources: research.sources || [],
    };
  }

  const allowed = new Map(
    (research.sources || [])
      .map((source) => [sourceKey(source.url), source])
      .filter(([key]) => Boolean(key)),
  );
  const verifiedSources = [...new Set((candidate.source_urls || []).map(clean).filter(Boolean))]
    .map((url) => allowed.get(sourceKey(url)))
    .filter(Boolean);
  const distinctHosts = [
    ...new Set(verifiedSources.map((source) => sourceHost(source.url)).filter(Boolean)),
  ];

  if (verifiedSources.length < 2 || distinctHosts.length < 2) {
    return {
      ok: false,
      reason: "The current row did not retain two independent supporting web sources.",
      confidence: research.confidence,
      rows_inserted: 0,
      rows_updated: 0,
      conflicts: 0,
      rejected_rows: 1,
      sources: research.sources || [],
    };
  }

  const { data: existingRows, error: existingError } = await admin
    .from("career_entries")
    .select(
      "id,season_label,club_name,league,appearances,starts,minutes,goals,assists,source_provider,source_acceptance_method,source_synced_at",
    )
    .eq("player_id", player.id);
  if (existingError) throw existingError;

  const exact = (existingRows || []).find(
    (entry) =>
      normalise(entry.season_label) === normalise(candidate.season_label) &&
      sameClub(entry.club_name, candidate.club_name) &&
      sameLeague(entry.league, candidate.league),
  );

  if (exact && !["public_web_evidence"].includes(normalise(exact.source_provider).replaceAll(" ", "_"))) {
    return {
      ok: true,
      reason: "A stronger verified/manual/provider row already exists for the current season, so DJM left it untouched.",
      confidence: research.confidence,
      rows_inserted: 0,
      rows_updated: 0,
      conflicts: 1,
      rejected_rows: 0,
      sources: research.sources || [],
    };
  }

  const hasAnyStat = [
    candidate.appearances,
    candidate.starts,
    candidate.minutes,
    candidate.goals,
    candidate.assists,
  ].some((value) => value != null);
  if (!hasAnyStat) {
    return {
      ok: false,
      reason: "The current evidence contained no safe numeric statistics.",
      confidence: research.confidence,
      rows_inserted: 0,
      rows_updated: 0,
      conflicts: 0,
      rejected_rows: 1,
      sources: research.sources || [],
    };
  }

  const now = new Date().toISOString();
  const primary = verifiedSources[0];
  const sourceList = verifiedSources
    .slice(0, 6)
    .map((source) => `${source.title}: ${source.url}`)
    .join(" | ");

  const payload = {
    player_id: player.id,
    season_label: clean(candidate.season_label) || player.current_season_label,
    club_name: clean(candidate.club_name) || player.current_club,
    league: clean(candidate.league) || player.current_league,
    country: clean(candidate.country) || player.current_country,
    appearances: monotonic(exact?.appearances, candidate.appearances),
    starts: monotonic(exact?.starts, candidate.starts),
    minutes: monotonic(exact?.minutes, candidate.minutes),
    goals: monotonic(exact?.goals, candidate.goals),
    assists: monotonic(exact?.assists, candidate.assists),
    notes: `Automatically refreshed current-season public evidence. Sources: ${sourceList}`,
    source_name: "Cross-checked current public football statistics",
    source_url: primary.url,
    source_reviewed_at: null,
    source_provider: "public_web_evidence",
    source_acceptance_method: "web_current_season_cross_checked_monotonic",
    source_provider_player_id: null,
    source_synced_at: now,
  };

  if (exact?.id) {
    const { error } = await admin.from("career_entries").update(payload).eq("id", exact.id);
    if (error) throw error;
    return {
      ok: true,
      reason: "Current public football statistics refreshed.",
      confidence: research.confidence,
      rows_inserted: 0,
      rows_updated: 1,
      conflicts: 0,
      rejected_rows: 0,
      sources: verifiedSources,
    };
  }

  const { error } = await admin.from("career_entries").insert(payload);
  if (error) throw error;
  return {
    ok: true,
    reason: "Current public football statistics saved.",
    confidence: research.confidence,
    rows_inserted: 1,
    rows_updated: 0,
    conflicts: 0,
    rejected_rows: 0,
    sources: verifiedSources,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
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
    if (!playerId) return json({ ok: false, error: "Player is required" }, 400);

    const { data: player, error: playerError } = await admin
      .from("players")
      .select(
        "id,first_name,last_name,preferred_name,date_of_birth,current_club,current_league,current_country,current_season_label,current_season_start,football_provider_ids,transfermarkt_url,stats_url",
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

    let apiFootball = {
      ok: false,
      skipped: true,
      reason: "API-Football fallback was not available.",
    };

    if (anonKey) {
      try {
        const response = await fetch(`${url}/functions/v1/refresh-player-data`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: anonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ mode: "free_stats", player_id: playerId }),
          signal: AbortSignal.timeout(30000),
        });
        const payload = await response.json().catch(() => ({}));
        apiFootball = {
          ...payload,
          ok: Boolean(response.ok && payload?.ok),
          skipped: false,
        };
      } catch (error) {
        apiFootball = {
          ok: false,
          skipped: false,
          reason: error instanceof Error ? error.message : "API-Football fallback failed.",
        };
      }
    }

    const providerOk = Boolean(theSportsDb?.ok || apiFootball?.ok);
    let publicWeb = {
      ok: false,
      skipped: true,
      reason: providerOk
        ? "Normal football provider returned usable data."
        : "Current public evidence has not been checked yet.",
      rows_inserted: 0,
      rows_updated: 0,
      conflicts: 0,
      rejected_rows: 0,
    };

    if (!providerOk && player.current_club) {
      const { data: webRows, error: webRowsError } = await admin
        .from("career_entries")
        .select("club_name,season_label,source_provider,source_synced_at")
        .eq("player_id", playerId)
        .in("source_provider", ["public_web_evidence", "public_web_verified"])
        .not("source_synced_at", "is", null)
        .order("source_synced_at", { ascending: false })
        .limit(30);
      if (webRowsError) throw webRowsError;

      const currentFresh = (webRows || []).find(
        (row) =>
          sameClub(row.club_name, player.current_club) &&
          (!player.current_season_label ||
            normalise(row.season_label) === normalise(player.current_season_label)) &&
          row.source_synced_at >= sevenDaysAgo(),
      );

      if (currentFresh) {
        publicWeb = {
          ok: true,
          skipped: true,
          reason: "Current cross-checked public evidence is still fresh.",
          rows_inserted: 0,
          rows_updated: 0,
          conflicts: 0,
          rejected_rows: 0,
        };
      } else {
        try {
          const research = await researchCurrentPublicStats(openAiKey, player);
          publicWeb = await persistCurrentPublicStats(admin, player, research);
        } catch (error) {
          publicWeb = {
            ok: false,
            skipped: false,
            reason:
              error instanceof Error
                ? error.message
                : "Current public web evidence fallback failed.",
            rows_inserted: 0,
            rows_updated: 0,
            conflicts: 0,
            rejected_rows: 0,
          };
        }
      }
    }

    const ok = Boolean(providerOk || publicWeb?.ok);
    return json({
      ok,
      strategy: "provider_first_then_current_cross_checked_public_web",
      score_refresh: false,
      comparison_refresh: false,
      thesportsdb: theSportsDb,
      api_football: apiFootball,
      public_web: publicWeb,
      completed_at: new Date().toISOString(),
      error: ok
        ? null
        : "No provider or cross-checked current public source returned usable player stats.",
    }, 200);
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
