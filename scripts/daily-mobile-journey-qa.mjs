import assert from "node:assert/strict";
export async function verifyInPlaceCaptureCompletion(page, url, mobile = true) {
  await page.goto(url);
  const nav = page.getByRole("navigation", {
    name: "Mobile workspace",
    exact: true,
  });
  if (mobile) await nav.getByRole("link", { name: "Today", exact: true }).waitFor();
  await page.getByText("Confirm the trial dates", { exact: true }).waitFor();
  const complete = page.getByRole("button", {
    name: "Complete Follow up with Example FC",
    exact: true,
  });
  assert.equal(
    await complete.count(),
    0,
    "The unsaved follow-up is absent from Today",
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "redream-ai-active-captures",
      JSON.stringify([
        {
          captureId: "00000000-0000-4000-8000-000000000092",
          workspaceSlug: "qa-platform-polish",
          createdAt: new Date().toISOString(),
        },
      ]),
    ),
  );
  const trigger = mobile ? nav.getByRole("button", { name: "Tell ReDream", exact: true }) : page.locator('header').getByRole("button", { name: "Tell ReDream", exact: true });
  await trigger.click();
  const capture = page.getByRole("dialog", {
    name: "Tell ReDream",
    exact: true,
  });
  await capture
    .getByRole("button", { name: "Approve & save", exact: true })
    .click();
  await capture.getByText("Update complete", { exact: true }).waitFor();
  await capture
    .getByRole("button", { name: "Close Tell ReDream", exact: true })
    .click();
  await capture.waitFor({ state: "hidden" });
  await complete.waitFor();
  assert.equal(
    new URL(page.url()).searchParams.get("view"),
    "home",
    "Approval refreshes Today without a navigation round-trip",
  );
}
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
  await page.getByText("Example Director", { exact: true }).first().waitFor();
  await page.evaluate(() => {
    const query = new URLSearchParams(location.search);
    query.delete("network");
    history.replaceState(null, "", location.pathname + "?" + query.toString());
  });
  await page.waitForFunction(
    () => new URLSearchParams(location.search).get("network") === "people",
  );
  // History restoration can update the URL before React commits its category.
  await categories
    .getByRole("link", { name: "Contacts", exact: true })
    .and(page.locator('[aria-current="page"]'))
    .waitFor();
  assert.equal(
    await categories
      .getByRole("link", { name: "Contacts", exact: true })
      .getAttribute("aria-current"),
    "page",
    "The remembered directory and its People category agree",
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
  await page.evaluate(() => {
    localStorage.setItem(
      "redream-ai-active-captures",
      JSON.stringify([
        {
          captureId: "00000000-0000-4000-8000-000000000092",
          workspaceSlug: "qa-platform-polish",
          createdAt: new Date().toISOString(),
        },
      ]),
    );
  });
  await nav.getByRole("button", { name: "Tell ReDream", exact: true }).click();
  await capture
    .getByRole("button", { name: "Delete this update", exact: true })
    .waitFor();
  await capture
    .getByRole("button", { name: "Delete this update", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Delete this ReDream update?",
    exact: true,
  });
  await confirmation.waitFor();
  const cancel = confirmation.getByRole("button", {
    name: "Cancel",
    exact: true,
  });
  const remove = confirmation.getByRole("button", {
    name: "Delete update",
    exact: true,
  });
  await cancel.focus();
  await page.keyboard.press("Tab");
  assert.equal(
    await remove.evaluate((node) => node === document.activeElement),
    true,
    "Confirmation retains forward keyboard focus",
  );
  await page.keyboard.press("Tab");
  assert.equal(
    await cancel.evaluate((node) => node === document.activeElement),
    true,
    "Confirmation wraps keyboard focus",
  );
  await page.keyboard.press("Escape");
  await confirmation.waitFor({ state: "hidden" });
  assert.equal(
    await capture.isVisible(),
    true,
    "Cancelling confirmation keeps capture open",
  );
  await capture
    .getByRole("button", { name: "Approve & save", exact: true })
    .click();
  await capture.getByText("Update complete", { exact: true }).waitFor();
  await capture.getByRole("link", { name: "Open club", exact: true }).click();
  await capture.waitFor({ state: "hidden" });
  await page
    .getByRole("region", { name: "Club details for Example FC", exact: true })
    .waitFor();
  const tell = nav.getByRole("button", { name: "Tell ReDream", exact: true });
  const reachable = await tell.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return node.contains(
      document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
    );
  });
  assert.equal(
    reachable,
    true,
    "Mobile capture remains reachable from a club record",
  );
  await tell.click();
  await capture.waitFor();
  const recordLink = capture.getByRole("link", {
    name: "Open full screen",
    exact: true,
  });
  const recordParams = new URL(
    await recordLink.getAttribute("href"),
    "https://example.test",
  ).searchParams;
  assert.equal(
    recordParams.get("organisation_id"),
    "00000000-0000-4000-8000-000000000095",
    "Capture retains the opened club identity",
  );
  assert.ok(
    recordParams
      .get("from")
      .includes("club=00000000-0000-4000-8000-000000000095"),
    "Capture returns to the opened club",
  );
  await page.keyboard.press("Escape");
  await capture.waitFor({ state: "hidden" });
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

