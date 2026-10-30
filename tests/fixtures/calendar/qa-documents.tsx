import { preparationLink, type PreparationLink } from "@/lib/capture-preparation";
import { useCallback, useRef, useEffect, useState } from "react";
import {
  DocumentStudioEditor,
  type DocumentRequest,
  type DocumentStudioData,
} from "@/components/AgencyDocumentStudio";
import {
  documentBrand,
  DOCUMENT_KINDS,
  DOCUMENT_TEMPLATES,
  newAgencyDocument,
  type AgencyDocument,
} from "@/lib/agency-documents";
const brand = documentBrand({
  display_name: "Northstar Football Management",
  legal_name: "Northstar Football Management Ltd",
  primary_color: "#23483F",
  accent_color: "#B49568",
  support_email: "team@example.com",
});
const invoice = newAgencyDocument("invoice", brand, new Date("2026-10-18"));
invoice.id = "10000000-0000-4000-8000-000000000001";
invoice.title = "Harbour FC | Agency services";
invoice.revision = 1;
invoice.content.fields = {
  invoice_number: "NS-2026-014",
  recipient_name: "Harbour Football Club",
  recipient_address: "1 Harbour Road\nLondon",
  issue_date: "2026-10-18",
  due_date: "2026-11-01",
  currency: "EUR",
  tax_rate: "20",
  reference: "NS-2026-014",
  payment_url: "https://wise.com/pay/example",
};
invoice.content.lines = [
  {
    id: "one",
    description: "Player representation services",
    quantity: "1",
    unitPrice: "2500",
  },
];
invoice.content.sections = [
  {
    id: "terms",
    title: "Agreed services",
    body: "Representation services under the agreement dated 1 October 2026.",
  },
];
invoice.content.brand.bankDetails =
  "Northstar Football Management Ltd\nIBAN: EXAMPLE FOR TESTING ONLY";
