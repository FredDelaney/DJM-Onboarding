import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, after, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  documentBrand,
  DOCUMENT_TEMPLATES,
  resolveDocumentText,
  newAgencyDocument,
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
