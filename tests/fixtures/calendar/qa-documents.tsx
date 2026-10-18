import { useCallback, useRef } from "react";
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
    },
  };
}
export default function DocumentFixture({
  reviewBrand = "",
  longInvoice = false,
}: {
  reviewBrand?: string;
  longInvoice?: boolean;
}) {
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
  const documents = useRef<AgencyDocument[]>(
      reviewBrand
        ? reviewCollection(selectedBrand, longInvoice)
        : [structuredClone(invoice)],
    ),
    events = useRef<Record<string, any[]>>({}),
    failed = useRef(false);
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
        },
      },
      { id: "player-b", name: "Jamie Harper", profile: null },
    ],
  }).current;
  const request = useCallback<DocumentRequest>(
    async (action, doc, payload = {}) => {
      await new Promise((resolve) => setTimeout(resolve, 120));
      if (action === "list")
        return {
          ...initial,
          documents: structuredClone(documents.current),
        } as any;
      if (!doc) throw new Error("Choose a document");
      if (action === "save") {
        if (
          new URLSearchParams(window.location.search).get("scenario") ===
            "save-failed" &&
          !failed.current
        ) {
          failed.current = true;
          throw new Error(
            "The save failed. Your draft is still here. Try again.",
          );
        }
        const saved = {
          ...doc,
          ...payload,
          revision: doc.revision + 1,
          updated_at: new Date().toISOString(),
        } as AgencyDocument;
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
    />
  );
}
