# Intelligence Data Runbook

## Configure licensed Wyscout access

Set these Edge Function secrets in the target environment:

```text
DJM_WYSCOUT_API_ENABLED=true
WYSCOUT_API_USERNAME=<licensed account username>
WYSCOUT_API_PASSWORD=<licensed account password>
```

Do not place real values in source control, browser environment variables or client code. Confirm provider capability in Brain -> Intelligence Data. It should show `Licensed API`. Without all three values it must show `API not configured` and the rest of DJM must continue working.

To disable Wyscout immediately, set `DJM_WYSCOUT_API_ENABLED=false` or remove the flag. No database change is required.

## Diagnose ingestion failure

1. Open Brain -> Intelligence Data -> Run history.
2. Check provider, mode, start and completion time, status, warnings and staff-facing error.
3. Inspect Edge Function logs for structured fields: provider, operation, entity id, run id, duration, result status, HTTP status and retry count.
4. Never paste authorization headers or credentials into a ticket.
5. Confirm `existing_data_changed: false` for a provider preview failure.
6. Retry only when capability is still licensed and the source is healthy.

Wyscout 429 responses receive bounded retries. Repeated failure leaves existing DJM records unchanged.

## Import an authorised CSV or JSON export

1. Open Brain -> Intelligence Data -> Import evidence.
2. Choose the signed player and record the source name and optional source URL.
3. Upload or paste CSV/JSON.
4. Build preview and inspect every row.
5. Confirm blank numeric cells show Unknown, not zero.
6. Create evidence review. This does not update the career record.
7. Open Review and compare Current DJM with Incoming.
8. Select Accept, Reject, Keep current or Review later.

Minimum CSV columns are Season and Club. Supported aliases include Competition/League, Apps/Appearances, Mins/Minutes, Source and URL.

## Review suggestions and conflicts

Accept only when DJM is permitted to use the source and the incoming value is supported. A current value and a different incoming value are shown as a conflict. Accepting updates the season record, records the reviewer and source, creates evidence and canonical-change events, and recalculates Player Score conservatively. Reject and Keep current do not change the canonical record.

## Manage competition benchmarks

1. Open Benchmarks.
2. Enter the canonical competition name and country.
3. Add aliases only for genuine naming variants of the same competition.
4. Enter a strength score only when DJM has a documented basis.
5. Attach a source URL or evidence note.
6. Record the verification date and review cadence.
7. Save.

Changing or removing a benchmark marks affected scorecards stale. It does not invent a replacement score. If no verified benchmark exists, `Not enough benchmark data` is correct.

## Recalculate Player Score

Use Recalculate from the player admin intelligence panel or the gap queue. Confirm the disclosure shows effective, model, manual override, confidence, calculation time, model version, benchmark, minutes and evidence window.

Do not use profile readiness as Player Score. Do not describe Potential as a transfer prediction.

## Verify no unknown value became zero

Run unit tests and manually preview a row with:

```csv
Season,Club,Apps,Starts,Minutes,Goals,Assists
2025/26,Example FC,0,,540,,2
```

Expected preview:

- Apps = 0
- Starts = Unknown
- Minutes = 540
- Goals = Unknown
- Assists = 2

After review, verify null incoming fields did not overwrite a known canonical value.

## Transfermarkt policy

Transfermarkt remains a research reference. Staff can save and open links and record authorised manual values with source and verification date. Automated scraping and automatic refresh buttons are disabled by default. Do not re-enable legacy parsing without a documented licensed integration and a separate reviewed release.
