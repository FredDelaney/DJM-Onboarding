import { normaliseSeason, textOrNull } from "./normalise.ts";
import { payloadHash } from "./provenance.ts";
import type { ProviderContext, ProviderPreview } from "./types.ts";

const API_BASE = "https://apirest.wyscout.com/v3";
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 10_000;

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const basicAuthorization = () => {
  const username = Deno.env.get("WYSCOUT_API_USERNAME") || "";
  const password = Deno.env.get("WYSCOUT_API_PASSWORD") || "";
  if (!username || !password) throw new Error("Wyscout API is not configured.");
  return `Basic ${btoa(`${username}:${password}`)}`;
};

const fetchWyscout = async (path: string) => {
  let lastStatus: number | null = null;
  let lastError = "Wyscout could not be reached.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: {
          Authorization: basicAuthorization(),
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      lastStatus = response.status;
      console.info(
        JSON.stringify({
          provider: "wyscout",
          operation: path.split("?")[0],
          duration_ms: Date.now() - startedAt,
          http_status: response.status,
          retry_count: attempt - 1,
          result_status: response.ok ? "success" : "failed",
        }),
      );
      if (response.ok) return await response.json();
      if (![408, 425, 429].includes(response.status) && response.status < 500) {
        throw new Error(`Wyscout returned HTTP ${response.status}.`);
      }
      lastError =
        response.status === 429
          ? "Wyscout rate limited the request."
          : `Wyscout returned HTTP ${response.status}.`;
      const retryAfter = Math.min(
        2_000,
        Number(response.headers.get("Retry-After") || 0) * 1_000,
      );
      if (attempt < MAX_ATTEMPTS) await wait(retryAfter || attempt * 350);
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
      if (attempt < MAX_ATTEMPTS) await wait(attempt * 350);
    }
  }

  throw new Error(
    `${lastError} Existing DJM data was not changed after ${MAX_ATTEMPTS} attempts${lastStatus ? ` (HTTP ${lastStatus})` : ""}.`,
  );
};

const careerRows = (payload: Record<string, unknown>) => {
  const candidates =
    payload.career ?? payload.seasons ?? payload.items ?? payload.data;
  return Array.isArray(candidates)
    ? (candidates as Record<string, unknown>[])
    : [];
};

export const wyscoutPreview = async (
  context: ProviderContext,
): Promise<ProviderPreview> => {
  const playerId = String(context.sourceReference || "").trim();
  if (!/^\d+$/.test(playerId)) {
    throw new Error("A numeric Wyscout player ID is required.");
  }

  const [playerPayload, careerPayload] = await Promise.all([
    fetchWyscout(
      `/players/${encodeURIComponent(playerId)}?details=currentTeam`,
    ),
    fetchWyscout(
      `/players/${encodeURIComponent(playerId)}/career?fetch=player&details=team,competition,season`,
    ),
  ]);
  const rows = careerRows(careerPayload);
  const sourceUrl = context.sourceUrl || null;
  const seasonRecords = rows
    .map((row) => normaliseSeason(row, "Wyscout", sourceUrl))
    .filter((row) => row.season_label && row.club_name);
  const hash = await payloadHash({
    player: playerPayload,
    career: careerPayload,
  });

  return {
    provider: "wyscout",
    capability: "licensed_api",
    source_name: "Wyscout",
    source_reference: playerId,
    source_url: sourceUrl,
    fetched_at: new Date().toISOString(),
    provider_version: "v3",
    player: {
      provider_player_id: textOrNull(playerPayload?.wyId),
      first_name: textOrNull(playerPayload?.firstName),
      last_name: textOrNull(playerPayload?.lastName),
      current_club: textOrNull(playerPayload?.currentTeam?.name),
      position: textOrNull(playerPayload?.role?.name),
      preferred_foot: textOrNull(playerPayload?.foot),
    },
    season_records: seasonRecords,
    recent_matches: [],
    warnings: seasonRecords.length
      ? []
      : ["Wyscout returned no usable core season records."],
    confidence: 0.95,
    license_mode: "licensed_api",
    raw_payload_retention: "hash_only",
    payload_hash: hash,
    request_metadata: { attempts_max: MAX_ATTEMPTS, timeout_ms: TIMEOUT_MS },
  };
};
