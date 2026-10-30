export type PlayerContextField =
  | "current_club"
  | "current_league"
  | "current_country"
  | "current_season_label"
  | "primary_position"
  | "transfermarkt_url"
  | "stats_url"
  | "date_of_birth" | "nationalities" | "height_cm" | "preferred_foot" | "contract_status" | "contract_expiry";

export type PlayerContextValue = string | number | string[];

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
    nationalities?: string[] | null; height_cm?: number | null; preferred_foot?: string | null;
    contract_status?: string | null; contract_expiry?: string | null;
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
  fields: Partial<Record<PlayerContextField, PlayerContextValue>>;
  field_sources: Partial<Record<PlayerContextField, Array<{title:string;url:string}>>>;
  sources: Array<{ title: string; url: string }>;
  model: string;
};

const clean = (value: unknown, max = 180) => String(value ?? "").trim().slice(0, max);
const cleanClub = (value: unknown) => clean(value, 160)
  .replace(/\s*[\u2014\u2013-]\s*(?:senior\s*)?\(?first team\)?\s*$/i, "")
  .replace(/\s*\((?:senior|first team)\)\s*$/i, "")
  .trim();
const safeUrl = (value: unknown) => {
  try {
    const url = new URL(clean(value, 600));
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
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

export const PLAYER_CONTEXT_FIELDS = ["current_club","current_league","current_country","current_season_label","primary_position","transfermarkt_url","stats_url","date_of_birth","nationalities","height_cm","preferred_foot","contract_status","contract_expiry"] as const;

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
    date_of_birth: {type:["string","null"]}, nationalities: {type:["array","null"],items:{type:"string"}},
    height_cm:{type:["integer","null"]},preferred_foot:{type:["string","null"],enum:["Left","Right","Both",null]},contract_status:{type:["string","null"]},contract_expiry:{type:["string","null"]},
    field_sources:{type:"object",additionalProperties:false,properties:Object.fromEntries(PLAYER_CONTEXT_FIELDS.map(key=>[key,{type:"array",items:{type:"string"}}])),required:[...PLAYER_CONTEXT_FIELDS]},
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
    "stats_url", "date_of_birth", "nationalities", "height_cm", "preferred_foot", "contract_status", "contract_expiry", "field_sources",
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
    field_sources: {},
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
      nationalities:input.player.nationalities||null,height_cm:input.player.height_cm||null,preferred_foot:input.player.preferred_foot||null,
      contract_status:input.player.contract_status||null,contract_expiry:input.player.contract_expiry||null,
    },
    career_clues: (input.career || []).slice(0, 6),
  };
  const prompt = [
    "Research the exact football player's CURRENT playing context using live web search.",
    "Identify the exact current squad, not merely the parent club. Distinguish first team from Reserves, II, B, academy, U23 and U21. Return only the canonical team name in current_club; do not append labels such as Senior or first team.",
    "Identify the domestic league/competition the current squad plays in, the country, the current season label and primary position.",
    "Return a Transfermarkt player profile URL and a useful current statistics/profile URL only when the exact player is clearly matched.",
    "Do not infer an answer from a same-name player. Use name, date of birth, club history and supplied links to prove identity.",
    "If reliable evidence is missing, return null for that field. Do not invent or guess.",
    "For EACH proposed field return its exact supporting URLs in field_sources. Only use URLs surfaced by web search. An unrelated profile is not evidence for a date or contract.",
    "Birth date, nationalities, height, preferred foot and contract status/expiry require explicit published evidence. Dates must be complete YYYY-MM-DD dates. Never infer a contract, estimate its term, or turn a year into 30 June. Return null and an empty field_sources array when not explicitly stated.",
    "Prefer official club/league/federation sources, Transfermarkt and established football statistics providers.",
    `Player context: ${JSON.stringify(context)}`,
    `Current date: ${new Date().toISOString().slice(0, 10)}`,
  ].join("\n");

  const controller = new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  let response: Response;let payload:any;
  try {
    await Promise.race([(async()=>{
    response = await (options.fetchImpl || fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "medium" },
        max_output_tokens: 2200,
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
    payload=await response.json().catch(()=>({}));
    })(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new DOMException("Research timed out","AbortError"));},options.timeoutMs||25000);})]);
  } catch (error) {
    clearTimeout(timer);
    return fallback(error instanceof Error && error.name === "AbortError" ? "timeout" : "model_error");
  } finally {
    clearTimeout(timer);
  }

  if (!response!.ok) return fallback("model_error");
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
  if (parsed?.identity_match !== true || !Number.isFinite(confidence) || confidence < 0.85 || confidence > 1 || !sources.length) {
    return { ...fallback(clean(parsed?.reason, 300) || "identity_not_confident"), confidence, sources };
  }

  const fields: Partial<Record<PlayerContextField, PlayerContextValue>> = {};
  const field_sources:PlayerContextResearchResult["field_sources"]={};
  for(const key of PLAYER_CONTEXT_FIELDS){
    const references=Array.isArray(parsed?.field_sources?.[key])?parsed.field_sources[key]:[];
    field_sources[key]=sources.filter(source=>references.some((url:unknown)=>sourceKey(url)===sourceKey(source.url)));
  }
  for (const key of ["current_club", "current_league", "current_country", "current_season_label", "primary_position"] as const) {
    const value = key === "current_club" ? cleanClub(parsed?.[key]) : clean(parsed?.[key], 160);
    if (value && field_sources[key]?.length) fields[key] = value;
  }

  const surfaced = new Set(sources.map((source) => sourceKey(source.url)).filter(Boolean));
  const transfermarkt = safeUrl(parsed?.transfermarkt_url);
  if (transfermarkt && field_sources.transfermarkt_url?.some(source=>sourceKey(source.url)===sourceKey(transfermarkt)) && surfaced.has(sourceKey(transfermarkt))) {
    const url = new URL(transfermarkt);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host.startsWith("transfermarkt.") || host.includes(".transfermarkt.")) {
      fields.transfermarkt_url = `https://www.transfermarkt.com${url.pathname}`;
    }
  }
  const statsUrl = safeUrl(parsed?.stats_url);
  if (statsUrl && field_sources.stats_url?.some(source=>sourceKey(source.url)===sourceKey(statsUrl)) && surfaced.has(sourceKey(statsUrl))) fields.stats_url = statsUrl;
  for(const key of ["date_of_birth","contract_expiry"] as const){
    const date=String(parsed?.[key]??'').trim(),stamp=Date.parse(date);
    if(field_sources[key]?.length && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10)===date && date>="1900-01-01" && (key!=="date_of_birth" || stamp<Date.now()))fields[key]=date;
  }
  for(const key of ["contract_status"] as const){const v=clean(parsed?.[key],160);if(v&&field_sources[key]?.length)fields[key]=v;}
  if(field_sources.preferred_foot?.length&&["Left","Right","Both"].includes(parsed?.preferred_foot))fields.preferred_foot=parsed.preferred_foot;
  if(field_sources.height_cm?.length&&Number.isInteger(parsed?.height_cm)&&parsed.height_cm>=140&&parsed.height_cm<=230)fields.height_cm=parsed.height_cm;
  if(field_sources.nationalities?.length&&Array.isArray(parsed?.nationalities)&&parsed.nationalities.length>0&&parsed.nationalities.length<=5&&parsed.nationalities.every((v:unknown)=>typeof v==="string"&&v.trim().length>0&&v.trim().length<=80))fields.nationalities=parsed.nationalities.map((v:string)=>v.trim());

  return {
    ok: Boolean(Object.keys(fields).length),
    confidence,
    reason: clean(parsed?.reason, 300) || "Current player context found.",
    fields,
    field_sources,
    sources,
    model,
  };
}
