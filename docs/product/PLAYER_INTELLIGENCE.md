# DJM Player Intelligence

DJM uses several separate numbers. They must never be blended into one vague score.

## DJM Player Score

A 0 to 100 current-football-level measure. It is not readiness, profile completeness, Club Match or transfer probability.

Version 1 is intentionally conservative. A model score is not produced until the player has at least 500 recorded senior minutes in the previous 24 months and the current competition has a verified DJM league benchmark. No league benchmark is invented automatically.

The stored scorecard contains the model value, optional manual override, model version, confidence, calculation time and basis. A manual override requires a reason and does not destroy the model value.

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
