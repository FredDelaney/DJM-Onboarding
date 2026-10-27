import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  documentBrand,
  DOCUMENT_TEMPLATES,
  resolveDocumentText,
  newAgencyDocument,
  copyAgencyDocument,
  type AgencyDocument,
} from "../lib/agency-documents.ts";
const db = new PGlite();
const tenantA = "10000000-0000-4000-8000-000000000001",
  tenantB = "10000000-0000-4000-8000-000000000002",
  owner = "20000000-0000-4000-8000-000000000001",
  otherOwner = "20000000-0000-4000-8000-000000000002",
  agent = "20000000-0000-4000-8000-000000000003";
let saved: AgencyDocument, token: string;
const actor = async (id: string | null, role = "authenticated") => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id || "",
  ]);
  await db.exec(`set role ${role}`);
};
const call = async (
  action: string,
  doc?: AgencyDocument,
  payload: any = {},
  slug = "agency-a",
) => {
  const result = await db.query<{ result: any }>(
    "select public.redream_documents($1,$2,$3,$4,$5::jsonb) as result",
    [
      slug,
      action,
      doc?.id || null,
      doc?.revision ?? null,
      JSON.stringify(payload),
    ],
  );
  return result.rows[0].result;
};
const save = async (doc: AgencyDocument) =>
  call("save", doc, {
    kind: doc.kind,
    title: doc.title,
    is_template: doc.is_template,
    content: doc.content,
  });
