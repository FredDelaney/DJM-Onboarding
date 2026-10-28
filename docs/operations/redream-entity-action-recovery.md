# Shared record action recovery

Programme: OPS-03-B / UX-03 / UX-04 / UX-05. Local implementation and validation are complete; final CI and the new hosted frontend remain acceptance gates. This is not whole-programme or production acceptance.

## Problem and reused implementation

The existing management menu treated a fulfilled RPC as a successful edit/archive/deletion, even for an empty or wrong-record response. Generic writes, deletion previews and post-save refresh callbacks could wait indefinitely. An old response or refresh could also outlive its selected record or account.

The new rendered regression fails the preceding implementation: an empty acknowledgement calls the completed-change refresh once when zero calls are permitted. Existing canonical writers and the [staged entrypoint repair](redream-entity-management-entrypoints.md) are reused. No parallel writer, form system, dependency, schema, policy, grant or Supabase configuration is added.

## Behaviour

- Edit/archive/delete use the existing 12-second write deadline, cancellation signal and synchronous admission lock. Only the exact record ID/type and actual action result confirm a change; club-request edits additionally retain brief version 1 and the existing expected-version writer. Empty, malformed, wrong-record and wrong-kind responses remain unconfirmed.
- Known transaction-aborting permission/validation/constraint errors permit correcting the retained draft. Connection failures, missing acknowledgements and timeouts preserve uncertainty, block blind resubmission and explain that the original change may still finish. Permission, duplicate and unavailable-action errors avoid internal function/constraint names.
- The uncertain edit shows its retained changed fields in a keyboard-accessible disclosure. Closing requires the existing discard confirmation; explicit Reload states that the latest details replace this draft. Reload only invokes the existing detail/list read path, never the original write or an archive/delete completion callback.
- Confirmed changes remain visibly saved if refresh fails or exceeds its own 12-second deadline. Refresh list repeats only the existing projection callback. Delayed callbacks cannot later close a successor panel; permitted callbacks receive cancellation and check it before updating detail/closing the record.
- Deletion preview is bounded, checks the exact response identity/shape and offers a read-only Retry. A failed or mismatched read cannot imply no dependencies or enable deletion. Protected records show clear archive guidance rather than incorrectly telling an already authorised owner that they are not an owner.
- Record/account keys, owned lifetime cancellation and request generations dispose old drafts/results. Global club/deal detail keys include the existing account/tenant scope. Focus returns only to a connected opener when the same lifetime remains and another modal or active control has not taken focus. Overlay leases, pending locks, archive/delete confirmations and tenant/role authority remain intact.
- The shared read-deadline helper gains optional cancellation with timer/listener cleanup. Existing two-argument callers retain their behaviour; an already-cancelled read observes any late rejection without leaking an unhandled error.

## Validation

- Full milestone `npm run check`: **2,232 tests**, every TypeScript project, production build and initial workspace budget pass. Final disclosure/error-copy refinements pass **30 focused contracts**, the complete targeted rendered journey, all TypeScript projects and build/budget again. Final initial workspace gzip: **146,239 / 150,000 bytes**. No new dependency.
- Existing club/contact/deal record journeys pass. The extended existing record browser suite covers exact/empty/wrong acknowledgements, failed-refresh saved state, double activation, correctable denial, all three stalled writes, read-only recovery, failed/stalled/mismatched previews, protected deletion, late old account/record/mount results, late preview and callback completion, and 320/390/768/1440 layout, touch targets and opener/scroll restoration.
- The existing club-request editor journey passes all four widths, including failed-edit retention, optional grouped fields, exact changed-field submission, source selection and the bounded uncertain-write/read-only reload path. Its fixture now returns the actual canonical ID/type in versioned acknowledgements and supplies the actual transaction error code; the production writer is unchanged.
- Phone and desktop recovery output is inspected. Evidence: `/tmp/redream-platform-programme/entity-actions-*.log` and `/tmp/redream-platform-programme/entity-actions/`. The controlled local RPC fixtures establish UI behaviour, not actual signed-in backend/device/provider acceptance or human productivity measurements. Earlier actual-role database and immutable bundle evidence remains in the entrypoint/club-request manifests and is not redundantly rerun.

## Rollout and remaining gates

This increment requires no additional backend migration or Edge deployment. The prior staging-only entrypoint and club-request migration chains remain required; do not replay them or the excluded `20260930142119_restore_redream_relationship_person_entrypoint.sql`.

Preceding 791bb67 CI 40774528544 passes verify and reaches a late mobile journey before failing at an obsolete unowned receipt-resume fixture. Both resume seeds now receive the actual signed-in fixture actor; no production capture permission or behaviour changes. The targeted production-mode owner Home/mobile capture, follow-up and confirmation journey passes at 320/390, with the existing CSP/PDF-download check. Publish this correction and recovery increment in consolidated draft PR 281, then observe the corrected head's CI. Install only a validated frontend on the existing staging project when its deployment quota permits and verify actual signed-in intake/reopen/edit/recovery. No production rollout, external send/share/sign or customer-data mutation is included.

A client abort/timeout does not roll back a server transaction. Generic legacy writers still have no command receipt or optimistic version token; this repair does not invent exactly-once execution or automatically decide whether an uncertain write committed. Real staff/device/independent-agency and remaining club-to-outcome/matching gates stay open.
