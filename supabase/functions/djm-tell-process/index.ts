// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const ACTION_TYPES = [
  "log_interaction",
  "upsert_club_need",
  "create_task",
  "add_claim",
  "suggest_player",
  "exclude_player",
  "log_scout_observation",
] as const;

const POSITION_VALUES = [
  null,
  "GK",
  "RB",
  "LB",
  "CB",
  "RCB",
  "LCB",
  "6",
  "8",
  "10",
  "RW",
  "LW",
  "Winger",
  "ST",
];

const actionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    key: { type: "string", minLength: 1 },
    type: { type: "string", enum: ACTION_TYPES },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    evidence: { type: "string", minLength: 1 },
    club_name: { type: ["string", "null"] },
    contact_name: { type: ["string", "null"] },
    player_name: { type: ["string", "null"] },
    player_current_club: { type: ["string", "null"] },
    club_country: { type: ["string", "null"] },
    player_current_country: { type: ["string", "null"] },
    contact_role: { type: ["string", "null"] },
    scout_source_type: { type: ["string", "null"], enum: [null, "live", "video", "data", "reference", "conversation"] },
    scout_recommendation: { type: ["string", "null"], enum: [null, "strong_yes", "yes", "monitor", "no", "strong_no"] },
    strengths: { type: ["string", "null"] },
    risks: { type: ["string", "null"] },
    title: { type: ["string", "null"] },
    summary: { type: ["string", "null"] },
    position: { type: ["string", "null"], enum: POSITION_VALUES },
    secondary_position: { type: ["string", "null"] },
    preferred_foot: {
      type: ["string", "null"],
      enum: [null, "left", "right", "either"],
    },
    min_age: { type: ["integer", "null"], minimum: 14, maximum: 50 },
    max_age: { type: ["integer", "null"], minimum: 14, maximum: 50 },
    min_height_cm: { type: ["integer", "null"], minimum: 140, maximum: 230 },
    transfer_type: { type: ["string", "null"] },
    transfer_budget: { type: ["number", "null"], minimum: 0 },
    transfer_budget_raw: { type: ["string", "null"] },
    salary_budget: { type: ["number", "null"], minimum: 0 },
    salary_budget_raw: { type: ["string", "null"] },
    currency: { type: ["string", "null"] },
    salary_period: { type: ["string", "null"] },
    salary_tax_basis: { type: ["string", "null"] },
    registration_notes: { type: ["string", "null"] },
    profile_notes: { type: ["string", "null"] },
    playing_style: { type: ["string", "null"] },
    need_type: {
      type: ["string", "null"],
      enum: [null, "confirmed", "predicted"],
    },
    priority: { type: ["integer", "null"], minimum: 1, maximum: 5 },
    due_at: { type: ["string", "null"] },
    claim_type: { type: ["string", "null"] },
    claim_key: { type: ["string", "null"] },
    claim_value: { type: ["string", "null"] },
  },
  required: [
    "key",
    "type",
    "confidence",
    "evidence",
    "club_name",
    "contact_name",
    "player_name",
    "player_current_club",
    "club_country",
    "player_current_country",
    "contact_role",
    "scout_source_type",
    "scout_recommendation",
    "strengths",
    "risks",
    "title",
    "summary",
    "position",
    "secondary_position",
    "preferred_foot",
    "min_age",
    "max_age",
    "min_height_cm",
    "transfer_type",
    "transfer_budget",
    "transfer_budget_raw",
    "salary_budget",
    "salary_budget_raw",
    "currency",
    "salary_period",
    "salary_tax_basis",
    "registration_notes",
    "profile_notes",
    "playing_style",
    "need_type",
    "priority",
    "due_at",
    "claim_type",
    "claim_key",
    "claim_value",
  ],
};

const planSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", minLength: 1 },
    actions: {
      type: "array",
      maxItems: 12,
      items: actionSchema,
    },
  },
  required: ["summary", "actions"],
};

class HttpModelError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpModelError";
    this.status = status;
  }
}

function isRetryable(error: unknown) {
  if (error instanceof HttpModelError) {
    return error.status === 408 || error.status === 409 || error.status === 429 || error.status >= 500;
  }
  const message = error instanceof Error ? error.message : String(error || "");
  return /timeout|timed out|network|fetch failed|connection/i.test(message);
}

function outputText(response: any) {
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return "";
}

function storageParts(sourceUri: string) {
  const [bucket, ...parts] = String(sourceUri || "").split("/");
  return { bucket, path: parts.join("/") };
}

