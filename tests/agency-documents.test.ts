import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import ts from "typescript";
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
  documentMoney,
  documentPrice,
  newAgencyDocument,
  resolveDocumentText,
  safeDocumentUrl,
  safeDocumentLogoUrl,
} from "../lib/agency-documents.ts";
import { workspaceMoreLinks } from "../lib/workspace-mobile-navigation.ts";
import {
  documentTheme,
  isDocumentSigningBlock,
} from "../lib/document-presentation.ts";
import { brandContrastRatio } from "../lib/tenant-brand-style.ts";
import {
  DOCUMENT_GUIDES,
  documentIssueTarget,
  invoiceDueDate,
  updateDocumentField,
} from "../lib/document-workflow.ts";

test("each document guides every existing field without requiring a roster player", () => {
  for (const kind of DOCUMENT_KINDS) {
    const keys = DOCUMENT_GUIDES[kind].groups.flatMap((group) => group.keys);
    if (kind !== "invoice") keys.push("player_name");
    assert.deepEqual(
      [...keys].sort(),
      DOCUMENT_TEMPLATES[kind].fields.map((field) => field.key).sort(),
    );
    assert.equal(
      DOCUMENT_GUIDES[kind].prompts.length,
      DOCUMENT_TEMPLATES[kind].sections.length,
    );
    const doc = updateDocumentField(
      newAgencyDocument(kind, documentBrand()),
      kind === "invoice" ? "recipient_name" : "player_name",
      "New Prospect",
    );
    assert.equal(
      doc.title,
      `${DOCUMENT_TEMPLATES[kind].label} for New Prospect`,
    );
    assert.equal("player_id" in doc.content.fields, false);
    assert.equal(doc.content.reviewed, false);
  }
});

test("recipient names suggest titles while custom titles and invoice references stay in control", () => {
  let doc = newAgencyDocument("agency_pitch", documentBrand());
  doc = updateDocumentField(doc, "player_name", "Alex");
  doc = updateDocumentField(doc, "player_name", "Alex Bennett");
  assert.equal(doc.title, "Player pitch for Alex Bennett");
  doc.title = "A personal plan";
  assert.equal(
    updateDocumentField(doc, "player_name", "Another prospect").title,
    "A personal plan",
  );
  let invoice = newAgencyDocument("invoice", documentBrand());
  invoice = updateDocumentField(invoice, "invoice_number", "INV-001");
  assert.equal(invoice.content.fields.reference, "INV-001");
  invoice = updateDocumentField(invoice, "invoice_number", "INV-002");
  assert.equal(invoice.content.fields.reference, "INV-002");
  invoice.content.fields.reference = "Agreed club reference";
  assert.equal(
    updateDocumentField(invoice, "invoice_number", "INV-003").content.fields
      .reference,
    "Agreed club reference",
  );
  assert.equal(
    updateDocumentField(invoice, "currency", "gbp").content.fields.currency,
    "GBP",
  );
});

test("payment shortcuts use calendar dates and review actions lead to the relevant input", () => {
  assert.equal(invoiceDueDate("2026-12-20", 14), "2027-01-03");
  assert.equal(invoiceDueDate("2028-02-28", 7), "2028-03-06");
  assert.equal(invoiceDueDate("2026-02-31", 14), "");
  assert.equal(invoiceDueDate("", 30), "");
  const report = newAgencyDocument("scouting_report", documentBrand());
  assert.deepEqual(documentIssueTarget(report, "Add player name"), {
    tab: "details",
    id: "document-field-player_name",
  });
  assert.deepEqual(
    documentIssueTarget(report, "Review the document for its recipient"),
    { tab: "review", id: "document-review-confirm" },
  );
  report.content.fields.player_name = "Prospect";
  assert.deepEqual(
    documentIssueTarget(report, "Complete the highlighted template text"),
    { tab: "content", id: "document-section-section-1" },
  );
});

