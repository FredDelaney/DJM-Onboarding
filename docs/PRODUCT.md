# Product principles

## Player experience

DJM Player should feel like a private career app, not a CRM exposed to a footballer.

The player should understand the product in seconds:

- What does DJM need from me?
- Has anything changed this week?
- Is my information current?
- How do I message DJM?

The primary navigation is intentionally limited to Home, Inbox, Check-in and Profile. Documents and club-profile preview are contextual secondary actions.

## Admin experience

Admin is the operating layer behind the simple player app. One player record is the source of truth for football data, private representation information, check-ins, requests, opportunities, documents, agreements, verification and the club dossier.

## Club experience

The club dossier is a recruitment product, not a copy of the player portal. It includes only information intentionally approved for sharing and can be distributed through tracked expiring links.

## External data

The intended workflow is:

`source refresh -> detected changes -> DJM review -> approve/reject -> master profile`

No provider may silently overwrite the player record. Transfermarkt links are verification references only unless a permitted data-access agreement exists. Official/licensed APIs such as Wyscout can be connected later.