function cleanKeyword(value: unknown) {
  return String(value || "")
    .replace(/[<>\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function dedupe(values: unknown[]) {
  return [...new Set(values.map(cleanKeyword).filter(Boolean))];
}

function normaliseCurrency(value: unknown) {
  const text = String(value || "").trim().toUpperCase();
  const aliases: Record<string, string> = {
    EURO: "EUR",
    EUROS: "EUR",
    DOLLAR: "USD",
    DOLLARS: "USD",
    "NEW ZEALAND DOLLAR": "NZD",
    "NEW ZEALAND DOLLARS": "NZD",
    "AUSTRALIAN DOLLAR": "AUD",
    "AUSTRALIAN DOLLARS": "AUD",
    POUND: "GBP",
    POUNDS: "GBP",
    KRONA: "SEK",
    ZLOTY: "PLN",
  };
  const candidate = aliases[text] || text;
  return /^[A-Z]{3}$/.test(candidate) ? candidate : null;
}

function explicitCurrenciesFromText(value: unknown) {
  const text = String(value || "");
  const found = new Set<string>();
  const upper = text.toUpperCase();
  for (const match of upper.matchAll(/(?:^|[^A-Z])(EUR|GBP|USD|NZD|AUD|SEK|PLN)(?=[^A-Z]|$)/g)) {
    if (match[1]) found.add(match[1]);
  }
  const phraseRules: Array<[RegExp, string]> = [
    [/\bnew zealand dollars?\b/i, "NZD"],
    [/\baustralian dollars?\b/i, "AUD"],
    [/\bus dollars?\b|\bamerican dollars?\b/i, "USD"],
    [/\beuros?\b/i, "EUR"],
    [/\bbritish pounds?\b|\bpounds sterling\b|\bsterling\b/i, "GBP"],
    [/\bswedish krona\b|\bswedish kronor\b/i, "SEK"],
    [/\bpolish zloty\b|\bzloty\b/i, "PLN"],
    [/NZ\$/i, "NZD"],
    [/A\$/i, "AUD"],
    [/US\$/i, "USD"],
    [/€/i, "EUR"],
    [/£/i, "GBP"],
  ];
  for (const [pattern, currency] of phraseRules) {
    if (pattern.test(text)) found.add(currency);
  }
  return [...found];
}

function groundedCurrency(transcript: string, action: any) {
  const rawCurrencies = explicitCurrenciesFromText(
    `${action.salary_budget_raw || ""} ${action.transfer_budget_raw || ""}`,
  );
  if (rawCurrencies.length === 1) return rawCurrencies[0];
  if (rawCurrencies.length > 1) return null;

  const transcriptCurrencies = explicitCurrenciesFromText(transcript);
  return transcriptCurrencies.length === 1 ? transcriptCurrencies[0] : null;
}

function financialMagnitudeIsAmbiguous(rawValue: unknown) {
  const raw = String(rawValue || "").trim();
  if (!raw) return false;
  if (/\b(?:thousand|grand|million|mn)\b|\d\s*[km]\b/i.test(raw)) return false;
  const numeric = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) && numeric >= 0 && numeric < 10_000;
}

function hasConcreteTemporalSignal(value: unknown) {
  const text = String(value || "");
  return /\b(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text)
    || /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text)
    || /\bin\s+\d+\s+(?:minutes?|hours?|days?|weeks?)\b/i.test(text)
    || /\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/.test(text)
    || /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(text);
}

function commonCurrencies(country?: string | null) {
  const map: Record<string, string> = {
    "new zealand": "NZD",
    australia: "AUD",
    england: "GBP",
    "united kingdom": "GBP",
    scotland: "GBP",
    wales: "GBP",
    italy: "EUR",
    germany: "EUR",
    france: "EUR",
    spain: "EUR",
    portugal: "EUR",
    netherlands: "EUR",
    ireland: "EUR",
    sweden: "SEK",
    poland: "PLN",
    usa: "USD",
    "united states": "USD",
  };
  const likely = map[String(country || "").trim().toLowerCase()];
  return dedupe([likely, "EUR", "GBP", "USD", "NZD", "AUD", "SEK", "PLN"])
    .slice(0, 7)
    .map((value) => ({ kind: "scalar", field: "currency", value, label: value }));
}

function normaliseEvidence(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceIsGrounded(transcript: string, evidence: unknown) {
  const source = normaliseEvidence(transcript);
  const excerpt = normaliseEvidence(evidence);
  return Boolean(excerpt && source.includes(excerpt));
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function resolutions(capture: any) {
  const list = capture?.context_json?.resolutions;
  return Array.isArray(list) ? list : [];
}

function resolutionFor(capture: any, fieldKey: string) {
  const matches = resolutions(capture).filter((item: any) => item?.field_key === fieldKey);
  return matches.length ? matches[matches.length - 1]?.value || null : null;
}

async function transcribe(
  openAiKey: string,
  admin: any,
  capture: any,
  vocabulary: any,
) {
  if (capture.capture_type !== "audio") {
    const typed = String(capture.raw_text || "").trim();
    if (!typed) throw new Error("Typed Tell DJM capture has no text");
    return typed;
  }

  if (capture.transcript_text) return String(capture.transcript_text).trim();

  const { bucket, path } = storageParts(capture.source_uri);
  if (!bucket || !path) throw new Error("Audio storage path is missing");

  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) throw error || new Error("Could not load voice note");

  const mime = data.type || "audio/webm";
  const extension = mime.includes("mp4") || mime.includes("m4a") ? "m4a" : "webm";
  const file = new File([await data.arrayBuffer()], `tell-djm.${extension}`, {
    type: mime,
  });

  const contextNames = [
    capture.context_json?.label,
    ...(vocabulary?.players || []),
    ...(vocabulary?.prospects || []),
    ...(vocabulary?.clubs || []),
    ...(vocabulary?.contacts || []),
  ];
  const keywords = dedupe([
    ...contextNames,
    "Transfermarkt",
    "A-League",
    "centre-back",
    "center-back",
    "left-footed",
    "right-footed",
    "number six",
    "number eight",
    "number ten",
    "striker",
    "winger",
  ]).slice(0, 90);

  const form = new FormData();
  form.append("file", file);
  form.append("model", "gpt-transcribe");
  form.append("response_format", "json");
  form.append(
    "prompt",
    "Internal football agency debrief. Preserve names, clubs, currencies, amounts, dates and football terms exactly.",
  );
  for (const keyword of keywords) form.append("keywords[]", keyword);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey}` },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new HttpModelError(
      `Transcription failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      response.status,
    );
  }

  const payload = await response.json();
  const text = String(payload?.text || "").trim();
  if (!text) throw new Error("Transcription returned no text");
  return text;
}

