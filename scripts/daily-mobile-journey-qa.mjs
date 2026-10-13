import assert from "node:assert/strict";
export async function verifyDailyMobileNavigation(page) {
  const nav = page.getByRole("navigation", {
    name: "Mobile workspace",
    exact: true,
  });
  assert.equal(
    await nav.isVisible(),
    true,
    "Five-part mobile navigation must be present",
  );
  const controls = nav.locator(":scope > a, :scope > button");
  assert.deepEqual(
    (await controls.allTextContents()).map((s) => s.trim()),
    ["Today", "Search", "Tell ReDream", "People", "More"],
  );
  for (const control of await controls.all()) {
    const box = await control.boundingBox();
    assert.ok(
      box.height >= 44 && box.width >= 44,
      "Navigation needs comfortable touch targets",
    );
  }
  const more = nav.getByRole("button", { name: "More", exact: true });
  await more.click();
  const sheet = page.getByRole("dialog", {
    name: "More workspace options",
    exact: true,
  });
  await sheet.waitFor();
  for (const name of ["Calendar", "Opportunities", "Business"])
    await sheet.getByRole("link", { name, exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "hidden" });
  assert.equal(
    await more.evaluate((node) => node === document.activeElement),
    true,
    "More returns keyboard focus",
  );
  await page.keyboard.press("Meta+k");
  const search = page.getByRole("dialog", {
    name: "Find in this agency",
    exact: true,
  });
  await search.waitFor();
  assert.equal(
    await page.getByRole("dialog").count(),
    1,
    "Only visible Search handles the shortcut",
  );
  await page.keyboard.press("Escape");
  await search.waitFor({ state: "hidden" });
  await nav.getByRole("link", { name: "People", exact: true }).click();
  const categories = page.getByRole("navigation", {
    name: "People categories",
    exact: true,
  });
  await categories.waitFor();
  await categories.getByRole("link", { name: "Contacts", exact: true }).click();
  assert.ok(
    page.url().includes("network=people"),
    "Contacts opens its list directly",
  );
  await nav
    .getByRole("button", { name: "Tell ReDream", exact: true })
    .waitFor();
  await nav.getByRole("button", { name: "Tell ReDream", exact: true }).click();
  const capture = page.getByRole("dialog", {
    name: "Tell ReDream",
    exact: true,
  });
  await capture.waitFor();
  assert.equal(
    await capture
      .getByRole("button", { name: "Close Tell ReDream", exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
    "Capture receives keyboard focus",
  );
  const full = capture.getByRole("link", {
    name: "Open full screen",
    exact: true,
  });
  assert.ok(
    new URL(
      await full.getAttribute("href"),
      "https://example.test",
    ).searchParams
      .get("from")
      .includes("network=people"),
    "Capture keeps the source view",
  );
  await full.focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await capture
      .getByRole("button", { name: "Close Tell ReDream", exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
    "Capture contains keyboard focus",
  );
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 800, height: viewport.height });
  assert.equal(
    await capture.isVisible(),
    true,
    "Changing orientation must preserve an open capture",
  );
  await page.setViewportSize(viewport);
  await page.keyboard.press("Escape");
  await capture.waitFor({ state: "hidden" });
  assert.equal(
    await nav
      .getByRole("button", { name: "Tell ReDream", exact: true })
      .evaluate((node) => node === document.activeElement),
    true,
    "Capture restores focus",
  );
  await more.click();
  await sheet.getByRole("link", { name: "Calendar", exact: true }).click();
  await sheet.waitFor({ state: "hidden" });
  assert.ok(page.url().includes("view=calendar"), "More opens Calendar");
  await nav.getByRole("link", { name: "Today", exact: true }).click();
  await nav.locator('a[aria-current="page"]').waitFor();
  assert.equal(
    await nav
      .getByRole("link", { name: "Today", exact: true })
      .getAttribute("aria-current"),
    "page",
  );
}
