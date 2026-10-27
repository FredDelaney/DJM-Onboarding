# Document assistance source checks and hosted journey

Scope: DOC-06 / UI-11 / UI-12, stacked on draft PR 279. The full 46-item and 17-surface programme remains active.

## Source-established change

A new regression reproduces a validation gap: an allowed identity field can contain an invented name even when its supporting quote occurs in the brief. The prior validator checks the quote's presence but not whether it contains the proposed identity.

The shared browser/Edge validator now requires a literal, bounded match for player and agent names, club names, principal/recipient names, agent licences and recipient email addresses. Unicode compatibility normalisation, case, whitespace and straight/curly quote typography are tolerated. Partial words, licence suffixes and embedded email suffixes are rejected. Identity punctuation is preserved rather than replaced during prose cleanup. Other field and narrative semantics remain unchanged.

This check establishes a source span only. It does not verify the person, club, licence, claim, relationship, source truth or narrative meaning. Human review remains required. The prompt explicitly requests quoted identities without invented expansions, and telemetry uses `document_assist_v2`. The existing client displays a plain recoverable message for invalid suggestions, keeps the draft unchanged and offers explicit retry. It does not expose validation internals.

No new assistant, provider SDK, dependency, schema, data model, permission, billing rule or automatic action is added. Existing owner/admin authorisation, selected agency, quota check, provider deadline, private-free telemetry and explicit Apply/review/save/share remain.

## Focused validation

- The new identity-rejection test fails the preceding code. It covers invented identities, club abbreviation expansion, partial words/licences and email suffixes. Positive cases preserve accented Latin, Greek, Cyrillic, quote typography, case, whitespace, identity punctuation and email case. Existing backend rejection now covers an allowed-key invented name, returns a recoverable failure and records failed usage without returning the proposed identity.
- The existing document browser fixture adds one invalid-identity response followed by a valid explicit retry. The new suggestion never enters the draft, no Apply action is offered for it, the plain error appears, and retry returns the normal deliberate-apply flow. Existing success, provider failure, stale-draft rejection, all-five-kind/four-width and actual export cases pass. CI retains the existing document artifact folder; no framework is added.
- Fifteen focused assistance/preparation tests pass. Final full check after the punctuation-preservation follow-up passes 2,175 tests, every TypeScript project/build and workspace gzip 146,026 / 150,000 bytes. Exact new-function/frontend hosted acceptance and final-source CI remain pending.

Evidence: `/tmp/redream-platform-programme/document-assistance/`, including before/final tests, browser log, original deployed function bundle and hosted evidence.

## Actual existing staging journey before the source-check release

The deployed `redream-document-assist` version 3 is ACTIVE with JWT verification true. Its three downloaded files exactly match the preceding repository source. No backend is changed for this baseline.

Northstar's real note picker reads a labelled existing QA capture and copies only its transcript into the private brief, without approving the capture's task action. A fictional replacement brief requests optional suggestions; the existing allowance check refuses Northstar because its AI feature is disabled. There is no provider usage event for that denial. Manual editing and explicit discard remain available. No entitlement, wallet or configuration is changed.

A read-only preflight confirms DJM staging already has its authorised AI allowance. One real owner request from a fictional new prospect returns only the supplied name and priority, exact supporting quotes and three questions about missing actual services, people and next steps. The draft stays blank until Apply. Actual usage event `066f34fb-eded-4841-ba20-c10c417fe0dd` records success, `document_assist_v1`, 3,502 ms and estimated cost 306 micros ($0.000306); actual cost remains unknown. Event and saved document tenants match DJM. No real sporting/service assertion is generated.

Explicit Apply -> five manually authored QA chapters/source -> review -> save revision 1 -> Library reopen -> phone preview -> actual Word/PDF succeeds. The private brief is empty on reopen and absent from stored content. Both exports have six landscape pages; all twelve are rendered and inspected, with full approved wording, inherited DJM identity and the manual source link. Word is unprotected. Raw briefs and supporting quotes remain absent. This is scoped staging technical acceptance, not an independent agency or real player commitment.

Only `a2dea888-cbe1-405c-bcfd-163bda106f7b`, `[QA] Document Assistance 2026-10-27 A1`, is normally archived at revision 2, `2026-10-27 18:47:23.202417+00`. Its row and one created event remain intentionally; no recipient link exists. All original 13 business/related and three document projections match after excluding only this exact new QA/dependencies and the one new expected AI usage event. Earlier canaries are untouched. Normal metering records are retained, not removed. The viewport is reset.

## Exact release manifest and pending gate

Deploy only `redream-document-assist` to **staging** project `ltvmopvarlnidiozvpow`, preserving `verify_jwt: true`, existing import-map behaviour and entrypoint `redream-document-assist/index.ts`. Include only that entrypoint, `_shared/document-assist.ts` and unchanged `_shared/ai-router.ts`. Before replacing version 3, re-read its bundle and refuse unexpected drift. The original version-3 bundle is retained privately for rollback. Do not print or change secrets.

Frontend: existing `components/AgencyDocumentAssist.tsx` only. Supporting changes: existing shared-helper/Edge tests, document fixture/browser test and artifact registration, plus this manifest/programme checkpoint. Publish a draft based on `codex/redream-scouting-report-journey`; use the exact pushed frontend on the existing staging project/team. Independently verify full SHA/project/READY/preview target/alias before owner acceptance. No production, merge or migration is included. Never replay existing/excluded migrations.

After the source-check release, one bounded fictional DJM owner request must succeed with `document_assist_v2`, exact quotes, deliberate Apply, manual editability, no implicit document/roster/task/share write and expected tenant-scoped usage only. The baseline end-to-end exports above do not prove the new function is installed. Record exact bundle hashes, deployment identity and final-source CI separately. Actual staff/device/provider permutations, every document kind with live AI, physical iPhone/Safari, independent-agency and production acceptance remain open.
