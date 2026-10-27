# Career strategy approval recovery

The career-plan action uses the saved strategy to choose the next step. Missing objective, preferred route, fallback route or checkpoint opens the populated editor. A complete plan without player confirmation opens confirmation. Agency approval is offered only after confirmation is recorded.

Saving the editor keeps existing priorities, non-negotiables, trade-offs and other strategy details. Both routes are explicit human inputs. Editing the strategy continues to invalidate confirmation through the existing database workflow.

The Edge handler awaits returned route promises before leaving its error boundary. Database validation errors therefore return JSON with CORS headers rather than escaping as a misleading connection failure. Missing strategy details and player confirmation have specific recovery messages. Tenant membership and owner/admin approval rules are unchanged.

Verification:

```sh
npm run check
node scripts/calendar-browser-fixture.mjs scripts/career-strategy-browser-qa.mjs scripts/agency-command-recovery-qa.mjs
```

The HTTP tests execute the real Edge handler with controlled RPC transport. The mobile browser check renders the real drawer and client transport at 390px with a synthetic saved plan. It checks retained data, required routes, a failed confirmation, successful confirmation and explicit approval. The new journey is included in `check:browser`.

Release the updated `agency-os` function with its existing relative dependencies and JWT setting, then the Next.js frontend. No database migration or player-record backfill is needed. Existing incomplete plans remain drafts until their missing details and confirmation are supplied.
