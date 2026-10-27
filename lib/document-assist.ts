import type { AgencyDocument } from "./agency-documents.ts";
import { updateDocumentField } from "./document-workflow.ts";
import {
  documentAssistInput,
  type DocumentSuggestions,
} from "../supabase/functions/_shared/document-assist.ts";

export function prepareDocumentAssist(
  doc: AgencyDocument,
  notes: string,
  sectionId = "",
) {
  return documentAssistInput({
    kind: doc.kind,
    notes,
    agency: doc.content.brand.name,
    fields: doc.content.fields,
    sections: sectionId
      ? doc.content.sections.filter((section) => section.id === sectionId)
      : doc.content.sections,
  });
}

/** Apply only to the exact draft the user reviewed. Saving and sharing remain separate. */
export function applyDocumentSuggestions(
  doc: AgencyDocument,
  suggestions: DocumentSuggestions,
  fingerprint: string,
): AgencyDocument {
  if (doc.paid_at || JSON.stringify(doc) !== fingerprint) return doc;
  let next = doc;
  for (const field of suggestions.fields)
    next = updateDocumentField(next, field.key, field.value);
  return {
    ...next,
    status: "draft",
    content: {
      ...next.content,
      reviewed: false,
      sections: next.content.sections.map((section) => {
        const suggestion = suggestions.sections.find(
          (item) => item.id === section.id,
        );
        return suggestion ? { ...section, body: suggestion.body } : section;
      }),
    },
  };
}
