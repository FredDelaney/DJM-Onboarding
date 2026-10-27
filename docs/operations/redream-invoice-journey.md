# Invoice journey and date review guard

Scope: DOC-04 / DOC-06 / UI-11 / UI-12, stacked on draft PR 276. The full 46-item/17-surface programme remains active.

## Observed problems and changes

Invoice templates retained a preceding invoice's due date while assigning a fresh issue date. The review system also allowed impossible dates and due dates before issue dates. Three new model/database regressions reproduce these defects against the preceding source.

Non-duplicate invoice conversion now clears issue/due dates along with the already-cleared invoice number/reference and recipient. Applying a template assigns the existing fresh issue date and requires an explicit new due date. Original documents remain unchanged. Explicit Duplicate retains the chosen dates for review, as before; existing old invoices are not rewritten.

The current review checklist now identifies an invalid issue date, invalid due date or due-before-issue date and focuses the actual input that needs correction. Same-day invoices and valid leap dates remain supported. Missing dates use the existing required-field guidance. Draft saves remain permissive so corrections and incomplete work are retained.

The existing server writer receives the same narrow date gate before invoice share/sent/paid actions. These actions require strict real YYYY-MM-DD calendar dates and due >= issued. Invalid calendar casts return a simple recoverable error. No automatic payment, delivery event or provider success is invented. Existing totals, immutable snapshots, explicit review, uniqueness, manual notes, paid-invoice immutability, tenant/role guards and all other document semantics remain in use.

## Validation

- The three regressions fail the previous implementation and pass this fix: invalid/reversed dates, actionable review focus, same-day/leap billing, clean current/legacy template dates, original preservation and server denial of share/sent/paid while drafts remain editable.
- Existing PostgreSQL tests retain duplicate-number, rounding, payment-repeat, paid-write, role/tenant and recipient-snapshot checks. Added migration checks prove repeat application preserves OID/source/owner/ACL/security settings, and unexpected source drift is refused and rolled back. The exact hosted canary script is rehearsed locally under the actual authenticated role with mapped technical fixture identities; document/share/event counts match after rollback.
- `scripts/invoice-document-browser-qa.mjs` reuses the current fixture/harness. Two technical brands cover blank organisation billing without player import, missing-recipient focus, reversed-date correction, 14-day year-boundary shortcut, invoice-reference auto-fill/custom control, fractional quantities/rounded tax/totals, missing bank/link guidance, invalid-link correction, explicit review, failed-save retention/retry, Library reopen and template-date clearing. Four preview widths (320/390/768/1440) fit without horizontal overflow.
- Northstar uses a fictional bank-only one-line sample; Atlas uses a payment-link-only 30-line sample. Word/PDF downloads retain every service exactly once, correct total/reference/recipient/brand and per-page tenant furniture. Actual hyperlink annotations/relationships remain valid without visiting the payment URL. Word editing protection is absent. Short samples have one Word/one PDF page; long samples two/two. All six rendered pages and both phone proofs are inspected. PDF remains regenerable from the editable draft, not a fillable form.
- Local manual sent/payment dialogs require notes and remain explicitly labelled manual; no provider event is inferred. The paid fixture is locked for editing. This is local synthetic lifecycle evidence, not an actual payment, delivery or real bank/provider acceptance.
- Existing player-pitch and general-document browser suites pass. Full `npm run check` passes 2,157 tests, every TypeScript project, production build and gzip 145,983 / 150,000 bytes. Browser registration/artifacts reuse existing CI and seven-day retention; no dependency/framework is added.

Evidence: `/tmp/redream-platform-programme/invoice-journey/`, including before/after regression logs, focused browser results/log, actual exports, Word renders, four review sheets, render-verification JSON and full check log. Initial fixture-only dialog selector correction uses the existing `Document action` accessible name; no modal redesign was made.

## Exact backend manifest

Final migration: `supabase/migrations/20261027060256_invoice_date_review_guard.sql`, name `invoice_date_review_guard`. The CLI originally created 20261027055046; the local filename/test reference is aligned to the service-recorded 20261027060256 with identical SQL and no replay or ledger rewrite. It patches only the existing `public.redream_documents(text,text,uuid,integer,jsonb)` invoice lifecycle block. Draft save and every unrelated body fragment remain byte-for-byte unchanged. The known original body hash must be `fd0101533fcf451d7b82ee66df4f3be6`; the exact patched hash is `3bd8623f7cb0bac0a722f7dcb389abc2`. Unexpected source/security settings cause a transaction failure. Exact patched-source repetition is a no-op. OID, owner, ACL, empty search_path and volatility are checked and retained.

