import assert from "node:assert/strict";
import test from "node:test";
import { captureOutcomeLinks } from "../lib/capture-outcome-links.ts";
const id = "10000000-0000-4000-8000-000000000001";
test("applied records link to their exact record and workspace", () => {
  assert.deepEqual(
    captureOutcomeLinks(
      [{ status: "applied", target_type: "organisation", target_id: id }],
      "djm",
    ),
    [
      {
        label: "Open club",
        href: "/workspace/djm?view=network&network=clubs&club=" + id,
      },
    ],
  );
});
test("applied follow-ups have one Calendar destination", () => {
  const action = {
    status: "applied",
    action_type: "create_task",
    target_type: "task",
    target_id: id,
  };
  assert.deepEqual(captureOutcomeLinks([action, action], "djm"), [
    { label: "View follow-ups", href: "/workspace/djm?view=calendar" },
  ]);
});
test("pending, undone, malformed and unknown targets never produce record links", () => {
  assert.deepEqual(
    captureOutcomeLinks(
      [
        { status: "pending", target_type: "player", target_id: id },
        { status: "undone", target_type: "organisation", target_id: id },
        { status: "applied", target_type: "person", target_id: "invalid" },
        { status: "applied", target_type: "anything", target_id: id },
      ],
      "djm",
    ),
    [],
  );
});
test("record destinations are deduplicated and fall back safely for legacy workspaces", () => {
  const action = { status: "applied", target_type: "player", target_id: id };
  assert.deepEqual(captureOutcomeLinks([action, action], "../wrong"), [
    { label: "Open player", href: "/agency?view=players&player=" + id },
  ]);
});
test("saved interactions and club needs link using their resolved record identities", () => {
  assert.deepEqual(
    captureOutcomeLinks(
      [
        {
          status: "applied",
          target_type: "club_need",
          target_id: id,
          resolved_payload: { organisation_id: id },
        },
      ],
      "djm",
    ),
    [
      {
        label: "Open club",
        href: "/workspace/djm?view=network&network=clubs&club=" + id,
      },
    ],
  );
  assert.deepEqual(
    captureOutcomeLinks(
      [
        {
          status: "applied",
          target_type: "interaction",
          target_id: id,
          proposed_payload: { person_id: id },
        },
      ],
      "djm",
    ),
    [],
  );
});
