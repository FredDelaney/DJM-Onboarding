# DJM Player Score V5

## Purpose

DJM Player Score V5 estimates a player's current demonstrated football level while making the strength, age and completeness of the supporting evidence explicit.

V5 is designed to avoid false precision. Missing evidence is not silently replaced with an average value, a thin career history is not treated as proof of weak experience, and provisional estimates are deliberately pulled towards a neutral prior when the evidence base is incomplete.

## Score states

V5 has four display states:

1. Full Score
   - Requires strong recent role evidence.
   - Requires a defensible competition benchmark.
   - Requires current verified position-adjusted performance evidence.
   - Requires sufficient effective evidence mass.

2. Performance-backed Provisional
   - Includes position-adjusted performance evidence, but evidence quality or total evidence mass is below the Full threshold.
   - Remains explicitly provisional.

3. Context-only Provisional
   - Used only when current competition and role evidence are strong enough but deep performance evidence is unavailable.
   - Uses stronger shrinkage towards 50 and a lower confidence ceiling.

4. Unavailable
   - The minimum evidence gate is not met.
   - V5 does not manufacture a score.

A manual DJM override remains a separate judgement layer and never becomes model evidence.

## Canonical dimensions

The underlying football dimensions remain aligned with the established DJM model:

- Competition level: 30
- Position-adjusted performance: 30
- Role and minutes: 15
- Experience: 10
- Trend: 10
- Availability: 5

These are base dimensions, not guaranteed effective weights. V5 multiplies each observed component by an evidence-quality factor before it can influence the score.

## Evidence quality

V5 treats score magnitude and evidence strength as separate concepts.

Examples:

- A league benchmark can be present but weak, old or sourced from a lower-quality benchmark provider.
- A performance snapshot can exist but have a small sample or lower provider confidence.
- Career history can contain only one reviewed season, which is evidence of that season but not evidence that the player has little career experience.
- Recent minutes can be present but old enough to deserve less influence on a current-level estimate.

This prevents weak evidence from receiving the same scoring influence as strong evidence merely because both fields are non-null.

## Continuous recency

Current-level evidence uses continuous exponential decay rather than abrupt month buckets.

The default current-evidence half-life is 365 days with a 730-day hard horizon.

A piece of evidence therefore becomes gradually less influential with age rather than suddenly changing weight at a six-month boundary.

For a current-club live-season career row, V5 may use the latest defensible reviewed or synchronised source date as the evidence-as-of date. Historical seasons remain historically dated.

## Incomplete career history protection

Experience is particularly vulnerable to incomplete data.

V5 calculates an experience-history quality factor using the amount and breadth of reviewed career evidence. If the history is too thin, experience is treated as unknown and its scoring influence is removed.

This prevents a player with only one imported season from being penalised as if that single season represented the player's entire senior career.

## Prior and shrinkage

V5 uses a neutral prior score of 50.

The prior is strongest for context-only provisional estimates and weaker as high-quality evidence accumulates.

Conceptually:

`posterior score = (neutral prior mass + quality-weighted football evidence) / total information mass`

This is an evidence-regularisation mechanism, not a claim that player ability is statistically distributed around 50.

## Confidence

V5 confidence means evidence strength only.

It is not:

- the probability that the score is correct,
- the probability that the player succeeds,
- a transfer probability,
- a scouting certainty percentage.

Context-only provisional confidence has a lower ceiling than performance-backed provisional confidence, which in turn remains below a strong Full Score.

## Evidence band

V5 can display a low-to-high evidence band around the central score.

This band widens when:

- evidence strength is lower,
- effective evidence mass is lower,
- important inputs are missing,
- observed components disagree materially.

The band is explicitly a heuristic evidence band, not a statistical confidence interval.

## Full versus Provisional

A provisional score must never populate `model_score`.

- Full Score uses `model_score`.
- Provisional uses `provisional_score`.
- Manual override uses `manual_score`.

This distinction is part of the model contract and should remain visible in the UI and exports.

## Auditability and reproducibility

Each V5 calculation stores an input fingerprint derived from the score-driving evidence state.

The score basis also records items including:

- model version,
- component qualities,
- effective component weights,
- evidence grade,
- prior strength,
- posterior information,
- missing inputs,
- evidence band,
- benchmark quality,
- current evidence dates.

The fingerprint makes it possible to determine whether two apparently identical scores were calculated from the same evidence state.

## Staleness

V5 installs targeted score-staleness triggers for score-driving evidence changes.

Changes to relevant career evidence, performance evidence, player identity or current context, and league benchmarks mark affected V5 scorecards stale rather than leaving an old score looking authoritative.

Staleness and recalculation are deliberately separate. A source change invalidates the old calculation immediately; normal application workflows can then recalculate through the authorised scorer.

## Source independence

The scoring layer operates on canonical reviewed evidence rather than awarding points because a particular provider supplied the data.

Provider identity may affect evidence quality when the source has a defensible quality model, but the same underlying football fact should not receive a different football score merely because it arrived through a different ingestion route.

## Simon Lindholm shadow case

During V5 design, the current Simon Lindholm evidence was used as a shadow fixture.

The important behaviour was not to force a different central estimate. The V5 fixture kept the central score near the existing result while reducing confidence because deep position-adjusted performance evidence was missing and the recorded career history was thin.

The contract test currently expects approximately:

- V5 central score: 52
- evidence confidence: 42
- evidence state: context-only provisional

This fixture is a regression guard, not a permanent truth about the player. As new reviewed evidence is added, the score must be recalculated from that evidence.

## Deployment principle

The database implementation is the model source of truth and must live in repository migrations.

Do not maintain a production-only scorer that is absent from GitHub. The V5 migration preserves the pre-V5 runtime scorer for rollback/forensics, then defines the complete V5 scoring layer in source control.

Before production activation:

1. Run the repository test suite.
2. Run the V5 shadow audit.
3. Run the integrity audit.
4. Apply the migration through the normal Supabase migration path.
5. Recalculate one known player first.
6. Inspect score tier, basis, evidence grade, fingerprint and event output.
7. Only then recalculate additional players.
