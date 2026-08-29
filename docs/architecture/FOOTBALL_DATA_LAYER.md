# Football Data Layer

## Purpose

The Football Data Layer lets DJM continuously improve trusted football intelligence without confusing external data with canonical truth. Its core sequence is:

Provider or authorised export -> normalised preview -> evidence -> human review -> canonical update -> deterministic recalculation.

No provider preview writes directly to player or career records.

## Provider contract

Provider code lives under `supabase/functions/_shared/football-data/` and returns one normalised preview shape. Provider-specific fetching, normalisation and provenance are separated from persistence and review.

Capabilities are:

- `licensed_api`: production automation is permitted and explicitly configured.
- `manual_import`: staff supplies an authorised export.
- `reference_only`: DJM retains links and manual evidence, but the system does not fetch the source.
- `disabled`: the provider cannot be called.

The current policy is:

| Provider      | Default capability | Behavior                                                                               |
| ------------- | ------------------ | -------------------------------------------------------------------------------------- |
| Wyscout       | `disabled`         | Becomes `licensed_api` only with the enable flag, username and password on the server. |
| Manual        | `manual_import`    | CSV and JSON become reviewable evidence.                                               |
| Transfermarkt | `reference_only`   | Saved links and reviewed values remain; automated scraping is inaccessible.            |
| SofaScore     | `disabled`         | Saved reference links do not create a provider dependency.                             |

## Wyscout adapter

The V1 adapter follows the official v3 Basic Authentication model and uses the official player detail and player career resources. It requests only the core identity and season fields DJM can review usefully.

Controls include:

- credentials read only from Edge Function environment variables
- explicit `DJM_WYSCOUT_API_ENABLED=true`
- 10 second request timeout
- at most three attempts
- bounded 429 backoff
- structured logs without credentials or authorization headers
- payload hash only, not indefinite raw licensed payload retention
- preview response before any evidence or canonical update

## Canonical competition identity

`djm_os.competitions` stores the canonical key, display name, country, optional gender and level, aliases, provider identifiers and active state. It never stores or implies competition strength.

`djm_os.league_benchmarks` remains the strength source of truth and now references a canonical competition. A verified date and source URL or evidence note are required through the staff workflow. No benchmark rows are seeded by this release.

## Evidence and review

`djm_os.player_evidence` records the normalised value, provider, source reference, truth state, confidence, observed and fetched times, reviewer, validity, freshness, review state, supersession and payload hash. It does not store provider secrets.

`public.player_source_refreshes` records each run and its mode, capability, timestamps, counts, warnings, provider version, payload hash and freshness. `public.player_source_suggestions` connects evidence to the current and suggested values.

Staff decisions are:

- Accept: apply the reviewed fact and record canonical-change events.
- Reject: preserve DJM truth and retain the audit trail.
- Keep current: explicitly preserve DJM truth.
- Review later: keep the item in the queue.

An accepted season import preserves unknown values. Null does not overwrite a known canonical metric. An explicit numeric zero can be accepted as zero.

## Player Score recalculation

The V1 model remains deterministic:

- at least 500 verified senior minutes in the previous 24 months
- a verified benchmark for the current competition
- 75 percent competition benchmark
- 25 percent playing-time signal
- potential remains separate

Career evidence, current competition and benchmark changes mark an existing model result `needs_recalculation`. Recalculation clears staleness and records the model basis. A manual override is stored separately and requires a reason. Removing it reveals the preserved model value.

## Freshness

Freshness is deterministic and category-specific. Current club, contract, recent-match and benchmark evidence have separate review windows. Verified historical career evidence does not become false merely because time passed. Passport evidence is not expired by an arbitrary weekly timer.

The staff UI presents `fresh`, `aging`, `stale` or `unknown` without changing the underlying truth state automatically.

## Security

Competition and evidence tables use RLS and the existing active DJM team-member check. Anonymous access is revoked. Public RPCs use caller privileges, explicitly verify staff access and are granted only to authenticated and service roles. Trigger-only helpers are security-definer functions in the private schema with an empty search path and no direct public execution grant.

Player, club-share and public-profile paths do not receive the staff evidence ledger, source-run history, gap queue or benchmark-management data.

## Failure behavior

A provider failure returns an understandable provider-action error and `existing_data_changed: false`. Canonical application routes do not depend on provider availability. Career, CV, Market, Brain, Deals and public shares continue to use current DJM records.
