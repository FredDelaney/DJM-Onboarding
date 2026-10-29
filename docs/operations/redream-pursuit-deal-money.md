# Explicit commission currency in request-to-deal conversion

Programme: REL-01-C / REL-02-A / UI-06 and OPS-03-B focus recovery. Locally validated and candidate-tested on staging in ROLLBACK; no new migration, worker or frontend is installed. The whole programme remains active at 2/63 (3%).

## Confirmed problems and correction

The existing pursuit form always sent EUR, converted a blank human probability to zero and sent commission through a JavaScript number. Its canonical writer defaulted missing currency to EUR. Opportunity/deal summaries rounded commission to whole units, while numeric JSON could lose decimal precision at larger supported values.

The existing form now requires the agent to select the deal currency and deliberately enter an integer probability. Expected commission stays optional; blank remains null and a deliberate zero stays zero. Currency and commission are agency deal inputs, separate from the player's base salary and club budget. The frozen existing ISO precision map validates exact decimal strings, with no FX, tax, salary-to-fee conversion, automatic commission or new table. Native input validation, a confirmation displaying the exact commission/unknown and definitive server input errors protect the same workflow. Inputs and the action are at least 44px; 16px input text and readable labels fit 320/390/768/1440.

The unchanged canonical career/financial/verification gates run before creation. New conversions require explicit valid currency, stage, whole-number probability and supported amount precision. Existing active deals are reused without overwriting their facts. Exact commission strings/null are returned in new/reused acknowledgements and current portfolio, instant/deep deal and closeout read models. Existing consumers use the shared exact formatter; unrelated receivable/payment calculations and legacy model/weighted-forecast computations are unchanged and remain separate open financial acceptance work. No historical row, invoice, audit snapshot or customer obligation is rewritten.

The prior b035267 CI 40831228169 finished with verify success and browser failure at `platform-polish-browser-qa.mjs:273`, exact record-edit focus return. `EntityActionsMenu` previously refused to return focus whenever *any* modal remained, including its valid parent deal view. It now permits an interactive opener inside remaining parent modals, while blocking inert/disconnected targets or unrelated active modals. The test waits for the existing animation frame and still asserts the exact opener; it never focuses the button itself. Production-mode deal/club/contact checks pass all 12 screen/width combinations, including nested discard, focus, scroll/inertness and the existing CSP/PDF-download check.

## Pending deployment manifest

Staging only: Supabase `ltvmopvarlnidiozvpow`; Vercel project `prj_uMBOnfwXjmglJXpJblkGqNrDWAmK`, team `team_UQsuBTYTtkklLpT9lJ3llVNQ`. Production is untouched. Use the matching final validated frontend/worker source.

Apply only after the reviewed immutable preview is READY and the coordinated validation window is ready, in this exact order:

1. **Unapplied** `20261028230249_pursuit_salary_constraints.sql`, as recorded in `redream-pursuit-salary-controls.md` (SHA-256 `73398bd02d920d070e7beaa8c68483cfe06823f3c85d588687c97aa8b91293a7`).
2. **Unapplied** `20261029070637_require_explicit_pursuit_deal_money.sql`, SHA-256 `8498d3f986f561e92a93931f98f73900c03a4c58b1c93ce106f32ac57eb19f46`. Guarded conversion body `760b72b223f8af975c691e0ee78759dd` -> `1f4025482c7c2e703999ee1dae80f6ea`. Frozen precision dependency `7a55e13cc590c2bf75c885bab12cadfc` is checked, not modified.
3. **Unapplied** `20261029072522_preserve_deal_commission_decimal_dtos.sql`, SHA-256 `0a11b6d99829dac6eb7ce35699f183c9a9edb3cef90ca05bd95da28c1c900d54`. Only exact money DTO projections change; existing source hashes, OIDs, owners, ACLs, security modes, paths and volatility are guarded/preserved.
4. Matching `agency-market`, same existing JWT true/no-import-map settings. Exact local index.ts SHA-256 `d3934074c86b4e1616ade0198f3ed039eb2d913dbbb5d22fdd9d654cd7f5c6d8`; retrieve/verify the actual deployed bundle/source afterward. Baseline remains version 10, ACTIVE, bundle `a250e369667e175ac106b7d4737c20ad170a2481076ebb1e3fb6b37d0bed7718`. No new agency-os deployment is required beyond installed 65.
5. Run the retained real-role rollback canary and metadata/advisor/original-projection comparison. Accept signed-in new-frontend request -> current terms/review -> explicit fee/currency -> read/reopen and recovery, with no external send. Only then assign the staging alias. No production or merge.

