# Free Player Data Sync

## Decision

DJM uses API-Football as the default zero-cost automated football-stat provider.

The reason is coverage economics: its free plan includes every competition and endpoint in its catalogue with a 100 request/day quota. As of 29 August 2026 the provider lists 1,241 leagues and cups. The free plan limits available seasons, so DJM treats historical depth as opportunistic rather than guaranteed.

Sportmonks has broader total coverage, but its forever-free plan exposes only two leagues. That does not fit an agency whose players are spread across lower divisions and multiple countries.

SofaScore may expose public JSON used by its own website, but DJM does not make an undocumented interface a production dependency.

## One-click workflow

On the player profile staff sees `Refresh player data`.

The Edge Function:

1. authenticates DJM admin access;
2. reads the player name, date of birth, nationality and current club;
3. reuses a cached API-Football player ID when available;
4. otherwise resolves the player using name plus identity evidence;
5. requests at most the current and previous relevant season;
6. stores apps, starts, minutes, goals and assists in the canonical season record;
7. stores the full available provider metric object for future scoring and scouting intelligence;
8. fills only blank master-profile fields;
9. never overwrites an already reviewed season from another source;
10. recalculates Player Score when the scoring RPC is available.

A conflict leaves DJM's current reviewed record untouched.

## Quota discipline

The free plan is 100 requests/day. DJM therefore does not crawl whole leagues on each click. Player IDs are cached in `players.football_provider_ids`, and a normal repeat refresh should require roughly one request per available season.

## Transfermarkt

Transfermarkt remains a first-class player reference and market-value source, but not an automated scraper.

The profile stores:

- Transfermarkt URL
- structured market value
- currency
- DJM verification timestamp

This keeps the market value usable by future market-value modelling while staying separate from Player Score.

## Scoring

API-Football raw metrics are evidence inputs. They are not automatically converted into a fake percentile. Player Score V2 still requires defensible position-adjusted performance evidence. A later league peer-cache can turn provider metrics into true within-league position percentiles without changing this sync workflow.
