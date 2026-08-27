# Event model

Operational tables remain current truth. `djm_os.events` is append-oriented history for audit, workflow triggers, analytics and learning.

Events include actor, entity, type, occurred/captured time, source, visibility, before/after, metadata and optional causation/correlation IDs. Sensitive event rows are team-scoped; player service receives a separate deliberately player-visible ledger.

Jobs and handlers must be idempotent and retry-safe. Events never bypass approval requirements.
