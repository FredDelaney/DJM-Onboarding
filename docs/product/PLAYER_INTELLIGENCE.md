# DJM Player Intelligence

DJM uses several separate numbers. They must never be blended into one vague score.

## DJM Player Score

A 0 to 100 current-football-level measure. It is not readiness, profile completeness, Club Match or transfer probability.

Version 1 remains deliberately conservative. A model score is produced only when the player has at least 500 verified senior minutes with defensible playing dates in the previous 24 months and DJM has a verified competition-strength benchmark. No benchmark is invented automatically.

The stored scorecard contains the model value, optional manual override, model version, confidence, calculation time and full basis. A manual override requires a reason and does not destroy the model value.

## Playing-time evidence window

The 24-month window is about when the football was played, not when a source was reviewed.

Resolution order for a career row is:

1. recorded end date
2. recorded start date
3. a parseable season label such as `2025/26`, `25/26` or `2026`
4. otherwise the playing date is unknown and the row does not count toward recent minutes

A source reviewed today does not make a 2021/22 season recent.

## Competition resolution

Competition identity is resolved before benchmark lookup.

Priority is:

1. verified current competition ID
2. usable current league identity
3. for an unattached or unresolved player, the most recent verified senior competition inside the valid evidence window

Using a previous competition for an unattached player is explicitly labelled `most_recent_verified_competition`. It is a level basis only and must never imply the player is currently contracted there.

If recent minutes exist but no trustworthy competition can be resolved, the score status is `competition_evidence_required`.

## Competition benchmark acquisition

A missing benchmark is an acquisition task rather than the desired end state.

Preferred hierarchy:

1. licensed Opta / Stats Perform Power Ranking data where DJM has contractual access
2. a DJM-reviewed authorised import based on the Opta league-average Power Ranking methodology
3. another explicitly licensed global competition-strength provider
4. a documented DJM-reviewed 0-100 source with clear methodology

Opta Power Rankings use a global 0-100 team scale. The preferred league measure is the mean rating of all active clubs in the competition. Top-five or top-ten averages are not interchangeable with league-average strength.

The public Opta Analyst methodology page is a reference and reviewed-import source. DJM does not scrape it automatically. Full automation requires licensed access. Stats Perform's documented Soccer Season Power Rankings feed (`TM14`) is the preferred future automation target because it provides globally comparable team Power Ratings by tournament calendar.

Each benchmark snapshots raw value, effective rounded value, provider, metric, methodology, source URL, observed date, verification date and next review date.

For reviewed Opta-style benchmarks, V1 uses a maximum 90-day review cadence. Historical Player Scores preserve the benchmark snapshot used at calculation time.

## Player Score states

- `not_enough_playing_time_data`: fewer than 500 eligible verified senior minutes are supported inside the previous 24 months
- `competition_evidence_required`: enough recent minutes exist but DJM cannot resolve a trustworthy current or recent senior competition
- `benchmark_required`: enough recent minutes and a competition are resolved, but no verified competition benchmark exists
- `calculated`: the deterministic V1 model has both required inputs
- `needs_recalculation`: relevant career, competition or benchmark evidence changed
- `manual_override`: a separately stored staff value and reason is effective while the model value remains preserved

`benchmark_required` should be actionable. The UI links staff directly to Benchmark Acquisition and identifies the competition and recommended source.

## Model V1

Current Score remains:

- 75 percent verified competition benchmark
- 25 percent recent playing-time signal

This weighting is transparent and deterministic. It is not an AI talent rating.

## Potential Score

A separate future-upside indicator. Version 1 is provisional and uses transparent age headroom only after a current Player Score can be calculated. It must not be described as a transfer prediction.

## Club Match

A contextual 0 to 100 fit between one player and one Club Need. It may use football, commercial, registration, career, availability and access evidence. Hard blockers, concerns and missing information must stay visible.

Recommended language:

- 85 to 100: Excellent fit
- 70 to 84: Strong fit
- 50 to 69: Possible fit
- Below 50: Weak fit
- Missing usable evidence: Insufficient evidence

## Predicted Club Need

A likelihood attached to a predicted requirement. The percentage needs documented evidence in `prediction_basis`. Confirmed requirements remain distinct from predicted requirements.

## Opportunity Probability

An estimate of a defined deal outcome. The model probability, manual override, effective probability and basis are stored separately. A manual override should capture the human reason.

## Data flywheel

Normal DJM work should improve future intelligence. Useful events include requirements, matches, pitches, pitch opens, replies, interest, trials, negotiations, offers, wins, losses and recorded reasons. The platform must collect these outcomes without adding unnecessary admin work.

## Evidence operating contract

External provider data is evidence before it is DJM truth. A provider preview cannot directly overwrite a player, career entry or score. Staff sees the current value, incoming value, source, observed date, confidence and freshness, then chooses Accept, Reject, Keep current or Review later.

Authorised CSV and JSON exports are first-class sources. Blank numeric cells remain `null`; an explicit zero remains zero. Accepted season evidence records the reviewer and review time before the Player Score is recalculated.

Competition identity is separate from strength. Aliases and provider identifiers can map to one canonical competition without creating a benchmark.