Already installed salary migration `20261028224735` is immutable. Never replay it or `20260930142119_restore_redream_relationship_person_entrypoint.sql`. New files were CLI-created. If the tool returns another ledger version, align filenames/references with identical SQL bytes and record the actual result, without replay.

Reader body MD5s (before -> after):

| Routine | Before | After |
| --- | --- | --- |
| `platform_server_deal_closeout_control(uuid,uuid)` | `2a204a25491832880d28c302b8c34c9f` | `5f7fe8f66014b15438d096783ce24888` |
| `platform_server_deal_portfolio_v2(uuid,integer)` | `dae54c4b4b11608ae5d845da24b284a1` | `e82f2159f974ff93342bf775d567901d` |
| `platform_server_deal_war_room(uuid,uuid)` | `b338cad2143c03b7b202b9543fcc05e7` | `d93cb31ce801c70a083d23f28129abeb` |
| `platform_server_deal_war_room_instant(uuid,uuid)` | `3b084b0242442039602e9c16480a7d3f` | `6403e09c6097a41f5b7e6a9b10054540` |

## Evidence and release checkpoint

- Full final `npm run check`: 2,254 tests, all TypeScript projects, production build and workspace gzip 149,431 / 150,000 pass. The bundle is close to its existing budget; preserve it in future increments.
- Focused database/Edge/pursuit checks pass. Tests cover missing/zero commission, USD/JPY/KWD/CLF precision, large exact values, empty/fractional/out-of-range human probability, missing/invalid currency/stage, nonfinite/exponent/negative/overprecision amounts, existing-deal reuse, metadata and definitive HTTP input versus salary-gate error codes.
- Fourteen financial browser scenarios and existing pursuit page/drawer continuity pass, plus shared usability recovery. New form cases prove native empty input cannot become zero, no EUR default, rejected overprecision, exact string transport, explicit zero probability, unknown commission/null, confirmation and 44px controls at all four widths. Updated phone/desktop output is inspected.
- Actual staging executes all three candidate migrations and the complete `docs/operations/sql/redream-pursuit-salary-canary.sql` inside one transaction ending in ROLLBACK. Actual career/verification/branding/native guards still pass. Explicit USD commission survives creation; supported CLF `999999999999.1234` survives portfolio, instant/deep deal and closeout as a JSON string. All nine original business projections match; ledger stays 20261028224735, current installed writer stays `64e62557366ffb4d76a55979859bdccb`, portfolio stays `dae54c4b4b11608ae5d845da24b284a1`, and no synthetic salary users/tenants or new enforcement remain. This is candidate proof, not installed/new-frontend acceptance.

Evidence: `/tmp/redream-platform-programme/pursuit-money-check-final.log`, `pursuit-money-browser-accepted.log`, `pursuit-money-polish.log`, `pursuit-money-staging-rollback.json` and `pursuit-salary/deal-money-*.png`.

Jesse explicitly approved **one staging preview after CI passes**, in response to the concrete ignored-build cancellation. Use only a per-deployment ignored-command override for that one reviewed preview; global project settings/billing and production remain unchanged. b035267's CI is terminal failed, so publish the corrected source and observe a fresh exact-head CI before using this approval. No bypass or preview retry has yet used the exception. The accepted staging frontend remains 4604652. Wider football matching, complete request-to-outcome, agency revenue/weighted reporting, roles/providers, physical devices and independent-agency acceptance remain open; retain every 46/17 programme row.
