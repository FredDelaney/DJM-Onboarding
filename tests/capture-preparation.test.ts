import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import * as preparation from "../supabase/functions/_shared/capture-preparation.ts";
import {
  preparationHref,
  preparationLink,
  preparationPlayer,
  readPreparation,
} from "../lib/capture-preparation.ts";
const capture = "10000000-0000-4000-8000-000000000001";
const player = "20000000-0000-4000-8000-000000000001";
const notes =
  "Prepare a player pitch for Prospect Ravi Singh. He wants a development plan.";
const intent = {
  key: "pitch_1",
  kind: "agency_pitch",
  player_name: "Ravi Singh",
  club_name: null,
  evidence: "Prepare a player pitch for Prospect Ravi Singh.",
};
test("all six grounded preparations preserve source and ignore malformed, negated, invented and duplicate intents", () => {
  for (const kind of Object.keys(preparation.PREPARATION_LABELS)) {
    const values = preparation.capturePreparations(
      [{ ...intent, kind }],
      notes,
    );
    assert.equal(values[0].kind, kind);
    assert.equal(values[0].player_name, "Ravi Singh");
  }
  for (const bad of [
    { ...intent, kind: "__proto__" },
    { ...intent, key: "../other" },
    { ...intent, evidence: "A fabricated request" },
    { ...intent, evidence: "" },
    null,
  ])
    assert.deepEqual(preparation.capturePreparations([bad], notes), []);
  assert.deepEqual(
    preparation.capturePreparations(
      [{ ...intent, evidence: "Don't prepare a pitch" }],
      "Don't prepare a pitch",
    ),
    [],
  );
  assert.deepEqual(preparation.capturePreparations([{...intent, evidence: "I prepared the pitch yesterday"}], "I prepared the pitch yesterday"), []);
  assert.equal(preparation.capturePreparations([{...intent, player_name: "May"}], notes + " Maybe later.")[0].player_name, null);
  assert.equal(
    preparation.capturePreparations([intent, intent], notes).length,
    1,
  );
  assert.equal(
    preparation.capturePreparations(
      [{ ...intent, player_name: "Unmentioned Player" }],
      notes,
    )[0].player_name,
    null,
  );
});
test("handoffs contain only scoped identifiers and refuse wrong captures, old plans and forged routes", () => {
  const link = preparationLink(capture, intent.key)!;
  const href = preparationHref("northstar-football-management", link)!;
  assert.equal(
    new URL(href, "https://example.test").searchParams.get("capture"),
    capture,
  );
  assert.ok(!href.includes("Ravi"));
  assert.ok(
    href.startsWith("/workspace/northstar-football-management/documents?"),
  );
  assert.match(
    preparationHref("northstar-football-management", link, player)!,
    /profile=1/,
  );
  assert.equal(preparationLink("bad", intent.key), null);
  assert.equal(preparationLink(capture, "../bad"), null);
  assert.equal(preparationHref("../agency", link), null);
  assert.equal(preparationHref("agency", link, "bad-player"), null);
  assert.deepEqual(
    readPreparation(
      {
        capture: { id: capture, transcript_text: notes },
        preparations: [intent],
      },
      link,
    ),
    { intent, notes },
  );
  assert.throws(() =>
    readPreparation(
      {
        capture: { id: player, transcript_text: notes },
        preparations: [intent],
      },
      link,
    ),
  );
  assert.throws(() =>
    readPreparation({ capture: { id: capture, transcript_text: notes } }, link),
  );
});
test("a profile handoff suggests only a unique exact player name, never a fuzzy prospect or ambiguous roster match", () => {
  const players = [
    { id: player, name: "Ravi Singh" },
    { id: "other", name: "Ravi Kumar" },
  ];
  assert.equal(preparationPlayer(players, "  RAVI SINGH "), player);
  assert.equal(preparationPlayer(players, "Ravi"), "");
  assert.equal(preparationPlayer(players, null), "");
  assert.equal(
    preparationPlayer(
      [...players, { id: "duplicate", name: "Ravi Singh" }],
      "Ravi Singh",
    ),
    "",
  );
});
test("the existing one-call interpreter returns source-grounded preparation metadata without document/task mutations or an extra model call", async () => {
  const source = ts.transpileModule(
    readFileSync("supabase/functions/_shared/ai-process.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const exports: any = {};
  let calls = 0;
  vm.runInNewContext(source + "\nexports.interpret=interpret;", {
    exports,
    require: (name: string) =>
      name.includes("capture-preparation") ? preparation : {},
    AbortSignal,
    Response,
    fetch: async (_url: string, options: any) => {
      calls++;
      const body = JSON.parse(options.body);
      assert.equal(body.store, false);
      assert.ok(body.text.format.schema.required.includes("preparations"));
      assert.match(
        body.instructions,
        /Do not turn preparation itself into create_task/,
      );
      return Response.json({
        output: [
          {
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  summary: "Review your preparation",
                  actions: [],
                  preparations: [intent],
                }),
              },
            ],
          },
        ],
      });
    },
  });
  const result = await exports.interpret(
    "fixture",
    "fixture-model",
    "none",
    { context_json: {} },
    notes,
  );
  assert.equal(calls, 1);
  assert.equal(result.plan.actions.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result.plan.preparations)), [
    intent,
  ]);
  for (const capture_origin of ["email", "whatsapp", "instagram"]) {
    const external = await exports.interpret(
      "fixture",
      "fixture-model",
      "none",
      { context_json: { capture_origin } },
      notes,
    );
    assert.equal(external.plan.preparations.length, 0);
  }
});
test("receipt exposes metadata with its unchanged invoker security and tenant/Tell permissions, without writing any records", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema private;create schema auth;create schema djm_os;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
      create function private.tell_request_tenant() returns uuid language plpgsql stable as $$begin if auth.uid() is null then raise exception 'Workspace access denied';end if;return current_setting('test.tenant')::uuid;end$$;
      create table djm_os.tell_djm_permissions(tenant_id uuid,user_id uuid,is_enabled boolean,permission_scope text);
      create table djm_os.captures(id uuid,tenant_id uuid,submitted_by uuid,processing_version text,status text,summary text,transcript_text text,created_at timestamptz,completed_at timestamptz,error_message text,extracted_json jsonb);
      create table djm_os.tell_djm_actions(id uuid,capture_id uuid,action_type text,status text,confidence numeric,evidence text,proposed_payload jsonb,resolved_payload jsonb,target_type text,target_id uuid,verification_json jsonb,undo_supported boolean,error_message text,action_index integer,created_at timestamptz);
      create table djm_os.tell_djm_questions(id uuid,capture_id uuid,field_key text,prompt text,reason text,candidates jsonb,status text,created_at timestamptz);
      create function private.tell_assert_capture(p_capture_id uuid,p_write boolean default false) returns void language plpgsql stable set search_path='' as $$declare v_tenant uuid:=private.tell_request_tenant();begin
        if not exists(select 1 from djm_os.captures c join djm_os.tell_djm_permissions p on p.tenant_id=c.tenant_id and p.user_id=auth.uid() where c.id=p_capture_id and c.tenant_id=v_tenant and c.processing_version='tell_djm_v1' and p.is_enabled and (not p_write or p.permission_scope in ('full','scout')) and (c.submitted_by=auth.uid() or p.permission_scope='full')) then raise exception 'Capture access denied';end if;end$$;`);
    await db.exec(
      readFileSync(
        "supabase/migrations/20261020214341_tell_document_preparation_handoff.sql",
        "utf8",
      ),
    );
    const tenant = "30000000-0000-4000-8000-000000000001",
      other = "40000000-0000-4000-8000-000000000001";
    await db.query(
      "insert into djm_os.captures(id,tenant_id,submitted_by,processing_version,status,transcript_text,extracted_json) values($1,$2,$3,'tell_djm_v1','done',$4,$5)",
      [
        capture,
        tenant,
        player,
        notes,
        JSON.stringify({ tell_djm_plan: { preparations: [intent] } }),
      ],
    );
    await db.query(
      "insert into djm_os.tell_djm_permissions values($1,$2,true,'scout')",
      [tenant, player],
    );
    const scope = async (user: string, t: string) =>
      db.query(
        "select set_config('test.user',$1,false),set_config('test.tenant',$2,false)",
        [user, t],
      );
    await scope(player, tenant);
    const read = async () =>
      (
        await db.query<any>("select public.redream_ai_receipt($1) as receipt", [
          capture,
        ])
      ).rows[0].receipt;
    assert.deepEqual((await read()).preparations, [intent]);
    assert.equal((await read()).capture.transcript_text, notes);
    assert.equal(
      (
        await db.query<any>(
          "select prosecdef from pg_proc where proname='redream_ai_receipt'",
        )
      ).rows[0].prosecdef,
      false,
    );
    await scope(player, other);
    await assert.rejects(read, /Capture access denied/);
    await scope(other, tenant);
    await assert.rejects(read, /Capture access denied/);
    await scope("", tenant);
    await assert.rejects(read, /Workspace access denied/);
    await scope(player, tenant);
    await db.query("update djm_os.tell_djm_permissions set is_enabled=false");
    await assert.rejects(read, /Capture access denied/);
    assert.equal(
      (
        await db.query<any>(
          "select count(*)::int as n from djm_os.tell_djm_actions",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
