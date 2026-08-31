// @ts-nocheck

const BASE_URL = "https://www.thesportsdb.com/api/v1/json/123";

const clean = (value) => {
  const text = String(value ?? "").trim();
  return text || null;
};

const whole = (value) => {
  if (value == null || value === "") return null;
  const number = Number(String(value).replace(/[^0-9.-]/g, ""));
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

function first(value, keys) {
  for (const key of keys) {
    const candidate = value?.[key];
    if (candidate != null && String(candidate).trim()) return candidate;
  }
  return null;
}

async function sportsDb(path, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && String(value).trim()) query.set(key, String(value));
  }

  const response = await fetch(`${BASE_URL}${path}?${query}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`TheSportsDB returned HTTP ${response.status}.`);
  }
  return await response.json().catch(() => ({}));
}

function teamScore(left, right) {
  const a = normalise(left);
  const b = normalise(right);
  if (!a || !b) return 0;
  if (a === b) return 10;
  if (a.includes(b) || b.includes(a)) return 7;

  const aWords = new Set(a.split(" "));
  const bWords = new Set(b.split(" "));
  return [...aWords].filter((word) => bWords.has(word) && word.length > 2).length >= 2
    ? 5
    : 0;
}

function candidateScore(remote, player) {
  const remoteName = normalise(
    first(remote, ["strPlayer", "strPlayerAlternate", "strPlayerShort"]),
  );
  const fullName = normalise(
    [player.first_name, player.last_name].filter(Boolean).join(" "),
  );
  const preferredName = normalise(player.preferred_name);
  let score = remoteName === fullName ? 12 : remoteName === preferredName ? 11 : 0;

  const remoteBirth = String(
    first(remote, ["dateBorn", "dateBirth", "strBorn"]) || "",
  ).slice(0, 10);
  const playerBirth = String(player.date_of_birth || "").slice(0, 10);
  if (remoteBirth && playerBirth && remoteBirth === playerBirth) score += 14;
  if (teamScore(first(remote, ["strTeam", "strTeam2"]), player.current_club) >= 7) {
    score += 6;
  }
  return score;
}

function statsRows(payload) {
  for (const key of ["playerstats", "playerStats", "stats", "statistics"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function seasonLabel(row, player) {
  return (
    clean(first(row, ["strSeason", "season", "strYear", "year"])) ||
    player.current_season_label ||
    String(new Date().getUTCFullYear())
  );
}

function seasonMatches(row, player) {
  const remote = normalise(
    first(row, ["strSeason", "season", "strYear", "year"]),
  );
  if (!remote) return true;

  const current = normalise(player.current_season_label);
  const startYear = String(player.current_season_start || "").slice(0, 4);
  const thisYear = String(new Date().getUTCFullYear());
  return Boolean(
    (current &&
      (remote === current || remote.includes(current) || current.includes(remote))) ||
      (startYear && remote.includes(startYear)) ||
      remote.includes(thisYear),
  );
}

function normaliseStats(row, player) {
  const league = clean(first(row, ["strLeague", "league", "strCompetition"]));
  const club = clean(first(row, ["strTeam", "team", "strClub"]));
  let score = seasonMatches(row, player) ? 5 : 0;
  if (league && player.current_league) {
    score += normalise(league) === normalise(player.current_league) ? 8 : 0;
  }
  if (club && player.current_club) score += teamScore(club, player.current_club);

  return {
    score,
    season_label: seasonLabel(row, player),
    club_name: club || player.current_club,
    league: league || player.current_league,
    country: clean(first(row, ["strCountry", "country"])) || player.current_country,
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
    provider_team_id: clean(first(row, ["idTeam", "teamId", "idClub"])) || "",
    provider_competition_id:
      clean(first(row, ["idLeague", "leagueId", "idCompetition"])) || "",
    raw: row,
  };
}

export async function syncTheSportsDbWeekly(admin, player) {
  const fullName =
    [player.first_name, player.last_name].filter(Boolean).join(" ") ||
    player.preferred_name;
  if (!fullName) return { ok: false, reason: "Player name is missing." };

  const search = await sportsDb("/searchplayers.php", { p: fullName });
  const candidates = Array.isArray(search?.player)
    ? search.player
    : Array.isArray(search?.players)
      ? search.players
      : [];
  const ranked = candidates
    .map((candidate) => ({ candidate, score: candidateScore(candidate, player) }))
    .sort((left, right) => right.score - left.score);

  if (!ranked.length || ranked[0].score < 10) {
    return { ok: false, reason: "No confident player match." };
  }
  if (ranked[1] && ranked[1].score === ranked[0].score) {
    return { ok: false, reason: "Player match is ambiguous." };
  }

  const remote = ranked[0].candidate;
  const providerPlayerId = clean(first(remote, ["idPlayer", "playerId", "id"]));
  if (!providerPlayerId) {
    return { ok: false, reason: "Matched player has no provider ID." };
  }

  const stats = await sportsDb("/lookupplayerstats.php", { id: providerPlayerId });
  const rows = statsRows(stats)
    .map((row) => normaliseStats(row, player))
    .sort((left, right) => right.score - left.score);
  const current = rows.find((row) => seasonMatches(row.raw, player)) || rows[0];
  if (!current) return { ok: false, reason: "No current-season statistics." };

  const now = new Date().toISOString();
  const providerIds = {
    ...(player.football_provider_ids &&
    typeof player.football_provider_ids === "object"
      ? player.football_provider_ids
      : {}),
    thesportsdb: providerPlayerId,
  };
  const { error: playerError } = await admin
    .from("players")
    .update({ football_provider_ids: providerIds })
    .eq("id", player.id);
  if (playerError) throw playerError;

  const existing = await admin
    .from("career_entries")
    .select(
      "id,season_label,club_name,league,source_reviewed_at,source_provider,source_name",
    )
    .eq("player_id", player.id);
  if (existing.error) throw existing.error;

  const exact = (existing.data || []).find(
    (entry) =>
      normalise(entry.season_label) === normalise(current.season_label) &&
      normalise(entry.club_name) === normalise(current.club_name) &&
      normalise(entry.league) === normalise(current.league),
  );
  const providerOwned =
    exact &&
    (normalise(exact.source_provider) === "thesportsdb" ||
      normalise(exact.source_name) === "thesportsdb");
  const conflict = Boolean(exact?.source_reviewed_at && !providerOwned);

  if (!conflict && ((current.appearances ?? 0) > 0 || (current.minutes ?? 0) > 0)) {
    const payload = {
      player_id: player.id,
      season_label: current.season_label,
      club_name: current.club_name || "Unknown club",
      league: current.league || "Unknown competition",
      country: current.country,
      appearances: current.appearances,
      starts: current.starts,
      minutes: current.minutes,
      goals: current.goals,
      assists: current.assists,
      source_name: "TheSportsDB",
      source_url: "https://www.thesportsdb.com/",
      source_reviewed_at: now,
      source_provider: "thesportsdb",
      source_acceptance_method: "scheduled_free_api_sync",
      source_provider_player_id: providerPlayerId,
      source_synced_at: now,
    };
    const query = exact?.id
      ? admin.from("career_entries").update(payload).eq("id", exact.id)
      : admin.from("career_entries").insert(payload);
    const { error } = await query;
    if (error) throw error;
  }

  const { error: snapshotError } = await admin.rpc(
    "djm_upsert_weekly_provider_snapshot",
    {
      p_snapshot: {
        player_id: player.id,
        provider_player_id: providerPlayerId,
        provider_team_id: current.provider_team_id,
        provider_competition_id: current.provider_competition_id,
        provider_season_id: String(current.season_label),
        season_label: current.season_label,
        club_name: current.club_name,
        competition_name: current.league,
        metrics: { profile: remote, current_stats: current.raw, normalised: current },
        observed_at: now,
        synced_at: now,
      },
    },
  );
  if (snapshotError) throw snapshotError;

  return { ok: true, conflict, providerPlayerId };
}
