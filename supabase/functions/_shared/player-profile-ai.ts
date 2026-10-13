import type { PlayerProfileStatCandidate } from "./player-profile-preparation.ts";

export type PlayerProfileFootballFocus =
  | "balanced"
  | "playing_time"
  | "goal_threat"
  | "creation"
  | "defensive_role"
  | "goalkeeping";

export type PlayerProfileAiInput = {
  mode: "general" | "club";
  player: {
    displayName: string;
    primaryPosition?: string | null;
    currentClub?: string | null;
    currentSeasonLabel?: string | null;
  };
  club?: {
    name: string;
    league?: string | null;
    positionNeed?: string | null;
  } | null;
  statCandidates: PlayerProfileStatCandidate[];
  videoCandidates: { id: string; title: string; url: string }[];
};

export type PlayerProfileAiResult = {
  source: "ai" | "fallback";
  reason: "selected" | "no_api_key" | "no_evidence" | "model_error" | "invalid_model_output";
  selectedStatRefs: string[];
  selectedVideoId: string | null;
  focus: PlayerProfileFootballFocus;
  headline: string;
  introLine: string;
};

export type PlayerProfileAiOptions = {
  apiKey?: string | null;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const focusValues = new Set<PlayerProfileFootballFocus>([
  "balanced", "playing_time", "goal_threat", "creation", "defensive_role", "goalkeeping",
]);

const selectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    selected_stat_refs: { type: "array", maxItems: 4, items: { type: "string" } },
    selected_video_id: { type: ["string", "null"] },
    focus: { type: "string", enum: [...focusValues] },
  },
  required: ["selected_stat_refs", "selected_video_id", "focus"],
};

const clean = (value: unknown, max = 160) => String(value ?? "").trim().slice(0, max);

function outputText(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" &&
        (part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string") {
        return (part as { text: string }).text;
      }
    }
  }
  return null;
}

function deterministicFocus(input: PlayerProfileAiInput): PlayerProfileFootballFocus {
  const position = clean(input.player.primaryPosition).toLowerCase();
  const fields = new Set(input.statCandidates.map((stat) => stat.field));
  if (/\b(gk|goalkeeper|keeper)\b/.test(position)) return "goalkeeping";
  if (/\b(st|striker|centre forward|center forward|winger|right winger|left winger)\b/.test(position)) {
    if (fields.has("goals")) return "goal_threat";
    if (fields.has("assists")) return "creation";
  }
  if (/\b(cb|centre back|center back|defender|full back|right back|left back)\b/.test(position)) return "defensive_role";
  return fields.has("starts") || fields.has("minutes") ? "playing_time" : "balanced";
}

function composeCopy(input: PlayerProfileAiInput, stats: PlayerProfileStatCandidate[]) {
  const name = clean(input.player.displayName, 100) || "Player";
  const position = clean(input.player.primaryPosition, 70);
  const currentClub = clean(input.player.currentClub, 100);
  const targetClub = input.mode === "club" ? clean(input.club?.name, 100) : "";
  const headline = [name, position].filter(Boolean).join(" · ").slice(0, 220);
  const identity = [name, position, currentClub].filter(Boolean).join(" · ");
  const evidence = stats.slice(0, 2).map((stat) =>
    `${stat.value} ${stat.label.toLowerCase()} (${stat.seasonLabel}${stat.competition ? `, ${stat.competition}` : ""})`);
  const audience = targetClub ? `Prepared for ${targetClub}. ` : "";
  const recorded = evidence.length ? `Recorded evidence: ${evidence.join("; ")}.` : "";
  const introLine = `${audience}${identity}${identity ? ". " : ""}${recorded}`.trim().slice(0, 320);
  return { headline, introLine };
}

function makeResult(
  input: PlayerProfileAiInput,
  source: "ai" | "fallback",
  reason: PlayerProfileAiResult["reason"],
  selectedStatRefs: string[],
  selectedVideoId: string | null,
  focus: PlayerProfileFootballFocus,
): PlayerProfileAiResult {
  const byRef = new Map(input.statCandidates.map((candidate) => [candidate.ref, candidate]));
  const selected = selectedStatRefs.map((ref) => byRef.get(ref)).filter((stat): stat is PlayerProfileStatCandidate => Boolean(stat));
  return {
    source, reason, selectedStatRefs, selectedVideoId, focus,
    ...composeCopy(input, selected),
  };
}

function fallback(input: PlayerProfileAiInput, reason: PlayerProfileAiResult["reason"]): PlayerProfileAiResult {
  const usedFields = new Set<string>();
  const refs = input.statCandidates.filter((candidate) => {
    if (usedFields.has(candidate.field) || usedFields.size >= 4) return false;
    usedFields.add(candidate.field);
    return true;
  }).map((candidate) => candidate.ref);
  return makeResult(input, "fallback", reason, refs, input.videoCandidates[0]?.id || null, deterministicFocus(input));
}