async function interpret(
  openAiKey: string,
  model: string,
  capture: any,
  transcript: string,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 4000,
      instructions: [
        "You convert an internal football-agency debrief into safe DJM actions.",
        "Extract only information the speaker stated explicitly or clearly and directly implied.",
        "Unknown means null. Never invent missing values.",
        "Never guess a club, contact, player, currency, unit, salary, transfer fee, contract fact, registration fact or date.",
        "Use current_context to resolve pronouns or omitted entities when the context is clear, but an explicitly named club, contact, player or prospect always overrides page context.",
        "Do not produce player scores, rankings, future projections or comparisons.",
        "The action key must be short and unique inside this capture, for example need_1 or task_1.",
        "Use canonical football positions only: GK, RB, LB, CB, RCB, LCB, 6, 8, 10, RW, LW, Winger, ST.",
        "Use upsert_club_need only when a club requirement is confirmed or explicitly described as a predicted scouting need.",
        "Use add_claim for softer intelligence, reported contract information, player preferences, scout observations and anything that should remain sourced and unverified.",
        "Use create_task only when the speaker states a follow-up, commitment or reminder.",
        "Resolve explicit relative dates from the supplied capture time and timezone. If the time/date is genuinely unclear, leave due_at null.",
        "For salary and transfer budgets, copy the exact spoken amount phrase into salary_budget_raw or transfer_budget_raw whenever a budget is mentioned.",
        "If a money amount is ambiguous in magnitude or currency, leave the ambiguous numeric field null rather than converting or assuming, but preserve the exact phrase in the matching raw field.",
        "For 250k, 250 grand, 250 thousand or equivalent, output 250000. For bare 250 with no magnitude, never assume 250 means 250000.",
        "When a salary amount is explicit but its period is not, keep salary_period null.",
        "Use preferred_foot values left, right or either only when stated.",
        "For a direct club request, use need_type confirmed. Use predicted only when the speaker explicitly describes an inferred future need.",
        "Use suggest_player when the speaker says a named DJM player is worth sending or considering for a club need. Repeat the need club and position on the suggest_player action when they are clear from the same transcript.",
        "Use exclude_player when the speaker explicitly says a named player is not suitable for that need. Repeat the need club and position on the exclude_player action when they are clear from the same transcript.",
        "Use log_scout_observation when a scout or team member describes watching, assessing or monitoring an unsigned or recruitment player. Use player_current_club for the player current club, not club_name.",
        "For log_scout_observation, use player_current_country for the player current country. Never invent numeric scout scores. Capture only explicit recommendation, strengths, risks, role/position and notes.",
        "Evidence must be a short verbatim excerpt copied from the transcript, not a paraphrase. Keep it under 25 words.",
      ].join("\n"),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({
                capture_created_at: capture.created_at,
                timezone: capture.timezone || "Europe/Rome",
                current_context: capture.context_json || {},
                transcript,
              }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "djm_tell_plan",
          strict: true,
          schema: planSchema,
        },
      },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new HttpModelError(
      `Interpretation failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`,
      response.status,
    );
  }

  const payload = await response.json();
  const text = outputText(payload);
  if (!text) throw new Error("Interpreter returned no structured output");

  let plan: any;
  try {
    plan = JSON.parse(text);
  } catch {
    throw new Error("Interpreter output could not be parsed as JSON");
  }

  if (!plan || !Array.isArray(plan.actions) || typeof plan.summary !== "string") {
    throw new Error("Interpreter returned an invalid Tell DJM plan");
  }

  return { plan, usage: payload?.usage || {} };
}

function entityFieldKey(
  type: "club" | "contact" | "player" | "prospect",
  name: string,
  organisationName?: string | null,
) {
  const slug = (value: string) =>
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70);
  return `entity:${type}:${slug(name)}${
    type === "contact" && organisationName ? `:${slug(organisationName)}` : ""
  }`;
}

