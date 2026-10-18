export const DOCUMENT_KINDS = [
  "player_contract",
  "mandate",
  "agency_pitch",
  "invoice",
  "scouting_report",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export type DocumentBrand = {
  name: string;
  legalName: string;
  logoUrl: string;
  primary: string;
  accent: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  registration: string;
  bankDetails: string;
};
export type DocumentSection = {
  id: string;
  title: string;
  body: string;
  pageBreak?: boolean;
};
export type DocumentLine = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
};
export type DocumentSource = { label: string; url: string; capturedAt: string };
export type DocumentContent = {
  brand: DocumentBrand;
  fields: Record<string, string>;
  sections: DocumentSection[];
  lines: DocumentLine[];
  sources: DocumentSource[];
  reviewed: boolean;
};
export type AgencyDocument = {
  id: string;
  kind: DocumentKind;
  title: string;
  is_template: boolean;
  status: "draft" | "ready";
  revision: number;
  content: DocumentContent;
  updated_at: string;
  opened_at?: string | null;
  paid_at?: string | null;
  sent_at?: string | null;
  active_links?: number;
};
export type DocumentPlayer = {
  id: string;
  name: string;
  dob?: string;
  profile?: Record<string, any> | null;
};
export type DocumentSettings = { default_currency?: string; timezone?: string };
/** The same recipient-facing brief is used by preview, Word and PDF. */
export function documentBrief(
  doc: AgencyDocument,
): { label: string; value: string }[] {
  const fields = doc.content.fields;
  const layouts: Record<DocumentKind, [string, string][]> = {
    player_contract: [
      ["player_name", "Player"],
      ["player_dob", "Date of birth"],
      ["start_date", "Starts"],
      ["end_date", "Expires"],
    ],
    mandate: [
      ["player_name", "Player"],
      ["principal_name", "Mandated by"],
      ["territory", "Clubs and territories"],
      ["start_date", "Valid from"],
      ["end_date", "Expires"],
    ],
    agency_pitch: [
      ["player_name", "Prepared for"],
      ["player_club", "Current club"],
      ["position", "Position"],
    ],
    scouting_report: [
      ["player_name", "Player"],
      ["recipient_name", "Prepared for"],
      ["report_date", "Report date"],
      ["author", "Prepared by"],
    ],
    invoice: [],
  };
  return layouts[doc.kind].flatMap(([key, label]) => {
    const value = fields[key]?.trim();
    if (!value) return [];
    // Calendar dates have no timezone. Never shift them to the previous day.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value) && /(?:date|dob)$/.test(key)) {
      const date = new Date(value + "T12:00:00Z");
      if (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
      )
        return [
          {
            label,
            value: date.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }),
          },
        ];
    }
    return [{ label, value }];
  });
}
export function documentDate(now = new Date(), timezone?: string): string {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(timezone ? { timeZone: timezone } : {}),
    }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
  }
  return ["year", "month", "day"]
    .map((key) => parts.find((part) => part.type === key)!.value)
    .join("-");
}
export type DocumentField = {
  key: string;
  label: string;
  type?: "date" | "email" | "url" | "textarea";
  required?: boolean;
  placeholder?: string;
};
export const DOCUMENT_TEMPLATES: Record<
  DocumentKind,
  {
    label: string;
    description: string;
    category: string;
    fields: DocumentField[];
    sections: [string, string][];
  }
