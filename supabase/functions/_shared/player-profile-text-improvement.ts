// A text suggestion only selects existing sentences. The model cannot author factual
// profile copy, and callers must require an explicit user save before persisting it.

export type PlayerProfileTextSection =
  | "headline"
  | "intro_line"
  | "why_review"
  | "career_summary";

export type PlayerProfileTextStyle =
  | "shorter"
  | "clearer"
  | "football_focused"
  | "more_direct"
  | "tailor_to_club";

export type PlayerProfileTextImprovementInput = {
  section: PlayerProfileTextSection;
  style: PlayerProfileTextStyle;
  text: string;
  clubName?: string | null;
};

export type PlayerProfileTextImprovementResult = {
  status: "suggested" | "unchanged";
  source: "ai" | "fallback";
  reason: "selected" | "no_api_key" | "no_change" | "invalid_input" | "model_error" | "invalid_model_output";
  section: PlayerProfileTextSection;
  originalText: string;
  suggestedText: string;
  requiresApproval: boolean;
};

export type PlayerProfileTextImprovementOptions = {
  apiKey?: string | null;
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const sections = new Set<PlayerProfileTextSection>(["headline", "intro_line", "why_review", "career_summary"]);
const styles = new Set<PlayerProfileTextStyle>(["shorter", "clearer", "football_focused", "more_direct", "tailor_to_club"]);
const qualifier = /\b(?:not|no|never|without|unverified|estimated|reported|pending|subject to|youth|academy|reserve|approx(?:imate(?:ly)?)?)\b/i;
const numberOrDate = /\b\d+(?:[.,]\d+)?\b/;

const clean = (value: unknown) => String(value ?? "").trim();

function outputText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const output = (payload as { output?: unknown }).output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    const content = item && typeof item === "object" ? (item as { content?: unknown }).content : null;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: unknown }).type === "output_text" &&
        typeof (part as { text?: unknown }).text === "string") return (part as { text: string }).text;
    }
  }
  return null;
}

function unchanged(input: PlayerProfileTextImprovementInput, reason: PlayerProfileTextImprovementResult["reason"]): PlayerProfileTextImprovementResult {
  return {
    status: "unchanged", source: "fallback", reason, section: input.section,
    originalText: input.text, suggestedText: input.text, requiresApproval: false,
  };
}

function validatedSelection(raw: unknown, segments: string[]): number[] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).length !== 1 || !Object.hasOwn(value, "selected_segment_indices") ||
    !Array.isArray(value.selected_segment_indices)) return null;
  const indices = value.selected_segment_indices;
  if (!indices.length || indices.length > segments.length ||
    indices.some((index) => !Number.isInteger(index) || index < 0 || index >= segments.length)) return null;
  for (let index = 1; index < indices.length; index++) {
    if (indices[index] <= indices[index - 1]) return null;
  }
  // Removing the qualifying context or a numeric fact can reverse meaning.
  for (let index = 0; index < segments.length; index++) {
    if ((qualifier.test(segments[index]) || numberOrDate.test(segments[index])) && !indices.includes(index)) return null;
  }
  return indices as number[];
}

export async function suggestPlayerProfileTextImprovement(
  input: PlayerProfileTextImprovementInput,
  options: PlayerProfileTextImprovementOptions = {},
): Promise<PlayerProfileTextImprovementResult> {
  if (!sections.has(input.section) || !styles.has(input.style) ||
    !clean(input.text) || input.text.length > 1200 ||
    (input.style === "tailor_to_club" && !clean(input.clubName))) return unchanged(input, "invalid_input");

  const segments = clean(input.text).split(/(?<=[.!?])\s+|\n+/).map(clean).filter(Boolean);
  if (segments.length < 2 || segments.length > 12) return unchanged(input, "no_change");
  const apiKey = clean(options.apiKey);
  if (!apiKey) return unchanged(input, "no_api_key");

  const controller = new AbortController();
  const timeout = Math.max(1_000, Math.min(30_000, options.timeoutMs ?? 12_000));
  const timer = setTimeout(() => controller.abort(), timeout);
  let response: Response;
  try {
    response = await (options.fetchImpl || fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: clean(options.model) || "gpt-5.6-luna",
        store: false,
        reasoning: { effort: "none" },
        max_output_tokens: 120,
        instructions: [
          "Improve exactly one existing player-profile text section by choosing a shorter set of its existing sentences.",
          "Choose only indices from the supplied sentences in their original order. Do not write or rewrite any words.",
          "Keep factual numbers, dates, and all qualifying or limiting context.",
          "For a club audience, select relevant existing sentences but do not claim player-club fit.",
          "Return only the strict JSON object requested by the schema.",
        ].join("\n"),
        input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify({
          section: input.section,
          style: input.style,
          club_name: input.style === "tailor_to_club" ? clean(input.clubName).slice(0, 100) : null,
          segments: segments.map((text, index) => ({ index, text })),
        }) }] }],
        text: { format: {
          type: "json_schema", name: "redream_profile_text_segment_selection", strict: true,
          schema: {
            type: "object", additionalProperties: false,
            properties: { selected_segment_indices: { type: "array", items: { type: "integer" }, maxItems: 12 } },
            required: ["selected_segment_indices"],
          },
        } },
      }),
      signal: controller.signal,
    });
  } catch { return unchanged(input, "model_error"); }
  finally { clearTimeout(timer); }
  if (!response.ok) return unchanged(input, "model_error");

  let raw: unknown;
  try { raw = JSON.parse(outputText(await response.json()) || ""); }
  catch { return unchanged(input, "invalid_model_output"); }
  const indices = validatedSelection(raw, segments);
  if (!indices) return unchanged(input, "invalid_model_output");

  const selected = indices.map((index) => segments[index]).join(" ");
  const target = input.style === "tailor_to_club" ? clean(input.clubName).slice(0, 100) : "";
  const suggestedText = target ? `Prepared for ${target}. ${selected}` : selected;
  if (suggestedText === input.text || suggestedText.length > 1200) return unchanged(input, "no_change");
  return {
    status: "suggested", source: "ai", reason: "selected", section: input.section,
    originalText: input.text, suggestedText, requiresApproval: true,
  };
}
