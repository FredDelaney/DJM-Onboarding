import {
  DOCUMENT_TEMPLATES,
  resolveDocumentText,
  type AgencyDocument,
  type DocumentKind,
} from "./agency-documents.ts";

type FieldGroup = {
  title: string;
  description: string;
  keys: string[];
  advanced?: boolean;
};
type DocumentGuide = {
  purpose: string;
  recipient: string;
  playerHint: string;
  groups: FieldGroup[];
  prompts: string[];
};

/** Editor guidance only. Never exported as evidence, a promise or contractual wording. */
export const DOCUMENT_GUIDES: Record<DocumentKind, DocumentGuide> = {
  player_contract: {
    purpose: "Agree a clear beginning",
    recipient: "For a player considering representation by your agency.",
    playerHint:
      "Enter the new player's full legal name. They do not need to be in your roster.",
    groups: [
      {
        title: "Player identity",
        description: "Use the details that will appear in the agreement.",
        keys: ["player_dob"],
      },
      {
        title: "Who represents the player",
        description:
          "Name the licensed individual and check the licence number.",
        keys: ["agent_name", "agent_licence"],
      },
      {
        title: "Term and fees",
        description: "Agree each fee and any excluded income with this player.",
        keys: [
          "start_date",
          "end_date",
          "commission",
          "commercial_commission",
          "excluded_income",
        ],
      },
      {
        title: "Notices and jurisdiction",
        description:
          "Check these choices for this agreement. Your agency template can retain recurring agent details.",
        keys: [
          "agent_notice_contact",
          "player_notice_contact",
          "data_protection_law",
          "dispute_resolution",
          "governing_law",
          "enforcement_courts",
        ],
        advanced: true,
      },
    ],
    prompts: [
      "Check the parties and the licensed agent.",
      "Check the agreed services and scope.",
      "Check dates and renewal wording.",
      "Review exclusivity and this player's excluded income.",
      "Check the fee basis, payer and written agreement required for any shortfall.",
      "Check the commercial fee, payment timing and post-term provisions.",
      "Review the agent's commitments.",
      "Review written approvals and the player's commitments.",
      "Check notice, remedy and earned-commission provisions.",
      "Use the applicable data protection wording.",
      "Confirm the agreed dispute procedure.",
      "Confirm the governing law and enforcement courts.",
      "Check notices, filing obligations and any guardian requirements.",
      "Leave signing lines blank for execution after review.",
    ],
  },
  mandate: {
    purpose: "Make the authority precise",
    recipient:
      "For an agency, club or player granting your agency a defined mandate.",
    playerHint:
      "Name the player covered by the mandate. A roster record is not required.",
    groups: [
      {
        title: "Who is granting the mandate",
        description: "Use the actual legal party granting the authority.",
        keys: ["principal_type", "principal_name"],
      },
      {
        title: "Where you may act",
        description:
          "Name the clubs or countries. State exclusions explicitly in the wording.",
        keys: ["territory", "start_date", "end_date"],
      },
      {
        title: "How the fee is shared",
        description:
          "Specify the payer, percentage or amount, calculation basis and payment trigger.",
        keys: ["commission"],
      },
    ],
    prompts: [
      "Set out the approved services and who may authorise them. Do not imply unrestricted authority.",
      "Name permitted clubs or countries, exclusions and any exclusivity.",
      "Identify the payer, fee basis, split, trigger and tax treatment in approved wording.",
      "Confirm expiry, revocation, restrictions and what happens to existing introductions.",
      "Check both legal parties before signature.",
    ],
  },
  agency_pitch: {
    purpose: "Make the case personal",
    recipient:
      "For a prospective player deciding whether your agency is the right partner.",
    playerHint:
      "Start with the player you want to sign. No roster entry or signed status is needed.",
    groups: [
      {
        title: "Their football context",
        description: "Include current details only when you know them.",
        keys: ["player_club", "position"],
      },
      {
        title: "What matters to this player",
        description:
          "Their next decision, ambitions and priorities should lead the pitch.",
        keys: ["purpose"],
      },
    ],
    prompts: [
      "Connect their stated priorities to the reason for this conversation. Make this about the player.",
      "Name the actual services and people you can provide. Avoid generic promises.",
      "Explain practical next steps, the timing and what remains uncertain. Do not promise a club or transfer.",
      "Introduce the people the player would work with and verifiable relevant experience.",
      "Offer a specific next conversation, the person to contact and what you will discuss.",
    ],
  },
  invoice: {
    purpose: "Make payment straightforward",
    recipient:
      "For the club or organisation paying for your agency's agreed services.",
    playerHint: "",
    groups: [
      {
        title: "Bill the right organisation",
        description: "Use the club's billing entity and accounts contact.",
        keys: ["recipient_name", "recipient_address", "recipient_email"],
      },
      {
        title: "Invoice details",
        description: "Use a unique number and the agreed payment date.",
        keys: [
          "invoice_number",
          "issue_date",
          "due_date",
          "currency",
          "tax_rate",
        ],
      },
      {
        title: "How to pay",
        description:
          "Add bank instructions, a secure payment link, or both. Use the receiving agency's details.",
        keys: ["reference", "payment_url"],
      },
    ],
    prompts: [
      "Identify the agreed service, relevant agreement and fee basis. The line items below determine the total.",
      "Explain the payment reference and any agreed instructions. A payment link does not confirm settlement.",
    ],
  },
  scouting_report: {
    purpose: "Help a club make its next decision",
    recipient:
      "For a club evaluating a player, with observations separated from missing evidence.",
    playerHint:
      "Report on any player, including a prospect outside your roster.",
    groups: [
      {
        title: "Player context",
        description: "Add verified context. Leave unknown details empty.",
        keys: ["player_club", "position"],
      },
      {
        title: "Who is receiving this view",
        description:
          "Tailor the football recommendation to this club and credit the report's author.",
        keys: ["recipient_name", "report_date", "author"],
      },
    ],
    prompts: [
      "Keep identity, club and role factual.",
      "Describe what you watched or verified, when and from which source. Published profile facts can be imported optionally.",
      "Explain the observed role and relevance to this club's requirements.",
      "Use concrete actions, match situations or timecodes rather than unsupported ratings.",
      "State the questions a further observation should answer. Missing information stays missing.",
      "Give a reasoned next action and explain the limits of the evidence.",
    ],
  },
};

