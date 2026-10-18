import assert from "node:assert/strict";
import test from "node:test";
import {
  DOCUMENT_KINDS,
  DOCUMENT_TEMPLATES,
  documentBrand,
  documentBrief,
  copyAgencyDocument,
  documentDate,
  documentIssues,
  fillDocumentPlayer,
  invoiceTotals,
  newAgencyDocument,
  resolveDocumentText,
  safeDocumentUrl,
  safeDocumentLogoUrl,
} from "../lib/agency-documents.ts";
import { workspaceMoreLinks } from "../lib/workspace-mobile-navigation.ts";

test("five independent editable templates use the selected agency branding", () => {
  const brand = documentBrand({
    display_name: "Northstar",
    legal_name: "Northstar Ltd",
    primary_color: "#123456",
  });
  for (const kind of DOCUMENT_KINDS) {
    const first = newAgencyDocument(kind, brand),
      second = newAgencyDocument(kind, brand);
    first.content.brand.name = "Changed";
    assert.equal(second.content.brand.name, "Northstar");
    assert.ok(first.content.sections.length);
    assert.ok(documentIssues(first).length);
    assert.equal(first.content.reviewed, false);
  }
  assert.equal(
    resolveDocumentText(
      "{{agency_legal_name}} represents {{player_name}}",
      newAgencyDocument("player_contract", brand).content,
    ),
    "Northstar Ltd represents [player name]",
  );
  assert.equal(
    workspaceMoreLinks("/workspace/northstar", true).find(
      (x) => x.label === "Documents",
    )?.href,
    "/workspace/northstar/documents",
  );
  assert.equal(
    workspaceMoreLinks("/agency", true, "northstar").find(
      (x) => x.label === "Documents",
    )?.href,
    "/workspace/northstar/documents",
  );
  assert.equal(
    workspaceMoreLinks("/workspace/northstar", false).some(
      (x) => x.label === "Documents",
    ),
    false,
  );
});
test("new documents use the agency currency and calendar date", () => {
  const now = new Date("2026-10-17T23:30:00Z");
  assert.equal(documentDate(now, "Europe/Rome"), "2026-10-18");
  assert.equal(documentDate(now, "America/New_York"), "2026-10-17");
  const invoice = newAgencyDocument(
    "invoice",
    documentBrand({ display_name: "Agency" }),
    now,
    { default_currency: "GBP", timezone: "Europe/Rome" },
  );
  assert.equal(invoice.content.fields.currency, "GBP");
  assert.equal(invoice.content.fields.issue_date, "2026-10-18");
});
test("recipient briefs show only the relevant document fields without guessing missing details", () => {
  const report = newAgencyDocument("scouting_report", documentBrand());
  report.content.fields = {
    player_name: "Alex Bennett",
    recipient_name: "Harbour FC",
    report_date: "2026-10-18",
    author: "Sam Taylor",
    player_dob: "2000-01-01",
    commission: "Private terms",
    extra_internal_field: "Never display",
  };
  assert.deepEqual(documentBrief(report), [
    { label: "Player", value: "Alex Bennett" },
    { label: "Prepared for", value: "Harbour FC" },
    { label: "Report date", value: "18 Oct 2026" },
    { label: "Prepared by", value: "Sam Taylor" },
  ]);
  const pitch = newAgencyDocument("agency_pitch", documentBrand());
  assert.deepEqual(documentBrief(pitch), []);
  pitch.content.fields = report.content.fields;
  assert.deepEqual(documentBrief(pitch), [
    { label: "Prepared for", value: "Alex Bennett" },
  ]);
  const contract = newAgencyDocument("player_contract", documentBrand());
  contract.content.fields = {
    player_name: "Alex",
    player_dob: "2000-01-01",
    start_date: "2026-02-31",
  };
  assert.deepEqual(documentBrief(contract), [
    { label: "Player", value: "Alex" },
    { label: "Date of birth", value: "1 Jan 2000" },
    { label: "Starts", value: "2026-02-31" },
  ]);
});
test("invoice money uses rounded minor units and rejects invalid or missing amounts", () => {
  const doc = newAgencyDocument("invoice", documentBrand());
  doc.content.lines = [
    {
      id: "1",
      description: "Representation",
      quantity: "2.5",
      unitPrice: "100.10",
    },
  ];
  doc.content.fields.tax_rate = "20";
  assert.deepEqual(invoiceTotals(doc.content), {
    valid: true,
    amounts: [25025],
    subtotal: 25025,
    tax: 5005,
    total: 30030,
  });
  doc.content.lines[0] = {
    id: "one",
    description: "Fractional service",
    quantity: "1.5",
    unitPrice: "1.01",
  };
  doc.content.fields.tax_rate = "0";
  assert.equal(invoiceTotals(doc.content).subtotal, 152);
  doc.content.lines[0].unitPrice = "1.005";
  assert.equal(
    invoiceTotals(doc.content).valid,
    false,
    "Sub-cent unit prices must be corrected, not silently rounded",
  );
  for (const value of ["", "-1", "NaN", "1e8", "Infinity"]) {
    doc.content.lines[0].unitPrice = value;
    assert.equal(invoiceTotals(doc.content).valid, false);
  }
  doc.content.lines[0].unitPrice = "0";
  assert.ok(documentIssues(doc).some((x) => x.startsWith("Check invoice")));
});
test("external links accept only HTTPS without embedded credentials", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,hello",
    "http://wise.com/x",
    "https://username:secret@wise.com/x",
    "/file",
  ])
    assert.equal(safeDocumentUrl(value), "");
  assert.equal(
    safeDocumentUrl("https://wise.com/pay/abc"),
    "https://wise.com/pay/abc",
  );
  assert.equal(safeDocumentLogoUrl("/logos/agency.svg"), "/logos/agency.svg");
  assert.equal(safeDocumentLogoUrl("//external.example/logo.svg"), "");
  assert.equal(safeDocumentLogoUrl("/../logo.svg"), "");
});
test("changing the report player clears previous evidence and scouting conclusions", () => {
  let doc = newAgencyDocument(
    "scouting_report",
    documentBrand({ display_name: "Agency" }),
  );
  doc = fillDocumentPlayer(doc, {
    id: "a",
    name: "Player A",
    dob: "2000-01-01",
    profile: {
      current_club: "Club A",
      primary_position: "ST",
      career_summary: "Approved career evidence",
      key_stats: [
        { label: "Goals", value: 0 },
        { label: "Unknown minutes", value: null },
      ],
      private_notes: "Never import",
    },
  });
  assert.match(doc.content.sections[1].body, /Approved career evidence/);
  assert.match(doc.content.sections[1].body, /Goals: 0/);
  assert.doesNotMatch(doc.content.sections[1].body, /Unknown minutes/);
  assert.equal(doc.content.fields.player_dob, undefined);
  assert.doesNotMatch(JSON.stringify(doc), /Never import/);
  doc.content.sections[3].body = "Observations about Player A";
  doc.content.reviewed = true;
  doc = fillDocumentPlayer(doc, { id: "b", name: "Player B", profile: null });
  assert.doesNotMatch(
    JSON.stringify(doc),
    /Club A|Approved career evidence|Observations about Player A/,
  );
  assert.equal(doc.content.sources.length, 0);
  assert.equal(doc.content.reviewed, false);
  assert.equal(
    doc.content.sections[3].body,
    DOCUMENT_TEMPLATES.scouting_report.sections[3][1],
  );
});
test("review does not hide unfinished clauses or missing variables", () => {
  const doc = newAgencyDocument(
    "mandate",
    documentBrand({ display_name: "Agency" }),
  );
  doc.content.reviewed = true;
  for (const field of DOCUMENT_TEMPLATES.mandate.fields)
    doc.content.fields[field.key] = "Agreed";
  assert.ok(
    documentIssues(doc).includes("Complete the highlighted template text"),
  );
  doc.content.sections = [
    {
      id: "ready",
      title: "Mandate",
      body: "{{player_name}} · {{agency_name}}",
    },
  ];
  assert.deepEqual(documentIssues(doc), []);
});
test("a new copy never inherits payment activity, invoice numbers or review approval", () => {
  const paid = newAgencyDocument(
    "invoice",
    documentBrand({ display_name: "Agency" }),
  );
  paid.paid_at = "2026-10-18";
  paid.revision = 3;
  paid.active_links = 2;
  paid.content.reviewed = true;
  paid.content.fields.invoice_number = "INV-123";
  paid.content.fields.recipient_name = "Club A";
  const duplicate = copyAgencyDocument(paid, "duplicate");
  assert.equal(duplicate.paid_at, undefined);
  assert.equal(duplicate.active_links, undefined);
  assert.equal(duplicate.revision, 0);
  assert.equal(duplicate.content.reviewed, false);
  assert.equal(duplicate.content.fields.invoice_number, "");
  assert.equal(duplicate.content.fields.recipient_name, "Club A");
  const template = copyAgencyDocument(paid, "template");
  assert.equal(template.content.fields.recipient_name, undefined);
  assert.equal(template.is_template, true);
  assert.equal(template.paid_at, undefined);
});
