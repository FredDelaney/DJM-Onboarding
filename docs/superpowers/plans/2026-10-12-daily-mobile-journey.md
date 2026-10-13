# Daily mobile journey and record consistency

Approved scope: improve the existing DJM and ReDream platforms, preserve their permissions and football value, finish the full plan and release both sites. The user has explicitly authorised production deployment.

## 1. A simple mobile workspace

Use five stable controls: Today, Search, Tell ReDream, People and More. People contains Players, Clubs and Contacts. More contains Calendar, Recruitment and the additional work areas permitted by the user's role, plus Connections and Settings. Keep desktop navigation and all direct URLs working.

Verify same-view Clubs/Contacts switching, keyboard search, More dismissal and focus return, safe-area spacing and capture continuity when a phone changes orientation.

## 2. Consistent records

Player, club, contact and opportunity records present identity, next action, relevant recorded activity and supporting detail in that order. Expose the existing edit forms clearly where the user's role and record access permit editing. Keep scores separate and do not infer missing information.

Keep capture tied to the current route and selected record. Return links must retain the source query and stay within the current workspace. Resolve names using existing tenant-bound server context; do not carry stale record IDs across navigation.

## 3. A shared visual foundation

Consolidate the ten final global override sheets into one ordered product stylesheet, retaining their exact cascade order. Use the common spacing, reading sizes, surfaces and blue action colour for new shared components. Preserve the earlier football and product styles, pitch visual and graphs.

Verify the production CSS build across existing pages and subpages. Do not rely only on development styling.

## 4. A complete, verified working journey

Exercise capture review, explicit approval, the saved linked record, the follow-up in Calendar with its owner and due date, and completion from Today. Opening or cancelling completion must not write anything; confirmation must complete exactly once. Proposed changes must never appear as saved links.

Run all source tests, type checks, a production build and the existing complete browser journey suite. Include phone, tablet and desktop layouts, keyboard use, loading, retry and recovery. Upload the broad visual review as a CI artifact. Obtain a fresh read-only whole-change review, fix important findings and verify the final commit before merging.

## 5. Release and acceptance

Merge only after the exact PR head passes the required checks. Verify that both production projects deploy the merged commit, are ready and serve their production aliases. Check public routes and recent runtime errors.

Perform acceptance against authenticated DJM records and a physical iPhone when those environments are available. Chromium fixture tests are synthetic data and emulated viewports. They do not prove physical iPhone or real-record acceptance. Do not delay independent implementation and release while access is unavailable, and do not claim these acceptance checks are complete without evidence.