> = {
  player_contract: {
    label: "Player contract",
    description: "A clear beginning to your representation.",
    category: "Representation",
    fields: [
      { key: "player_name", label: "Player name", required: true },
      { key: "player_dob", label: "Date of birth", type: "date" },
      { key: "start_date", label: "Start date", type: "date", required: true },
      { key: "end_date", label: "End date", type: "date", required: true },
      {
        key: "commission",
        label: "Agreed fees and commission",
        type: "textarea",
        required: true,
      },
    ],
    sections: [
      [
        "Parties",
        "This draft is prepared for {{player_name}} and {{agency_legal_name}}.",
      ],
      [
        "Representation and scope",
        "[[Add your approved representation clause, including the agreed services and scope of authority.]]",
      ],
      [
        "Term",
        "Proposed term: {{start_date}} to {{end_date}}.\n[[Add the agreed renewal and notice provisions.]]",
      ],
      [
        "Fees and commission",
        "{{commission}}\n[[Add your approved payment, tax and commission provisions.]]",
      ],
      [
        "Responsibilities",
        "[[Add the responsibilities agreed with this player.]]",
      ],
      [
        "Ending the agreement and disputes",
        "[[Add your approved termination, governing-law and dispute provisions.]]",
      ],
      [
        "Signatures",
        "Player: {{player_name}}\nSignature: ____________________  Date: __________\n\nFor {{agency_legal_name}}\nName: _______________________\nSignature: ____________________  Date: __________",
      ],
    ],
  },
  mandate: {
    label: "Mandate",
    description: "Define the authority, territory and shared fee.",
    category: "Representation",
    fields: [
      {
        key: "principal_name",
        label: "Mandating agency, club or player",
        required: true,
      },
      {
        key: "principal_type",
        label: "Mandating party type",
        placeholder: "Agency, club or player",
        required: true,
      },
      { key: "player_name", label: "Player name", required: true },
      {
        key: "territory",
        label: "Named clubs or countries",
        type: "textarea",
        required: true,
      },
      { key: "start_date", label: "Start date", type: "date", required: true },
      { key: "end_date", label: "Expiry date", type: "date", required: true },
      {
        key: "commission",
        label: "Commission and split",
        type: "textarea",
        required: true,
      },
    ],
    sections: [
      [
        "Parties and authority",
        "{{principal_name}} ({{principal_type}}) proposes to authorise {{agency_legal_name}} in relation to {{player_name}}.\n[[Add the approved authority and permitted services.]]",
      ],
      [
        "Clubs and territories",
        "{{territory}}\n[[Specify any exclusivity, restrictions and introduction requirements.]]",
      ],
      [
        "Commission arrangement",
        "{{commission}}\n[[Define the fee basis, payer, split, payment trigger and tax treatment.]]",
      ],
      [
        "Duration and limits",
        "{{start_date}} to {{end_date}}.\n[[Add expiry, revocation and limits on authority.]]",
      ],
      [
        "Acceptance",
        "For {{principal_name}}\nSignature: ____________________  Date: __________\n\nFor {{agency_legal_name}}\nSignature: ____________________  Date: __________",
      ],
    ],
  },
  agency_pitch: {
    label: "Player pitch",
    description: "Show a player what a future together could look like.",
    category: "Relationships",
    fields: [
      { key: "player_name", label: "Target player", required: true },
      { key: "player_club", label: "Current club" },
      { key: "position", label: "Position" },
      {
        key: "purpose",
        label: "The player’s priorities",
        type: "textarea",
        required: true,
      },
    ],
    sections: [
      [
        "A plan around {{player_name}}",
        "{{purpose}}\n[[Explain why your agency is the right partner for this player.]]",
      ],
      [
        "How we will support you",
        "[[Describe the services, people and attention you can actually provide.]]",
      ],
      [
        "Your football pathway",
        "[[Set out a realistic, tailored plan without promising a transfer or outcome.]]",
      ],
      [
        "The people beside you",
        "[[Introduce the team and relevant, verifiable experience.]]",
      ],
      [
        "Our next conversation",
        "[[Propose a personal next step.]]\n\n{{agency_email}}\n{{agency_phone}}",
      ],
    ],
  },
  invoice: {
    label: "Invoice",
    description: "Make the fee clear and payment straightforward.",
    category: "Finance",
    fields: [
      { key: "invoice_number", label: "Invoice number", required: true },
      { key: "recipient_name", label: "Bill to", required: true },
      {
        key: "recipient_address",
        label: "Billing address",
        type: "textarea",
        required: true,
      },
      { key: "recipient_email", label: "Billing email", type: "email" },
      { key: "issue_date", label: "Issue date", type: "date", required: true },
      { key: "due_date", label: "Due date", type: "date", required: true },
      {
        key: "currency",
        label: "Currency",
        placeholder: "EUR",
        required: true,
      },
      { key: "tax_rate", label: "Tax rate (%)", placeholder: "0" },
      {
        key: "payment_url",
        label: "Payment link",
        type: "url",
        placeholder: "Your Wise, Revolut or other HTTPS payment link",
      },
      { key: "reference", label: "Payment reference" },
    ],
    sections: [
      [
        "Services and terms",
        "[[Describe the agreed services, fee basis and payment terms.]]",
      ],
      [
        "Payment instructions",
        "Please include reference {{reference}} with your payment.\n[[Add any other payment instructions.]]",
      ],
    ],
  },
  scouting_report: {
    label: "Scouting report",
    description: "A considered football view, grounded in evidence.",
    category: "Football",
    fields: [
      { key: "player_name", label: "Player name", required: true },
      { key: "player_club", label: "Current club" },
      { key: "position", label: "Position" },
      { key: "recipient_name", label: "Prepared for", required: true },
      {
        key: "report_date",
        label: "Report date",
        type: "date",
        required: true,
      },
      { key: "author", label: "Scout or report author", required: true },
    ],
    sections: [
      ["Player overview", "{{player_name}}\n{{position}} · {{player_club}}"],
      [
        "Current evidence",
        "[[Use approved player information, or add your sourced observations here.]]",
      ],
      [
        "Role and tactical fit",
        "[[Describe the observed role, match context and fit for the receiving club.]]",
      ],
      [
        "Strengths observed",
        "[[Add specific observations with a match, date or source.]]",
      ],
      [
        "Questions to evaluate",
        "[[Record areas requiring further observation. Keep missing information explicit.]]",
      ],
      [
        "Recommendation",
        "[[Add your reasoned recommendation and the limits of the evidence.]]",
      ],
    ],
  },
};