function normaliseEntityName(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function contextEntity(capture: any, type: "club" | "contact" | "player" | "prospect") {
  const context = capture?.context_json || {};
  if (type === "club") {
    return { id: context.organisation_id || null, name: context.organisation_name || null };
  }
  if (type === "contact") {
    return { id: context.person_id || null, name: context.person_name || null };
  }
  if (type === "player") {
    return { id: context.player_id || null, name: context.player_name || null };
  }
  return { id: context.prospect_id || null, name: context.prospect_name || null };
}

function explicitNameMatchesContext(explicitName: string | null, contextName: string | null) {
  if (!explicitName) return true;
  if (!contextName) return false;
  const explicit = normaliseEntityName(explicitName);
  const context = normaliseEntityName(contextName);
  if (!explicit || !context) return false;
  if (explicit === context) return true;
  const shorter = explicit.length <= context.length ? explicit : context;
  const longer = explicit.length <= context.length ? context : explicit;
  return shorter.length >= 5 && (longer.startsWith(`${shorter} `) || longer.endsWith(` ${shorter}`));
}

async function resolveEntity(
  admin: any,
  capture: any,
  type: "club" | "contact" | "player" | "prospect",
  name: string | null,
  organisationName?: string | null,
) {
  const contextMatch = contextEntity(capture, type);
  const fieldKey = entityFieldKey(type, name || contextMatch.name || type, organisationName);
  const selected = resolutionFor(capture, fieldKey);
  if (selected?.kind === "leave_unlinked") {
    return {
      id: null,
      label: null,
      candidates: [selected],
      fieldKey,
      resolvedBy: "user",
      omitted: true,
      review: false,
    };
  }
  if (selected?.kind === "review") {
    return {
      id: null,
      label: name,
      candidates: [selected],
      fieldKey,
      resolvedBy: "user",
      omitted: false,
      review: true,
    };
  }
  if (selected?.entity_id && selected?.entity_type === type) {
    return {
      id: String(selected.entity_id),
      label: selected.label || name,
      candidates: [selected],
      fieldKey,
      resolvedBy: "user",
      omitted: false,
      review: false,
    };
  }

  if (contextMatch.id && explicitNameMatchesContext(name, contextMatch.name)) {
    return {
      id: String(contextMatch.id),
      label: contextMatch.name || name,
      candidates: [],
      fieldKey,
      resolvedBy: "context",
      omitted: false,
      review: false,
    };
  }

  if (!name) {
    return {
      id: null,
      label: null,
      candidates: [],
      fieldKey,
      resolvedBy: null,
      omitted: false,
      review: false,
    };
  }

  const { data, error } = await admin.rpc("djm_tell_resolve_entity", {
    p_user_id: capture.submitted_by,
    p_entity_type: type,
    p_name: name,
    p_organisation_name: organisationName || null,
  });
  if (error) throw error;

  return {
    id: data?.resolved_id || null,
    label: data?.resolved_label || null,
    candidates: Array.isArray(data?.candidates) ? data.candidates : [],
    fieldKey,
    resolvedBy: data?.matched_by || null,
    omitted: false,
    review: false,
  };
}

async function recordQuestion(
  admin: any,
  captureId: string,
  fieldKey: string,
  prompt: string,
  reason: string,
  candidates: any[],
  context: any = {},
) {
  const safeCandidates = candidates.length
    ? candidates
    : [{ kind: "review", value: "review", label: "Keep for review" }];
  const { data, error } = await admin.rpc("djm_tell_record_question", {
    p_capture_id: captureId,
    p_field_key: fieldKey,
    p_prompt: prompt,
    p_reason: reason,
    p_candidates: safeCandidates,
    p_context_json: context,
  });
  if (error) throw error;
  return data;
}

function entityQuestionPrompt(type: string, name: string) {
  if (type === "club") return `Which club did you mean by "${name}"?`;
  if (type === "player") return `Which player did you mean by "${name}"?`;
  if (type === "prospect") return `Which recruitment player did you mean by "${name}"?`;
  return `Which ${name} did you mean?`;
}

function reviewCandidate() {
  return { kind: "review", value: "review", label: "Keep for review" };
}

function unknownClubCandidates(capture: any, name: string, country?: string | null) {
  const candidates: any[] = [];
  if (capture?.permission_scope === "full") {
    candidates.push({
      kind: "create_club",
      entity_type: "club",
      name,
      country: country || null,
      label: `Add ${name} as a new club`,
    });
  }
  candidates.push(reviewCandidate());
  return candidates;
}

function unknownContactCandidates(name: string, club: any, roleTitle?: string | null) {
  if (!club?.id) return [reviewCandidate()];
  return [
    {
      kind: "create_contact",
      entity_type: "contact",
      full_name: name,
      organisation_id: club.id,
      organisation_name: club.label || null,
      role_title: roleTitle || null,
      label: `Add ${name}${club.label ? ` to ${club.label}` : ""}`,
    },
    {
      kind: "leave_unlinked",
      value: "leave_unlinked",
      label: "Leave contact unlinked",
    },
  ];
}

function applyFinancialResolution(
  capture: any,
  action: any,
  actionKey: string,
  field: "salary_budget" | "transfer_budget",
) {
  const key = `field:${actionKey}:${field}`;
  const answer = resolutionFor(capture, key);
  if (answer?.kind === "scalar" && answer?.field === field) {
    const value = Number(answer.value);
    action[field] = Number.isFinite(value) && value >= 0 ? value : null;
    return { key, resolved: true, omitted: false };
  }
  if (answer?.kind === "omit_field" && answer?.field === field) {
    action[field] = null;
    return { key, resolved: true, omitted: true };
  }
  return { key, resolved: false, omitted: false };
}

function financialMagnitudeCandidates(field: "salary_budget" | "transfer_budget", raw: string) {
  const cleaned = String(raw || "").trim();
  const numeric = Number(cleaned.replace(/[^0-9.]/g, ""));
  const candidates: any[] = [];
  if (Number.isFinite(numeric) && numeric >= 0) {
    candidates.push({
      kind: "scalar",
      field,
      value: numeric,
      label: `${numeric.toLocaleString("en-GB")}`,
    });
    if (numeric > 0 && numeric < 10000) {
      candidates.push({
        kind: "scalar",
        field,
        value: numeric * 1000,
        label: `${numeric.toLocaleString("en-GB")}k`,
      });
    }
  }
  candidates.push({
    kind: "omit_field",
    field,
    value: null,
    label: "Leave unknown",
  });
  return candidates;
}

async function forceReviewAction(
  admin: any,
  capture: any,
  action: any,
  actionKey: string,
  index: number,
  reason: string,
) {
  const actionHash = await sha256({
    capture_id: capture.capture_id,
    key: actionKey,
    type: action.type,
  });
  const { data, error } = await admin.rpc("djm_tell_apply_action", {
    p_capture_id: capture.capture_id,
    p_action_hash: actionHash,
    p_action_index: index,
    p_action_type: action.type,
    p_confidence: 0,
    p_evidence: `${action.evidence} Review reason: ${reason}`,
    p_payload: { ...action, _review_reason: reason },
  });
  if (error) throw error;
  return data;
}

async function getPlan(
  admin: any,
  openAiKey: string,
  capture: any,
) {
  const storedPlan = capture?.extracted_json?.tell_djm_plan;
  let transcript = String(capture?.transcript_text || "").trim();

  if (!transcript) {
    const { data: vocabulary, error: vocabularyError } = await admin.rpc(
      "djm_tell_vocabulary",
      { p_limit: 120 },
    );
    if (vocabularyError) throw vocabularyError;

    transcript = await transcribe(openAiKey, admin, capture, vocabulary);
    const transcriptionCost =
      capture.capture_type === "audio"
        ? (Number(capture.duration_seconds || 0) / 60) *
          Number(capture?.settings?.transcription_usd_per_minute || 0.0045)
        : 0;

    const { error: storeTranscriptError } = await admin.rpc(
      "djm_tell_worker_store_transcript",
      {
        p_capture_id: capture.capture_id,
        p_transcript: transcript,
        p_usage: {
          transcription_seconds: capture.duration_seconds || null,
          transcription_cost_usd: Number(transcriptionCost.toFixed(6)),
          estimated_cost_usd: Number(transcriptionCost.toFixed(6)),
        },
      },
    );
    if (storeTranscriptError) throw storeTranscriptError;
  }

  if (storedPlan && Array.isArray(storedPlan.actions) && storedPlan.summary) {
    return {
      transcript,
      plan: storedPlan,
      modelUsage: capture.usage_json || {},
      reusedPlan: true,
    };
  }

  const { plan, usage } = await interpret(
    openAiKey,
    capture?.settings?.interpreter_model || "gpt-5.6-terra",
    capture,
    transcript,
  );

  const inputTokens = Number(usage?.input_tokens || 0);
  const outputTokens = Number(usage?.output_tokens || 0);
  const settings = capture.settings || {};
  const modelCost =
    (inputTokens / 1_000_000) * Number(settings.interpreter_input_usd_per_million || 2) +
    (outputTokens / 1_000_000) * Number(settings.interpreter_output_usd_per_million || 12);
  const existingTranscriptionCost = Number(
    capture?.usage_json?.transcription_cost_usd ||
      ((Number(capture.duration_seconds || 0) / 60) *
        Number(settings.transcription_usd_per_minute || 0.0045)),
  );
  const estimatedCost = existingTranscriptionCost + modelCost;

  const { error: storePlanError } = await admin.rpc("djm_tell_worker_store_plan", {
    p_capture_id: capture.capture_id,
    p_transcript: transcript,
    p_plan: plan,
    p_usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      interpretation_cost_usd: Number(modelCost.toFixed(6)),
      estimated_cost_usd: Number(estimatedCost.toFixed(6)),
    },
  });
  if (storePlanError) throw storePlanError;

  return {
    transcript,
    plan,
    modelUsage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      interpretation_cost_usd: Number(modelCost.toFixed(6)),
      estimated_cost_usd: Number(estimatedCost.toFixed(6)),
    },
    reusedPlan: false,
  };
}

