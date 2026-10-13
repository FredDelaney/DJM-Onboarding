# Home review clarity recovery

The phone recording exposed two unrelated player reminders grouped as copies because their titles matched. Dylan and James both had a career statistics review flag. The Home action created a task instead of opening the review, and mobile CSS hid action labels.

## Result

- Task grouping now includes player, contact, organisation, club need, interaction, owner and task type. Matching titles alone cannot create a duplicate group.
- Home shows the actual review reason and opens the specific player profile. A redundant reminder card is hidden while that player's review flag is visible; the task record is retained.
- After the review, an existing single reminder remains available with an explicit confirmed completion action.
- Player verification shows the review reason and current recorded statistics before human confirmation.
- Capture questions open their original capture. Similar reminders use plain language and link to the relevant working area.
- Home action labels remain readable on mobile and tablet widths.

## Verification

All 1,461 tests pass. Database regression tests execute the complete migration and cover player/contact grouping, matching-context copies, owner/tenant boundaries and review-only preparation. Browser checks cover Home at 320, 390, 430 and 768 pixels, actual player verification, reminder review, confirmation recovery and existing calendar flows across 12 viewports. TypeScript and production build pass. Stale development route types from temporary browser fixtures were removed before the release check.

The staging migration compiled after removal of an accidentally copied unrelated SQL block. Staging's older interactions table lacks production's player_id field, preventing a full personal-feed rehearsal. Its previous personal function was restored in a staging-only migration; shared and personal feeds both read successfully afterward. Production function bodies were checked against the exact local baseline before deployment. The new personal function is exercised in PGlite with the production schema fields.

## Release

Production database migration 20261005123654_home_review_context is applied. Live shared and personal feeds return Dylan and James as separate single reminders. Player review preparation returns review_player_record, review_only and executable=false in a rolled-back transaction. No live task was completed and no player was verified.

The feature patch is based on local content snapshot 35fea2a, corresponding to the previously merged release. Apply the patch to canonical main; do not push the local snapshot history. GitHub writes are unavailable in this session, so the frontend requires the user's manual PR and merge. The additive database migration changes three functions only and performs no task completion or player verification.

Manual workflow after uploading home-review-clarity.patch into the repository root:

```sh
git switch main
git pull --ff-only
git switch -c fix/home-review-clarity
git apply --check home-review-clarity.patch
git apply --index home-review-clarity.patch
npm run check
git commit -m "Clarify Home player reviews and separate unrelated reminders"
git push -u origin fix/home-review-clarity
```

Create and merge the PR, then confirm the production deployment is Ready. On the phone, refresh Home, open Review player data, check the statistics and confirm only if accurate. A reminder's completion is separate from verification of player facts.