test("agency templates clear the previous player's pitch priorities and scouting observations", () => {
  const report = newAgencyDocument("scouting_report", documentBrand());
  report.content.fields.player_name = "Previous player";
  report.content.sections[2].body = "Previous player's private evaluation";
  report.content.sources = [
    { label: "Previous match", url: "", capturedAt: "2026-10-18" },
  ];
  const template = copyAgencyDocument(report, "template");
  assert.equal(template.content.fields.player_name, undefined);
  assert.deepEqual(template.content.sources, []);
  assert.ok(
    template.content.sections.every(
      (section) => !section.body.includes("Previous"),
    ),
  );
  template.content.sections[2].body =
    "[[Add the observed role and explain its relevance to the club.]]";
  assert.equal(
    copyAgencyDocument(template, "from_template").content.sections[2].body,
    template.content.sections[2].body,
    "A clean agency template retains its reusable guidance",
  );
  assert.equal(
    documentIssues(template).includes("Complete the highlighted template text"),
    true,
  );
  const pitch = newAgencyDocument("agency_pitch", documentBrand());
  pitch.content.fields.purpose = "Previous player's private priorities";
  assert.equal(
    copyAgencyDocument(pitch, "from_template").content.fields.purpose,
    undefined,
  );
});
test("a pitch document or legacy template cannot silently become another prospect's personalised wording", () => {
  const pitch = newAgencyDocument("agency_pitch", documentBrand({display_name:"QA Agency"}));
  pitch.content.fields = {player_name:"QA Previous Prospect",purpose:"QA private family priority"};
  pitch.content.sections[0].title="QA Previous Prospect's personal plan";
  pitch.content.sections[0].body="QA Previous Prospect has a QA private family priority.";
  pitch.content.sections.push({id:"custom-chapter",title:"QA private family meeting",body:"QA private family priority and meeting details",pageBreak:true});
  pitch.content.sources=[{label:"QA private conversation",url:"",capturedAt:"2026-10-27"}];
  const before=structuredClone(pitch);
  for(const is_template of [false,true]){
    const template=copyAgencyDocument({...pitch,is_template},is_template?"from_template":"template");
    assert.doesNotMatch(JSON.stringify(template),/QA Previous Prospect|QA private family|QA private conversation/);
    assert.equal(template.content.sections.length,pitch.content.sections.length);
    assert.deepEqual(template.content.sections.map(s=>[s.id,s.pageBreak]),pitch.content.sections.map(s=>[s.id,s.pageBreak]));
    assert.equal(template.content.brand.name,"QA Agency");
    assert.equal(template.content.reviewed,false);
    assert.equal(template.content.pitchTemplateVersion,1);
    assert.ok(documentIssues(template).includes("Complete the highlighted template text"));
  }
  assert.deepEqual(pitch,before,"Conversion never edits the original saved pitch");
  assert.equal(copyAgencyDocument(pitch,"duplicate").content.sections[0].body,pitch.content.sections[0].body,"Explicit duplicate retains the chosen document, with review reset");
});
test("deliberately authored clean pitch template copy and agency evidence remain reusable", () => {
  const template=copyAgencyDocument(newAgencyDocument("agency_pitch",documentBrand()),"template");
  template.content.sections[1].body="QA reusable agency service offer. Confirm the scope in a conversation.";
  template.content.sources=[{label:"QA reusable agency service schedule",url:"",capturedAt:"2026-10-27"}];
  const next=copyAgencyDocument(template,"from_template");
  assert.equal(next.content.sections[1].body,template.content.sections[1].body);
  assert.deepEqual(next.content.sources,template.content.sources);
  assert.equal(next.content.reviewed,false);
  next.content.fields.player_name="QA Second Prospect";
  next.content.sections[1].body="QA Second Prospect's private situation";
  assert.doesNotMatch(JSON.stringify(copyAgencyDocument(next,"template")),/QA Second Prospect/);
});

