import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import {
  assistFields,
  documentAssistInput,
  documentAssistInstructions,
  documentAssistSchema,
  validateDocumentSuggestions,
} from "../supabase/functions/_shared/document-assist.ts";
import {
  applyDocumentSuggestions,
  prepareDocumentAssist,
} from "../lib/document-assist.ts";
import {
  documentBrand,
  DOCUMENT_KINDS,
  DOCUMENT_TEMPLATES,
  newAgencyDocument,
} from "../lib/agency-documents.ts";
import { documentCoverLead } from "../lib/document-presentation.ts";

const notes =
  "Prospect Ravi Singh plays for Harbour FC. He wants a clear development plan.";
const proposed = {
  fields: [{ key: "player_name", value: "Ravi Singh", quote: "Ravi Singh" }],
  sections: [],
  questions: ["Who is the report for?"],
};
test("all five assistants allow existing document fields while keeping clauses, money destinations and identities manual", () => {
  for (const kind of DOCUMENT_KINDS) {
    const doc = newAgencyDocument(kind, documentBrand());
    doc.content.brand.bankDetails = "PRIVATE BANK DETAILS";
    doc.content.fields.player_id = "roster-id";
    doc.content.fields.payment_url = "https://example.com/payment";
    for (const key of assistFields[kind])
      assert.ok(
        DOCUMENT_TEMPLATES[kind].fields.some((field) => field.key === key),
      );
    const input = prepareDocumentAssist(doc, notes);
    assert.equal("player_id" in input.fields, false);
    assert.equal("payment_url" in input.fields, false);
    assert.ok(!JSON.stringify(input).includes("PRIVATE BANK DETAILS"));
    if (!["agency_pitch", "scouting_report"].includes(kind))
      assert.deepEqual(input.sections, []);
  }
  assert.throws(() => documentAssistInput({ kind: "__proto__", notes }));
  assert.throws(() =>
    documentAssistInput({ kind: "mandate", notes: "x".repeat(8001) }),
  );
});
test("unsupported facts, duplicate fields, invalid dates and changed legal clauses are rejected", () => {
  const input = prepareDocumentAssist(
    newAgencyDocument("player_contract", documentBrand()),
    notes,
  );
  assert.deepEqual(validateDocumentSuggestions(proposed, input), proposed);
  for (const fields of [
    [{ key: "payment_url", value: "https://example.com", quote: "Ravi Singh" }],
    [
      {
        key: "agent_name",
        value: "Invented agent",
        quote: "A made-up reference",
      },
    ],
    [{ key: "player_dob", value: "2026-02-31", quote: "Ravi Singh" }],
    [...proposed.fields, ...proposed.fields],
  ])
    assert.throws(() =>
      validateDocumentSuggestions(
        { fields, sections: [], questions: [] },
        input,
      ),
    );
  assert.throws(() =>
    validateDocumentSuggestions(
      {
        fields: [],
        sections: [{ id: "section-0", body: "New legal obligation" }],
        questions: [],
      },
      input,
    ),
  );
});
test("selected suggestions affect only the exact editable draft and reset review without roster or payment writes", () => {
  const doc = newAgencyDocument("scouting_report", documentBrand());
  doc.content.reviewed = true;
  const fingerprint = JSON.stringify(doc);
  const updated = applyDocumentSuggestions(doc, proposed, fingerprint);
  assert.equal(updated.content.fields.player_name, "Ravi Singh");
  assert.equal(updated.content.reviewed, false);
  assert.equal(doc.content.fields.player_name, undefined);
  assert.equal(
    applyDocumentSuggestions(updated, proposed, fingerprint),
    updated,
  );
  const paid = { ...doc, paid_at: "2026-10-18" };
  assert.equal(
    applyDocumentSuggestions(paid, proposed, JSON.stringify(paid)),
    paid,
  );
  const pitch = newAgencyDocument("agency_pitch", documentBrand());
  pitch.content.fields.purpose = "A clear development plan";
  assert.equal(documentCoverLead(pitch), "A clear development plan");
  pitch.content.fields.purpose = "x".repeat(221);
  assert.equal(documentCoverLead(pitch), "");
});

