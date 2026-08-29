# Benchmark Acquisition

## Purpose

DJM Player Score needs a competition-strength input that is globally comparable, traceable and repeatable. Missing benchmark data should remain an integrity safeguard, but it should trigger a resolution workflow rather than leave a well-documented player at a permanent dead end.

## Primary methodology

The preferred methodology is the Opta Power Rankings global 0-100 scale.

Opta describes league strength by averaging the Power Ratings of the clubs in a competition. DJM therefore treats the league-average rating as the preferred division-level benchmark when the data is available through a licensed feed or a reviewed authorised import.

DJM does not substitute top-five or top-ten averages for the full league average.

Reference methodology:

`https://theanalyst.com/articles/strongest-football-leagues-in-the-world-opta-power-rankings`

## Access modes

Benchmark provenance and access permission are separate concepts.

Supported modes are:

- licensed provider feed: automated only when DJM has explicit contractual access
- reviewed authorised import: staff supplies data DJM is entitled to use and records the source
- manual verified source: a documented 0-100 benchmark with a defensible methodology
- unavailable: no score is created

The public Opta Analyst page must not be scraped as a production data source. It can be opened for review and methodology reference. True automated refresh should use licensed Stats Perform / Opta access.

Stats Perform currently documents the Soccer Season Power Rankings feed `TM14` at `/sdapi/v1/soccerdata/seasonpowerrankings`. It exposes current and season-average team Power Ratings globally and by tournament calendar. Once DJM has the relevant licensed API entitlement and OAuth credentials, this is the preferred automation target: request the active tournament calendar, take the current team ratings for all active clubs in that competition, calculate their arithmetic mean, preserve the raw values and provider timestamp, then submit the resulting league benchmark through the same provenance path used by reviewed imports. Polling must respect the rate in DJM's actual Stats Perform contract.

ClubElo or any other provider must not be automated merely because a technical endpoint is accessible. DJM needs explicit permission or licensing before making it a production ingestion source.

Wyscout remains useful for player and competition identity. DJM must not claim Wyscout supplies a global league-strength metric unless the actual licensed contract exposes such a field.

## Competition resolution

The scoring engine resolves competition identity before looking for a benchmark.

Priority:

1. canonical current competition
2. usable current league text matched to a canonical competition or alias
3. most recent verified senior competition inside the Player Score evidence window

The third path exists for free agents, unattached players and incomplete current-club records. It is always labelled as a historical level basis, never a current-club claim.

Rows without explicit start/end dates use a parseable season label to estimate the playing date. The source review timestamp is never used as the playing date.

## Benchmark record

A benchmark stores:

- canonical competition
- effective integer strength score
- raw strength value
- raw scale
- provider / reviewed source
- benchmark metric
- methodology
- methodology version
- source reference
- source URL
- source note
- observed date
- verified date
- next review date
- reviewer

The Player Score basis snapshots these values so later benchmark changes do not make historical calculations inexplicable.

## Freshness

V1 treats an Opta-style reviewed benchmark as:

- Fresh: first 30 days
- Aging: day 31 through the review date
- Stale: after the review date

The reviewed-import workflow caps the review cadence at 90 days. A licensed future provider may refresh more frequently.

## Failure states

`not_enough_playing_time_data` means recent playing evidence is insufficient.

`competition_evidence_required` means enough recent minutes exist but no defensible competition can be resolved.

`benchmark_required` means the competition is resolved and benchmark acquisition is the remaining model blocker.

The Benchmark Acquisition screen shows those benchmark gaps and lets staff import verified data with source provenance.

## No seed scores

The migration creates no benchmark rows. It does not infer league strength from country, tier, name, reputation, Transfermarkt value or model knowledge.

A competition score exists only after source-backed evidence is supplied.
