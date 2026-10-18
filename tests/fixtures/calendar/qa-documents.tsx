import { useCallback, useRef } from "react";
import {
  DocumentStudioEditor,
  type DocumentRequest,
  type DocumentStudioData,
} from "@/components/AgencyDocumentStudio";
import {
  documentBrand,
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
export default function DocumentFixture() {
  const documents = useRef<AgencyDocument[]>([structuredClone(invoice)]),
    events = useRef<Record<string, any[]>>({}),
    failed = useRef(false);
  const initial = useRef<DocumentStudioData>({
    tenant_id: "fixture",
    brand: {
      display_name: brand.name,
      legal_name: brand.legalName,
      primary_color: brand.primary,
      accent_color: brand.accent,
      support_email: brand.email,
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
