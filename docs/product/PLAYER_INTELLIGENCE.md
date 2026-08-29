# DJM Player Intelligence

DJM uses several separate numbers. They must never be blended into one vague score.

## DJM Player Score

DJM Player Score is a 0 to 100 measure of current demonstrated football level.

It is not readiness, profile completeness, market price, Club Match or transfer probability.

Version 2 is evidence-first. A headline score is not published from league level and minutes alone. DJM needs enough recent playing evidence, a verified competition benchmark and verified position-adjusted performance evidence.

The model uses:

- competition level
- position-adjusted performance against a relevant peer group
- actual role and recent minutes
- senior experience, with old experience heavily discounted
- recent performance trend where two windows are available
- availability where possible-minutes evidence exists
- a modest position-specific age performance adjustment
- evidence coverage, confidence and freshness

Potential remains separate.

## Why age is handled carefully

Age matters, but it must not override what the player is actually doing on the pitch.

Research suggests football performance peaks vary by position, with many outfield players peaking in the mid-to-late twenties and goalkeepers and centre-backs tending to peak later. Physical performance generally declines more clearly after the early thirties, while technical and tactical performance can persist for longer.

DJM therefore uses age as a modest position-specific performance prior, not as a blunt talent deduction.

A 34-year-old who is still producing elite recent performance is penalised much less than a 34-year-old with weak or missing recent evidence.

Potential carries the larger future age effect. Once a player moves beyond the positional peak window, Potential can fall below the current Player Score.

Market price and resale value should remain a separate future model because age affects economic value more strongly than it necessarily affects present football ability.

## Current evidence decay

Old football must not keep a current Player Score artificially high.

Current evidence uses these deterministic weights:

- 0 to 6 months: 1.00
- 7 to 12 months: 0.85
- 13 to 18 months: 0.65
- 19 to 24 months: 0.45
- older than 24 months: 0.00 for current-level evidence

The 24-month window is about when the football was played, not when a source was reviewed.

Resolution order for a career row is:

1. recorded end date
2. recorded start date
3. a parseable season label such as `2025/26`, `25/26` or `2026`
4. otherwise the playing date is unknown and the row does not count toward recent minutes

A source reviewed today does not make a 2021/22 season recent.

## Experience decay

Experience still matters, but old pedigree cannot dominate current level.

Verified career evidence uses weaker long-term weights:

- 0 to 24 months: 1.00
- 25 to 48 months: 0.65
- 49 to 72 months: 0.35
- older than 72 months: 0.15

Experience is also adjusted for the level of the competition where a benchmark exists. Verified senior international appearances can add a small capped experience benefit.

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

The public Opta Analyst methodology page is a reference and reviewed-import source. DJM does not scrape it automatically. Full automation requires licensed access.

## Position-adjusted performance

Raw goals, assists or appearances are not a universal ability model.

Performance evidence must state its peer group and use a percentile or comparable normalized score against relevant players.

The V2 position groups are:

- GK
- CB
- FB_WB
- DM
- CM
- AM
- W
- ST

Performance categories are weighted differently by position. Examples:

- goalkeeper: goalkeeping, possession, progression, aerial command
- centre-back: defending, aerial, progression, possession, physical
- full-back / wing-back: defending, progression, creativity, physical and attacking contribution
- defensive midfield: defending, possession and progression
- central midfield: possession, progression and creativity with defensive contribution
- attacking midfield / winger: creativity, attacking output and progression
- striker: attacking output first, then creativity, aerial and physical contribution

If an authorised source supplies a defensible overall position percentile, DJM can use that directly. Otherwise at least 50 percent of the relevant category weight must be present before a performance score is produced.

Preferred source is licensed Wyscout Data or another authorised provider/export capable of producing position and competition peer comparisons.

## Player Score V2 weights

The maximum component weights are:

- competition level: 30 percent
- position-adjusted performance: 30 percent
- role / minutes: 15 percent
- experience: 10 percent
- recent trend: 10 percent
- availability: 5 percent

Competition level, performance and role are mandatory for a full V2 score.

Optional components are used when evidence exists. The model records exact data coverage. Missing optional evidence is not turned into zero.

## Age performance adjustment

Age adjustment is intentionally capped and position-specific.

The adjustment starts later for goalkeepers and centre-backs than for wide and attacking players. Strong recent performance reduces the adjustment materially.

The purpose is to prevent an old career profile from looking current when evidence is thin while still allowing genuinely high-performing older players to score highly.

## Potential Score V2

Potential is future playing-level upside, not current ability and not transfer probability.

It starts from the current Player Score and applies:

- position-specific age window
- recent performance trend when available

Young players below the positional peak can have upside added. Players beyond the positional peak can have Potential below current level.

## Confidence

Confidence is separate from the score.

It uses:

- model coverage
- volume of recent verified minutes
- benchmark freshness
- confidence of performance evidence
- player verification status

A score of 76 with 95 percent confidence is a stronger statement than a score of 76 with 60 percent confidence.

## Player Score states

- `not_enough_playing_time_data`: fewer than 500 eligible verified senior minutes inside the previous 24 months
- `competition_evidence_required`: enough recent minutes exist but no trustworthy competition can be resolved
- `benchmark_required`: recent minutes and competition are resolved, but no verified competition benchmark exists
- `performance_data_required`: league and minutes evidence are available, but DJM lacks verified position-adjusted performance evidence
- `not_enough_model_coverage`: performance exists but total evidence coverage is still below the minimum publish threshold
- `calculated`: Player Score V2 has enough evidence to publish
- `needs_recalculation`: relevant evidence changed after the last score
- `manual_override`: a separate staff value and reason is effective while the model value remains preserved

## Club Match

Club Match remains a separate contextual fit between one player and one Club Need. It can use Player Score as one input but must still account for role, style, registration, budget, availability, passports, contract situation and hard blockers.

## Market value

Economic market value is not silently mixed into Player Score.

A future DJM Market Value model should use evidence such as:

- Player Score
- age and position-specific resale curve
- verified market value references
- contract expiry and transfer status
- league and club visibility
- recent trajectory
- international status
- comparable transfers
- current market demand

This separation prevents DJM from claiming an older elite player is a worse footballer merely because his resale value is falling.

## Free automated player data

DJM's default zero-cost automated source is API-Football. The free plan is used for broad player identity and season-stat evidence, especially across lower divisions. The full provider stat object is retained where supplied, while missing metrics remain unknown.

Transfermarkt remains a first-class market-value reference. DJM stores the linked Transfermarkt profile plus a structured value, currency and verification timestamp, but does not rely on automated Transfermarkt scraping.

Provider season statistics do not become an invented position percentile. Player Score V2 only uses performance evidence when a defensible peer comparison exists.
