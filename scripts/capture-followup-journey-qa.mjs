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
    name: "Complete follow-up",
    exact: true,
  });
  await complete.click();
  const confirmation = page.getByRole("dialog", {
    name: "Complete: " + title,
    exact: true,
  });
  await confirmation.waitFor();
  assert.equal(counts().completions, 0, "Opening completion never applies it");
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await confirmation.waitFor({ state: "hidden" });
  assert.equal(
    counts().completions,
    0,
    "Cancelling completion never applies it",
  );
  await complete.click();
  await confirmation.waitFor();
  await confirmation
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await confirmation.waitFor({ state: "hidden" });
  await complete.waitFor({ state: "hidden" });
  assert.equal(
    counts().completions,
    1,
    "The confirmed follow-up completes exactly once",
  );
}
