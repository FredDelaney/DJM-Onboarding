import assert from "node:assert/strict";
import test from "node:test";
import {
  workspaceMobileNavigation,
  workspaceMoreLinks,
} from "../lib/workspace-mobile-navigation.ts";
test("daily mobile navigation has five destinations and groups records under People", () => {
  const nav = workspaceMobileNavigation("/workspace/djm", "network");
  assert.deepEqual(
    nav.map((item) => item.label),
    ["Today", "Search", "Tell ReDream", "People", "More"],
  );
  assert.equal(nav.find((item) => item.label === "People")?.active, true);
  assert.equal(
    nav.find((item) => item.label === "People")?.href,
    "/workspace/djm?view=players",
  );
  assert.equal(workspaceMobileNavigation("/agency", "home")[0].active, true);
});
test("More keeps Calendar available and preserves commercial role restrictions", () => {
  assert.deepEqual(
    workspaceMoreLinks("/workspace/djm", false).map((item) => item.label),
    ["Calendar", "Recruitment"],
  );
  const links = workspaceMoreLinks("/workspace/djm", true);
  assert.ok(
    links.some(
      (item) =>
        item.label === "Opportunities" &&
        item.href === "/workspace/djm?view=opportunities",
    ),
  );
  assert.ok(
    links.some(
      (item) =>
        item.label === "Business" &&
        item.href === "/workspace/djm?view=business",
    ),
  );
  assert.equal(
    workspaceMobileNavigation("/workspace/djm", "calendar").find(
      (item) => item.label === "More",
    )?.active,
    true,
  );
});
test("Recruitment highlights More without selecting the People directory", () => {
  const nav = workspaceMobileNavigation("/agency", "players", "recruitment");
  assert.equal(nav.find((item) => item.label === "People")?.active, false);
  assert.equal(nav.find((item) => item.label === "More")?.active, true);
});