export function documentBrand(source: Record<string, any> = {}): DocumentBrand {
  return {
    name: source.display_name || source.name || "",
    legalName:
      source.legal_name || source.legalName || source.display_name || "",
    logoUrl: safeDocumentLogoUrl(source.logo_asset || source.logoUrl),
    primary: /^#[0-9a-f]{6}$/i.test(
      source.primary_color || source.primary || "",
    )
      ? source.primary_color || source.primary
      : "#172A36",
    accent: /^#[0-9a-f]{6}$/i.test(source.accent_color || source.accent || "")
      ? source.accent_color || source.accent
      : "#AF9367",
    email: source.support_email || source.email || "",
    phone: source.phone || "",
    website: source.website_url || source.website || "",
    address: source.address || "",
    registration: source.registration || "",
    bankDetails: source.bankDetails || "",
  };
}
export function safeDocumentUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function safeDocumentLogoUrl(value: unknown): string {
  const external = safeDocumentUrl(value);
  if (external) return external;
  return typeof value === "string" &&
    /^\/[a-z0-9][a-z0-9._/-]*\.(png|jpe?g|svg|webp)$/i.test(value) &&
    !value.split("/").includes("..")
    ? value
    : "";
}
export function newAgencyDocument(
  kind: DocumentKind,
  brand: DocumentBrand,
  now = new Date(),
  settings: DocumentSettings = {},
): AgencyDocument {
  const template = DOCUMENT_TEMPLATES[kind];
  return {
    id: crypto.randomUUID(),
    kind,
    title: template.label,
    is_template: false,
    status: "draft",
    revision: 0,
    updated_at: now.toISOString(),
    content: {
      brand: { ...brand },
      fields: {
        issue_date: documentDate(now, settings.timezone),
        report_date: documentDate(now, settings.timezone),
        currency: /^[A-Z]{3}$/.test(settings.default_currency || "")
          ? settings.default_currency!
          : "EUR",
        tax_rate: "0",
      },
      sections: template.sections.map(([title, body], index) => ({
        id: `section-${index}`,
        title,
        body,
        pageBreak: kind === "agency_pitch" && index > 0,
      })),
      lines:
        kind === "invoice"
          ? [
              {
                id: crypto.randomUUID(),
                description: "",
                quantity: "1",
                unitPrice: "",
              },
            ]
          : [],
      sources: [],
      reviewed: false,
    },
  };
}
export function resolveDocumentText(
  text: string,
  content: DocumentContent,
): string {
  const fields: Record<string, string> = {
    ...content.fields,
    agency_name: content.brand.name,
    agency_legal_name: content.brand.legalName || content.brand.name,
    agency_email: content.brand.email,
    agency_phone: content.brand.phone,
  };
  return text.replace(
    /\{\{([a-z_]+)\}\}/g,
    (_, key: string) => fields[key]?.trim() || `[${key.replaceAll("_", " ")}]`,
  );
}
function scaled(value: string, places: number): number | null {
  if (!new RegExp(`^\\d{1,9}(?:\\.\\d{1,${places}})?$`).test(value.trim()))
    return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const n = Number(whole) * 10 ** places + Number(fraction.padEnd(places, "0"));
  return Number.isSafeInteger(n) ? n : null;
}
export function invoiceTotals(content: DocumentContent) {
  let valid = content.lines.length > 0;
  const amounts = content.lines.map((line) => {
    const quantity = scaled(line.quantity, 3),
      price = scaled(line.unitPrice, 2);
    if (
      quantity === null ||
      quantity <= 0 ||
      price === null ||
      !line.description.trim()
    ) {
      valid = false;
      return 0;
    }
    const amount = Number(
      (BigInt(quantity) * BigInt(price) + BigInt(500)) / BigInt(1000),
    );
    if (!Number.isSafeInteger(amount)) {
      valid = false;
      return 0;
    }
    return amount;
  });
  const subtotal = amounts.reduce((a, b) => a + b, 0),
    rate = scaled(content.fields.tax_rate || "0", 2);
  if (rate === null || rate > 10000) valid = false;
  const tax = Number(
      (BigInt(Number.isSafeInteger(subtotal) ? subtotal : 0) *
        BigInt(rate || 0) +
        BigInt(5000)) /
        BigInt(10000),
    ),
    total = subtotal + tax;
  if (!Number.isSafeInteger(total) || total > 999999999999) valid = false;
  return { valid, amounts, subtotal, tax, total };
}
export function documentMoney(minor: number, currency: string) {
  if (!Number.isFinite(minor)) return "[amount]";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: /^[A-Z]{3}$/.test(currency) ? currency : "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}
export function documentPrice(value: string, currency: string) {
  const minor = scaled(value, 2);
  return minor === null ? "[unit price]" : documentMoney(minor, currency);
}
export function documentIssues(doc: AgencyDocument): string[] {
  const issues: string[] = [];
  if (!doc.title.trim()) issues.push("Add a document title");
  if (!doc.content.brand.name.trim()) issues.push("Add the agency name");
  DOCUMENT_TEMPLATES[doc.kind].fields
    .filter((f) => f.required && !doc.content.fields[f.key]?.trim())
    .forEach((f) => issues.push(`Add ${f.label.toLowerCase()}`));
  const text = doc.content.sections
    .map((s) => resolveDocumentText(s.title + "\n" + s.body, doc.content))
    .join("\n");
  if (
    /\[\[|\{\{|\[(?:player|agency|recipient|start|end|reference)[^\]]*\]/.test(
      text,
    )
  )
    issues.push("Complete the highlighted template text");
  if (!doc.content.sections.length) issues.push("Add document content");
  if (doc.kind === "invoice") {
    if (
      !invoiceTotals(doc.content).valid ||
      invoiceTotals(doc.content).total <= 0
    )
      issues.push("Check invoice descriptions, quantities, amounts and tax");
    if (!/^[A-Z]{3}$/.test(doc.content.fields.currency || ""))
      issues.push("Use a three-letter currency code");
    if (
      !doc.content.brand.bankDetails.trim() &&
      !safeDocumentUrl(doc.content.fields.payment_url)
    )
      issues.push("Add bank details or a secure payment link");
    if (
      doc.content.fields.payment_url &&
      !safeDocumentUrl(doc.content.fields.payment_url)
    )
      issues.push("Use an HTTPS payment link");
  }
  const start = doc.content.fields.start_date,
    end = doc.content.fields.end_date;
  if (start && end && end < start)
    issues.push("End date must follow the start date");
  if (
    doc.content.sources.some(
      (source) =>
        !source.label.trim() || (source.url && !safeDocumentUrl(source.url)),
    )
  )
    issues.push("Add a source description and a valid HTTPS source link");
  if (!doc.content.reviewed)
    issues.push(
      ["player_contract", "mandate"].includes(doc.kind)
        ? "Confirm the wording and terms have been reviewed"
        : "Review the document for its recipient",
    );
  return issues;
}
export function fillDocumentPlayer(
  doc: AgencyDocument,
  player: DocumentPlayer,
): AgencyDocument {
  const profile = player.profile || {},
    content: DocumentContent = {
      ...doc.content,
      fields: {
        ...doc.content.fields,
        player_name: player.name,
        player_club: String(profile.current_club || ""),
        position: String(profile.primary_position || ""),
      },
      reviewed: false,
    };
  delete content.fields.player_dob;
  if (doc.kind === "player_contract")
    content.fields.player_dob = player.dob || "";
  if (doc.kind === "scouting_report") {
    const stats = Array.isArray(profile.key_stats)
      ? profile.key_stats.slice(0, 12).flatMap((stat: unknown) => {
          if (!stat || typeof stat !== "object") return [];
          const { label, value } = stat as { label?: unknown; value?: unknown };
          return typeof label === "string" &&
            label.trim() &&
            ((typeof value === "string" && value.trim()) ||
              (typeof value === "number" && Number.isFinite(value)))
            ? [`${label}: ${value}`]
            : [];
        })
      : [];
    const facts = [
      profile.current_club && `Current club: ${profile.current_club}`,
      profile.primary_position && `Position: ${profile.primary_position}`,
      profile.career_summary,
      ...stats,
    ].filter(Boolean);
    const replacing =
      doc.content.fields.player_name &&
      doc.content.fields.player_name !== player.name;
    const sections = replacing
      ? DOCUMENT_TEMPLATES.scouting_report.sections.map(
          ([title, body], index) => ({ id: `section-${index}`, title, body }),
        )
      : content.sections;
    content.sections = sections.map((section) =>
      section.id === "section-1"
        ? {
            ...section,
            body: facts.length
              ? facts.join("\n\n")
              : "[[No approved profile evidence is available. Add sourced observations.]]",
          }
        : section,
    );
    content.sources = facts.length
      ? [
          {
            label: "Agency-approved player profile",
            url: "",
            capturedAt: new Date().toISOString(),
          },
          ...(safeDocumentUrl(profile.transfermarkt_url)
            ? [
                {
                  label: "Player reference",
                  url: safeDocumentUrl(profile.transfermarkt_url),
                  capturedAt: new Date().toISOString(),
                },
              ]
            : []),
        ]
      : [];
  }
  return { ...doc, status: "draft", content };
}
export function exportDocumentName(doc: AgencyDocument, extension: string) {
  return `${
    doc.title
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 100) || "document"
  }.${extension}`;
}
export function copyAgencyDocument(
  source: AgencyDocument,
  mode: "duplicate" | "template" | "from_template",
  settings: DocumentSettings = {},
): AgencyDocument {
  const content = structuredClone(source.content);
  content.reviewed = false;
  if (mode !== "duplicate") {
    for (const key of [
      "player_name",
      "player_dob",
      "player_club",
      "position",
      "recipient_name",
      "recipient_address",
      "recipient_email",
      "principal_name",
      "start_date",
      "end_date",
    ])
      delete content.fields[key];
    content.sources = [];
  }
  if (source.kind === "invoice") {
    content.fields.invoice_number = "";
    content.fields.reference = "";
  }
  if (mode === "from_template") {
    content.fields.issue_date = documentDate(new Date(), settings.timezone);
    content.fields.report_date = content.fields.issue_date;
  }
  return {
    id: crypto.randomUUID(),
    kind: source.kind,
    title:
      mode === "duplicate"
        ? source.title.slice(0, 175) + " copy"
        : mode === "template"
          ? `${DOCUMENT_TEMPLATES[source.kind].label} template`
          : DOCUMENT_TEMPLATES[source.kind].label,
    is_template: mode === "template",
    status: "draft",
    revision: 0,
    updated_at: new Date().toISOString(),
    content,
  };
}
