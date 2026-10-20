# Tell ReDream preparation handoff

## Scope

An explicit internal request to prepare an agency contract, mandate, player pitch, invoice, scouting report or existing player profile now offers the corresponding preparation entrypoint in the verified capture receipt. The existing interpretation call supplies at most three small, source-grounded intents. Opening a handoff does not invoke another model, save a document, create a task, attach a prospect to the roster or publish/send anything.

Document preparation opens the existing tenant-branded Document Studio and carries the original note into its private, editable assistance brief. Only an explicitly supplied player name is prefilled where the selected template has that field. Existing sourced AI suggestions remain optional and require explicit application; save, export, review links and sharing keep their existing behaviour. Legal clauses and bank/payment destinations remain manual. Raw source notes are not automatically inserted into recipient-facing sections or document snapshots.

For player profiles, the user confirms an existing workspace player. Only a unique exact name match can be suggested; ambiguous, partial or prospect names never choose a roster record automatically. The existing Player Profile preparation editor displays the private brief alongside its recorded evidence workflow. The agent edits the brief and explicitly copies suitable wording into the introduction before saving. The existing AI improvement, evidence selection, profile review and sharing remain available. No additional profile backend or public renderer is introduced.

Handoff URLs contain capture and intent identifiers only, preserve the workspace and re-read the authorised receipt. No source text, generated wording or private brief is stored in URLs or new browser persistence. Reads have a deadline, Retry and stale-response protection. Existing Documents owner/admin and Player Profile edit permissions are preserved.

## Deployment manifest

1. Apply only `20261020214341_tell_document_preparation_handoff.sql`.
   It extends `public.redream_ai_receipt(uuid)` with read-only preparation metadata. It preserves the current invoker security, grants, tenant guard, Tell permission checks, actions and questions. It creates no table and changes no customer rows.
2. Deploy `redream-ai-process` and compatibility `djm-tell-process`, preserving `verify_jwt=false` and their existing handler authentication. Include their entrypoints and `_shared/ai-process.ts`, `ai-router.ts`, `ai-safety.ts`, `task-work.ts`, plus new `capture-preparation.ts`.
3. Deploy the frontend from the same validated commit. No other Edge Function, environment variable, secret, project setting or old migration is required.

Validate staging before production. Merge only the exact reviewed head with successful `verify` and `browser_journeys`. Confirm the resulting serving commit and aliases. Rollback can restore the previous worker/frontend; the additive receipt field is compatible with the previous clients and workers.

## Verification

Automated tests mock model requests and use isolated PostgreSQL/PGlite. Coverage includes six intent kinds, source grounding, malformed/duplicate/negated requests, unmentioned identities, inbound-message exclusion, identifier-only workspace links, unique exact player matching, denied cross-tenant/unauthorised/disabled-Tell reads, preserved invoker security and zero automatic action writes.

Browser fixtures exercise all five document drafts, an explicit suggestion/application, the real profile preparation editor, private notes versus recipient text, no automatic save/share, recoverable reads, a genuine Tell receipt entrypoint and 320/390/768/1440 pixel layouts. Existing Word/PDF renderers and templates are reused. These viewport checks do not claim physical iPhone/Safari acceptance.

## Hosted staging acceptance

The authorised synthetic Northstar note produced both `agency_pitch` and `player_profile` preparations in one 2,953 ms interpretation, with zero action rows. The real document link opened Northstar's existing editor, prefilled the explicitly supplied prospect name and retained the full private note in the assistance brief. No document or roster row was created. The canary exposed a model summary claiming drafts were already prepared; preparation-only summaries are now composed from the validated intent labels and cannot claim a save or share. This correction is covered by a mocked-model regression with deliberately false model summary text.
