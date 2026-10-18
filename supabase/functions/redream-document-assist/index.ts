import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseContext } from "npm:@supabase/server@1.6.0";
import { estimateAiCost, selectAiRoute } from "../_shared/ai-router.ts";
import {
  documentAssistInput,
  documentAssistInstructions,
  documentAssistSchema,
  validateDocumentSuggestions,
} from "../_shared/document-assist.ts";

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

export default {
  fetch: async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    const { data: ctx, error } = await createSupabaseContext(req, {
      auth: "user",
    });
    if (error || !ctx) return json({ error: "Sign in to use ReDream." }, 401);
    const started = performance.now(),
      requestId = crypto.randomUUID();
    let tenantId = "",
      userId = "",
      attempted = false,
      recorded = false,
      estimate = 0,
      inputTokens = 0,
      outputTokens = 0,
      cachedTokens = 0;
    let route: ReturnType<typeof selectAiRoute> | null = null;
    let kind = "";
    const rpc = async (name: string, args: Record<string, unknown>) => {
      const result = await ctx.supabaseAdmin.rpc(name, args);
      if (result.error) throw result.error;
      return result.data;
    };
    const record = async (status: string) => {
      if (!route) return;
      await rpc("platform_server_record_ai_usage", {
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_feature_key: "ai_assistant",
        p_provider: "openai",
        p_model: route.model,
        p_status: status,
        p_input_tokens: inputTokens,
        p_cached_input_tokens: cachedTokens,
        p_output_tokens: outputTokens,
        p_estimated_cost_micros:
          inputTokens || outputTokens
            ? Math.ceil(
                estimateAiCost(route, inputTokens, outputTokens) * 1_000_000,
              )
            : estimate,
        p_actual_cost_micros: null,
        p_latency_ms: Math.round(performance.now() - started),
        p_prompt_version: "document_assist_v1",
        p_source_fingerprint: null,
        p_external_request_id: requestId,
        p_idempotency_key: requestId,
        p_error_code: status === "success" ? null : "document_assist_failed",
        p_metadata: { document_kind: kind, route_tier: route.tier },
      });
      recorded = true;
    };
    try {
      const claims = (ctx.userClaims || {}) as Record<string, unknown>;
      userId = String(claims.id || claims.sub || "");
      if (!userId) return json({ error: "Sign in to use ReDream." }, 401);
      const raw = await req.text();
      if (raw.length > 40000)
        return json({ error: "Use a shorter document brief." }, 413);
      let body: Record<string, unknown>;
      let input: ReturnType<typeof documentAssistInput>;
      try {
        body = JSON.parse(raw);
        input = documentAssistInput(body);
      } catch {
        return json(
          {
            error:
              "Add a valid document and a brief between 10 and 8,000 characters.",
          },
          400,
        );
      }
      const workspaces = await rpc("platform_server_user_workspaces", {
        p_user_id: userId,
      });
      const workspace = Array.isArray(workspaces)
        ? workspaces.find((item) => item.slug === body.workspace_slug)
        : null;
      if (!workspace || !["owner", "admin"].includes(workspace.role))
        return json(
          {
            error:
              "Document assistance is available to this workspace's owners and admins.",
          },
          403,
        );
      tenantId = workspace.tenant_id;
      kind = input.kind;
      const key = Deno.env.get("OPENAI_API_KEY");
      if (!key)
        return json(
          {
            error:
              "ReDream assistance is not configured yet. You can keep editing manually.",
          },
          503,
        );
      const prompt = JSON.stringify(input);
      route = selectAiRoute("data_cleanup", { text: prompt });
      const maxOutputTokens = 2800;
      estimate = Math.ceil(
        estimateAiCost(
          route,
          Math.ceil((prompt.length + documentAssistInstructions.length) / 3),
          maxOutputTokens,
        ) * 1_000_000,
      );
      const authorization = await rpc("platform_server_authorize_usage", {
        p_tenant_id: tenantId,
        p_feature_key: "ai_assistant",
        p_estimated_cost_micros: estimate,
        p_required_credits: 0,
        p_wallet_key: "platform_credits",
      });
      if (authorization?.allowed !== true)
        return json(
          {
            error:
              "AI assistance is unavailable for this workspace right now. You can keep editing manually.",
          },
          402,
        );
      attempted = true;
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: route.model,
          store: false,
          reasoning: { effort: route.reasoning_effort },
          max_output_tokens: maxOutputTokens,
          instructions: documentAssistInstructions,
          input: [
            { role: "user", content: [{ type: "input_text", text: prompt }] },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "redream_document_suggestions",
              strict: true,
              schema: documentAssistSchema,
            },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error("Provider request failed");
      const payload = await response.json();
      inputTokens = Number(payload.usage?.input_tokens || 0);
      outputTokens = Number(payload.usage?.output_tokens || 0);
      cachedTokens = Number(
        payload.usage?.input_tokens_details?.cached_tokens || 0,
      );
      const output = payload.output
        ?.flatMap(
          (item: { content?: { type: string; text?: string }[] }) =>
            item.content || [],
        )
        .find((part: { type: string }) => part.type === "output_text")?.text;
      const suggestions = validateDocumentSuggestions(
        JSON.parse(output || ""),
        input,
      );
      await record("success");
      return json({ suggestions, external_action: false });
    } catch {
      if (attempted && !recorded) {
        try {
          await record("failed");
        } catch {
          console.error("Document assistance usage record failed", requestId);
        }
      }
      return json(
        {
          error:
            "ReDream could not prepare suggestions. Your draft is unchanged. Please try again.",
        },
        502,
      );
    }
  },
};
