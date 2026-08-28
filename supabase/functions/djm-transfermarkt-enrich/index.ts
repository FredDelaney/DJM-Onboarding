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

const decode = (v: string) =>
  v
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&euro;/gi, "€")
    .replace(/&pound;/gi, "£")
    .replace(/&#36;/g, "$")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));

const toText = (html: string) =>
  decode(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();

const clean = (v: string | null | undefined) =>
  v?.replace(/\s+/g, " ").replace(/^[-–\u2014\s]+|[-–\u2014\s]+$/g, "").trim() || null;

const first = (text: string, patterns: RegExp[]) => {
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return clean(m[1]);
  }
  return null;
};

const tagText = (html: string, tag: string) => {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m?.[1] ? clean(toText(m[1])) : null;
};

const isoDate = (value: string | null) => {
  if (!value || value.trim() === "-") return null;
  const s = value.trim();
  let m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
};

const money = (text: string) => {
  const m =
    text.match(/([€£$])\s*([0-9]+(?:[.,][0-9]+)?)\s*(k|m|bn)?\b[^\n]{0,50}?(?:Last update|last update)/i) ||
    text.match(/(?:Market value|market value)[^€£$]{0,80}([€£$])\s*([0-9]+(?:[.,][0-9]+)?)\s*(k|m|bn)?/i);

  if (!m) return { value: null, currency: null };

  const n = Number(m[2].replace(",", "."));
  const suffix = (m[3] || "").toLowerCase();
  const multiplier = suffix === "bn" ? 1e9 : suffix === "m" ? 1e6 : suffix === "k" ? 1e3 : 1;

  return {
    value: Number.isFinite(n) ? Math.round(n * multiplier) : null,
    currency: m[1] === "€" ? "EUR" : m[1] === "£" ? "GBP" : "USD",
  };
};

const normalizePosition = (v: string | null) => {
  if (!v) return null;
  const bounded = v.split(/\s+(?:Former International:|Caps\/Goals:|National player:|International:|Foot:|Player agent:|Current club:)/i)[0];
  const parts = bounded.split(" - ");
  return clean(parts[parts.length - 1]);
};

const POSITION_NAMES = [
  "Goalkeeper",
  "Centre-Back",
  "Left-Back",
  "Right-Back",
  "Defensive Midfield",
  "Central Midfield",
  "Attacking Midfield",
  "Left Midfield",
  "Right Midfield",
  "Left Winger",
  "Right Winger",
  "Second Striker",
  "Centre-Forward",
];

const secondaryPositions = (text: string, primary: string | null) => {
  const m = text.match(/Other position:\s*(.*?)\s+Facts and data/i);
  if (!m) return [];
  const section = m[1];
  return POSITION_NAMES.filter(
    (p) =>
      section.toLowerCase().includes(p.toLowerCase()) &&
      p.toLowerCase() !== String(primary || "").toLowerCase(),
  );
};

const citizenship = (text: string) => {
  const values = [...text.matchAll(/Citizenship:\s*(.*?)\s+(?:Height:|Position:)/gi)]
    .map((m) => clean(m[1]))
    .filter((v): v is string => Boolean(v));

  if (!values.length) return null;
  values.sort((a, b) => b.length - a.length);
  return values[0];
};

const validUrl = (raw: string) => {
  try {
    const u = new URL(raw);
    return u.hostname.toLowerCase().includes("transfermarkt") && /\/profil\/spieler\/\d+/.test(u.pathname);
  } catch {
    return false;
  }
};

const errorMessage = (e: unknown) => {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message?: unknown }).message || "Transfermarkt enrichment failed");
  }
  return "Transfermarkt enrichment failed";
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    if (!token) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) return json({ error: "Unauthorized" }, 401);

    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: accessError } = await client.rpc("djm_network_dashboard");
    if (accessError) return json({ error: "DJM team access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const prospectId = body?.prospect_id ? String(body.prospect_id) : null;
    let sourceUrl = body?.url ? String(body.url).trim() : "";

    if (!sourceUrl && prospectId) {
      const { data: targetData, error: targetError } = await client.rpc("djm_recruitment_target", {
        p_prospect_id: prospectId,
      });
      if (targetError) throw targetError;
      const target = targetData?.target;
      if (!target) return json({ error: "Recruitment target not found or already signed" }, 404);
      sourceUrl = String(target.transfermarkt_url || "").trim();
    }

    if (!sourceUrl) return json({ error: "Transfermarkt URL is required" }, 400);
    if (!validUrl(sourceUrl)) return json({ error: "Use a valid Transfermarkt player profile URL" }, 400);

    const observedAt = new Date().toISOString();
    const response = await fetch(sourceUrl, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });

    const html = await response.text();
    const text = toText(html);
    const blocked =
      !response.ok ||
      /verify that you.?re not a robot|javascript is disabled|access denied|captcha/i.test(text);

    if (blocked) {
      if (prospectId) {
        const { error: applyError } = await client.rpc(
          "djm_recruitment_apply_transfermarkt_enrichment",
          {
            p_prospect_id: prospectId,
            p_source_url: sourceUrl,
            p_status: "queued",
            p_observed_at: observedAt,
            p_fields: {},
            p_http_status: response.status,
            p_blocked: true,
            p_parser_version: "tm_v7",
          },
        );
        if (applyError) throw applyError;

        const { error: queueError } = await client.rpc(
          "djm_recruitment_request_transfermarkt_refresh",
          { p_prospect_id: prospectId },
        );
        if (queueError) throw queueError;
      }

      return json({
        ok: false,
        blocked: true,
        queued: Boolean(prospectId),
        status: "queued",
        message:
          "Transfermarkt blocked the automated read. DJM kept the URL and queued sourced verification instead.",
      });
    }

    const fullName = tagText(html, "h1");
    const dobRaw = first(text, [
      /Date of birth\/Age:\s*((?:\d{1,2}[/.]\d{1,2}[/.]\d{4})|(?:[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})|(?:\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}))/i,
    ]);
    const nationality = citizenship(text);
    const positionRaw = first(text, [
      /Position:\s*(.*?)\s+(?:Foot:|Player agent:|Current club:|Former International:|Caps\/Goals:|National player:|International:|€|£|\$)/i,
    ]);
    const primary = normalizePosition(positionRaw);
    const secondaries = secondaryPositions(text, primary);
    const foot = first(text, [/Foot:\s*(left|right|both)/i]);
    const club = first(text, [
      /Current club:\s*(.*?)\s+(?:Joined:|Contract expires:|Contract option:|Outfitter:|Social-Media:)/i,
      /Last club:\s*(.*?)\s+(?:Retired since:|Without Club since:|Date of birth\/Age:)/i,
    ]);
    const contractRaw = first(text, [
      /Contract expires:\s*((?:\d{1,2}[/.]\d{1,2}[/.]\d{4})|(?:[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})|(?:\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})|-)/i,
    ]);
    const agentLabel = /Player agent:/i.test(text);
    const agent = first(text, [
      /Player agent:\s*(.*?)\s+(?:Current club:|Former International:|Social-Media:|Facts and data)/i,
    ]);
    const mv = money(text);

    const preview: Record<string, unknown> = {
      full_name: fullName,
      date_of_birth: isoDate(dobRaw),
      nationality,
      current_club: club,
      primary_position: primary,
      secondary_positions: secondaries.length ? secondaries : null,
      preferred_foot: foot
        ? foot[0].toUpperCase() + foot.slice(1).toLowerCase()
        : null,
      contract_expiry: isoDate(contractRaw),
      market_value: mv.value,
      market_value_currency: mv.currency,
      agent_name: agent,
      agent_status: agent ? "represented" : agentLabel ? "not_listed" : null,
    };

    const parsed: Record<string, unknown> = Object.fromEntries(
      Object.entries(preview).filter(
        ([, v]) =>
          v !== null &&
          v !== undefined &&
          v !== "" &&
          (!Array.isArray(v) || v.length),
      ),
    );

    if (agentLabel && !agent) {
      parsed.agent_status = "not_listed";
      parsed.agent_name = null;
    }

    const meaningful = Object.keys(parsed).filter((k) => k !== "full_name").length;
    const status = meaningful >= 5 ? "verified" : meaningful > 0 ? "review" : "failed";

    if (prospectId) {
      const { error: applyError } = await client.rpc(
        "djm_recruitment_apply_transfermarkt_enrichment",
        {
          p_prospect_id: prospectId,
          p_source_url: sourceUrl,
          p_status: status,
          p_observed_at: observedAt,
          p_fields: parsed,
          p_http_status: response.status,
          p_blocked: false,
          p_parser_version: "tm_v7",
        },
      );
      if (applyError) throw applyError;
    }

    return json({
      ok: true,
      blocked: false,
      persisted: Boolean(prospectId),
      source_url: sourceUrl,
      observed_at: observedAt,
      status,
      fields: parsed,
    });
  } catch (e) {
    const message = errorMessage(e);
    console.error("djm-transfermarkt-enrich", message, e);
    return json(
      { error: message, code: "TRANSFERMARKT_ENRICHMENT_FAILED" },
      500,
    );
  }
});
