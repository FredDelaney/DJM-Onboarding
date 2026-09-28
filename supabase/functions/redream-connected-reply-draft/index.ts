// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseContext } from "npm:@supabase/server@1.6.0";

import {
  estimateAiCost,
  selectAiRoute,
} from "../_shared/ai-router.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

const clean = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const outputText = (payload: any) => {
  if (typeof payload?.output_text === "string") {
    return payload.output_text.trim();
  }

  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (typeof part?.text === "string") return part.text.trim();
    }
  }

  return "";
};

const asObject = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};

const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["draft_text", "tone", "safety_notes"],
  properties: {
    draft_text: {
      type: "string",
      minLength: 1,
      maxLength: 4000,
    },
    tone: {
      type: "string",
      enum: ["concise", "warm", "direct"],
    },
    safety_notes: {
      type: "array",
      maxItems: 6,
      items: {
        type: "string",
        maxLength: 220,
      },
    },
  },
};

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: cors });
    }

    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const { data: ctx, error: contextError } =
      await createSupabaseContext(req, { auth: "user" });

    if (contextError || !ctx) {
      return json(
        { error: contextError?.message || "Unauthorized" },
        contextError?.status || 401,
      );
    }

    const openAiKey = Deno.env.get("OPENAI_API_KEY") || "";

    const started = performance.now();
    let tenantId = "";
    let userId = "";
    let interactionId = "";
    const externalRequestId = crypto.randomUUID();
    let aiRoute: any = null;
    let estimatedCostMicros = 0;
    let modelAttempted = false;

    const rpc = async (
      name: string,
      args: Record<string, unknown> = {},
    ) => {
      const { data, error } = await ctx.supabaseAdmin.rpc(name, args);
      if (error) throw error;
      return data;
    };

    try {
      const claims = (ctx.userClaims || {}) as Record<string, unknown>;
      userId = String(claims.id || claims.sub || "");
      if (!userId) {
        return json({ error: "Authenticated user identity missing" }, 401);
      }

      const body = await req.json().catch(() => ({}));
      const action = clean(body?.action).toLowerCase() || "generate";
      tenantId = clean(body?.tenant_id);
      interactionId = clean(body?.interaction_id);

      if (!uuid.test(tenantId) || !uuid.test(interactionId)) {
        return json(
          { error: "Valid tenant_id and interaction_id are required." },
          400,
        );
      }

      const workspaces =
        (await rpc("platform_server_user_workspaces", {
          p_user_id: userId,
        })) || [];

      const workspace = Array.isArray(workspaces)
        ? workspaces.find(
            (item: any) => String(item?.tenant_id || "") === tenantId,
          )
        : null;

      if (
        !workspace ||
        !["owner", "admin", "agent", "operations", "scout"].includes(
          String(workspace?.role || ""),
        )
      ) {
        return json({ error: "Agency staff access required" }, 403);
      }

      const context = asObject(
        await rpc("platform_server_connected_reply_context", {
          p_tenant_id: tenantId,
          p_user_id: userId,
          p_interaction_id: interactionId,
        }),
      );

      const interaction = asObject(context.interaction);
      const person = asObject(context.person);
      const recent = Array.isArray(context.recent_context)
        ? context.recent_context.slice(0, 4)
        : [];

      const contextPayload = {
        person_name: person.name || null,
        current_organisation_name:
          person.current_organisation_name || null,
        current_role: person.current_role || null,
        channel: interaction.channel || null,
        direction: interaction.direction || null,
        occurred_at: interaction.occurred_at || null,
        source_summary: interaction.summary || null,
      };

      if (action === "get") {
        return json({
          ok: true,
          draft: context.existing_draft || null,
          context: contextPayload,
          truth_contract: context.truth_contract || {},
          external_action: false,
        });
      }

      if (action === "save") {
        const draftText = clean(body?.draft_text);

        if (!draftText || draftText.length > 4000) {
          return json(
            { error: "Draft text is required and must be under 4000 characters." },
            400,
          );
        }

        const existingDraft = asObject(context.existing_draft);
        const stored = await rpc("platform_server_connected_reply_store", {
          p_tenant_id: tenantId,
          p_user_id: userId,
          p_interaction_id: interactionId,
          p_draft_text: draftText,
          p_model: "human_edit",
          p_prompt_version: "connected_reply_v1_edit",
          p_evidence: {
            source: "human_edit",
            prior_draft_id: existingDraft.draft_id || null,
          },
        });

        return json({
          ok: true,
          draft: stored,
          context: contextPayload,
          external_action: false,
        });
      }

      if (action !== "generate") {
        return json({ error: "Unknown action" }, 400);
      }

      if (!openAiKey) {
        return json({ error: "AI drafting is not configured." }, 503);
      }

      const promptPayload = {
        source_interaction: {
          channel: clean(interaction.channel),
          direction: clean(interaction.direction),
          summary: clean(interaction.summary).slice(0, 1800),
          occurred_at: interaction.occurred_at || null,
        },
        network_person: {
          name: clean(person.name) || null,
          current_organisation:
            clean(person.current_organisation_name) || null,
          current_role: clean(person.current_role) || null,
          source_organisation:
            clean(person.source_organisation_name) || null,
        },
        recent_same_contact_context: recent.map((item: any) => ({
          channel: clean(item?.channel),
          direction: clean(item?.direction),
          summary: clean(item?.summary).slice(0, 1200),
          occurred_at: item?.occurred_at || null,
        })),
      };

      const promptText = JSON.stringify(promptPayload);

      aiRoute = selectAiRoute("connected_reply", { text: promptText });

      const estimatedInputTokens =
        Math.max(1, Math.ceil(promptText.length / 4) + 350);
      const estimatedOutputTokens = 320;

      estimatedCostMicros = Math.ceil(
        estimateAiCost(
          aiRoute,
          estimatedInputTokens,
          estimatedOutputTokens,
        ) * 1_000_000,
      );

      const authorization = asObject(
        await rpc("platform_server_authorize_usage", {
          p_tenant_id: tenantId,
          p_feature_key: "ai_assistant",
          p_estimated_cost_micros: estimatedCostMicros,
          p_required_credits: 0,
          p_wallet_key: "platform_credits",
        }),
      );

      if (authorization.allowed !== true) {
        return json(
          {
            error: "AI drafting is not available for this workspace right now.",
            reason: authorization.reason || "not_allowed",
          },
          402,
        );
      }

      modelAttempted = true;

      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + openAiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiRoute.model,
          store: false,
          reasoning: {
            effort: aiRoute.reasoning_effort,
          },
          max_output_tokens: 520,
          instructions: [
            "You draft one concise reply for a professional football agent.",
            "The source interaction is an inbound connected email, Instagram message or WhatsApp message already linked to a known Network person.",
            "Use only the supplied source interaction and supplied recent same-contact context.",
            "Do not invent player availability, prices, salaries, fees, dates, deadlines, travel, medical information, deal terms, promises, approvals or commitments.",
            "If the sender asks for information that is not supported by the supplied evidence, acknowledge the request without inventing the answer.",
            "Do not imply that something has been sent, agreed, approved or completed unless the supplied evidence states that clearly.",
            "Do not introduce a deadline or promise a response time unless it is present in the evidence.",
            "Do not write a legal or contractual commitment.",
            "Keep the reply natural, understated and professional. Avoid hype, sales language, emojis and generic AI phrasing.",
            "Keep it short enough to work naturally in the source channel.",
            "For email, do not add a subject line or signature unless the source evidence explicitly requires one.",
            "For Instagram or WhatsApp, avoid formal email language.",
            "Return only the structured JSON requested by the schema.",
          ].join("\n"),
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: promptText,
                },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "redream_connected_reply_draft",
              strict: true,
              schema: responseSchema,
            },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(
          "Reply drafting failed with HTTP " +
            response.status +
            (detail ? ": " + detail.slice(0, 240) : ""),
        );
      }

      const payload = await response.json();
      const raw = outputText(payload);
      if (!raw) throw new Error("Reply drafting returned no output.");

      let plan: any = null;
      try {
        plan = JSON.parse(raw);
      } catch {
        throw new Error("Reply draft could not be parsed.");
      }

      const draftText = clean(plan?.draft_text);
      if (!draftText || draftText.length > 4000) {
        throw new Error("Reply draft was invalid.");
      }

      const usage = payload?.usage || {};
      const inputTokens = Number(usage?.input_tokens || 0);
      const outputTokens = Number(usage?.output_tokens || 0);
      const actualEstimateMicros = Math.ceil(
        estimateAiCost(aiRoute, inputTokens, outputTokens) * 1_000_000,
      );

      const stored = await rpc("platform_server_connected_reply_store", {
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_interaction_id: interactionId,
        p_draft_text: draftText,
        p_model: aiRoute.model,
        p_prompt_version: "connected_reply_v1",
        p_evidence: {
          source: "connected_interaction_summary",
          recent_context_count: recent.length,
          route_tier: aiRoute.tier,
          tone: clean(plan?.tone) || null,
          safety_notes: Array.isArray(plan?.safety_notes)
            ? plan.safety_notes
                .map((item: any) => clean(item))
                .filter(Boolean)
                .slice(0, 6)
            : [],
        },
      });

      const latencyMs = Math.round(performance.now() - started);

      await rpc("platform_server_record_ai_usage", {
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_feature_key: "ai_assistant",
        p_provider: "openai",
        p_model: aiRoute.model,
        p_status: "success",
        p_input_tokens: inputTokens,
        p_cached_input_tokens: Number(
          usage?.input_tokens_details?.cached_tokens || 0,
        ),
        p_output_tokens: outputTokens,
        p_estimated_cost_micros: actualEstimateMicros,
        p_actual_cost_micros: null,
        p_latency_ms: latencyMs,
        p_prompt_version: "connected_reply_v1",
        p_source_fingerprint: interactionId,
        p_external_request_id: externalRequestId,
        p_idempotency_key: externalRequestId,
        p_error_code: null,
        p_metadata: {
          route_tier: aiRoute.tier,
          interaction_id: interactionId,
          channel: interaction.channel || null,
        },
      });

      return json({
        ok: true,
        draft: stored,
        context: contextPayload,
        safety_notes: Array.isArray(plan?.safety_notes)
          ? plan.safety_notes.slice(0, 6)
          : [],
        external_action: false,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      if (tenantId && userId && aiRoute && modelAttempted) {
        try {
          await rpc("platform_server_record_ai_usage", {
            p_tenant_id: tenantId,
            p_user_id: userId,
            p_feature_key: "ai_assistant",
            p_provider: "openai",
            p_model: aiRoute.model,
            p_status: "failed",
            p_input_tokens: 0,
            p_cached_input_tokens: 0,
            p_output_tokens: 0,
            p_estimated_cost_micros: estimatedCostMicros,
            p_actual_cost_micros: null,
            p_latency_ms: Math.round(performance.now() - started),
            p_prompt_version: "connected_reply_v1",
            p_source_fingerprint: interactionId || null,
            p_external_request_id: externalRequestId,
            p_idempotency_key: externalRequestId,
            p_error_code: "reply_draft_failed",
            p_metadata: {
              interaction_id: interactionId || null,
            },
          });
        } catch (usageError) {
          console.error(
            "connected reply usage record failed",
            usageError,
          );
        }
      }

      console.error("redream-connected-reply-draft", error);

      const denied =
        /workspace_access_denied|connected_interaction_not_available|reply_draft_requires_inbound_interaction/i.test(
          message,
        );

      return json(
        {
          error: denied
            ? "This connected conversation is not available for reply drafting."
            : message,
        },
        denied ? 403 : 500,
      );
    }
  },
};
