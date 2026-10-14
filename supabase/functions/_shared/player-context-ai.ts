export type PlayerContextField =
  | "current_club"
  | "current_league"
  | "current_country"
  | "current_season_label"
  | "primary_position"
  | "transfermarkt_url"
  | "stats_url";

export type PlayerContextResearchInput = {
  player: {
    first_name?: string | null;
    last_name?: string | null;
    preferred_name?: string | null;
    date_of_birth?: string | null;
    current_club?: string | null;
    current_league?: string | null;
    current_country?: string | null;
    current_season_label?: string | null;
    primary_position?: string | null;
    transfermarkt_url?: string | null;
    stats_url?: string | null;
  };
  career?: Array<{
    club_name?: string | null;
    league?: string | null;
    season_label?: string | null;
  }>;
};

export type PlayerContextResearchResult = {
  ok: boolean;
  confidence: number;
  reason: string;
  fields: Partial<Record<PlayerContextField, string>>;
  sources: Array<{ title: string; url: string }>;
  model: string;
};

const clean = (value: unknown, max = 180) => String(value ?? "").trim().slice(0, max);
const safeUrl = (value: unknown) => {
  try {
    const url = new URL(clean(value, 600));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
};
const sourceKey = (value: unknown) => {
  const url = safeUrl(value);
  if (!url) return null;
  const parsed = new URL(url);
  return `${parsed.hostname.toLowerCase().replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "") || "/"}`.toLowerCase();
};
const outputText = (payload: any) => {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  for (const item of payload?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  return "";
};
const webSources = (payload: any) => {
  const out: Array<{ title: string; url: string }> = [];
  for (const item of payload?.output || []) {
    if (!String(item?.type || "").includes("web_search")) continue;
    for (const source of item?.action?.sources || []) {
      const url = safeUrl(source?.url);
      if (url) out.push({ title: clean(source?.title, 160) || new URL(url).hostname, url });
    }
  }
  const seen = new Set<string>();
  return out.filter((source) => {
    const key = sourceKey(source.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    identity_match: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string" },
    current_club: { type: ["string", "null"] },
    current_league: { type: ["string", "null"] },
    current_country: { type: ["string", "null"] },
    current_season_label: { type: ["string", "null"] },
    primary_position: { type: ["string", "null"] },
    transfermarkt_url: { type: ["string", "null"] },
    stats_url: { type: ["string", "null"] },
  },
  required: [
    "identity_match",
    "confidence",
    "reason",
    "current_club",
    "current_league",
    "current_country",
    "current_season_label",
    "primary_position",
    "transfermarkt_url",
    "stats_url",
  ],
};

export async function researchPlayerContext(
  input: PlayerContextResearchInput,
  options: {
    apiKey: string;
    model?: string;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  },
): Promise<PlayerContextResearchResult> {
  const model = clean(options.model, 100) || "gpt-6-luna";
  const fallback = (reason: string): PlayerContextResearchResult => ({
    ok: false,
    confidence: 0,
    reason,
    fields: {},
    sources: [],
    model,
  });
  const apiKey = clean(options.apiKey, 500);
  if (!apiKey) return fallback("no_api_key");

  const context = {
    name: [input.player.first_name, input.player.last_name].filter(Boolean).join(" "),
    preferred_name: input.player.preferred_name || null,
    date_of_birth: input.player.date_of_birth || null,
    recorded: {
      current_club: input.player.current_club || null,
      current_league: input.player.current_league || null,
      current_country: input.player.current_country || null,
      current_season_label: input.player.current_season_label || null,
      primary_position: input.player.primary_position || null,
      transfermarkt_url: input.player.transfermarkt_url || null,
      stats_url: input.player.stats_url || null,
    },
    career_clues: (input.career || []).slice(0, 6),
  };
  const prompt = [
    "Research the exact football player's CURRENT playing context using live web search.",
    "Identify the exact current squad, not merely the parent club. Distinguish first team from Reserves, II, B, academy, U23 and U21.",
    "Identify the domestic league/competition the current squad plays in, the country, the current season label and primary position.",
    "Return a Transfermarkt player profile URL and a useful current statistics/profile URL only when the exact player is clearly matched.",
    "Do not infer an answer from a same-name player. Use name, date of birth, club history and supplied links to prove identity.",
    "If reliable evidence is missing, return null for that field. Do not invent or guess.",
    "Prefer official club/league/federation sources, Transfermarkt and established football statistics providers.",
    `Player context: ${JSON.stringify(context)}`,
    `Current date: ${new Date().toISOString().slice(0, 10)}`,
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 25000);
  let response: Response;
  try {
    response = await (options.fetchImpl || fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "medium" },
        max_output_tokens: 1200,
        tools: [{ type: "web_search", search_context_size: "medium" }],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        input: [
          { role: "system", content: [{ type: "input_text", text: "You are ReDream's conservative football identity and current-context researcher. Facts must be source-grounded and identity-safe." }] },
          { role: "user", content: [{ type: "input_text", text: prompt }] },
        ],
        text: { format: { type: "json_schema", name: "redream_player_current_context", strict: true, schema } },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    return fallback(error instanceof Error && error.name === "AbortError" ? "timeout" : "model_error");
  } finally {
    clearTimeout(timer);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return fallback("model_error");
  const raw = outputText(payload);
  if (!raw) return fallback("empty_model_output");

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback("invalid_model_output");
  }
  const sources = webSources(payload);
  const confidence = Number(parsed?.confidence || 0);
  if (parsed?.identity_match !== true || confidence < 0.85 || !sources.length) {
    return { ...fallback(clean(parsed?.reason, 300) || "identity_not_confident"), confidence, sources };
  }

  const fields: Partial<Record<PlayerContextField, string>> = {};
  for (const key of ["current_club", "current_league", "current_country", "current_season_label", "primary_position"] as const) {
    const value = clean(parsed?.[key], 160);
    if (value) fields[key] = value;
  }

  const surfaced = new Set(sources.map((source) => sourceKey(source.url)).filter(Boolean));
  for (const key of ["transfermarkt_url", "stats_url"] as const) {
    const value = safeUrl(parsed?.[key]);
    if (value && surfaced.has(sourceKey(value))) fields[key] = value;
  }

  return {
    ok: Boolean(Object.keys(fields).length),
    confidence,
    reason: clean(parsed?.reason, 300) || "Current player context found.",
    fields,
    sources,
    model,
  };
}
