// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
const clean = (v) => {
  const s = String(v ?? "").trim();
  return s || null;
};
const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const whole = (v) => {
  const n = num(v);
  return n == null ? null : Math.max(0, Math.round(n));
};
const norm = (v) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const nowIso = () => new Date().toISOString();
const SPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/123";

async function sportsDb(path, params = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && String(v).trim()) q.set(k, String(v));
  });
  const r = await fetch(
    `${SPORTSDB_BASE}${path}${q.toString() ? `?${q}` : ""}`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!r.ok) throw new Error(`TheSportsDB returned HTTP ${r.status}.`);
  return await r.json().catch(() => ({}));
}

function first(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return v;
  }
  return null;
}

function teamScore(a, b) {
  a = norm(a);
  b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 10;
  if (a.includes(b) || b.includes(a)) return 7;
  const aa = new Set(a.split(" "));
  const bb = new Set(b.split(" "));
  return [...aa].filter((x) => bb.has(x) && x.length > 2).length >= 2 ? 5 : 0;
}

function nameScore(remote, p) {
  const rn = norm(remote);
  const full = norm([p.first_name, p.last_name].filter(Boolean).join(" "));
  const pref = norm(p.preferred_name);
  if (!rn) return 0;
  if (full && rn === full) return 12;
  if (pref && rn === pref) return 11;
  const last = norm(p.last_name);
  const firstName = norm(p.first_name);
  const parts = rn.split(" ");
  if (
    last &&
    parts.includes(last) &&
    firstName &&
    (rn.includes(firstName) || rn.startsWith(firstName[0] + " "))
  ) {
    return 8;
  }
  if (last && parts.includes(last)) return 5;
  return 0;
}

function candidateScore(r, p) {
  let s = nameScore(
    first(r, ["strPlayer", "strPlayerAlternate", "strPlayerShort"]),
    p,
  );
  const rd = String(first(r, ["dateBorn", "dateBirth", "strBorn"]) || "").slice(
    0,
    10,
  );
  const ld = String(p.date_of_birth || "").slice(0, 10);
  if (rd && ld && rd === ld) s += 14;
  if (teamScore(first(r, ["strTeam", "strTeam2"]), p.current_club) >= 7) s += 6;
  return s;
}

function statsRows(payload) {
  for (const k of ["playerstats", "playerStats", "stats", "statistics"]) {
    if (Array.isArray(payload?.[k])) return payload[k];
  }
  return [];
}

function seasonText(row) {
  return clean(first(row, ["strSeason", "season", "strYear", "year"]));
}

function seasonMatches(row, p) {
  const raw = norm(seasonText(row));
  if (!raw) return true;
  const label = norm(p.current_season_label);
  const year = String(p.current_season_start || "").slice(0, 4);
  const now = String(new Date().getUTCFullYear());
  return Boolean(
    (label && (raw === label || raw.includes(label) || label.includes(raw))) ||
      (year && raw.includes(year)) ||
      raw.includes(now),
  );
}

function normaliseStat(row, p) {
  const league = clean(first(row, ["strLeague", "league", "strCompetition"]));
  const club = clean(first(row, ["strTeam", "team", "strClub"]));
  let score = 0;

  if (league && p.current_league) {
    score +=
      norm(league) === norm(p.current_league)
        ? 8
        : norm(league).includes(norm(p.current_league)) ||
            norm(p.current_league).includes(norm(league))
          ? 5
          : 0;
  }
  if (club && p.current_club) score += teamScore(club, p.current_club);
  if (seasonMatches(row, p)) score += 5;

  return {
    score,
    season_label:
      seasonText(row) ||
      p.current_season_label ||
      String(new Date().getUTCFullYear()),
    club_name: club || p.current_club,
    league: league || p.current_league,
    country:
      clean(first(row, ["strCountry", "country"])) || p.current_country,
    appearances: whole(
      first(row, [
        "intAppearances",
        "strAppearances",
        "appearances",
        "intPlayed",
        "strPlayed",
        "played",
      ]),
    ),
    starts: whole(first(row, ["intStarts", "strStarts", "starts"])),
    minutes: whole(
      first(row, [
        "intMinutes",
        "strMinutes",
        "minutes",
        "intMinutesPlayed",
        "strMinutesPlayed",
      ]),
    ),
    goals: whole(first(row, ["intGoals", "strGoals", "goals"])),
    assists: whole(first(row, ["intAssists", "strAssists", "assists"])),
    provider_team_id: clean(first(row, ["idTeam", "teamId", "idClub"])),
    provider_competition_id: clean(
      first(row, ["idLeague", "leagueId", "idCompetition"]),
    ),
    raw: row,
  };
}

async function callCore(url, publicKey, token, body) {
  try {
    const r = await fetch(`${url}/functions/v1/refresh-player-data`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: publicKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    const p = await r.json().catch(() => ({}));
    return { ...p, _http_status: r.status };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      _http_status: 0,
    };
  }
}

