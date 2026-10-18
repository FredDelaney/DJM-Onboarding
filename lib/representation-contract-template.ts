import type { DocumentField } from "./agency-documents.ts";

// Adapted from the owner's supplied representation reference. Personal details,
// signatures, negotiated percentages and jurisdiction choices are not defaults.
export const REPRESENTATION_CONTRACT_FIELDS: DocumentField[] = [
  { key: "player_name", label: "Player full legal name", required: true },
  { key: "player_dob", label: "Date of birth", type: "date" },
  { key: "agent_name", label: "Licensed agent full name", required: true },
  { key: "agent_licence", label: "FIFA agent licence number", required: true },
  { key: "start_date", label: "Start date", type: "date", required: true },
  { key: "end_date", label: "End date", type: "date", required: true },
  {
    key: "commission",
    label: "Player services commission rate",
    placeholder: "Agreed percentage",
    required: true,
  },
  {
    key: "commercial_commission",
    label: "Commercial commission rate",
    placeholder: "Agreed percentage",
    required: true,
  },
  {
    key: "excluded_income",
    label: "Income excluded from commission",
    type: "textarea",
    placeholder: "State the agreed exclusions, or enter None",
    required: true,
  },
  {
    key: "agent_notice_contact",
    label: "Agent notice address and email",
    type: "textarea",
    required: true,
  },
  {
    key: "player_notice_contact",
    label: "Player notice address and email",
    type: "textarea",
    required: true,
  },
  {
    key: "data_protection_law",
    label: "Applicable data protection legislation",
    type: "textarea",
    required: true,
  },
  {
    key: "dispute_resolution",
    label: "Dispute resolution forum and procedure",
    type: "textarea",
    placeholder: "Approved arbitration procedure and tribunal",
    required: true,
  },
  { key: "governing_law", label: "Governing law jurisdiction", required: true },
  {
    key: "enforcement_courts",
    label: "Courts for enforcement",
    required: true,
  },
];

