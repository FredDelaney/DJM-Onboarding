# Agency document studio

The agency owner or admin opens **Documents** from mobile More or desktop workspace tools. The canonical route is `/workspace/[tenantSlug]/documents`; it always retains the selected agency.

## Included in the first version

- Player representation contract, mandate, player pitch, invoice and scouting report starting structures.
- Agency-owned reusable templates, editable variable fields, editable/reorderable sections, page breaks and live preview.
- Agency name, legal entity, logo, colours, contact/address/registration and invoice banking details. New invoices use the configured agency currency and calendar timezone.
- Editable Word `.docx` output and text-based PDF output. The studio remains the editable source; PDF is a published layout, not a Word-style editing format.
- Recipient briefs display the relevant player, recipient, author and dates consistently in preview, Word and PDF. Empty fields stay absent; birth dates appear only on representation contracts.
- Player pitches use a dedicated landscape cover followed by numbered chapters. The chapter wording and page breaks remain editable, and long content flows onto additional pages.
- Preview, Word and PDF share one tenant letterhead palette, including logo, readable brand ink, a soft brand surface and the tenant accent. Word embeds the logo; both published formats carry agency contact details.
- PDF embeds self-hosted, licensed static fonts to preserve extended Latin names. The font files and upstream revision are recorded under `public/fonts/agency-documents/`. The initial workspace bundle does not load these assets.
- Exact decimal invoice amounts, tax, payment links, unique invoice numbers per agency and manual delivery/payment records with a required reference.
- Published player-profile facts and selected statistics can fill scouting reports. Hidden profile sections and private operational records are excluded. A changed report player resets the previous player’s observations and evidence.
- Cloud drafts with revision checks, retained unsaved content on errors, and explicit review before creating a recipient link.
- Fourteen-day bearer links to immutable document snapshots, first-open tracking after the recipient explicitly chooses View document, revocation, expiry and archive controls. Activity identifies the document revision. Paid invoices cannot be edited in place; duplicating resets payment activity and invoice numbering.

## Deliberate boundaries

The player representation draft uses the owner-supplied reference wording for appointment, exclusivity, remuneration, approval, obligations, termination and general terms. Player identity, licensed agent, fees, exclusions, notices and jurisdiction choices are editable variables. The supplied player's personal identifiers and signatures are not stored in the template. Mandates still begin with clearly marked spaces for agency-approved wording. The product does not certify legal compliance or execute electronic signatures. The review checkbox records an operator’s review, not professional certification.

The first report preparation step reuses published player facts already in the platform. It does not run new web research or generate scouting claims with an LLM. Source entries remain editable and all material wording requires review.

Use an agency logo from tenant storage or a safe local asset, designed for a light background. Images follow the existing platform image policy. Custom typeface uploads, right-to-left layouts and CJK font coverage are not included in this version.

An HTTPS Wise/Revolut/other payment link is a recipient action. There is no payment-provider settlement webhook, bank reconciliation, email delivery confirmation or automated sending in this version. Manual records are labelled accordingly. An open event does not mark an invoice as delivered or paid.

Only active tenant owners/admins can access the studio initially because the library includes representation terms, commissions and banking data. Player/scout/agent accounts cannot list or retrieve these records. The most recent 100 documents/templates are shown; a larger paginated library and more granular document permissions can follow.

## Storage and security

`agency_documents`, `agency_document_shares` and `agency_document_events` have RLS and no raw anonymous/authenticated table grants. `redream_documents` resolves the explicit agency slug and checks active owner/admin membership before every action. The public bearer-token endpoint has no search/list capability. Tokens contain two random UUIDs; only SHA-256 hashes are stored. Suspended agencies, archived documents and expired/revoked links cannot open.

Recipient snapshots omit unused variable fields, internal actor information and bank details outside invoices. External text is rendered as text, and external actions use HTTPS URLs without embedded credentials. No customer data is persisted in browser storage by the studio.

## Deployment manifest

1. Review and apply `supabase/migrations/20261018095925_agency_document_studio_v1.sql`, then `supabase/migrations/20261018153045_agency_document_representation_fields.sql`, to staging. The second migration extends only the private contract snapshot field projection; other document kinds retain their existing boundaries.
2. Deploy the web branch containing the Documents route and its lazily loaded exporters. No new Edge Function or secret is required.
3. Run authenticated owner/admin, denied staff/player, second-tenant, source-visibility and recipient-link canaries on staging before any production rollout.

The implementation work does not apply this migration or deploy the application.

## Validation

Domain/database regression tests:

```sh
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types --test tests/agency-documents.test.ts tests/agency-documents-database.test.ts tests/mobile-workspace-navigation.test.ts
```

The database tests execute the full new migration in PGlite with real membership predicates and the existing public-profile visibility projection. They cover denied access, cross-tenant writes, stale revisions, snapshot redaction/immutability, token expiry/revocation, invoice numbering, manual payment and paid-invoice protection.

The existing temporary-fixture browser runner exercises all five starting points, four viewport widths, editing/autofill, draft recovery, recipient briefs, Word/PDF downloads, pitch covers/chapters, sharing, recipient retry/open and manual invoice payment. It checks that the concise sample report retains its sources on one page and that the pitch exports a cover and five chapters:

```sh
CALENDAR_QA_PORT=3213 node scripts/calendar-browser-fixture.mjs scripts/documents-browser-qa.mjs
```

The complete collection check exports every type for two synthetic agency brands, including logos and a light primary colour. It checks mobile widths, agreement draft protection, Word letterhead colours, embedded logos, real PDF Unicode mappings for accented names, clickable payment/evidence links, and a 30-line invoice:

```sh
CALENDAR_QA_PORT=3213 node scripts/calendar-browser-fixture.mjs scripts/document-collection-browser-qa.mjs
```

Before publishing an exporter change, render every generated Word/PDF page. Check clause headings with their opening text, complete signing blocks, source lists, repeated invoice column headings, footer clearance and the final payment details. Test fixtures are layout samples; contract/mandate examples remain unapproved drafts.

It is also included in `npm run check:browser`. Fixtures use synthetic records; their routes are removed afterwards. Export samples/screenshots are written under `/tmp/redream-document-qa` for visual inspection. Run `npm run check` for the full unit/database, TypeScript, build and bundle checks.

The interaction references were PandaDoc’s [template variables and document generation](https://developers.pandadoc.com/docs/create-document-from-template) and Templafy’s [brand-aware smart templates](https://support.templafy.com/hc/en-us/articles/5120367280157-What-are-Dynamics-and-smart-templates). No integration with either vendor is installed.