const open = async (slug: string, value: string) => {
  const result = await db.query<{ result: any }>(
    "select public.redream_document_open($1,$2) as result",
    [slug, value],
  );
  return result.rows[0].result;
};
before(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema platform;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table auth.users(id uuid primary key);create table platform.tenants(id uuid primary key,slug text,status text,legal_name text);
 create table platform.tenant_memberships(tenant_id uuid,user_id uuid,role text,status text);
 create table platform.tenant_settings(tenant_id uuid,default_currency text,timezone text);
 create table platform.tenant_branding(tenant_id uuid,display_name text,legal_name text,logo_asset text,primary_color text,accent_color text,support_email text,phone text,website_url text);
 create table public.players(id uuid primary key,tenant_id uuid,first_name text,last_name text,preferred_name text,date_of_birth date,archived_at timestamptz);
 create table public.player_public_profiles(player_id uuid,published boolean,current_club text,primary_position text,career_summary text,key_stats jsonb,transfermarkt_url text,hidden_sections text[]);
 `);
  const helper = readFileSync(
    "supabase/migrations/20260913101801_enforce_core_tenant_isolation.sql",
    "utf8",
  ).match(
    /create or replace function private\.user_is_tenant_admin\([\s\S]*?\$\$;/,
  )![0];
  await db.exec(helper);
  const visibility = readFileSync(
    "supabase/migrations/20261009061051_public_profile_visibility_boundary.sql",
    "utf8",
  ).match(
    /create or replace function private\.visible_public_player_profile\([\s\S]*?\$visibility\$;/,
  )![0];
  await db.exec(visibility);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261018095925_agency_document_studio_v1.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/20261018153045_agency_document_representation_fields.sql",
      "utf8",
    ),
  );
  await db.exec(readFileSync("supabase/migrations/20261026231700_agency_document_exact_read.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20261027060256_invoice_date_review_guard.sql", "utf8"));
  await db.query("insert into auth.users values($1),($2),($3)", [
    owner,
    otherOwner,
    agent,
  ]);
  await db.query(
    "insert into platform.tenants values($1,'agency-a','active','Agency A Ltd'),($2,'agency-b','active','Agency B Ltd')",
    [tenantA, tenantB],
  );
  await db.query(
    "insert into platform.tenant_memberships values($1,$3,'owner','active'),($2,$4,'owner','active'),($1,$5,'agent','active')",
    [tenantA, tenantB, owner, otherOwner, agent],
  );
  await db.query(
    "insert into platform.tenant_branding(tenant_id,display_name) values($1,'Agency A'),($2,'Agency B')",
    [tenantA, tenantB],
  );
});
after(async () => {
  await db.close();
});
const exact = async (id: string, slug = "agency-a") => (await db.query<{ result: any }>(
  "select public.redream_document_read($1,$2) as result", [slug, id],
)).rows[0].result;
test("exact document confirmation is read-only, outside the list limit and owner/admin scoped", async () => {
  await actor(owner);
  const draft = await save(newAgencyDocument("player_contract", documentBrand({ display_name: "Agency A" })));
  await db.exec("reset role");
  await db.query("update public.agency_documents set updated_at='2020-01-01' where id=$1", [draft.id]);
  await db.query("insert into public.agency_documents(tenant_id,kind,title,content) select $1,'player_contract','QA bulk '||n,$2::jsonb from generate_series(1,101) n", [tenantA, JSON.stringify(draft.content)]);
  await actor(owner);
  assert.equal((await call("list")).documents.some((d: any) => d.id === draft.id), false);
  const read = await exact(draft.id);
  assert.equal(read.tenant_id, tenantA); assert.equal(read.state, "found");
  assert.equal(read.document.id, draft.id); assert.deepEqual(read.document.content, draft.content);
  assert.equal(read.document.revision, 1); assert.equal(read.document.created_by, undefined);
  await assert.rejects(save({...draft, revision:0}), /already in use/);
  assert.equal((await exact(draft.id)).document.revision, 1);
  const count = (await db.query<{ count: number }>("select jsonb_array_length(public.redream_documents('agency-a','events',$1,1))::int as count", [draft.id])).rows[0].count;
  await exact(draft.id); assert.equal((await call("events", draft)).length, count);
  await actor(otherOwner); await assert.rejects(exact(draft.id), /owners and admins/);
  assert.deepEqual(await exact(draft.id, "agency-b"), { tenant_id: tenantB, state: "missing", document: null });
  await actor(agent); await assert.rejects(exact(draft.id), /owners and admins/);
  await db.exec("reset role");
  await db.query("update platform.tenant_memberships set role='admin' where tenant_id=$1 and user_id=$2", [tenantA, agent]);
  await actor(agent); assert.equal((await exact(draft.id)).state, "found");
  await db.exec("reset role");
  await db.query("update platform.tenant_memberships set role='agent' where tenant_id=$1 and user_id=$2", [tenantA, agent]);
  await actor(null, "anon"); await assert.rejects(exact(draft.id), /permission denied/);
  await actor(null); await assert.rejects(exact(draft.id), /Sign in/);
  await actor(owner);
  await db.exec("reset role");
  await db.query("update platform.tenants set status='suspended' where id=$1", [tenantA]);
  await actor(owner); await assert.rejects(exact(draft.id), /owners and admins/);
  await db.exec("reset role");
  await db.query("update platform.tenants set status='active' where id=$1", [tenantA]);
  await actor(owner);
  await call("archive", draft);
  assert.deepEqual(await exact(draft.id), { tenant_id: tenantA, state: "archived", document: null });
  await db.exec("reset role");
  await db.query("update platform.tenant_memberships set status='ended' where tenant_id=$1 and user_id=$2", [tenantA, owner]);
  await actor(owner); await assert.rejects(exact(draft.id), /owners and admins/);
  await db.exec("reset role");
  await db.query("update platform.tenant_memberships set status='active' where tenant_id=$1 and user_id=$2", [tenantA, owner]);
  // Remove only this test's rows so existing library assertions retain their baseline.
  await db.query("delete from public.agency_documents where id=$1 or title like 'QA bulk %'", [draft.id]);
  const canary = readFileSync("docs/operations/sql/redream-document-save-confirmation-canary.sql", "utf8")
    .replaceAll("675c4f97-f5b9-4686-912f-938b01b4df18", owner)
    .replaceAll("7ac91076-7836-4dfa-9ed0-4d825ae2c3dd", tenantA)
    .replaceAll("northstar-football-management", "agency-a").replaceAll("djm-sports-management", "agency-b");
  await db.query("insert into platform.tenant_memberships values($1,$2,'owner','active')", [tenantB,owner]);
  try { await db.exec(canary); }
  finally {
    await db.exec("rollback; reset role");
    await db.query("delete from platform.tenant_memberships where tenant_id=$1 and user_id=$2", [tenantB,owner]);
  }
  await actor(owner);
});
test("anonymous, non-admin and foreign-tenant callers cannot read the document library", async () => {
  await actor(null);
  await assert.rejects(call("list"), /Sign in/);
  await actor(agent);
  await assert.rejects(call("list"), /owners and admins/);
  await actor(otherOwner);
  await assert.rejects(call("list"), /owners and admins/);
  await actor(owner);
  const data = await call("list");
  assert.equal(data.tenant_id, tenantA);
  assert.equal(data.brand.display_name, "Agency A");
  assert.deepEqual(data.documents, []);
});
test("draft writes are tenant scoped and use revision checks instead of overwriting another editor", async () => {
  await actor(owner);
  const draft = newAgencyDocument(
    "scouting_report",
    documentBrand({ display_name: "Agency A" }),
  );
  saved = await save(draft);
  assert.equal(saved.revision, 1);
  await actor(otherOwner);
  await assert.rejects(save(saved), /owners and admins/);
  await assert.rejects(
    call(
      "save",
      saved,
      { title: saved.title, content: saved.content },
      "agency-b",
    ),
    /changed/,
  );
  await actor(owner);
  const updated = await save({ ...saved, title: "Updated report" });
  assert.equal(updated.revision, 2);
  await assert.rejects(save(saved), /changed/);
  saved = updated;
  await assert.rejects(
    db.query("select * from public.agency_documents"),
    /permission denied/,
  );
});
test("autofill sources exclude other tenants, unpublished profiles and hidden summaries", async () => {
  await db.exec("reset role");
  const playerA = "30000000-0000-4000-8000-000000000001",
    playerB = "30000000-0000-4000-8000-000000000002",
    unpublished = "30000000-0000-4000-8000-000000000003";
  await db.query(
    "insert into public.players(id,tenant_id,first_name,last_name) values($1,$4,'Visible','Player'),($2,$5,'Foreign','Player'),($3,$4,'Unpublished','Player')",
    [playerA, playerB, unpublished, tenantA, tenantB],
  );
  await db.query(
    "insert into public.player_public_profiles(player_id,published,career_summary,key_stats,hidden_sections) values($1,true,'PRIVATE SUMMARY','[{\"label\":\"Private stat\",\"value\":10}]','{summary,stats}'),($2,false,'UNPUBLISHED SUMMARY','[]','{}')",
    [playerA, unpublished],
  );
  await actor(owner);
  const data = await call("list");
  assert.equal(data.players.length, 2);
  assert.equal(
    data.players.find((p: any) => p.id === unpublished).profile,
    null,
  );
  assert.doesNotMatch(
    JSON.stringify(data.players),
    /PRIVATE SUMMARY|Private stat|Foreign|UNPUBLISHED SUMMARY/,
  );
});
test("only completed reviewed snapshots can be shared, and unused private fields are excluded", async () => {
  await actor(owner);
  await assert.rejects(call("share", saved), /Complete and review/);
  saved.content.fields = {
    player_name: "Player A",
    recipient_name: "Club A",
    report_date: "2026-10-18",
    author: "Scout A",
    private_medical: "DO NOT SHARE",
    player_dob: "1990-01-01",
  };
  saved.content.brand.bankDetails = "PRIVATE BANK";
  saved.content.sections = [
    {
      id: "one",
      title: "Observed role",
      body: "{{player_name}} played as a centre forward.",
    },
  ];
  saved.content.reviewed = true;
  saved = await save(saved);
  const link = await call("share", saved);
  token = link.token;
  assert.match(token, /^[a-f0-9]{64}$/);
  await actor(null, "anon");
  assert.equal(await open("agency-b", token), null);
  assert.equal(await open("agency-a", "bad-token"), null);
  const snapshot = await open("agency-a", token);
  assert.equal(snapshot.title, "Updated report");
  assert.doesNotMatch(
    JSON.stringify(snapshot),
    /DO NOT SHARE|PRIVATE BANK|1990-01-01|created_by/,
  );
  assert.deepEqual(await open("agency-a", token), snapshot);
});
test("public opens are idempotent and published versions do not change with draft edits", async () => {
  await actor(null, "anon");
  const original = await open("agency-a", token);
  assert.ok(original);
  await actor(owner);
  const events = await call("events", saved);
  assert.equal(events.filter((e: any) => e.kind === "opened").length, 1);
  assert.equal(
    events.some((e: any) => e.kind === "paid_manually"),
    false,
  );
  saved = await save({ ...saved, title: "Later private edit" });
  await actor(null, "anon");
  assert.equal((await open("agency-a", token)).title, original.title);
  await actor(owner);
  await call("revoke", saved);
  await actor(null, "anon");
  assert.equal(await open("agency-a", token), null);
});
test("clean pitch template authorship survives private save/reopen but is not recipient content", async () => {
  await actor(owner);
  const template = copyAgencyDocument(newAgencyDocument("agency_pitch", documentBrand({display_name: "QA Agency"})), "template");
  template.content.sections = [{ id: "section-0", title: "A personal conversation", body: "{{player_name}}, we will discuss {{purpose}} before agreeing any support." }];
  template.content.sources = [{ label: "QA agency service schedule", url: "", capturedAt: "2026-10-27" }];
  const stored = await save(template);
  assert.equal(stored.content.pitchTemplateVersion, 1);
  const reopened = (await call("list")).documents.find((doc: AgencyDocument) => doc.id === stored.id);
  assert.equal(reopened.content.pitchTemplateVersion, 1);
  const pitch = copyAgencyDocument(reopened, "from_template");
  pitch.content.fields = { player_name: "QA Pitch Prospect", purpose: "QA regular communication" };
  pitch.content.reviewed = true;
  const record = await save(pitch);
  assert.deepEqual(record.content.sources, template.content.sources);
  const link = await call("share", record);
  await actor(null, "anon");
  const snapshot = await open("agency-a", link.token);
  assert.equal(snapshot.content.pitchTemplateVersion, undefined);
  assert.equal(snapshot.content.sections[0].body, template.content.sections[0].body);
  assert.deepEqual(snapshot.content.sources, template.content.sources);
  await actor(owner);
  await call("archive", record);
  await call("archive", stored);
});
test("tokens expire and become unavailable when an agency is suspended", async () => {
  await actor(owner);
  let link = await call("share", saved);
  await db.exec("reset role");
  await db.exec(
    "update public.agency_document_shares set expires_at=now()-interval '1 day'",
  );
  await actor(null, "anon");
  assert.equal(await open("agency-a", link.token), null);
  await actor(owner);
  link = await call("share", saved);
  await db.exec("reset role");
  await db.query("update platform.tenants set status='suspended' where id=$1", [
    tenantA,
  ]);
  await actor(null, "anon");
  assert.equal(await open("agency-a", link.token), null);
  await db.exec("reset role");
  await db.query("update platform.tenants set status='active' where id=$1", [
    tenantA,
  ]);
});
test("invoice payments are explicit manual records and duplicate numbers are rejected", async () => {
  await actor(owner);
  const invoice = newAgencyDocument(
    "invoice",
    documentBrand({ display_name: "Agency A" }),
  );
  invoice.content.fields.invoice_number = "INV-001";
  let savedInvoice = await save(invoice);
  await assert.rejects(
    save({ ...invoice, id: crypto.randomUUID() }),
    /already in use/,
  );
  await assert.rejects(
    call("paid", savedInvoice, { note: "Bank reference" }),
    /Complete and review/,
  );
  savedInvoice.content.fields = {
    ...savedInvoice.content.fields,
    recipient_name: "Club A",
    recipient_address: "Example address",
    due_date: "2026-11-01",
    reference: "INV-001",
  };
  savedInvoice.content.brand.bankDetails = "Agency bank account";
  savedInvoice.content.lines = [
    {
      id: "fee",
      description: "Agreed agency services",
      quantity: "1.5",
      unitPrice: "100.01",
    },
  ];
  savedInvoice.content.sections = [
    {
      id: "terms",
      title: "Agreed services",
      body: "Services under the reviewed agreement.",
    },
  ];
  savedInvoice.content.reviewed = true;
  savedInvoice = await save(savedInvoice);
  await assert.rejects(call("paid", savedInvoice, {}), /reference or note/);
  await call("paid", savedInvoice, {
    note: "Received 18 October, bank reference 123",
  });
  await assert.rejects(
    call("paid", savedInvoice, { note: "Repeat" }),
    /already been recorded/,
  );
  const events = await call("events", savedInvoice);
  assert.equal(events.filter((e: any) => e.kind === "paid_manually").length, 1);
  assert.equal(
    events.find((e: any) => e.kind === "paid_manually").document_revision,
    savedInvoice.revision,
  );
  await assert.rejects(
    save({ ...savedInvoice, title: "Change paid invoice" }),
    /recorded payment/,
  );
});
test("invoice drafts retain invalid dates but share and manual lifecycle actions require valid ordered dates", async () => {
  await actor(owner);
  let invoice = newAgencyDocument("invoice",documentBrand({display_name:"QA Agency"}));
  invoice.content.fields = {invoice_number:"QA-DATE-001",recipient_name:"QA Club",recipient_address:"QA address",currency:"GBP",tax_rate:"20",issue_date:"2026-11-01",due_date:"2026-10-31"};
  invoice.content.brand.bankDetails = "TEST ONLY, not an account";
  invoice.content.sections = [{id:"terms",title:"QA terms",body:"QA software test only. No payment is requested."}];
  invoice.content.lines = [{id:"fee",description:"QA fictional service",quantity:"1.5",unitPrice:"100.01"}];
  invoice.content.reviewed = true;
  for (const [issue,due,message] of [
    ["2026-11-01","2026-10-31",/Due date must be on or after the issue date/],
    ["2026-02-31","2026-11-01",/Use valid invoice dates/],
    ["2026-11-01","2026-11-31",/Use valid invoice dates/],
    ["2026-2-01","2026-11-01",/Use valid invoice dates/],
    ["0000-01-01","2026-11-01",/Use valid invoice dates/],
  ] as const) {
    invoice.content.fields.issue_date=issue; invoice.content.fields.due_date=due;
    invoice=await save(invoice);
    assert.equal(invoice.content.fields.due_date,due,"Incomplete drafts remain saveable");
    const before=await call("events",invoice);
    for (const action of ["share","sent","paid"]) await assert.rejects(call(action,invoice,{note:"QA date test only"}),message);
    assert.deepEqual(await call("events",invoice),before,"Rejected actions leave no event or link");
  }
  invoice.content.fields.issue_date="2028-02-29";invoice.content.fields.due_date="2028-02-29";
  invoice=await save(invoice);
  assert.ok((await call("share",invoice)).token,"Valid same-day leap-date billing remains supported");
  await call("archive",invoice);
});
test("invoice date staging canary rehearses the actual role and leaves no rows or events", async () => {
  await db.exec("reset role");
  const counts = async () => (await db.query("select (select count(*) from public.agency_documents) documents,(select count(*) from public.agency_document_shares) shares,(select count(*) from public.agency_document_events) events")).rows;
  const before = await counts();
  const canary = readFileSync("docs/operations/sql/redream-invoice-date-canary.sql", "utf8")
    .replaceAll("675c4f97-f5b9-4686-912f-938b01b4df18", owner)
    .replaceAll("northstar-football-management", "agency-a").replaceAll("djm-sports-management", "agency-b");
  await db.query("insert into platform.tenant_memberships values($1,$2,'owner','active')", [tenantB,owner]);
  try { await db.exec(canary); }
  finally {
    await db.exec("rollback; reset role");
    await db.query("delete from platform.tenant_memberships where tenant_id=$1 and user_id=$2", [tenantB,owner]);
  }
  assert.deepEqual(await counts(),before);
});
test("invoice date migration preserves the writer contract, is repeatable and refuses source drift", async () => {
  await db.exec("reset role");
  const catalog = () => db.query("select oid,proowner,proacl,proconfig,prosecdef,provolatile,md5(prosrc) hash from pg_proc where oid='public.redream_documents(text,text,uuid,integer,jsonb)'::regprocedure");
  const before = await catalog();
  const migration = readFileSync("supabase/migrations/20261027060256_invoice_date_review_guard.sql", "utf8");
  await db.exec(migration);
  assert.deepEqual((await catalog()).rows, before.rows);
  const definition = (await db.query<{definition:string}>("select pg_get_functiondef('public.redream_documents(text,text,uuid,integer,jsonb)'::regprocedure) definition")).rows[0].definition;
  await db.exec("begin");
  await db.exec(definition.replace("Use valid invoice dates", "QA unexpected source"));
  await assert.rejects(db.exec(migration.match(/do \$patch\$[\s\S]*?end \$patch\$;/)![0]), /Unexpected redream_documents source/);
  await db.exec("rollback");
  assert.deepEqual((await catalog()).rows, before.rows);
});
test("raw tables and privileged document APIs remain closed to anonymous callers", async () => {
  await actor(null, "anon");
  await assert.rejects(call("list"), /permission denied/);
  for (const table of [
    "agency_documents",
    "agency_document_shares",
    "agency_document_events",
  ])
    await assert.rejects(
      db.query(`select * from public.${table}`),
      /permission denied/,
    );
  await db.exec("reset role");
  const result = await db.query<{ name: string; rls: boolean }>(
    "select relname as name,relrowsecurity as rls from pg_class where relname in ('agency_documents','agency_document_shares','agency_document_events')",
  );
  assert.equal(result.rows.length, 3);
  assert.ok(result.rows.every((row) => row.rls));
});
test("reviewed representation snapshots retain contract variables without carrying them into club reports", async () => {
  await actor(owner);
  const contract = newAgencyDocument(
    "player_contract",
    documentBrand({ display_name: "Agency A", legal_name: "Agency A Ltd" }),
  );
  for (const field of DOCUMENT_TEMPLATES.player_contract.fields.filter(
    (f) => f.required,
  ))
    contract.content.fields[field.key] = "Agreed";
  Object.assign(contract.content.fields, {
    player_name: "Test Player",
    agent_name: "Test Agent",
    agent_licence: "TEST-LICENCE",
    commission: "8%",
    commercial_commission: "15%",
    player_notice_contact: "Private contract notice address",
    excluded_income: "None",
    start_date: "2026-10-18",
    end_date: "2027-10-17",
    unrelated_private_field: "Never send",
  });
  contract.content.reviewed = true;
  let record = await save(contract);
  record.content.fields.agent_licence = "";
  record = await save(record);
  await assert.rejects(call("share", record), /document variables/);
  record.content.fields.agent_licence = "TEST-LICENCE";
  record = await save(record);
  const link = await call("share", record);
  await actor(null, "anon");
  assert.equal(await open("agency-b", link.token), null);
  const snapshot = await open("agency-a", link.token);
  const fields = snapshot.content.fields;
  assert.equal(fields.agent_licence, "TEST-LICENCE");
  assert.equal(fields.player_notice_contact, "Private contract notice address");
  assert.equal(fields.unrelated_private_field, undefined);
  const text = snapshot.content.sections
    .map((section: any) => resolveDocumentText(section.body, snapshot.content))
    .join("\n");
  assert.match(text, /8%/);
  assert.match(text, /15%/);
  assert.doesNotMatch(text, /\{\{|\[agent|\[player/);
  await actor(owner);
  const report = newAgencyDocument("scouting_report", contract.content.brand);
  report.content.fields = {
    ...contract.content.fields,
    recipient_name: "Club",
    report_date: "2026-10-18",
    author: "Scout",
  };
  report.content.sections = [
    {
      id: "one",
      title: "Overview",
      body: "Reviewed information for {{player_name}}.",
    },
  ];
  report.content.reviewed = true;
  const savedReport = await save(report);
  const reportLink = await call("share", savedReport);
  await actor(null, "anon");
  const reportSnapshot = await open("agency-a", reportLink.token);
  assert.doesNotMatch(
    JSON.stringify(reportSnapshot),
    /TEST-LICENCE|Private contract notice address|commercial_commission|governing_law/,
  );
});