async function refreshSportsDb(admin, player) {
  const fullName =
    [player.first_name, player.last_name].filter(Boolean).join(" ") ||
    player.preferred_name;
  if (!fullName) {
    return {
      ok: false,
      reason: "Player name is missing for TheSportsDB lookup.",
    };
  }

  const search = await sportsDb("/searchplayers.php", { p: fullName });
  const people = Array.isArray(search?.player)
    ? search.player
    : Array.isArray(search?.players)
      ? search.players
      : [];
  const ranked = people
    .map((x) => ({ x, s: candidateScore(x, player) }))
    .sort((a, b) => b.s - a.s);

  if (!ranked.length || ranked[0].s < 10) {
    return {
      ok: false,
      reason: "TheSportsDB did not return a confident player match.",
    };
  }
  if (ranked[1] && ranked[1].s === ranked[0].s) {
    return {
      ok: false,
      reason: "TheSportsDB returned an ambiguous player match.",
    };
  }

  const remote = ranked[0].x;
  const providerPlayerId = clean(
    first(remote, ["idPlayer", "playerId", "id"]),
  );
  if (!providerPlayerId) {
    return {
      ok: false,
      reason: "TheSportsDB matched the player but returned no player ID.",
    };
  }

  const stats = await sportsDb("/lookupplayerstats.php", {
    id: providerPlayerId,
  }).catch(() => ({}));

  const rows = statsRows(stats)
    .map((x) => normaliseStat(x, player))
    .sort((a, b) => b.score - a.score);
  const current = rows.find((x) => seasonMatches(x.raw, player)) || rows[0] || null;

  const ids = {
    ...(player.football_provider_ids &&
    typeof player.football_provider_ids === "object"
      ? player.football_provider_ids
      : {}),
    thesportsdb: providerPlayerId,
  };
  const patch = { football_provider_ids: ids };

  const height = whole(first(remote, ["strHeight", "intHeight", "height"]));
  if (!player.height_cm && height && height >= 140 && height <= 220) {
    patch.height_cm = height;
  }

  const nat = clean(first(remote, ["strNationality", "strCountry", "nationality"]));
  if ((!Array.isArray(player.nationalities) || !player.nationalities.length) && nat) {
    patch.nationalities = [nat];
  }

  const pos = clean(first(remote, ["strPosition", "strPosition2", "position"]));
  if (!player.primary_position && pos) patch.primary_position = pos;

  const team = clean(first(remote, ["strTeam", "strTeam2", "team"]));
  if (!player.current_club && team) patch.current_club = team;
  if (current?.league && !player.current_league) patch.current_league = current.league;
  if (current?.country && !player.current_country) {
    patch.current_country = current.country;
  }

  const { error: playerErr } = await admin
    .from("players")
    .update(patch)
    .eq("id", player.id);
  if (playerErr) throw playerErr;

  if (!current) {
    return {
      ok: false,
      providerPlayerId,
      reason:
        "TheSportsDB matched the profile but returned no usable current-season stats.",
    };
  }

  const now = nowIso();
  const league = current.league || player.current_league || "Unknown competition";
  const country = current.country || player.current_country;
  const providerCompetitionId =
    current.provider_competition_id ||
    `text:${norm(country)}:${norm(league)}`;

  const existing = await admin
    .from("career_entries")
    .select(
      "id,season_label,club_name,league,source_reviewed_at,source_provider,source_name",
    )
    .eq("player_id", player.id);
  if (existing.error) throw existing.error;

  const exact = (existing.data || []).find(
    (e) =>
      norm(e.season_label) === norm(current.season_label) &&
      norm(e.club_name) === norm(current.club_name || player.current_club) &&
      norm(e.league) === norm(league),
  );
  const owned =
    exact &&
    (norm(exact.source_provider) === "thesportsdb" ||
      norm(exact.source_name) === "thesportsdb");

  let conflict = false;
  if (exact?.source_reviewed_at && !owned) {
    conflict = true;
  } else if ((current.appearances ?? 0) > 0 || (current.minutes ?? 0) > 0) {
    const payload = {
      player_id: player.id,
      season_label: current.season_label,
      club_name: current.club_name || player.current_club || "Unknown club",
      league,
      country,
      appearances: current.appearances,
      starts: current.starts,
      minutes: current.minutes,
      goals: current.goals,
      assists: current.assists,
      source_name: "TheSportsDB",
      source_url: "https://www.thesportsdb.com/",
      source_reviewed_at: now,
      source_provider: "thesportsdb",
      source_acceptance_method: "free_api_sync",
      source_provider_player_id: providerPlayerId,
      source_synced_at: now,
    };
    if (exact?.id) {
      const { error } = await admin
        .from("career_entries")
        .update(payload)
        .eq("id", exact.id);
      if (error) throw error;
    } else {
      const { error } = await admin.from("career_entries").insert(payload);
      if (error) throw error;
    }
  }

  const { error: snapErr } = await admin.rpc(
    "djm_upsert_weekly_provider_snapshot",
    {
      p_snapshot: {
        player_id: player.id,
        provider_player_id: providerPlayerId,
        provider_team_id: String(current.provider_team_id || ""),
        provider_competition_id: String(providerCompetitionId),
        provider_season_id: String(current.season_label || "current"),
        season_label: current.season_label,
        club_name: current.club_name || player.current_club,
        competition_name: league,
        metrics: {
          profile: remote,
          current_stats: current.raw,
          normalised: current,
        },
        observed_at: now,
        synced_at: now,
      },
    },
  );
  if (snapErr) throw snapErr;

  return {
    ok: true,
    providerPlayerId,
    current,
    conflict,
    league,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const publicKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceKey;
    const token = (req.headers.get("Authorization") || "").replace(
      /^Bearer\s+/i,
      "",
    );

    if (!token) return json({ ok: false, error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const caller = createClient(url, publicKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return json({ ok: false, error: "Admin access required" }, 403);
    }

    const body = await req.json().catch(() => ({}));

    if (String(body?.mode || "refresh").toLowerCase() === "status") {
      const core = await callCore(url, publicKey, token, { mode: "status" });
      return json({
        ok: true,
        configured: true,
        provider_priority: [
          "PitchAPI deep current",
          "TheSportsDB current/basic",
          "API-Football historical",
          "Verified DJM evidence",
        ],
        pitchapi_configured: Boolean(
          core?.pitchapi_configured || core?.configured,
        ),
        api_football_configured: Boolean(core?.api_football_configured),
        thesportsdb_configured: true,
        thesportsdb_free_rate_limit: "30 requests/minute",
        score_modes: ["full", "provisional", "unavailable"],
        secret_names_are_ignored: true,
      });
    }

    const playerId = String(body?.player_id || "").trim();
    if (!playerId) return json({ ok: false, error: "Player is required" }, 400);

    const { data: player, error: pe } = await admin
      .from("players")
      .select(
        "id,first_name,last_name,preferred_name,date_of_birth,nationalities,height_cm,primary_position,current_club,current_league,current_country,current_season_label,current_season_start,current_competition_id,football_provider_ids",
      )
      .eq("id", playerId)
      .maybeSingle();
    if (pe) throw pe;
    if (!player) return json({ ok: false, error: "Player not found" }, 404);

    const core = await callCore(url, publicKey, token, {
      mode: "refresh",
      player_id: playerId,
    });

    if (
      core?.ok &&
      core?.primary_provider === "PitchAPI" &&
      core?.current_data &&
      core?.performance_snapshot
    ) {
      const { data: score, error: scoreError } = await caller.rpc(
        "djm_player_scorecard",
        { p_player_id: playerId },
      );
      if (scoreError) throw scoreError;

      return json({
        ...core,
        score_result: score,
        message: `Deep current evidence refreshed from PitchAPI. ${
          score?.score_tier === "full"
            ? `Full Player Score ${score?.model_score} calculated.`
            : `Player Score refreshed with ${score?.score_tier || "current"} evidence.`
        }`,
      });
    }

    let sports = null;
    let sportsError = null;
    try {
      sports = await refreshSportsDb(admin, player);
    } catch (e) {
      sportsError = e instanceof Error ? e.message : String(e);
    }

    const { data: score, error: scoreError } = await caller.rpc(
      "djm_player_scorecard",
      { p_player_id: playerId },
    );
    if (scoreError) throw scoreError;

    const tier = score?.score_tier || "unavailable";
    let message;

    if (tier === "full") {
      message = `Full Player Score ${score?.model_score} calculated from current verified evidence.`;
    } else if (tier === "provisional") {
      message = `Provisional Player Score ${score?.provisional_score} calculated at ${score?.provisional_confidence}% confidence. Missing deep performance evidence is neutral-imputed, never fabricated, and the score will upgrade automatically when richer current data becomes available.`;
    } else if (score?.model_status === "not_enough_playing_time_data") {
      message =
        "Player refresh completed, but DJM still needs at least 500 verified senior minutes inside the previous 24 months before publishing a rating.";
    } else if (score?.model_status === "competition_evidence_required") {
      message =
        "Player refresh completed, but the current or most recent valid senior competition still needs to be resolved.";
    } else {
      message =
        "Player refresh completed. DJM preserved the available evidence but still cannot publish a defensible rating yet.";
    }

    return json({
      ok: true,
      primary_provider: sports?.ok
        ? "TheSportsDB"
        : core?.primary_provider || "DJM verified evidence",
      current_data: Boolean(sports?.ok || core?.current_data),
      current_data_depth: sports?.ok
        ? "basic"
        : core?.current_data
          ? "provider"
          : "verified_evidence",
      sportsdb_result: sports?.ok
        ? {
            provider_player_id: sports.providerPlayerId,
            competition: sports.league,
            career_conflict_kept_for_review: sports.conflict,
          }
        : null,
      pitchapi_or_core_result: core?.ok ? core : null,
      provider_notes: {
        pitchapi: core?.pitchapi_reason || core?.error || null,
        thesportsdb: sports?.reason || sportsError || null,
        api_football: core?.api_football_reason || null,
      },
      score_result: score,
      message,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Universal player refresh failed";
    console.error(
      JSON.stringify({
        operation: "refresh_player_universal",
        result_status: "failed",
        error: message,
      }),
    );
    return json({ ok: false, error: message, existing_data_changed: false }, 500);
  }
});
