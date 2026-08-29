# Player Score V2 Architecture

## Objective

Produce a defensible current football-level score that gets more accurate as DJM adds licensed or reviewed evidence.

The model is deterministic and explainable. It is not a black-box AI talent rating.

## Required evidence

A full score needs all three core inputs:

1. at least 500 verified senior minutes in the prior 24 months
2. a resolved competition with a verified level benchmark
3. verified position-adjusted performance evidence

League plus minutes alone is not enough.

## Components

| Component | Maximum weight | Purpose |
| --- | ---: | --- |
| Competition level | 30 | Strength of current or valid recent playing environment |
| Position performance | 30 | How the player performs against relevant positional peers |
| Role / minutes | 15 | Whether the player is actually trusted to play |
| Experience | 10 | Level-adjusted senior career exposure with strong recency decay |
| Recent trend | 10 | Direction of performance between recent evidence windows |
| Availability | 5 | Share of possible minutes when defensible data exists |

Missing optional components remain null and reduce data coverage.

## Recency

Current evidence weights:

- <= 180 days: 1.00
- <= 365 days: 0.85
- <= 548 days: 0.65
- <= 730 days: 0.45
- older: 0

Experience weights:

- <= 730 days: 1.00
- <= 1460 days: 0.65
- <= 2190 days: 0.35
- older: 0.15

This means a strong season from five years ago can still prove career experience but cannot act like current form.

## Position performance

`djm_os.player_performance_snapshots` stores verified peer-relative evidence.

A snapshot records:

- player
- competition
- season
- position group
- evidence date
- minutes / starts / appearances
- possible minutes when known
- overall percentile or category percentiles
- peer-group description
- provider and source
- observed and verified timestamps
- confidence
- raw metrics / metadata for audit

The source must describe the peer group. For example:

`Wingers, 2026 A-League Men, minimum 450 minutes`

An 80th percentile performance means something only when the comparison population is known.

## Position baskets

V2 category weights are defined in `lib/player-score-v2.ts` and mirrored in the database function.

The model can use an authorised overall position percentile directly. Otherwise at least 50 percent of that position's category weight must be available.

## Role score

Role uses recency-weighted minutes plus starter share when starts and appearances are available.

Recent minutes carry more weight than older minutes in the 24-month window.

## Experience

Experience uses senior minutes adjusted by:

- age of evidence
- competition benchmark where available
- a capped senior international appearance benefit

No benchmark means the career row cannot contribute a fabricated level adjustment.

## Age

Age is a modest current-performance prior, not a market-price formula.

Peak-end assumptions vary by position and are intentionally conservative. The maximum current-score age deduction is capped at six points. Recent strong performance reduces the deduction.

This avoids two errors:

1. treating a 35-year-old as elite because of football from five years ago
2. treating a 35-year-old who is still producing elite current evidence as automatically poor

Potential applies a larger age effect because it describes future upside.

## Market value separation

Player Score describes current football level.

Economic value should be modelled separately. Age has a much stronger effect on resale value than on current football ability, so mixing market value into Player Score would make the headline number less truthful.

## Sources

Competition level is designed around globally comparable 0-100 team/league strength where DJM has permitted data access. Opta Power Rankings are the preferred reference methodology and licensed Stats Perform Power Rankings are the preferred automation target.

Position performance is designed for licensed Wyscout Data or another authorised provider/export. Wyscout markets more than 150 match/season metrics in its Stats Pack and API-based integration for recruitment and performance analysis.

## Failure behaviour

The model does not publish a fake number to avoid a blank state.

Missing benchmark creates `benchmark_required`.
Missing performance creates `performance_data_required`.
Missing competition creates `competition_evidence_required`.
Insufficient recent minutes creates `not_enough_playing_time_data`.

Each state should lead to an acquisition action.

## Research references used for V2 design

- Opta Power Rankings methodology: https://theanalyst.com/articles/power-rankings-your-club-ranked
- Opta league-strength application: https://theanalyst.com/articles/strongest-football-leagues-in-the-world-opta-power-rankings
- Hudl Wyscout Data: https://www.wyscout-apps.hudl.com/products/wyscout/data-api
- Hudl Wyscout football API: https://www.hudl.com/products/wyscout/football-api
- Age and physical performance in elite football: https://pmc.ncbi.nlm.nih.gov/articles/PMC12551122/
- Position-sensitive peak-age evidence: https://pmc.ncbi.nlm.nih.gov/articles/PMC8182689/
- Age and market-value evidence: https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2019.00076/full