const source = readFileSync(
  "supabase/functions/redream-document-assist/index.ts",
  "utf8",
).replace(/^import[\s\S]*?;\n/gm, "");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
function setup({
  role = "owner",
  authenticated = true,
  allowed = true,
  output = proposed,
  httpStatus = 200,
  configured = true,
  failUsage = false,
}: any = {}) {
  const calls: { name: string; args: any }[] = [],
    requests: any[] = [];
  const route = {
    model: "configured-workspace-model",
    tier: "fast",
    reasoning_effort: "none",
    input_usd_per_million: 2,
    output_usd_per_million: 10,
  };
  const handler = new Function(
    "exports",
    "createSupabaseContext",
    "Deno",
    "fetch",
    "selectAiRoute",
    "estimateAiCost",
    "documentAssistInput",
    "documentAssistInstructions",
    "documentAssistSchema",
    "validateDocumentSuggestions",
    compiled + "\nreturn exports.default;",
  )(
    {},
    async () =>
      authenticated
        ? {
            data: {
              userClaims: { sub: "actor" },
              supabaseAdmin: {
                rpc: async (name: string, args: any) => {
                  calls.push({ name, args });
                  if (name === "platform_server_user_workspaces")
                    return {
                      data: [
                        { slug: "northstar", tenant_id: "tenant-a", role },
                      ],
                    };
                  if (name === "platform_server_authorize_usage")
                    return { data: { allowed } };
                  if (name === "platform_server_record_ai_usage")
                    return failUsage
                      ? { error: new Error("usage unavailable") }
                      : { data: true };
                  throw new Error("Unexpected RPC: " + name);
                },
              },
            },
          }
        : { error: { status: 401 } },
    { env: { get: () => (configured ? "test-key" : "") } },
    async (url: string, options: any) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      if (httpStatus !== 200)
        return new Response("PRIVATE PROVIDER DETAILS", { status: httpStatus });
      return Response.json({
        usage: { input_tokens: 100, output_tokens: 50 },
        output: [
          { content: [{ type: "output_text", text: JSON.stringify(output) }] },
        ],
      });
    },
    () => route,
    (route: any, input: number, output: number) =>
      (input * 2 + output * 10) / 1_000_000,
    documentAssistInput,
    documentAssistInstructions,
    documentAssistSchema,
    validateDocumentSuggestions,
  );
  return {
    calls,
    requests,
    request: (body: any = {}) =>
      handler.fetch(
        new Request("https://example.test", {
          method: "POST",
          body: JSON.stringify({
            kind: "scouting_report",
            notes,
            workspace_slug: "northstar",
            ...body,
          }),
        }),
      ),
  };
}
test("anonymous users, staff roles and forged workspaces cannot call the model", async () => {
  assert.match(
    readFileSync("supabase/config.toml", "utf8"),
    /\[functions\.redream-document-assist\]\s+verify_jwt = true/,
  );
  for (const configuration of [
    { authenticated: false },
    { role: "agent" },
    { role: "scout" },
    { role: "operations" },
  ]) {
    const app = setup(configuration),
      response = await app.request();
    assert.ok([401, 403].includes(response.status));
    assert.equal(app.requests.length, 0);
  }
  const app = setup();
  assert.equal(
    (
      await app.request({
        workspace_slug: "foreign-agency",
        tenant_id: "tenant-a",
      })
    ).status,
    403,
  );
  assert.equal(app.requests.length, 0);
});
test("workspace quota is checked before model access and unavailable AI preserves manual work", async () => {
  for (const [configuration, status] of [
    [{ allowed: false }, 402],
    [{ configured: false }, 503],
  ] as const) {
    const app = setup(configuration);
    assert.equal((await app.request()).status, status);
    assert.equal(app.requests.length, 0);
  }
});
test("suggestions use the configured router, bounded provider call, strict output and private-free usage telemetry", async () => {
  const app = setup({ role: "admin" });
  const response = await app.request();
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).suggestions, proposed);
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].body.model, "configured-workspace-model");
  assert.equal(app.requests[0].body.store, false);
  assert.equal(app.requests[0].body.text.format.strict, true);
  assert.ok(app.requests[0].options.signal instanceof AbortSignal);
  assert.equal(app.calls[1].name, "platform_server_authorize_usage");
  const telemetry = app.calls.find(
    (call) => call.name === "platform_server_record_ai_usage",
  )!.args;
  assert.equal(telemetry.p_tenant_id, "tenant-a");
  assert.equal(telemetry.p_status, "success");
  assert.equal(telemetry.p_input_tokens, 100);
  assert.ok(!JSON.stringify(telemetry).includes("Ravi Singh"));
  assert.ok(
    app.calls.every(
      (call) => !/save|share|capture|apply|store/.test(call.name),
    ),
  );
});
test("provider failures and invalid suggestions are recoverable and recorded without exposing provider detail", async () => {
  for (const configuration of [
    { httpStatus: 500 },
    {
      output: {
        fields: [{ key: "player_id", value: "foreign", quote: "Ravi Singh" }],
        sections: [],
        questions: [],
      },
    },
  ]) {
    const app = setup(configuration),
      response = await app.request();
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes("PRIVATE PROVIDER DETAILS"));
    assert.equal(app.calls.at(-1)!.args.p_status, "failed");
  }
});