export const REPRESENTATION_CONTRACT_SECTIONS: [string, string][] = [
  [
    "The parties",
    "The Agent\n{{agent_name}}\nFIFA Licensed Agent | Licence No: {{agent_licence}}\n{{agency_legal_name}}\n(the 'Agent')\n\nThe Player\n{{player_name}}\n(the 'Player')",
  ],
  [
    "1 Appointment",
    "1.1 The Player appoints the Agent on an exclusive basis to represent and advise the Player worldwide in connection with the Player's career as a professional footballer, including:\n(a) seeking and negotiating employment opportunities;\n(b) negotiating, varying or renewing employment contracts; and\n(c) arranging transfers between professional football clubs (the 'Services').\n\n1.2 The Agent is further authorised to negotiate and manage any and all commercial, sponsorship, endorsement and image-rights agreements on behalf of the Player (the 'Commercial Services').",
  ],
  [
    "2 Duration",
    "This Contract commences on {{start_date}} (the 'Commencement Date') and continues until {{end_date}} (the 'Term') unless terminated earlier under Clause 7.\n\nIt may be renewed by written agreement of both parties for a maximum of two (2) years per renewal.",
  ],
  [
    "3 Exclusivity",
    "3.1 The Player shall not appoint or permit any other intermediary to perform the Services or Commercial Services during the Term without the Agent's written consent.\n\n3.2 If the Player independently negotiates any employment or commercial agreement during the Term, the Agent remains entitled to the full Commission as if the Agent had been involved. The following income is expressly excluded from the Services and Commercial Services and no Commission is payable on that income: {{excluded_income}}.",
  ],
  [
    "4 Remuneration player services",
    "4.1 The Agent shall receive a commission of {{commission}} of the Player's Basic Gross Income (including signing-on fees, loyalty bonuses and guaranteed income) from each employment contract negotiated, re-negotiated or substantially influenced during the Term (the 'Commission'), provided that where a lower maximum fee is mandatorily required by applicable FIFA regulations, national-association regulations or law, the Commission shall be reduced only to that required maximum. Where a club is to pay the Commission on the Player's behalf but does not pay it in full, the Player is not automatically liable for the shortfall; the Player and the Agent shall mutually agree in writing how any unpaid balance is to be covered, subject to Clause 4.2.\n\n4.2 Where permitted by applicable regulations, the Player shall request that the club pays the Commission directly to the Agent on the Player's behalf. If the club fails to pay the full Commission, or pays only part of it, the Player and the Agent shall cooperate in good faith to seek payment of the outstanding amount from the club where appropriate. Any remaining shortfall shall not automatically be payable in full by the Player. The Player and the Agent shall instead mutually agree in writing how that shortfall will be covered, including any amount to be contributed by the Player and the timing or structure of any payment. The Commission rate in Clause 4.1 is not reduced by this clause, but recovery of any club-payment shortfall from the Player is subject to that mutual written agreement.\n\n4.3 The Agent shall continue to receive Commission on any such contract entered into during the Term until that contract expires, even if this Contract has since terminated.",
  ],
  [
    "4 Remuneration commercial services",
    "4.4 The Agent shall receive a commission of {{commercial_commission}} on all gross income received by or on behalf of the Player from sponsorship, endorsement, image-rights or commercial arrangements negotiated, introduced or influenced by the Agent during the Term or within six (6) months after its expiry (the 'Commercial Commission').\n\n4.5 The Player shall pay the Commercial Commission within fourteen (14) days of receiving each relevant payment.",
  ],
  [
    "5 Obligations of the Agent",
    "The Agent warrants and agrees that:\n(a) the Agent will act in good faith, honestly and in the Player's best interests;\n(b) the Agent will maintain a valid FIFA Football Agent Licence (No. {{agent_licence}}) throughout the Term;\n(c) the Agent will keep the Player informed of all material developments; and\n(d) the Agent will not enter into binding commitments on the Player's behalf without written consent.",
  ],
  [
    "6 Obligations of the Player",
    "The Player warrants and agrees that:\n(a) the Player is free to enter this Contract and not bound by any other representation agreement;\n(b) the Player shall co-operate fully with the Agent and shall review and expressly approve in writing any request, instruction, offer, commitment or submission before the Agent proceeds with it on the Player's behalf. For this purpose, written approval includes email, WhatsApp or other recorded electronic communication;\n(c) the Player acknowledges the Agent does not provide legal or tax advice but may obtain such advice at the Player's request and cost;\n(d) the Player has been advised to seek independent legal advice before signing; and\n(e) the Player consents to the Agent listing the Player as a client of {{agency_name}} on public platforms (e.g. Transfermarkt) during the Term.",
  ],
  [
    "7 Termination",
    "7.1 This Contract automatically terminates if the Agent's FIFA Licence expires and is not renewed within fourteen (14) days after written notice from the Player.\n\n7.2 Either party may terminate by written notice if the other party:\n(a) commits a material breach and fails to remedy it within fourteen (14) days; or\n(b) becomes insolvent or unable to perform its obligations.\n\n7.3 Termination does not affect any Commission already earned or payable for contracts concluded during the Term.",
  ],
  [
    "8 Data protection",
    "Both parties consent to the processing, storage and transfer of personal data in accordance with {{data_protection_law}}, solely for the purposes of this Contract.",
  ],
  [
    "9 Disputes",
    "Any dispute arising out of or connected with this Contract shall be resolved by {{dispute_resolution}}.",
  ],
  [
    "10 Governing law",
    "This Contract is governed by and construed in accordance with the laws of {{governing_law}}, and the parties submit to the exclusive jurisdiction of {{enforcement_courts}} for enforcement purposes.",
  ],
  [
    "11 General",
    "11.1 This Contract constitutes the entire agreement between the parties.\n\n11.2 If any provision is held invalid or unenforceable, the remainder shall remain in full force.\n\n11.3 All notices under this Contract must be in writing and may be sent by email or recorded delivery to the contractual contact details below.\nAgent: {{agency_legal_name}}; {{agent_notice_contact}}.\nPlayer: {{player_name}}; {{player_notice_contact}}.\nEither party shall notify the other in writing of any change to these details.\n\n11.4 Any filing, lodging or reporting of this Contract required by FIFA, The FA or any other relevant national association shall be completed within the applicable regulatory deadline.\n\n11.5 If the Player is under 18, a parent or legal guardian must also sign below.",
  ],
  [
    "Signatures",
    "By signing below, the parties confirm their agreement to the terms of this Representation Contract. The Player should complete all personal details and dates before the agreement is executed.\n\nThe Player\nFull name: {{player_name}}\nSignature: ______________________________\nDate: __________________\n\nThe Agent\nFull name: {{agent_name}}\nCompany: {{agency_legal_name}}\nFIFA licence: {{agent_licence}}\nSignature: ______________________________\nDate: __________________\n\nParent or legal guardian (only where required)\nFull name: ______________________________\nSignature: ______________________________\nDate: __________________",
  ],
];