function validateSelection(
  raw: unknown,
  statRefs: Set<string>,
  videoIds: Set<string>,
  candidates: PlayerProfileStatCandidate[],
  position: string | null | undefined,
): { refs: string[]; videoId: string | null; focus: PlayerProfileFootballFocus } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).sort().join(",") !== "focus,selected_stat_refs,selected_video_id") return null;
  if (!Array.isArray(value.selected_stat_refs) || value.selected_stat_refs.length > 4 ||
    value.selected_stat_refs.some((ref) => typeof ref !== "string" || !statRefs.has(ref)) ||
    new Set(value.selected_stat_refs).size !== value.selected_stat_refs.length) return null;
  if (statRefs.size && !value.selected_stat_refs.length) return null;
  if (value.selected_video_id !== null &&
    (typeof value.selected_video_id !== "string" || !videoIds.has(value.selected_video_id))) return null;
  if (typeof value.focus !== "string" || !focusValues.has(value.focus as PlayerProfileFootballFocus)) return null;
  const selectedRefs = value.selected_stat_refs as string[];
  const chosen = candidates.filter((candidate) => selectedRefs.includes(candidate.ref));
  const fields = new Set(chosen.map((candidate) => candidate.field));
  const role = clean(position).toLowerCase();
  if (value.focus === "goal_threat" && !fields.has("goals")) return null;
  if (value.focus === "creation" && !fields.has("assists")) return null;
  if (value.focus === "playing_time" &&
    !fields.has("starts") && !fields.has("minutes") && !fields.has("appearances")) return null;
  if (value.focus === "goalkeeping" && !/\b(gk|goalkeeper|keeper)\b/.test(role)) return null;
  if (value.focus === "defensive_role" &&
    !/\b(cb|centre back|center back|defender|full back|right back|left back)\b/.test(role)) return null;
  return {
    refs: selectedRefs,
    videoId: value.selected_video_id as string | null,
    focus: value.focus as PlayerProfileFootballFocus,
  };
}

export async function selectPlayerProfilePresentation(
  input: PlayerProfileAiInput,
  options: PlayerProfileAiOptions = {},
): Promise<PlayerProfileAiResult> {
  if (!input.statCandidates.length) return fallback(input, "no_evidence");
  const apiKey = clean(options.apiKey, 500);
  if (!apiKey) return fallback(input, "no_api_key");

  // Only refs and bounded supplied facts enter the model prompt. No private club notes or
  // free-form model prose may be returned as profile copy.
  const candidates = input.statCandidates.slice(0, 24);
  const videos = input.videoCandidates.slice(0, 8);
  const statRefs = new Set(candidates.map((candidate) => candidate.ref));
  const videoIds = new Set(videos.map((video) => video.id));
  const controller = new AbortController();
  const timeout = Math.max(1_000, Math.min(30_000, options.timeoutMs ?? 15_000));
  const timer = setTimeout(() => controller.abort(), timeout);
  let response: Response;
  try {
    response = await (options.fetchImpl || fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: clean(options.model, 100) || "gpt-5.6-luna",
        store: false,
        reasoning: { effort: "none" },
        max_output_tokens: 240,
        instructions: [
          "Select only supplied statistic refs and an optional supplied video ID for a professional football player profile.",
          "Use the recorded player position and, for a club profile, the supplied club context to choose relevant evidence.",
          "Never create a statistic, numerical value, claim, conclusion about fit, or free-form profile text.",
          "Return only the strict JSON object requested by the schema.",
        ].join("\n"),
        input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({
          mode: input.mode,
          player: {
            position: clean(input.player.primaryPosition, 70) || null,
            current_club: clean(input.player.currentClub, 100) || null,
            current_season: clean(input.player.currentSeasonLabel, 40) || null,
          },
          club: input.mode === "club" ? {
            name: clean(input.club?.name, 100) || null,
            league: clean(input.club?.league, 100) || null,
            position_need: clean(input.club?.positionNeed, 70) || null,
          } : null,
          stats: candidates.map((candidate) => ({
            ref: candidate.ref, label: candidate.label, value: candidate.value,
            season: candidate.seasonLabel, competition: candidate.competition,
            provenance: candidate.source.provenance,
          })),
          videos: videos.map((video) => ({ id: video.id, title: clean(video.title, 100) })),
        }) }] }],
        text: { format: { type: "json_schema", name: "redream_profile_evidence_selection", strict: true, schema: selectionSchema } },
      }),
      signal: controller.signal,
    });
  } catch {
    return fallback(input, "model_error");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) return fallback(input, "model_error");
  let raw: unknown;
  try { raw = JSON.parse(outputText(await response.json()) || ""); }
  catch { return fallback(input, "invalid_model_output"); }
  const selected = validateSelection(raw, statRefs, videoIds, candidates, input.player.primaryPosition);
  if (!selected) return fallback(input, "invalid_model_output");
  return makeResult(input, "ai", "selected", selected.refs, selected.videoId, selected.focus);
}