invoice.content.reviewed = true;
const reviewBrands = {
  northstar: {
    display_name: "Northstar Football Management",
    legal_name: "Northstar Football Management Ltd",
    primary_color: "#23483F",
    accent_color: "#B49568",
    support_email: "team@northstar.example",
    logo_asset:
      "https://brand-assets.supabase.co/storage/v1/object/public/logos/northstar.svg",
  },
  atlas: {
    display_name: "Atlas Player Advisory",
    legal_name: "Atlas Player Advisory Ltd",
    primary_color: "#E3C672",
    accent_color: "#175E70",
    support_email: "team@atlas.example",
    logo_asset:
      "https://brand-assets.supabase.co/storage/v1/object/public/logos/atlas.svg",
  },
};
function reviewCollection(
  selectedBrand: ReturnType<typeof documentBrand>,
  longInvoice = false,
) {
  const playerName = selectedBrand.name.startsWith("Atlas")
    ? "Łukasz Zieliński"
    : "Alex Bennett";
  return DOCUMENT_KINDS.map((kind, index) => {
    const doc = newAgencyDocument(
      kind,
      selectedBrand,
      new Date("2026-10-18T12:00:00Z"),
    );
    doc.id = `10000000-0000-4000-8000-00000000000${index + 1}`;
    doc.revision = 1;
    doc.title = `${DOCUMENT_TEMPLATES[kind].label} | ${playerName}`;
    doc.content.fields = {
      ...doc.content.fields,
      player_name: playerName,
      player_dob: "2001-04-12",
      player_club: "Harbour FC",
      position: "Central midfield",
      start_date: "2026-10-18",
      end_date: "2027-10-17",
      commission: "Fee terms supplied by the agency for approval.",
      agent_name: "Alex Morgan",
      agent_licence: "LAYOUT-ONLY-001",
      commercial_commission: "15%",
      excluded_income: "None",
      agent_notice_contact: `10 Example Square, London; ${selectedBrand.email}`,
      player_notice_contact: "11 Example Road, London; player@example.test",
      data_protection_law:
        "the data protection legislation agreed by the parties",
      dispute_resolution:
        "the arbitration procedure and tribunal agreed by the parties",
      governing_law: "the agreed jurisdiction",
      enforcement_courts: "the agreed courts",
      principal_name: "Harbour Football Club",
      principal_type: "Club",
      territory:
        "Named clubs in England and Scotland, as agreed in the approved schedule.",
      purpose: "Consistent first-team football and a clear development plan",
      recipient_name: "Harbour Football Club",
      recipient_address: "1 Harbour Road\nLondon\nUnited Kingdom",
      invoice_number: "TEST-2026-014",
      due_date: "2026-11-01",
      reference: "TEST-2026-014",
      payment_url: "https://wise.com/pay/example",
      report_date: "2026-10-18",
      author: "Sam Taylor",
    };
    if (kind === "player_contract") doc.content.fields.commission = "8%";
    const notes = [
      "This is a layout-review sample. The agency’s approved wording belongs in this section. Names, dates and references are filled from the document details so the final version can be checked as a whole.",
      "A longer paragraph is included to check the reading experience across more than one line. It should remain comfortable to scan, with a clear heading and enough space between paragraphs. All final wording must be reviewed for the intended recipient.",
      "Any supporting schedule should be named clearly and checked against the document before it is shared. This sample includes no legal advice, verified scouting judgement or promise of a football outcome.",
    ];
    doc.content.sections = doc.content.sections.map((section, i) => ({
      ...section,
      body: section.body.replace(/\[\[[\s\S]*?\]\]/g, notes[i % notes.length]),
    }));
    if (kind === "invoice") {
      doc.content.lines = structuredClone(invoice.content.lines);
      if (longInvoice)
        doc.content.lines = Array.from({ length: 30 }, (_, i) => ({
          id: `line-${i}`,
          description: `Agency service ${i + 1}: preparation, review and administration under the agreed service schedule.`,
          quantity: "1",
          unitPrice: "125",
        }));
      doc.content.sections = structuredClone(invoice.content.sections);
    }
    if (kind === "scouting_report")
      doc.content.sources = [
        {
          label: "Agency review notes",
          url: "https://example.com/review-notes",
          capturedAt: "2026-10-18T12:00:00Z",
        },
      ];
    doc.content.reviewed = !["player_contract", "mandate"].includes(kind);
    return doc;
  });
}
export function getServerSideProps({
  query,
}: {
  query: Record<string, string | string[] | undefined>;
}) {
  return {
    props: {
      reviewBrand:
        typeof query.reviewBrand === "string" &&
        query.reviewBrand in reviewBrands
          ? query.reviewBrand
          : "",
      longInvoice: query.longInvoice === "1",
      legacyCurrency: query.legacyCurrency === "1",
      scoutingPlayers: query.scoutingPlayers === "1",
      legacyReport: query.legacyReport === "1",
    },
  };
}
export default function DocumentFixture({
  reviewBrand = "",
  longInvoice = false,
  legacyCurrency = false,
  scoutingPlayers = false,
  legacyReport = false,
}: {
  reviewBrand?: string;
  longInvoice?: boolean;
  legacyCurrency?: boolean;
  scoutingPlayers?: boolean;
  legacyReport?: boolean;
}) {
  const [handoff, setHandoff] = useState<PreparationLink | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setHandoff(preparationLink(query.get("capture"), query.get("preparation")));
  }, []);
  const selectedBrand = reviewBrand
    ? documentBrand({
        ...reviewBrands[reviewBrand as keyof typeof reviewBrands],
        phone: "+44 20 0000 0000",
        address: "10 Example Square\nLondon\nUnited Kingdom",
        registration: "Agency registration: EXAMPLE-001",
        website_url: `https://${reviewBrand}.example`,
        bankDetails: "Test account only\nIBAN: EXAMPLE FOR LAYOUT REVIEW",
      })
    : brand;
  const historical = structuredClone(invoice);
  historical.content.brand = selectedBrand;
  historical.title = "QA historical KWD invoice";
  delete historical.content.invoiceCurrencyVersion;
  historical.content.fields.currency = "KWD";
  historical.content.fields.tax_rate = "0";
  historical.content.lines = [{id:"legacy",description:"QA historical amount",quantity:"1.5",unitPrice:"1.23"}];
  const legacyScouting = newAgencyDocument("scouting_report", selectedBrand);
  legacyScouting.is_template = true; legacyScouting.revision = 1; legacyScouting.title = "QA legacy scouting template";
  legacyScouting.content.fields.player_name = "QA Previous Legacy Player";
  legacyScouting.content.sections[0].title = "QA Previous Legacy Player private assessment";
  legacyScouting.content.sections[2].body = "QA Previous Legacy Player private conclusions";
  legacyScouting.content.sources = [{label:"QA Previous Legacy Player private video",url:"",capturedAt:"2026-10-27"}];
  const documents = useRef<AgencyDocument[]>(
      legacyReport ? [legacyScouting] : legacyCurrency ? [historical] : reviewBrand
        ? reviewCollection(selectedBrand, longInvoice)
        : [structuredClone(invoice)],
    ),
    events = useRef<Record<string, any[]>>({}),
    failed = useRef(false), saveAttempts = useRef(0), readAttempts = useRef(0);
  const initial = useRef<DocumentStudioData>({
    tenant_id: "fixture",
    brand: {
      display_name: selectedBrand.name,
      legal_name: selectedBrand.legalName,
      primary_color: selectedBrand.primary,
      accent_color: selectedBrand.accent,
      support_email: selectedBrand.email,
      logo_asset: selectedBrand.logoUrl,
    },
    documents: documents.current,
    players: [
      {
        id: "player-a",
        name: "Alex Bennett",
        dob: "2001-04-12",
        profile: {
          current_club: "Harbour FC",
          primary_position: "CM",
          career_summary: "Senior football experience with Harbour FC.",
          ...(scoutingPlayers ? {key_stats:[{label:"QA published appearances, 2025/26",value:0},{label:"QA unknown minutes",value:null}]} : {}),
        },
      },
      { id: "player-b", name: "Jamie Harper", profile: null },
      ...(scoutingPlayers ? [{id:"player-c",name:"Alex Bennett",profile:null}] : []),
    ],
  }).current;
  const request = useCallback<DocumentRequest>(
    async (action, doc, payload = {}, signal) => {
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (signal?.aborted) throw new Error("Request cancelled");
      if (action === "capture_list")
        return [
          { id: "capture-one", summary: "A development plan for Milo" },
        ] as any;
      window.dispatchEvent(new CustomEvent("qa-document-request", { detail: action }));
      window.dispatchEvent(new CustomEvent("qa-document-record", { detail: { action, id: doc?.id, revision: doc?.revision } }));
      if (action === "capture_read" && payload.capture_id === "30000000-0000-4000-8000-000000000001") {
        const query = new URLSearchParams(window.location.search);
        if (query.get("scenario") === "brief-retry" && !failed.current) { failed.current = true; throw new Error("Fixture timeout"); }
        const notes = "Prepare a document for Prospect Milo Carter. His priority is a clear development plan. Private: internal negotiations remain confidential.";
        return { capture: { id: payload.capture_id, transcript_text: notes }, preparations: [{ key: "prepare_1", kind: query.get("kind") || "agency_pitch", player_name: "Milo Carter", club_name: null, evidence: "Prepare a document for Prospect Milo Carter." }] } as any;
      }
      if (action === "capture_read")
        return {
          capture: {
            id: "capture-one",
            transcript_text:
              "Prospect Milo Carter plays for Harbour FC. His priority is a clear development plan. We observed his central-midfield role on 18 October.",
          },
        } as any;
      if (action === "assist") {
        const scenario = new URLSearchParams(window.location.search).get(
          "scenario",
        );
        if (scenario === "assist-failed" && !failed.current) {
          failed.current = true;
          throw new Error(
            "ReDream could not prepare suggestions. Your draft is unchanged. Please try again.",
          );
        }
        if (scenario === "assist-slow")
          await new Promise((resolve) => setTimeout(resolve, 900));
        if (scenario === "assist-identity-mismatch" && !failed.current) {
          failed.current = true;
          return { suggestions: { fields: [{ key: "player_name", value: "Invented Prospect", quote: "Milo Carter" }], sections: [], questions: [] } } as any;
        }
        return {
          suggestions: {
            fields: [
              {
                key: doc?.kind === "invoice" ? "recipient_name" : "player_name",
                value: doc?.kind === "invoice" ? "Harbour FC" : "Milo Carter",
                quote: doc?.kind === "invoice" ? "Harbour FC" : "Milo Carter",
              },
            ],
            sections: Array.isArray(payload.sections)
              ? payload.sections.map((section: any) => ({
                  id: section.id,
                  body: "Milo Carter's priority is a clear development plan. A further full-match review is the proposed next step.",
                }))
              : [],
            questions: ["Who will lead the next conversation?"],
          },
        } as any;
      }
      if (action === "list")
        return {
          ...initial,
          documents: structuredClone(documents.current),
        } as any;
      if (!doc) throw new Error("Choose a document");
      if (action === "read") {
        const scenario = new URLSearchParams(window.location.search).get("scenario");
        if (scenario === "save-check-failed" && readAttempts.current++ === 0) {
          throw new Error("Fixture confirmation unavailable");
        }
        if (scenario === "save-check-slow") return new Promise(() => {});
        const current = documents.current.find(item => item.id === doc.id);
        return { tenant_id: scenario === "save-read-foreign" ? "foreign" : "fixture", state: current ? "found" : "missing", document: current ? structuredClone(current) : null } as any;
      }
      if (action === "save") {
        saveAttempts.current++;
        const scenario = new URLSearchParams(window.location.search).get("scenario");
        if (scenario === "save-retry-rejected" && saveAttempts.current === 2)
          throw Object.assign(new Error("Check the draft title before trying again."), {code: "P0001"});
        if (scenario === "save-late" && saveAttempts.current === 1) {
          return new Promise((resolve, reject) => setTimeout(() => {
            const current = documents.current.find(item => item.id === doc.id);
            if ((current?.revision || 0) !== doc.revision) {
              window.dispatchEvent(new CustomEvent("qa-document-late", { detail: "rejected" }));
              reject(Object.assign(new Error("This document changed."), {code: "40001"}));
            } else {
              const late = {...doc,...payload,revision:doc.revision+1,updated_at:new Date().toISOString()} as AgencyDocument;
              documents.current = [late,...documents.current.filter(item => item.id !== doc.id)];
              window.dispatchEvent(new CustomEvent("qa-document-late", { detail: "saved" }));
              resolve(structuredClone(late) as any);
            }
          }, 1600));
        }
        if (
          new URLSearchParams(window.location.search).get("scenario") ===
            "save-failed" &&
          !failed.current
        ) {
          failed.current = true;
          throw Object.assign(new Error(
            "The save failed. Your draft is still here. Try again.",
          ), { code: "P0001" });
        }
        const existing = documents.current.find(item => item.id === doc.id);
        if ((!doc.revision && existing) || (existing && existing.revision !== doc.revision))
          throw Object.assign(new Error("This document changed. Reopen it before saving again."), {code: "40001"});
        const saved = {
          ...doc,
          ...payload,
          revision: doc.revision + 1,
          updated_at: new Date().toISOString(),
        } as AgencyDocument;
        window.dispatchEvent(new CustomEvent("qa-document-saved", {detail: structuredClone(saved)}));
        documents.current = [
          saved,
          ...documents.current.filter((item) => item.id !== doc.id),
        ];
        events.current[doc.id] = [
          {
            kind: doc.revision ? "saved" : "created",
            created_at: saved.updated_at,
          },
          ...(events.current[doc.id] || []),
        ];
        if (scenario?.startsWith("save-") && scenario !== "save-failed" && saveAttempts.current === 1) {
          if (scenario === "save-absent" || scenario === "save-retry-rejected") documents.current = documents.current.filter(item => item.id !== doc.id);
          if (scenario === "save-conflict") saved.title = "Another editor's saved version";
          if (scenario === "save-lost") return new Promise(() => {});
          if (scenario !== "save-absent" && scenario !== "save-retry-rejected") documents.current = [structuredClone(saved), ...documents.current.filter(item => item.id !== doc.id)];
          throw new Error("Fixture connection lost after write");
        }
        return structuredClone(saved) as any;
      }
      if (action === "events") return (events.current[doc.id] || []) as any;
      if (action === "share") {
        events.current[doc.id] = [
          { kind: "link_created", created_at: new Date().toISOString() },
          ...(events.current[doc.id] || []),
        ];
        documents.current = documents.current.map((item) =>
          item.id === doc.id ? { ...item, active_links: 1 } : item,
        );
        return { token: "a".repeat(64) } as any;
      }
      if (action === "paid" || action === "sent") {
        events.current[doc.id] = [
          {
            kind: action === "paid" ? "paid_manually" : "sent_manually",
            created_at: new Date().toISOString(),
            note: payload.note,
          },
          ...(events.current[doc.id] || []),
        ];
        documents.current = documents.current.map((item) =>
          item.id === doc.id
            ? {
                ...item,
                [action === "paid" ? "paid_at" : "sent_at"]:
                  new Date().toISOString(),
              }
            : item,
        );
      }
      if (action === "archive")
        documents.current = documents.current.filter(
          (item) => item.id !== doc.id,
        );
      return { ok: true } as any;
    },
    [initial],
  );
  return (
    <DocumentStudioEditor
      initialData={initial}
      workspaceSlug="qa-agency"
      request={request}
      preparation={handoff}
    />
  );
}
