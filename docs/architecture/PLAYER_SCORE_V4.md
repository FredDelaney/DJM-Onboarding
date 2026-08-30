# DJM Player Score V4

## Purpose

DJM Player Score V4 is an evidence-regression layer for provisional player ratings. It exists to stop thin or incomplete evidence from producing a number that looks more certain than the underlying data justifies.

V4 does not replace the existing Full Player Score calculation. The V2 Full Score remains the full-evidence model and the V3 layer remains responsible for benchmark auto-resolution. V4 wraps those systems and changes only the provisional decision path.

## Core principle

A missing football signal is unknown, not average.

V3 used a neutral value of 50 for missing provisional components. That avoided inventing positive or negative performance, but it still allowed missing data to influence the final arithmetic. V4 removes that behaviour.

Only observed components enter the provisional numerator and denominator. The resulting observed estimate is then regressed towards a neutral prior of 50 according to the amount and reliability of the available evidence.

## Provisional component weights

The maximum provisional evidence weights are:

- Position-adjusted performance: 40
- Competition level: 20
- Role and recent minutes: 20
- Benchmarked experience: 10
- Recent trend: 5
- Availability: 5

The weights total 100 when every component is present.

Performance carries the largest single weight because a Player Score should primarily describe demonstrated football level rather than the strength of the league in which the player happens to appear.

## Minimum publication gate

A provisional number is not published unless all of the following are true:

- at least 500 verified senior minutes exist inside the current evidence window;
- a competition level score is resolved;
- a role/minutes score exists; and
- at least 40 points of provisional component weight are actually observed.

If those conditions are not met, the score remains unavailable.

## Evidence regression

First calculate the weighted average of observed components only.

Then calculate recent-minute reliability:

`minutes_reliability = min(1, sqrt(recent_minutes / 1800))`

Then calculate the regression factor:

`regression_factor = min(0.85, observed_coverage * (0.55 + 0.45 * minutes_reliability))`

where observed coverage is expressed from 0 to 1.

Finally:

`provisional_score = 50 + (raw_observed_score - 50) * regression_factor`

This means an extreme observed score cannot remain extreme when it is supported by only a small amount of evidence. As coverage and minutes improve, the provisional estimate is allowed to move further away from the prior.

## Confidence

Confidence is separate from the score.

V4 confidence:

- can never exceed observed component coverage;
- is capped at 50% when position-adjusted performance evidence is missing;
- is capped at 72% for any provisional score, even when performance is present;
- increases with recent-minute reliability;
- receives a small bonus for fresh benchmark evidence;
- receives a small bonus when the player record is verified.

A Full Score remains the preferred cross-player comparison measure.

## Model separation

V4 preserves these distinctions:

- `model_score`: Full Score only.
- `provisional_score`: V4 evidence-regressed estimate only.
- `manual_score`: explicit DJM human override only.

A provisional value must never overwrite `model_score`.

## Source independence

V4 does not score providers differently. Provider integrations populate canonical reviewed evidence. The score consumes the canonical score basis after the normal DJM verification and benchmark process.

This avoids a player receiving a different score merely because the same underlying fact arrived from a different authorised provider.

## Audit fields

The V4 provisional basis records:

- component weights;
- observed component coverage;
- raw observed score;
- regression prior;
- recent-minute reliability;
- regression factor;
- whether position-adjusted performance was present;
- missing inputs;
- confidence rule; and
- comparison rule.

These fields are intended to make every provisional number explainable to DJM staff.

## Initial production shadow result

Before applying V4, the live Simon Lindholm scorecard was evaluated with the V4 formula without writing any production data.

- V3: 52 provisional, 58% confidence
- V4 shadow: 51 provisional, 50% confidence
- Observed provisional coverage: 55%
- Regression factor: 0.512

That result is desirable. The underlying estimate remains similar while V4 correctly reduces the certainty attached to it.