Staging preflight confirms writer OID 30640, original source hash, postgres ownership, authenticated/service execute and no anon execute. The exact reader (OID 31991/hash 86c2a5c5ea0e7597d2d60d27c00a8790), validation/snapshot helpers and document-table grants/RLS/policies are recorded separately and must not change. No table/schema/permission/index/worker/provider/configuration/secret/schedule change. Previously approved snapshots and existing data are not rewritten.

Only staging project `ltvmopvarlnidiozvpow` may receive this exact new migration. Record the service-assigned ledger version; if it differs from the CLI filename, align that filename/test reference without replaying SQL or rewriting the ledger. Do not bulk-push migrations. The exact-reader migration 20261026231700 is already installed and must not be reapplied. Never replay the excluded relationship migration. Production is outside this increment's release scope; future application must pass the same source prerequisite rather than replacing an unknown writer.

After publication/local checks: apply only the date migration; verify expected writer hash and unchanged catalog/security metadata, run `docs/operations/sql/redream-invoice-date-canary.sql` (all writes roll back), compare all 16 original projections and security/performance finding sets. The canary makes only synthetic database records/tokens inside its rolled-back transaction; no token is exposed to a recipient, external send occurs or money moves.

## Frontend manifest and remaining acceptance

Product frontend changes are only `lib/agency-documents.ts` and `lib/document-workflow.ts`. Supporting files are existing tests, one focused browser journey, existing CI registration and programme/operation documentation. Stage only the final pushed SHA on project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `jesseedge10-8415s-projects`, after independently verifying source/project/READY/preview target. Assign only the existing staging alias. Immediate frontend rollback is accepted PR 276 source b7c8f49, immutable `redream-systems-staging-ebpjz0i59-jesseedge10-8415s-projects.vercel.app`, deployment `dpl_HcKvTqy7KD3sekMc2htRrS5pB5xL`.

Accept one labelled, explicitly fictional normal signed-in invoice through date correction/review/save/reopen/preview/real exports and unsaved clean template conversion. Do not persist sent/paid activity, create an actual obligation, follow payment links or share externally. Archive only the exact saved QA invoice through normal UI, retain its audit and compare original projections excluding that exact canary/dependencies. Record actual acceptance below only when proven. Preserve final-source CI and all earlier archived canaries.

Actual provider settlement/delivery, real club invoicing, broader staff/roles, physical iPhone/Safari, independent-agency and production acceptance remain open. Northstar/Atlas are technical fixtures. This increment does not establish legal/tax/accounting validity or complete the whole programme.


## Staging backend checkpoint

Only `invoice_date_review_guard` is applied to staging, recorded by the service as version `20261027060256`. The originally CLI-created `20261027055046` file and existing test references are aligned to that actual version with identical SQL; no replay or ledger rewrite. Expected writer body hash `3bd8623f7cb0bac0a722f7dcb389abc2` is confirmed. Its OID 30640, postgres owner, existing ACL, empty search_path, security-definer setting and volatility match preflight. Exact reader OID 31991/hash 86c2a5c5ea0e7597d2d60d27c00a8790, validation/snapshot helper bodies/metadata and every document-table grant/RLS/policy remain unchanged.

The actual authenticated-role rollback-only staging canary passes editable invalid drafts; invalid share/sent/paid rejection without extra events; real same-day leap dates; invoice-number uniqueness; explicit manual-event/repeat rejection; foreign-tenant absence; and nonmember/anonymous denial. Every canary write/token rolls back; no recipient is contacted or token exposed. All 13 original business and three original document projections match after execution. Public-profile projection deliberately excludes contract_expiry, as in preceding releases; this is not a whole-database immutability claim.

Security/performance finding sets match exactly after excluding `observed_at` timestamps. Existing findings remain tracked separately: no assertion that the broader security backlog is resolved. The first unnormalised comparison correctly stopped on the differing observation timestamps; normalising only that field proves no material finding delta. Evidence: `backend-final.json`, recorded catalog/data/advisor baselines and canary result in the private evidence folder.

All 34 focused model/database tests pass after the filename/reference alignment. The application helpers and migration SQL are unchanged from the complete 2,157-test/type/build/bundle and browser/export pass. Final all-project TypeScript also passes after alignment. Publish the alignment, retain its exact final-source CI and stage that exact frontend; no second migration application belongs to that step. No hosted invoice UI canary has been created at this checkpoint.

Parent PR 276 exact b7c8f49 now passes full CI 40456369058 and its accepted ebpjz0i59 frontend is the immediate rollback. Wider provider/club/ordinary-staff/device/independent-agency and production gates remain open. No production operation, configuration/schedule change, external action or merge.
