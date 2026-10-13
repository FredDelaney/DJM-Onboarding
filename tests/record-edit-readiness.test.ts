import assert from "node:assert/strict";
import test from "node:test";
import { recordEditReady } from "../lib/record-edit-readiness.ts";
const current = {
  requestedId: "record-b",
  loadedId: "record-b",
  busy: false,
  error: "",
  restricted: false,
};
test("record editing requires a successful current-record read", () => {
  assert.equal(recordEditReady(current), true);
  for (const scenario of [
    { busy: true },
    { loadedId: "" },
    { error: "Could not load record" },
    { loadedId: "record-a" },
    { restricted: true },
    { requestedId: "" },
  ]) {
    assert.equal(
      recordEditReady({ ...current, ...scenario }),
      false,
      JSON.stringify(scenario),
    );
  }
});
