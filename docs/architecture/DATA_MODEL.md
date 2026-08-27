# Data model

The existing `public` player platform and `djm_os` agency domain remain canonical. Additions are additive and map to existing entities instead of creating a parallel CRM.

Foundations: users/roles; players and private records; people/organisations/employments; relationships/interactions; claims/sources; club needs/matches; opportunities/deals; tasks/suggestions/reviews; evidence/documents; share snapshots; events/audit; integration cursors.

Material claims carry truth state, source, visibility, captured/source/verified dates, reviewer and freshness. Entity relationships stay in Postgres with typed edges and foreign keys; no graph database is justified at current scale.
