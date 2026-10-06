# Customer readiness remediation, 2026-10-06

Status: implementation under verification; only the RPC permission repair is currently applied to production.

## Changes

- Close anonymous and authenticated execution on the two exposed server RPCs. Add a repeatable read-only catalog gate for every public platform_server_* function.
- Route public customer sign-in to /sign-in, repair the product demo anchor, add reachable support and truthful billing guidance, and prevent malformed demo emails advancing the form.
- Associate auth labels with their fields, keep private auth pages out of indexing, and replace stuck recovery checking with explicit expiry and retry guidance.
- Route linked players on a central host through a verified agency portal chooser. Only workspaces owned by the authenticated user are returned; session tokens are never passed to another hostname.
- Search the complete tenant index through one staff-authorised server read, rather than capped operating summaries. Match accented names and literal multiword queries, exclude archives, and return a bounded top 30 with the real total.
- Page the player directory in batches of 100 so all records in a 250-player plan are reachable. Preserve card fields and scoped cache state, give page failures a retry, and state when filters cover only loaded records.
- Keep player sharing, Transfermarkt and preview prominent; group secondary profile actions under Profile tools. Describe completeness as readiness for verification, without changing publication approval.
- Pin Next.js 16.3.8 and Playwright 1.63.0, update the transitive source-map-js dependency to its patched 1.2.2 release, and add dependency auditing plus isolated customer, search and calendar browser journeys to CI.

## Release sequence

1. Run npm run check and npm run check:browser with no concurrent Next development fixture in this checkout.
2. Review the full branch independently before merge.
3. Apply the three additive read migrations to staging, reconcile only each newly created migration metadata row to its CLI filename version, and run supabase/checks/server_rpc_permissions.sql.
4. Deploy agency-os and player-os with the configured JWT requirement enabled. Production player-os was absent during this audit; its source already existed in the repository.
5. Repeat database and Edge deployment verification in production before releasing the Next application.
6. Merge only after verify and browser_journeys succeed. Require both checks for future main changes, and deploy both production projects from the exact merged commit.
7. Verify public routes, customer entry, recovery expiry, support, native email validation and the full server-RPC permission gate on the live release.

New migrations: 20261005204011_complete_workspace_search, 20261006045124_paged_player_directory, 20261006045519_verified_player_portal_entry. The existing player-workspaces return fields are retained with verified hostname information added. No customer rows are rewritten.

## Evidence and limits

Local verification: npm run check passed with 1,509 tests, type generation/type checking and a production build. The combined npm run check:browser passed all three suites using the pinned Playwright package and system Chrome: 20 customer viewport checks, five search/profile viewport checks, complete 250-player pagination and 12 calendar viewport checks. npm audit --omit=dev --audit-level=high reported zero vulnerabilities after the targeted source-map-js update.

The database tests execute the SQL in PGlite, including role denials, active membership requirements, cross-tenant separation, archived records, literal matching, owned player portal lookup and complete pagination. Browser fixtures use fake backend responses; they do not send email, demo requests or payments. The recovery callback uses the actual Supabase callback parameter shape. Calendar time is fixed to test daytime and DST behaviour consistently. These checks do not establish real email delivery, payment settlement or Safari/iPhone behaviour.

The full ACL gate passed before this release: 345 production and 353 staging server functions, with no anonymous or authenticated execute privilege. This count must be rechecked after the new migrations.

## Remaining operational work before broad paid onboarding

| Item | Evidence still required |
| --- | --- |
| Commercial billing | Configure the intended provider/customer references and prove an owned invoice or payment cycle, including cancellation/support handling. Missing Stripe setup is presented honestly in the UI. |
| Customer agreement | Confirm the actual contracting entity, service terms, DPA, subprocessors and agreed support commitments. Public copy does not invent these. |
| Owned customer journey | Run invitation, recovery email delivery, staff/player access, approved club share and onboarding with an owned pilot account. Fixture checks are not evidence of delivery to a real mailbox. |
| Password protection | Supabase's leaked-password protection setting still needs a targeted Auth configuration change. The exposed connector cannot modify Auth settings; do not replace unrelated project configuration blindly. |
| Staging parity | Investigate historical migration differences. Staging lacks four archive columns present in production; this release reads those archive fields portably rather than rewriting old migration history. |
| Performance | Improve measured first-load cost after field measurements. The prior 2.876-second median lab LCP is a small controlled sample, not real-user performance evidence. |
| Sales proof | Obtain genuine pilot outcomes and approved testimonials. Synthetic demonstration data must remain labelled. |

Broader advisor findings need individual interpretation. Intentional authenticated tenant wrappers are not the same as browser access to server-only RPCs, and unused indexes should not be removed without workload evidence.