function actionPriority(type: string) {
  if (type === "upsert_club_need") return 0;
  if (type === "suggest_player" || type === "exclude_player") return 2;
  return 1;
}

function enrichNeedDependentAction(action: any, needActions: any[]) {
  if (!['suggest_player', 'exclude_player'].includes(action?.type)) return action;
  const next = { ...action };
  const explicitClub = normaliseEntityName(next.club_name);
  const matching = needActions.filter((need) => {
    if (!explicitClub) return true;
    return normaliseEntityName(need.club_name) === explicitClub;
  });
  const candidates = matching.length ? matching : needActions;
  if (candidates.length === 1) {
    const need = candidates[0];
    if (!next.club_name && need.club_name) next.club_name = need.club_name;
    if (!next.position && need.position) next.position = need.position;
  }
  return next;
}

async function notifyAttention(admin: any, supabaseUrl: string, captureId: string) {
  const { data, error } = await admin.rpc("djm_tell_notify_attention", {
    p_capture_id: captureId,
  });
  if (error) {
    console.warn(JSON.stringify({
      operation: "tell_djm_notify_attention",
      capture_id: captureId,
      error: error.message,
    }));
    return;
  }
  if (!data?.queued) return;

  const { data: secret, error: secretError } = await admin.rpc(
    "get_push_scheduler_secret",
  );
  if (secretError || !secret) return;

  await fetch(`${supabaseUrl}/functions/v1/dispatch-player-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-djm-cron": String(secret),
    },
    body: JSON.stringify({ source: "tell-djm", capture_id: captureId }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

async function processOne(
  admin: any,
  openAiKey: string,
  supabaseUrl: string,
  captureId?: string | null,
) {
  const { data: capture, error: claimError } = await admin.rpc(
    "djm_tell_worker_claim",
    {
      p_capture_id: captureId || null,
      p_worker: `edge:${crypto.randomUUID()}`,
    },
  );
  if (claimError) throw claimError;
  if (!capture?.capture_id) return { processed: false };

  const budget = Number(capture?.settings?.monthly_ai_budget_usd || 5);
  const spent = Number(capture?.estimated_month_spend || 0);
  const minimumReserve = capture?.extracted_json?.tell_djm_plan ? 0 : 0.03;
  if (spent + minimumReserve > budget) {
    await admin.rpc("djm_tell_worker_fail", {
      p_capture_id: capture.capture_id,
      p_error: `Monthly Tell DJM AI budget of $${budget.toFixed(2)} has been reached`,
      p_code: "budget_exhausted",
      p_retryable: false,
    });
    await notifyAttention(admin, supabaseUrl, capture.capture_id);
    return { processed: true, status: "budget_blocked" };
  }

  try {
    const { transcript, plan, modelUsage } = await getPlan(
      admin,
      openAiKey,
      capture,
    );

    const actionKeys = new Set<string>();
    const needActions = plan.actions.filter((item: any) => item?.type === "upsert_club_need");
    const orderedActions = plan.actions
      .map((action: any, originalIndex: number) => ({ action, originalIndex }))
      .sort((left: any, right: any) =>
        actionPriority(left.action?.type) - actionPriority(right.action?.type) ||
        left.originalIndex - right.originalIndex
      );

    for (const item of orderedActions) {
      const index = item.originalIndex;
      const sourceAction = item.action;
      const action = enrichNeedDependentAction({ ...sourceAction }, needActions);
      const actionKey = String(action.key || `action_${index + 1}`).trim();
      if (!actionKey || actionKeys.has(actionKey)) {
        throw new Error("Interpreter returned duplicate or empty action keys");
      }
      actionKeys.add(actionKey);

      if (!evidenceIsGrounded(transcript, action.evidence)) {
        await forceReviewAction(
          admin,
          capture,
          action,
          actionKey,
          index,
          "The AI evidence excerpt could not be found verbatim in the source transcript.",
        );
        continue;
      }

      const isScoutObservation = action.type === "log_scout_observation";
      const club = await resolveEntity(
        admin,
        capture,
        "club",
        isScoutObservation ? null : action.club_name,
      );
      const contact = await resolveEntity(
        admin,
        capture,
        "contact",
        action.contact_name,
        action.club_name || club.label || capture?.context_json?.organisation_name || null,
      );
      const player = await resolveEntity(
        admin,
        capture,
        "player",
        isScoutObservation ? null : action.player_name,
      );
      const prospect = await resolveEntity(
        admin,
        capture,
        "prospect",
        isScoutObservation ? action.player_name : null,
        action.player_current_club,
      );

      let blocked = false;
      let forceReviewReason = "";

      if (!isScoutObservation && action.club_name && !club.id) {
        if (club.review) {
          forceReviewReason = `Club ${action.club_name} was left for review.`;
          blocked = true;
        } else {
          const candidates = club.candidates.length
            ? club.candidates
            : unknownClubCandidates(capture, action.club_name, action.club_country);
          await recordQuestion(
            admin,
            capture.capture_id,
            club.fieldKey,
            entityQuestionPrompt("club", action.club_name),
            club.candidates.length
              ? "DJM found more than one plausible club or could not resolve it confidently."
              : "DJM could not find this club in Network and will not invent a match.",
            candidates,
            { spoken_name: action.club_name, action_key: actionKey },
          );
          blocked = true;
        }
      }

      if (action.contact_name && !contact.id && !contact.omitted) {
        if (!club.id && action.club_name && !club.review) {
          blocked = true;
        } else if (contact.review) {
          forceReviewReason = forceReviewReason || `Contact ${action.contact_name} was left for review.`;
          blocked = true;
        } else {
          const candidates = contact.candidates.length
            ? contact.candidates
            : unknownContactCandidates(action.contact_name, club, action.contact_role);
          await recordQuestion(
            admin,
            capture.capture_id,
            contact.fieldKey,
            entityQuestionPrompt("contact", action.contact_name),
            contact.candidates.length
              ? "DJM will not guess between people."
              : "DJM could not find this contact in Network.",
            candidates,
            { spoken_name: action.contact_name, action_key: actionKey },
          );
          blocked = true;
        }
      }

      if (!isScoutObservation && action.player_name && !player.id) {
        if (player.review) {
          forceReviewReason = forceReviewReason || `Player ${action.player_name} was left for review.`;
          blocked = true;
        } else {
          const candidates = player.candidates.length
            ? player.candidates
            : [reviewCandidate()];
          await recordQuestion(
            admin,
            capture.capture_id,
            player.fieldKey,
            entityQuestionPrompt("player", action.player_name),
            player.candidates.length
              ? "DJM will not attach information to the wrong player."
              : "This person is not confidently matched to a signed DJM player.",
            candidates,
            { spoken_name: action.player_name, action_key: actionKey },
          );
          blocked = true;
        }
      }

      if (isScoutObservation && !action.player_name) {
        forceReviewReason = "Scout observation has no player name.";
        blocked = true;
      } else if (isScoutObservation && prospect.review) {
        forceReviewReason = `Recruitment player ${action.player_name} was left for review.`;
        blocked = true;
      } else if (
        isScoutObservation &&
        !prospect.id &&
        prospect.candidates.length
      ) {
        await recordQuestion(
          admin,
          capture.capture_id,
          prospect.fieldKey,
          entityQuestionPrompt("prospect", action.player_name),
          "DJM found similar Recruitment targets and will not create a duplicate without checking.",
          [...prospect.candidates, reviewCandidate()],
          { spoken_name: action.player_name, action_key: actionKey },
        );
        blocked = true;
      }

      if (action.type === "upsert_club_need") {
        for (const field of ["salary_budget", "transfer_budget"] as const) {
          const rawField = `${field}_raw` as "salary_budget_raw" | "transfer_budget_raw";
          const resolution = applyFinancialResolution(capture, action, actionKey, field);
          const raw = String(action[rawField] || "").trim();
          if (raw && !resolution.resolved && (action[field] == null || financialMagnitudeIsAmbiguous(raw))) {
            await recordQuestion(
              admin,
              capture.capture_id,
              resolution.key,
              `What did “${raw}” mean?`,
              "DJM heard a financial amount but will not guess its magnitude.",
              financialMagnitudeCandidates(field, raw),
              { action_key: actionKey, field, spoken_amount: raw },
            );
            blocked = true;
          }
        }
      }

      const currencyKey = `field:${actionKey}:currency`;
      const currencyAnswer = resolutionFor(capture, currencyKey);
      if (currencyAnswer?.kind === "scalar" && currencyAnswer?.value) {
        action.currency = normaliseCurrency(currencyAnswer.value);
      } else {
        action.currency = groundedCurrency(transcript, action);
      }

      if (
        action.type === "upsert_club_need" &&
        (action.salary_budget != null || action.transfer_budget != null) &&
        !action.currency
      ) {
        const country = club.candidates?.[0]?.country || action.club_country || null;
        await recordQuestion(
          admin,
          capture.capture_id,
          currencyKey,
          "What currency is the budget in?",
          "DJM will not guess a currency for financial information.",
          commonCurrencies(country),
          { action_key: actionKey },
        );
        blocked = true;
      }

      if (blocked) {
        if (forceReviewReason) {
          await forceReviewAction(
            admin,
            capture,
            action,
            actionKey,
            index,
            forceReviewReason,
          );
        }
        continue;
      }

      if (
        action.type === "create_task" &&
        action.due_at &&
        !hasConcreteTemporalSignal(transcript)
      ) {
        action.due_at = null;
      }

      const actionHash = await sha256({
        capture_id: capture.capture_id,
        key: actionKey,
        type: action.type,
      });

      let applied: any = null;
      let applyError: any = null;

      if (isScoutObservation) {
        const result = await admin.rpc("djm_tell_apply_scout_observation", {
          p_capture_id: capture.capture_id,
          p_action_hash: actionHash,
          p_action_index: index,
          p_confidence: action.confidence,
          p_evidence: action.evidence,
          p_payload: {
            ...action,
            prospect_id: prospect.id,
          },
        });
        applied = result.data;
        applyError = result.error;
      } else {
        const resolvedPayload = {
          ...action,
          organisation_id: club.id,
          person_id: contact.omitted ? null : contact.id,
          player_id: player.id,
        };
        const result = await admin.rpc("djm_tell_apply_action", {
          p_capture_id: capture.capture_id,
          p_action_hash: actionHash,
          p_action_index: index,
          p_action_type: action.type,
          p_confidence: action.confidence,
          p_evidence: action.evidence,
          p_payload: resolvedPayload,
        });
        applied = result.data;
        applyError = result.error;
      }

      if (applyError) throw applyError;

      if (applied?.status === "failed") {
        console.warn(JSON.stringify({
          operation: "tell_djm_apply_action",
          capture_id: capture.capture_id,
          action_key: actionKey,
          action_type: action.type,
          error: applied?.error || "Action failed",
        }));
      }
    }

    const usage = {
      ...(capture.usage_json || {}),
      ...(modelUsage || {}),
    };

    const { data: completed, error: completeError } = await admin.rpc(
      "djm_tell_worker_complete",
      {
        p_capture_id: capture.capture_id,
        p_transcript: transcript,
        p_summary: plan.summary || "DJM captured your update",
        p_usage: usage,
      },
    );
    if (completeError) throw completeError;

    if (["needs_input", "needs_review", "partial", "failed", "budget_blocked"].includes(String(completed?.status || ""))) {
      await notifyAttention(admin, supabaseUrl, capture.capture_id);
    }

    return { processed: true, ...completed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tell DJM processing failed";
    const retryable = isRetryable(error);
    const { data: failed } = await admin.rpc("djm_tell_worker_fail", {
      p_capture_id: capture.capture_id,
      p_error: message,
      p_code: retryable ? "processing_transient" : "processing_invalid",
      p_retryable: retryable,
    });
    console.error(JSON.stringify({
      operation: "tell_djm_process",
      capture_id: capture.capture_id,
      status: failed?.status || "failed",
      retryable,
      error: message,
    }));
    if (["failed", "budget_blocked"].includes(String(failed?.status || ""))) {
      await notifyAttention(admin, supabaseUrl, capture.capture_id);
    }
    return { processed: true, status: failed?.status || "failed", error: message };
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ error: "Server configuration is incomplete" }, 500);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = await request.json().catch(() => ({}));
  const mode = String(body?.mode || "process");
  const suppliedCron = request.headers.get("x-djm-cron") || "";
  const authHeader = request.headers.get("Authorization") || "";
  const requestedCaptureId = body?.capture_id ? String(body.capture_id) : null;

  let authorizedByCron = false;
  let authorizedUserId: string | null = null;

  if (suppliedCron) {
    const { data: expectedSecret, error: secretError } = await admin.rpc(
      "get_push_scheduler_secret",
    );
    authorizedByCron = Boolean(
      !secretError && expectedSecret && suppliedCron === expectedSecret,
    );
  }

  if (!authorizedByCron && authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (!authError && authData?.user) {
      authorizedUserId = authData.user.id;
    }
  }

  if (mode === "cleanup") {
    if (!authorizedByCron) return json({ error: "Unauthorized" }, 401);

    const { data: due, error: dueError } = await admin.rpc(
      "djm_tell_audio_cleanup_due",
      { p_limit: 100 },
    );
    if (dueError) return json({ error: dueError.message }, 500);

    let removed = 0;
    let orphanRemoved = 0;
    const failures: any[] = [];
    for (const item of due || []) {
      const { bucket, path } = storageParts(item.source_uri);
      if (!bucket || !path) continue;
      const result = await admin.storage.from(bucket).remove([path]);
      if (!result.error) {
        const { error: markError } = await admin.rpc("djm_tell_mark_audio_deleted", {
          p_capture_id: item.capture_id,
        });
        if (!markError) removed += 1;
        else failures.push({ capture_id: item.capture_id, error: markError.message });
      } else {
        failures.push({ capture_id: item.capture_id, error: result.error.message });
      }
    }

    const { data: orphanDue, error: orphanError } = await admin.rpc(
      "djm_tell_orphan_audio_cleanup_due",
      { p_limit: 100 },
    );
    if (orphanError) {
      failures.push({ type: "orphan_lookup", error: orphanError.message });
    } else {
      for (const item of orphanDue || []) {
        const bucket = String(item.bucket_id || "");
        const path = String(item.name || "");
        if (!bucket || !path) continue;
        const result = await admin.storage.from(bucket).remove([path]);
        if (!result.error) orphanRemoved += 1;
        else failures.push({ type: "orphan_delete", path, error: result.error.message });
      }
    }

    return json({
      ok: true,
      mode: "cleanup",
      removed,
      orphan_removed: orphanRemoved,
      failures,
    });
  }

  if (!authorizedByCron && !authorizedUserId) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (!authorizedByCron) {
    if (!requestedCaptureId) {
      return json({ error: "capture_id is required for user-triggered processing" }, 400);
    }
    const { data: canProcess, error: accessError } = await admin.rpc(
      "djm_tell_user_can_process",
      {
        p_user_id: authorizedUserId,
        p_capture_id: requestedCaptureId,
      },
    );
    if (accessError || !canProcess) return json({ error: "Forbidden" }, 403);
  }

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAiKey) {
    return json({ error: "OPENAI_API_KEY is not configured for Tell DJM" }, 503);
  }

  const batch = authorizedByCron
    ? Math.max(1, Math.min(Number(body?.batch || 1), 3))
    : 1;
  const results = [];

  for (let index = 0; index < batch; index += 1) {
    const result = await processOne(
      admin,
      openAiKey,
      url,
      requestedCaptureId,
    );
    results.push(result);
    if (requestedCaptureId || !result.processed) break;
  }

  return json({ ok: true, mode: "process", results });
});
