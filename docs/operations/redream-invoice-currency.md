# Invoice currency precision and historical compatibility

Scope: DOC-04 / DOC-06 / UI-11 / UI-12. Stacked on draft PR 277. The full 46-item/17-surface programme stays active. No production operation or merge is part of this increment.

## Amount contract

The preceding helpers and writer assumed two decimal places for every currency. Regressions demonstrate fractional yen being accepted and valid three-decimal dinar prices being rejected. New invoices now use a frozen version-1 currency map from [SIX's official ISO 4217 List One](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml), published 17 September 2026 and retrieved 27 October. The source SHA-256 is `33139b438657d1cee116ba737807ea71d19d6de4b90f799a09c56f0cc6a1b0ff` (full exact digest is recorded in both source files). The map contains 165 numeric-minor-unit codes: 17 with zero, 139 with two, seven with three and two with four decimal places. N.A./unknown codes are not assumed to have two decimals.

`invoiceCurrencyVersion: 1` is financial format metadata, not permission or factual verification. The client adds it to new invoices and explicit copies; the server defaults it on new invoice inserts, preserves it when a stale client omits it on an update and rejects unknown versions. An existing legacy invoice cannot be upgraded in place. No existing row or approved snapshot is rewritten. Version 1's map is frozen; a future precision-policy change needs a separately reviewed format version.

Unmarked historical invoices retain the original fixed-two-decimal arithmetic and output. Historical manual sent/payment records still use those original amounts and all existing review/date/notes/role/paid-repeat gates. Fresh sharing of an unmarked non-two-decimal or unknown currency requires an explicit Duplicate and review under current rules. For example, historical KWD 1.23 × 1.5 stays 1.85; a new unreviewed copy computes 1.845. Existing recipient snapshots retain their exact JSON and original amount format. No silent rounding or reinterpretation of an approved amount occurs.

New unit prices must match the chosen currency's precision. Additional trailing zeroes are harmless; extra non-zero digits require correction. Quantities retain three-decimal precision. Existing per-line half-up rounding, tax-percent precision, total ceiling of 999999999999 minor units, invoice-number uniqueness, paid-document immutability and tenant/role boundaries remain. Blank tax consistently means zero. No exchange-rate conversion, tax-law conclusion, payment integration or settlement claim is introduced.

All money-format callers now pass the entire content object, retaining its format version across Details, preview, Word, PDF and recipient output. Review gives specific whole-unit/decimal guidance and focuses the Services editor. The legacy sharing warning focuses Duplicate; it does not disable recording an otherwise valid historical manual payment. Previously approved output does not acquire a new draft stamp solely because sharing policy changed.

## Cached clients and rollout order

The existing per-request RPC wrapper adds `x-redream-invoice-currency: 1` only to the three document APIs. It does not change global Supabase configuration or carry authorisation. Existing membership/token checks still run first. PostgREST exposes lower-cased headers through its [request transaction settings](https://docs.postgrest.org/en/stable/references/transactions.html#request-headers-cookies-and-jwt-claims).

A cached client without this capability cannot list, read, save or act on a version-1 invoice whose precision differs from two or is unknown. The public reader checks the stored snapshot after token/tenant/archive validation and before recording an open. Failed saves and public reads roll back their writes/events. Legacy snapshots and compatible two-decimal version-1 invoices remain readable. The owner receives a simple refresh error rather than incorrect amounts. The header never grants document access.

Apply the reviewed backend gate before the new frontend. An older frontend may be restored only after verifying there are no active version-1 non-two-decimal documents or unrevoked/unexpired snapshots it would need to render; otherwise use a currency-aware rollback artifact. Do not remove the format marker or rewrite amounts to make an old frontend work. Backend rollback requires a separately reviewed forward change and data compatibility check, not replaying old migrations.

## Exact migration manifest

Unapplied migration: `supabase/migrations/20261027063255_invoice_currency_precision_v1.sql`, created using Supabase CLI 2.120.0. Only staging project `ltvmopvarlnidiozvpow` is eligible for this increment. No bulk push, excluded relationship migration, date-migration replay or exact-reader replay.

The new private `invoice_currency_minor_unit_v1(text)` lookup is immutable, strict, security-invoker, empty-search-path and owner-only. All client/service-role execution is revoked. Its source hash is `7a55e13cc590c2bf75c885bab12cadfc`. Four existing bodies are patched only against these exact prerequisites:

| Function | Before body MD5 | After body MD5 |
| --- | --- | --- |
| `redream_documents(text,text,uuid,integer,jsonb)` | `3bd8623f7cb0bac0a722f7dcb389abc2` | `7ad3eac7c7a18ce5c2ea2ce7dff8d247` |
| `document_studio_snapshot(agency_documents)` | `a8a36dee47211a88cdd418939b910f2a` | `e26630eceeee31fabe8356d9a5ce7810` |
| `redream_document_read(text,uuid)` | `86c2a5c5ea0e7597d2d60d27c00a8790` | `9e96a273a265780b6230dc1a9d6d23ad` |
| `redream_document_open(text,text)` | `f8ac8e68697fb3fae6be17f11471d4f4` | `0f94eb02ac637e50d29d965ad2a70ae5` |

The migration retains each existing OID, owner, ACL, search_path, SECURITY DEFINER/invoker setting and volatility. Repeated exact-source application is a no-op. Unexpected source or security metadata fails the transaction. The snapshot adds only numeric version 1 on invoice output; non-invoice and historical DTOs retain their prior shape. No table, policy, RLS, schema exposure, public API signature, provider, schedule, secret, configuration or existing data changes.

Staging preflight independently confirms writer OID 30640, snapshot 30639, exact reader 31991, public opener 30644 and all prerequisite hashes/security metadata. Validation helper hash `6ed11eb9dac5b33fe4187168024c1937`, document-table grants/RLS/policies and fresh original-data/advisor baselines are retained in private evidence. Do not apply until local validation, inspection and publication finish. If the service records a different ledger timestamp, align only the filename/test reference with identical SQL; do not replay SQL or alter the ledger.

## Validation and remaining acceptance

The initial currency regressions fail the preceding source. Focused tests now cover four precisions, exact line/tax totals, rejected excess precision, harmless zero extensions, unsupported currency/version, all 165 JS/SQL lookups, the exact amount ceiling and a one-unit overflow. Real PostgreSQL role tests retain tenant/role/raw-table denials, source/metadata/repeat/drift checks, historical snapshot equality/manual amount/paid lock, immutable stored format and cached-client denial without rows/events. The exact authenticated/anonymous rollback-only script is `docs/operations/sql/redream-invoice-currency-canary.sql`, rehearsed locally. The old date-canary fixture models a current client marker without altering the already-applied date migration or original hosted script.

The existing browser fixture/harness has a focused four-scale journey, two technical brands, four widths, actionable correction, save/reopen, recipient capability/output, historical output/manual payment/paid lock/explicit copy and actual editable Word/PDF downloads. It is registered in existing browser CI and seven-day artifacts; no dependency or framework is added. Fixture timing and mobile Preview/Edit transitions are handled explicitly. The final complete currency, existing invoice, player-pitch, general-document and save-recovery browser suites pass. All ten actual currency/historical export pages and representative yen/dinar phone proofs are inspected; totals, branding and legacy output remain intact. Every Word output is unprotected. Full `npm run check` passes 2,169 tests, every TypeScript project, production build and gzip 146,027 / 150,000 bytes. Initial harness failures were transient Activity timing and missing mobile Edit/Review transitions; no product defect was hidden or failed run counted as acceptance.

After local completion/publication, apply only this migration to staging, verify exact catalog/source/grants, run the rollback-only canary and compare original projections/advisor sets excluding only observation timestamps. Then deploy the exact pushed frontend to staging project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `jesseedge10-8415s-projects`; independently verify source, project, READY, preview target and canonical alias. The current accepted frontend is PR 277 `f00e9344f53fefc0e8ed12890502efc38a2f0bd6`, deployment `dpl_6f1nvLX5Kzr3fcJf3Do4K3UQA11D`, immutable `redream-systems-staging-pa94io9qc-jesseedge10-8415s-projects.vercel.app`. Its full CI 40459143218 is confirmed green.

Accept one labelled synthetic invoice through the actual owner UI, precise correction/save/reopen/real exports and normal archive. No hosted sent/paid event, real bank detail, obligation, recipient link, payment-URL visit or external send. Retain its archive audit and compare every original projection excluding only that exact new canary/dependencies. Historical provider/club/staff/physical-device/independent-agency and production acceptance remain open. Northstar/Atlas are technical fixtures. Continue DOC-05's sourced club-facing scouting journey only after this boundary; the whole programme remains active.

Private evidence: `/tmp/redream-platform-programme/invoice-currency/`.
