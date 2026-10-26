import { DOCUMENT_KINDS, type AgencyDocument } from './agency-documents.ts';

// Postgres JSONB does not retain object key order; arrays still retain order.
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
};
export function sameDocumentDraft(a: AgencyDocument, b: AgencyDocument): boolean {
  return a.id === b.id && a.kind === b.kind && a.is_template === b.is_template &&
    a.title.trim() === b.title.trim() && canonical(a.content) === canonical(b.content);
}
export type DocumentSaveCheck =
  | { state: 'matching' | 'different' | 'unchanged'; saved: AgencyDocument }
  | { state: 'missing' | 'archived' | 'unknown' };

export function documentSaveCheck(value: unknown, tenant: string, draft: AgencyDocument): DocumentSaveCheck {
  if (!value || typeof value !== 'object') return { state: 'unknown' };
  const result = value as { tenant_id?: unknown; state?: unknown; document?: any };
  if (result.tenant_id !== tenant) return { state: 'unknown' };
  if (['missing', 'archived'].includes(String(result.state)) && result.document === null)
    return { state: result.state as 'missing' | 'archived' };
  const saved = result.document;
  if (result.state !== 'found' || !saved || saved.id !== draft.id ||
    (saved.tenant_id !== undefined && saved.tenant_id !== tenant) ||
    !DOCUMENT_KINDS.includes(saved.kind) || typeof saved.is_template !== 'boolean' ||
    typeof saved.title !== 'string' || !saved.title.trim() ||
    !Number.isSafeInteger(saved.revision) || saved.revision < 1 ||
    typeof saved.updated_at !== 'string' || !Number.isFinite(Date.parse(saved.updated_at)) ||
    !['draft', 'ready'].includes(saved.status) || !saved.content ||
    typeof saved.content.reviewed !== 'boolean' ||
    !saved.content.brand || typeof saved.content.brand !== 'object' || Array.isArray(saved.content.brand) ||
    !Object.keys(draft.content.brand).every(key => typeof saved.content.brand[key] === 'string') ||
    !saved.content.fields || typeof saved.content.fields !== 'object' || Array.isArray(saved.content.fields) ||
    !Object.values(saved.content.fields).every(item => typeof item === 'string') ||
    !Array.isArray(saved.content.sections) || !Array.isArray(saved.content.lines) ||
    !Array.isArray(saved.content.sources) ||
    !saved.content.sections.every((item: any) => item && ['id','title','body'].every(key => typeof item[key] === 'string') && (item.pageBreak === undefined || typeof item.pageBreak === 'boolean')) ||
    !saved.content.lines.every((item: any) => item && ['id','description','quantity','unitPrice'].every(key => typeof item[key] === 'string')) ||
    !saved.content.sources.every((item: any) => item && ['label','url','capturedAt'].every(key => typeof item[key] === 'string'))) return { state: 'unknown' };
  if (saved.kind !== draft.kind || saved.is_template !== draft.is_template || saved.paid_at)
    return { state: 'different', saved };
  if (saved.revision === draft.revision + 1 && sameDocumentDraft(saved, draft))
    return { state: 'matching', saved };
  if (draft.revision > 0 && saved.revision === draft.revision)
    return { state: 'unchanged', saved };
  return { state: 'different', saved };
}