export async function verifyDealRecordCapture(page, url, dealA, dealB) {
  const nav = page.getByRole("navigation", {
    name: "Mobile workspace",
    exact: true,
  });
  for (const selected of [""]) {
    await page.goto(
      url + "&tab=deals" + (selected ? "&record=" + selected : ""),
    );
    const row = page.locator("#opportunity-" + dealB);
    await row.waitFor();
    await row.getByRole("button", { name: "Open deal", exact: true }).click();
    await page
      .getByRole("heading", { name: "Example transfer B", exact: true })
      .waitFor();
    assert.equal(
      new URL(page.url()).searchParams.get("record"),
      dealB,
      "The displayed deal replaces any prior search identity",
    );
    await nav
      .getByRole("button", { name: "Tell ReDream", exact: true })
      .click();
    const capture = page.getByRole("dialog", {
      name: "Tell ReDream",
      exact: true,
    });
    await capture.waitFor();
    const link = capture.getByRole("link", {
      name: "Open full screen",
      exact: true,
    });
    const query = new URL(
      await link.getAttribute("href"),
      "https://example.test",
    ).searchParams;
    assert.equal(
      query.get("opportunity_id"),
      dealB,
      "Capture targets the displayed deal",
    );
    assert.ok(
      query.get("from").includes("record=" + dealB),
      "Capture returns to the displayed deal",
    );
    await page.keyboard.press("Escape");
    await capture.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Back", exact: true }).click();
    assert.equal(
      new URL(page.url()).searchParams.has("record"),
      false,
      "Closing the deal clears its selected identity",
    );
    if (selected) {
      await page.goBack();
      assert.equal(
        new URL(page.url()).searchParams.get("record"),
        dealA,
        "Browser back restores the previous selected record",
      );
    }
  }
}

export async function verifyDealHistoryAndCrossView(page, url, dealA, dealB) {
  await page.goto(url + '&tab=deals');
  await page.locator('#opportunity-' + dealB).getByRole('button', { name: 'Open deal', exact: true }).click();
  const heading = page.getByRole('heading', { name: 'Example transfer B', exact: true });
  await heading.waitFor();
  await page.goBack();
  assert.equal(new URL(page.url()).searchParams.has('record'), false, 'Native Back returns to the deal list');
  await heading.waitFor({ state: 'hidden', timeout: 3000 });
  await page.goForward();
  await heading.waitFor({ timeout: 3000 });
  const nav = page.getByRole('navigation', { name: 'Mobile workspace', exact: true });
  await nav.getByRole('button', { name: 'Tell ReDream', exact: true }).click();
  const capture = page.getByRole('dialog', { name: 'Tell ReDream', exact: true });
  await capture.waitFor();
  const link = capture.getByRole('link', { name: 'Open full screen', exact: true });
  assert.equal(new URL(await link.getAttribute('href'), 'https://example.test').searchParams.get('opportunity_id'), dealB, 'Forward restores the displayed deal and its capture identity');
  await page.keyboard.press('Escape');
  await capture.waitFor({ state: 'hidden' });
  await page.goto(url + '&tab=deals&record=' + dealA);
  await page.getByRole('heading', { name: 'Example transfer A', exact: true }).waitFor({ timeout: 3000 });
  const network = new URL(url);
  network.searchParams.set('view', 'network');
  network.searchParams.set('network', 'clubs');
  network.searchParams.delete('record');
  network.searchParams.delete('tab');
  await page.goto(network.href);
  await page.getByRole('button', { name: 'Open Example FC', exact: true }).first().click();
  const club = page.getByRole('region', { name: 'Club details for Example FC', exact: true });
  await club.waitFor();
  await club.getByRole('button', { name: 'Open deal', exact: true }).click();
  await heading.waitFor({ timeout: 3000 });
  assert.equal(new URL(page.url()).searchParams.get('view'), 'opportunities', 'Cross-section opening keeps the requested deal visible');
  assert.equal(new URL(page.url()).searchParams.get('record'), dealB);
}
