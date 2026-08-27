# Product principles

## Player experience

DJM Player should feel like a private career app, not a CRM exposed to a footballer.

The player should understand the product in seconds:

- What does DJM need from me?
- Has anything changed this week?
- Is my information current?
- How do I message DJM?

The primary navigation is intentionally limited to Today, Career, Check-in, DJM and Me. Documents, footage and the club-profile preview remain contextual actions inside the player's career workflow.

`/home` is a weekly command centre, not a passive dashboard. It turns DJM requests, the latest check-in and gaps in the player's opportunity pack into a short, prioritised plan. The first screen should always answer: what is the most valuable thing I can do next?

`/career` is the player's private professional workspace. It connects:

- opportunity readiness and the evidence behind it;
- contract, mobility and availability context;
- footage, documents and the published club profile;
- a source-aware career timeline;
- player-visible representation information; and
- practical playbooks that end in a real DJM workflow.

The readiness score measures preparation and opportunity readiness only. It is never a rating of talent, form, selection quality or transfer value. Unknown information stays unknown rather than being converted to zero.

## Admin experience

Admin is the operating layer behind the simple player app. One player record is the source of truth for football data, private representation information, check-ins, requests, opportunities, documents, agreements, verification and the club dossier.

## Club experience

The club dossier is a recruitment product, not a copy of the player portal. It includes only information intentionally approved for sharing and can be distributed through tracked expiring links.

## External data

The intended workflow is:

`source refresh -> detected changes -> DJM review -> approve/reject -> master profile`

No provider may silently overwrite the player record. Transfermarkt links are verification references only unless a permitted data-access agreement exists. Official/licensed APIs such as Wyscout can be connected later.
