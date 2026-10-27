import assert from "node:assert/strict";
export async function verifyCaptureFollowupJourney(page, counts) {
  const title = "Follow up with Example FC";
  assert.equal(
    await page
      .getByRole("link", { name: "View follow-ups", exact: true })
      .count(),
    0,
    "A proposal must not claim saved follow-ups",
  );
  await page
    .getByRole("button", { name: "Approve & save", exact: true })
    .click();
  await page.getByText("Update complete", { exact: true }).waitFor();
  assert.equal(
    counts().approvals,
    1,
    "The update is saved only after explicit approval",
  );
  const club = page.getByRole("link", { name: "Open club", exact: true });
  await club.click();
  await page
    .getByRole("region", { name: "Club details for Example FC", exact: true })
    .getByRole("heading", { name: "Example FC", exact: true })
    .waitFor();
  await page.goBack();
  await page.getByText("Update complete", { exact: true }).waitFor();
  await page
    .getByRole("link", { name: "View follow-ups", exact: true })
    .click();
  await page.getByRole("heading", { name: "Calendar", exact: true }).waitFor();
  const row = page.locator("article").filter({ hasText: title }).first();
  await row.waitFor();
  await row.getByText("Jesse", { exact: true }).waitFor();
  assert.ok(
    (await row.textContent()).includes("Jesse"),
    "The Calendar follow-up retains its responsible person",
  );
  const time = await page.evaluate(
    (value) =>
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value)),
    counts().dueAt,
  );
  assert.ok(
    (await row.textContent()).includes(time),
    "The Calendar follow-up retains its due time in the current timezone",
  );
  await page
    .getByRole("navigation", { name: "Mobile workspace", exact: true })
    .getByRole("link", { name: "Today", exact: true })
    .click();
  const complete = page.getByRole("button", {
    name: "Complete " + title,
    exact: true,
  });
  const homeRow = page.locator('article').filter({ hasText: title });
  await homeRow.getByRole('button', { name: 'Update', exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Update task",
    exact: true,
  });
  await editor.waitFor();
  assert.equal(counts().completions, 0, "Opening completion never applies it");
  await editor
    .getByRole("button", { name: "Close task editor", exact: true })
    .click();
  await editor.waitFor({ state: "hidden" });
  assert.equal(
    counts().completions,
    0,
    "Cancelling completion never applies it",
  );
  await complete.click();
  await page.getByRole('button', { name: 'Undo completion of ' + title, exact: true }).waitFor();
  await complete.waitFor({ state: "hidden" });
  assert.equal(
    counts().completions,
    1,
    "The direct follow-up completion applies exactly once and offers Undo",
  );
}
