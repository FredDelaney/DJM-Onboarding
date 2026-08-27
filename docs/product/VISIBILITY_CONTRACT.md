# Visibility contract

Every material field, event, claim, document and suggestion has one visibility level.

| Level | Intended audience |
| --- | --- |
| `player_private` | The player and specifically authorised DJM staff |
| `djm_internal` | Authorised DJM staff within role/scope |
| `club_shareable` | Eligible for an approved Decision Room snapshot, not automatically public |
| `explicit_collaboration` | Intentionally shared for one decision, recipient and time window |

Players never automatically receive club targets, views, speculative interest, internal stages, notes, rejection intelligence, negotiation positions, relationship intelligence, scouting grades, matching logic, commissions or forecasts.

Clubs never receive private goals, wellbeing/medical data, readiness, internal notes, other club activity, negotiations, commission data, private documents or unsourced claims.

Controls must exist in RLS/RPCs, application DTOs, PDFs, exports, notifications and AI retrieval. Tests cover allow and deny cases.