test("unknown optional football details stay absent and exported dates read naturally", () => {
  const report = newAgencyDocument("scouting_report", documentBrand());
  report.content.fields.player_name = "Prospect";
  assert.equal(
    resolveDocumentText(report.content.sections[0].body, report.content),
    "Prospect",
  );
  assert.equal(
    resolveDocumentText("{{report_date}}", report.content),
    new Date(
      report.content.fields.report_date + "T12:00:00Z",
    ).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }),
  );
  report.content.fields.report_date = "2026-02-31";
  assert.equal(
    resolveDocumentText("{{report_date}}", report.content),
    "2026-02-31",
  );
  report.content.sections.push({ id: "empty", title: "", body: "" });
  assert.ok(
    documentIssues(report).includes(
      "Complete empty section headings and wording",
    ),
  );
});

test("document formats share a tenant palette with readable ink and unchanged decorative accent", () => {
  for (const primary of ["#23483F", "#E3C672", "#FFFFFF", "#FF00BB"]) {
    const theme = documentTheme({ primary, accent: "#175e70" });
    assert.equal(theme.accent, "#175E70");
    assert.ok(brandContrastRatio(theme.primary, theme.surface) >= 4.5);
    assert.ok(brandContrastRatio(theme.primary, "#FFFFFF") >= 4.5);
  }
  assert.equal(
    documentTheme({ primary: "invalid", accent: "invalid" }).accent,
    "#AF9367",
  );
  assert.ok(
    isDocumentSigningBlock(
      "Player\nSignature: ________\n\nAgency\nSignature: ________",
    ),
  );
  assert.equal(
    isDocumentSigningBlock("A normal representation clause."),
    false,
  );
  assert.equal(isDocumentSigningBlock("Signature: " + "a".repeat(2000)), false);
});

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
test("new invoice amounts follow the currency's minor unit, including whole and three/four-decimal units", () => {
  for (const [currency,price,quantity,amount,tax,total] of [
    ["JPY","100","2.5",250,50,300],
    ["EUR","100.10","2.5",25025,5005,30030],
    ["KWD","1.234","1.5",1851,370,2221],
    ["CLF","1.2345","1.5",18518,3704,22222],
  ] as const) {
    const doc=newAgencyDocument("invoice",documentBrand());
    doc.content.fields.currency=currency;doc.content.fields.tax_rate="20";
    doc.content.lines=[{id:"one",description:"QA precision test",quantity,unitPrice:price}];
    assert.deepEqual(invoiceTotals(doc.content),{valid:true,amounts:[amount],subtotal:amount,tax,total},currency);
    const text=documentMoney(total,doc.content);
    assert.match(text,currency==="JPY"?/300$/:currency==="KWD"?/2\.221$/:currency==="CLF"?/2\.2222$/:/300\.30$/);
    assert.equal(doc.content.invoiceCurrencyVersion,1);
  }
});
test("currency validation never rounds an unsupported unit price into a payable amount", () => {
  const doc=newAgencyDocument("invoice",documentBrand());
  doc.content.lines=[{id:"one",description:"QA price",quantity:"1",unitPrice:"100.01"}];
  for(const[currency,price,valid]of [["JPY","100.01",false],["JPY","100.000",true],["KWD","1.2340",true],["KWD","1.2341",false],["CLF","1.23450",true],["ZZZ","1",false],["XAU","1",false],["XXX","1",false]] as const){
    doc.content.fields.currency=currency;doc.content.lines[0].unitPrice=price;
    assert.equal(invoiceTotals(doc.content).valid,valid,currency+" "+price);
    if(!valid)assert.equal(documentPrice(price,doc.content),"[unit price]");
  }
  for(const version of [2,"1",null,false]){
    Object.assign(doc.content,{invoiceCurrencyVersion:version});doc.content.fields.currency="EUR";
    assert.equal(invoiceTotals(doc.content).valid,false,"An unknown format cannot fall back to legacy precision");
  }
});
test("legacy invoice output keeps its recorded scale while explicit copies adopt current precision", () => {
  const legacy=newAgencyDocument("invoice",documentBrand());
  delete legacy.content.invoiceCurrencyVersion;
  legacy.content.fields.currency="JPY";
  legacy.content.lines=[{id:"one",description:"QA historical amount",quantity:"1",unitPrice:"100.01"}];
  const before=structuredClone(legacy);
  assert.equal(invoiceTotals(legacy.content).total,10001);
  assert.match(documentMoney(10001,legacy.content),/100\.01$/);
  const warning="Duplicate this invoice to use current currency precision";
  assert.equal(documentIssues(legacy).includes(warning),false,"Rendering an old approved snapshot must not add a new draft stamp");
  assert.ok(documentIssues(legacy,true).includes(warning),"New lifecycle actions require explicit correction");
  assert.deepEqual(documentIssueTarget(legacy,warning),{tab:"review",id:"document-duplicate"});
  for(const mode of ["duplicate","template","from_template"] as const){
    const copy=copyAgencyDocument(legacy,mode);
    assert.equal(copy.content.invoiceCurrencyVersion,1);
    assert.equal(copy.content.reviewed,false);
    assert.equal(copy.content.lines[0].unitPrice,"100.01");
    assert.equal(invoiceTotals(copy.content).valid,false,"Correction is required; the copy never silently rounds the old price");
  }
  assert.deepEqual(legacy,before);
});
test("invoice review rejects invalid or reversed dates and focuses the date to correct", () => {
  const doc = newAgencyDocument("invoice", documentBrand());
  doc.content.fields.issue_date = "2026-11-01";
  doc.content.fields.due_date = "2026-10-31";
  const reversed = "Due date must be on or after the issue date";
  assert.ok(documentIssues(doc).includes(reversed));
  assert.deepEqual(documentIssueTarget(doc, reversed), {tab:"details",id:"document-field-due_date"});
  for (const key of ["issue_date", "due_date"]) {
    for (const value of ["2026-02-31", "2026-2-01", "0000-01-01", "not a date"]) {
      doc.content.fields = {issue_date:"2026-11-01",due_date:"2026-11-01",[key]:value};
      const issue = key === "issue_date" ? "Check the invoice issue date" : "Check the invoice due date";
      assert.ok(documentIssues(doc).includes(issue), key + " " + value);
      assert.deepEqual(documentIssueTarget(doc, issue), {tab:"details",id:"document-field-"+key});
    }
  }
  for (const value of ["2026-11-01", "2028-02-29"]) {
    doc.content.fields = {issue_date:value,due_date:value};
    assert.equal(documentIssues(doc).some(issue => /invoice (issue|due) date|Due date must/.test(issue)),false,"Same-day and leap-day billing remain valid");
  }
});
test("invoice template reuse requires a fresh payment date without changing the original", () => {
  const source = newAgencyDocument("invoice", documentBrand());
  source.content.fields.issue_date = "2020-01-01";
  source.content.fields.due_date = "2020-01-15";
  const before = structuredClone(source);
  const template = copyAgencyDocument(source,"template");
  assert.equal(template.content.fields.issue_date,undefined);
  assert.equal(template.content.fields.due_date,undefined);
  const next = copyAgencyDocument({...source,is_template:true},"from_template");
  assert.equal(next.content.fields.due_date,undefined,"Legacy templates cannot silently retain an old due date");
  assert.notEqual(next.content.fields.issue_date,"2020-01-01");
  assert.ok(documentIssues(next).includes("Add due date"));
  assert.deepEqual(source,before);
  assert.equal(copyAgencyDocument(source,"duplicate").content.fields.due_date,"2020-01-15","Explicit duplicate retains selected agreement dates for review");
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
test("mandate opening facts keep fees visible and reference full long terms without losing them", () => {
  const doc = newAgencyDocument("mandate", documentBrand());
  const territory = Array.from({length:12},(_,n)=>`QA permitted market ${n+1}, with agreed exclusions in this sample.`).join("\n");
  const commission = "QA payer, sample fee basis, sample split and sample payment trigger. ".repeat(12).trim();
  Object.assign(doc.content.fields, {territory, commission});
  let brief = documentBrief(doc);
  assert.equal(brief.find(item=>item.label==="Clubs and territories")?.value,"See Clubs and territories");
  assert.equal(brief.find(item=>item.label==="Fee arrangement")?.value,"See Commission arrangement");
  const body = doc.content.sections.map(section=>resolveDocumentText(section.body,doc.content)).join("\n");
  assert.ok(body.includes(territory)&&body.includes(commission));
  doc.content.sections[1].title="Agreed markets";
  assert.equal(documentBrief(doc).find(item=>item.label==="Clubs and territories")?.value,"See Agreed markets");
  doc.content.sections[1].body="Custom scope wording without the field variable";
  doc.content.sections[2].body="Custom fee wording without the field variable";
  brief=documentBrief(doc);
  assert.equal(brief.find(item=>item.label==="Clubs and territories")?.value,territory,"Unreferenced full wording must remain in the export");
  assert.equal(brief.find(item=>item.label==="Fee arrangement")?.value,commission);
  doc.content.fields.commission="50% of the sample agency fee, payable by the sample principal on the sample trigger.";
  assert.equal(documentBrief(doc).find(item=>item.label==="Fee arrangement")?.value,doc.content.fields.commission);
});
test("representation wording uses editable tenant/player terms and clears personal notice details for another player", () => {
  const doc = newAgencyDocument(
    "player_contract",
    documentBrand({ display_name: "Agency A", legal_name: "Agency A Ltd" }),
  );
  assert.equal(doc.content.sections.length, 14);
  assert.match(
    doc.content.sections.map((s) => s.body).join("\n"),
    /not automatically liable for the shortfall/,
  );
  assert.match(
    doc.content.sections.map((s) => s.body).join("\n"),
    /expressly approve in writing/,
  );
  assert.match(doc.content.sections.at(-1)!.body, /Parent or legal guardian/);
  assert.equal(doc.content.fields.commission, undefined);
  assert.equal(doc.content.fields.agent_licence, undefined);
  for (const field of DOCUMENT_TEMPLATES.player_contract.fields.filter(
    (f) => f.required,
  ))
    doc.content.fields[field.key] = "Agreed";
  doc.content.reviewed = true;
  assert.deepEqual(documentIssues(doc), []);
  const text = doc.content.sections
    .map((s) => resolveDocumentText(s.body, doc.content))
    .join("\n");
  assert.match(text, /Agency A Ltd/);
  assert.doesNotMatch(text, /\{\{|\[\[/);
  const next = fillDocumentPlayer(doc, {
    id: "another",
    name: "Another player",
  });
  assert.equal(next.content.fields.player_notice_contact, undefined);
  assert.equal(next.content.fields.excluded_income, undefined);
  assert.equal(next.content.reviewed, false);
  const template = copyAgencyDocument(doc, "template");
  assert.equal(template.content.fields.player_notice_contact, undefined);
  assert.equal(template.content.fields.excluded_income, undefined);
  assert.equal(template.content.fields.agent_licence, "Agreed");
  doc.content.sections.push({
    id: "missing",
    title: "Schedule",
    body: "{{custom_schedule}}",
  });
  assert.ok(
    documentIssues(doc).includes("Complete the highlighted template text"),
  );
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

test("document RPC compatibility is per request and leaves unrelated requests and cancellation intact", async () => {
  const requests:any[]=[];
  const exported:any={};
  const source=ts.transpileModule(readFileSync("lib/platform-client.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,{exports:exported,require:(name:string)=>name.endsWith("/supabase")?{supabase:{rpc:(name:string,args:any)=>{
    const request:any={name,args,headers:{},setHeader(key:string,value:string){this.headers[key]=value;return this;},abortSignal(signal:AbortSignal){this.signal=signal;return this;},then(resolve:any){return Promise.resolve({data:{ok:true},error:null}).then(resolve);}};
    requests.push(request);return request;
  }}}:{measureOperation:(_kind:string,_name:string,run:()=>Promise<any>)=>run()}});
  const signal=new AbortController().signal;
  for(const name of ["redream_documents","redream_document_read","redream_document_open","redream_ai_receipt"]) await exported.platformRpc(name,{qa:true},"qa-workspace",signal);
  assert.deepEqual(requests.map(r=>r.headers["x-redream-invoice-currency"]),["1","1","1",undefined]);
  assert.ok(requests.every(r=>r.headers["x-redream-workspace"]==="qa-workspace"&&r.signal===signal));
  assert.equal(new Set(requests.map(r=>r.headers)).size,4);
});