export function documentSectionPrompt(doc: AgencyDocument, title: string) {
  const index = DOCUMENT_TEMPLATES[doc.kind].sections.findIndex(
    ([heading]) => heading === title,
  );
  return index < 0
    ? "Write for this recipient. Keep facts and commitments specific."
    : DOCUMENT_GUIDES[doc.kind].prompts[index];
}

export function updateDocumentField(
  doc: AgencyDocument,
  key: string,
  value: string,
): AgencyDocument {
  const fields = {
    ...doc.content.fields,
    [key]: key === "currency" ? value.toUpperCase() : value,
  };
  const label = DOCUMENT_TEMPLATES[doc.kind].label;
  const subjectKey = doc.kind === "invoice" ? "recipient_name" : "player_name";
  const oldSubject = doc.content.fields[subjectKey]?.trim();
  const subject = fields[subjectKey]?.trim();
  const previousTitle = (
    oldSubject ? `${label} for ${oldSubject}` : label
  ).slice(0, 180);
  const title =
    !doc.is_template && key === subjectKey && doc.title === previousTitle
      ? subject
        ? `${label} for ${subject}`.slice(0, 180)
        : label
      : doc.title;
  if (
    doc.kind === "invoice" &&
    key === "invoice_number" &&
    (!fields.reference ||
      fields.reference === doc.content.fields.invoice_number)
  )
    fields.reference = value;
  return {
    ...doc,
    title,
    status: "draft",
    content: { ...doc.content, fields, reviewed: false },
  };
}

export function invoiceDueDate(issueDate: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate) || ![7, 14, 30].includes(days))
    return "";
  const date = new Date(issueDate + "T12:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== issueDate
  )
    return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function documentIssueTarget(
  doc: AgencyDocument,
  issue: string,
): { tab: string; id: string } {
  const field = DOCUMENT_TEMPLATES[doc.kind].fields.find(
    (f) => issue === `Add ${f.label.toLowerCase()}`,
  );
  if (field) return { tab: "details", id: `document-field-${field.key}` };
  if (issue.includes("document title"))
    return { tab: "details", id: "document-title" };
  if (issue.includes("agency name"))
    return { tab: "brand", id: "document-brand-name" };
  if (/review/i.test(issue))
    return { tab: "review", id: "document-review-confirm" };
  if (issue.includes("bank details"))
    return { tab: "details", id: "document-bank-details" };
  if (issue.includes("payment link"))
    return { tab: "details", id: "document-field-payment_url" };
  if (issue.includes("currency"))
    return { tab: "details", id: "document-field-currency" };
  if (issue.includes("invoice"))
    return { tab: "details", id: "document-line-items" };
  if (issue.includes("End date"))
    return { tab: "details", id: "document-field-end_date" };
  if (issue.includes("source"))
    return { tab: "content", id: "document-sources" };
  const section = doc.content.sections.find(
    (s) =>
      !s.title.trim() ||
      !s.body.trim() ||
      /\[\[|\[[a-z_ ]+\]/.test(
        resolveDocumentText(s.title + "\n" + s.body, doc.content),
      ),
  );
  return {
    tab: "content",
    id: section ? `document-section-${section.id}` : "document-sections",
  };
}
