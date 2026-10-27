import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.CALENDAR_CHROMIUM,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const output = process.env.DEEP_PAGES_SCREEN_DIR || "/tmp/redream-deep-after";
await mkdir(output, { recursive: true });
const base = new URL(
  "/qa-deep-pages",
  process.env.CALENDAR_QA_URL || "http://127.0.0.1:3113",
);
let page,
  mode = "healthy",
  held = [],
  calls = [],
  savedPlan = "",
  briefStep = false;
const errors = [];
const result = (action, body = {}) => {
  const id = body.deal_room_id || body.player_id || "first";
  if (action === "negotiation_brief")
    return {
      brief: {
        known_recorded_facts: {
          deal: { id, stage: "negotiation" },
          recorded_terms: {
            transfer_fee: null,
            player_salary: 0,
            expected_commission: "",
          },
        },
      },
    };
  if (action === "negotiation_readiness")
    return { negotiation: { state: "needs_preparation" } };
  if (action === "negotiation_sequence")
    return {
      sequence: {
        steps: [
          {
            step: 1,
            step_type: "set_negotiation_guardrails",
            instruction: "Record agency limits",
          },
        ],
        next_step: {
          step_type: briefStep
            ? "prepare_negotiation_brief"
            : "set_negotiation_guardrails",
          instruction: "Record agency limits",
        },
      },
    };
  if (action === "deal_guardrails")
    return {
      guardrails: {
        state: "draft",
        guardrails: {
          status: "draft",
          target_outcome: savedPlan || "Saved plan " + id,
        },
      },
    };
  if (action === "player_review_pack")
    return {
      review_pack: {
        value_proof: { proof_state: "recorded" },
        meeting_focus: { service_control_state: "recorded" },
      },
    };
  if (action === "player_value_proof_history")
    return { history: { snapshots: [] } };
  if (action === "deal_closeout")
    return {
      closeout: {
        deal: {
          id,
          stage: "contracting",
          currency: "EUR",
          expected_commission: null,
        },
        closeout_record: {
          final_terms: {
            summary: "Recorded final agreement",
            transfer_fee: null,
          },
        },
      },
    };
  if (action === "deal_receivables")
    return {
      receivables: {
        items: [
          {
            receivable_id: "eur-1",
            currency: "EUR",
            amount: 100.25,
            balance: 100.25,
            status: "sent",
          },
          {
            receivable_id: "eur-2",
            currency: "EUR",
            amount: 99.75,
            balance: 99.75,
            status: "sent",
          },
          {
            receivable_id: "usd",
            currency: "USD",
            amount: 10.5,
            balance: 10.5,
            status: "sent",
          },
        ],
      },
    };
  if (action === "brief") return { brief: { movement: { events: [] } } };
  if (action === "action_history") return { actions: [] };
  return {};
};
try {
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/qa-deep-read", async (route) => {
    const { action, body = {} } = route.request().postDataJSON();
    calls.push({ action, body });
    if (
      mode === "hung" ||
      (mode === "late" && (body.deal_room_id || body.player_id) === "first")
    ) {
      held.push({ route, action, body });
      return;
    }
    if (mode === "failed" || mode === "saved-read-failed")
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "This record is temporarily unavailable.",
        }),
      });
    if (action === "deal_guardrails_save") {
      if (mode === "write-failed")
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Could not save. Your draft is unchanged.",
          }),
        });
      savedPlan = body.guardrails.target_outcome;
      if (mode === "save-then-read-fails") mode = "saved-read-failed";
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(result(action, body)),
    });
  });
  const visit = async (kind, extra = "") => {
    for (let i = 0; i < 60; i++)
      try {
        await page.goto(base.href + "?kind=" + kind + extra);
        return;
      } catch (error) {
        if (i === 59) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
  };
  const panel = () => page.locator("aside").first();
  const content = () => panel().locator(':scope > div[class*="content"]');
  const release = async () => {
    for (const { route, action, body } of held.splice(0))
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(result(action, body)),
      });
  };
  for (const kind of process.env.DEEP_PAGE_KINDS?.split(",") || [
    "negotiation",
    "review",
    "closeout",
    "memory",
  ]) {
    mode = "failed";
    await visit(kind);
    await panel()
      .getByRole("alert")
      .filter({ hasText: "Could not load" })
      .waitFor();
    assert.equal(
      await content().count(),
      0,
      kind + " cannot show empty facts or forms after a failed read",
    );
    mode = "healthy";
    await panel()
      .getByRole("button", { name: "Try again", exact: true })
      .click();
    await content().waitFor();
    mode = "hung";
    await visit(kind);
    await panel()
      .getByRole("status")
      .filter({ hasText: /Loading|Preparing/ })
      .waitFor();
    await panel()
      .getByRole("alert")
      .filter({ hasText: "took too long" })
      .waitFor({ timeout: 16000 });
    assert.equal(
      await content().count(),
      0,
      kind + " has bounded loading with no false all-clear",
    );
    mode = "healthy";
    await panel()
      .getByRole("button", { name: "Try again", exact: true })
      .click();
    await content().waitFor();
    await release();
    if (kind === "negotiation") {
      await panel()
        .getByRole("button", { name: "Record guardrails below", exact: true })
        .click();
      const field = panel().getByRole("textbox", {
        name: "Target outcome",
        exact: true,
      });
      assert.ok(
        await field.evaluate((node) => node === document.activeElement),
        "The next-step button reaches the intended editable field",
      );
      await panel()
        .locator("summary")
        .filter({ hasText: "Recorded facts and open questions" })
        .click();
      for (const [label, expected] of [
        ["Recorded fee", "Not set"],
        ["Recorded salary", "€0"],
        ["Expected commission", "Not set"],
      ]) {
        const fact = panel().getByText(label, { exact: true }).locator("..");
        assert.equal(
          await fact.locator("strong").textContent(),
          expected,
          "Missing amounts and recorded zero must remain distinct",
        );
      }
    }
    if (kind === "closeout") {
      const balance = panel()
        .getByText("Open balance", { exact: true })
        .locator("..");
      assert.equal(
        await balance.locator("strong").textContent(),
        "€200 · US$10.5",
        "Currencies cannot become one misleading balance",
      );
      await panel()
        .getByText("Separate currencies; no conversion applied", {
          exact: true,
        })
        .waitFor();
      await panel().getByText("€100.25", { exact: true }).first().waitFor();
    }
    if (kind === "memory")
      await panel()
        .getByRole("heading", { name: "No activity recorded yet", exact: true })
        .waitFor();
    if (kind === "negotiation" || kind === "closeout") {
      await page.setViewportSize({ width: 390, height: 460 });
      await panel()
        .getByRole("button", {
          name: kind === "negotiation" ? "Review approval" : "Record payment",
          exact: true,
        })
        .first()
        .click();
      const cancel = panel().getByRole("button", {
        name: "Cancel",
        exact: true,
      });
      await cancel.waitFor();
      const bounds = await cancel.boundingBox();
      assert.ok(
        bounds.y >= 0 && bounds.y + bounds.height <= 460,
        "The confirmation action stays reachable above its sticky header",
      );
      await cancel.click();
    }
    for (const [width, height] of [
      [320, 320],
      [390, 460],
      [768, 380],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      const shell = page.locator('[class*="pageShell"]').first();
      await shell.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      const back = panel()
          .getByRole("button", { name: /Back to/ })
          .first(),
        bounds = await back.boundingBox();
      assert.ok(
        bounds && bounds.y >= 0 && bounds.y + bounds.height <= height,
        kind +
          " keeps the return action visible after long scrolling at " +
          width,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        kind + " fits " + width,
      );
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: output + "/" + kind + "-" + width + ".png",
        });
    }
    await panel()
      .getByRole("button", { name: /Back to/ })
      .first()
      .click();
    await page.getByText("Back in workspace", { exact: true }).waitFor();
    assert.notEqual(
      await page.evaluate(() => document.body.style.overflow),
      "hidden",
      "Returning restores normal document scrolling",
    );
    console.log(
      "PASS deep " +
        kind +
        ": failed/hung reads, retry, truthful states, 4 viewports and reachable return",
    );
  }
  // An older record response cannot replace the new record or its editable draft.
  mode = "late";
  await visit("negotiation");
  await page.waitForFunction(() => typeof window.qaSelectRecord === "function");
  await page.waitForFunction(() => document.querySelector('[role="status"]'));
  await page.evaluate(() => window.qaSelectRecord("second"));
  await panel()
    .getByRole("textbox", { name: "Target outcome", exact: true })
    .waitFor();
  assert.equal(
    await panel()
      .getByRole("textbox", { name: "Target outcome", exact: true })
      .inputValue(),
    "Saved plan second",
  );
  await release();
  await page.waitForTimeout(100);
  assert.equal(
    await panel()
      .getByRole("textbox", { name: "Target outcome", exact: true })
      .inputValue(),
    "Saved plan second",
    "Late reads cannot change the selected record",
  );
  mode = "healthy";
  await visit("negotiation");
  const draft = panel().getByRole("textbox", {
    name: "Target outcome",
    exact: true,
  });
  await draft.fill("Agency draft to retain");
  mode = "write-failed";
  await panel()
    .getByRole("button", { name: "Save guardrail draft", exact: true })
    .click();
  await panel()
    .getByRole("alert")
    .filter({ hasText: "Your draft is unchanged" })
    .waitFor();
  assert.equal(
    await draft.inputValue(),
    "Agency draft to retain",
    "Failed writes keep editable values",
  );
  assert.equal(await draft.isEnabled(), true);
  mode = "save-then-read-fails";
  await panel()
    .getByRole("button", { name: "Save guardrail draft", exact: true })
    .click();
  await panel()
    .getByRole("alert")
    .filter({ hasText: "Could not load" })
    .waitFor();
  const writes = calls.filter(
    (call) => call.action === "deal_guardrails_save",
  ).length;
  mode = "healthy";
  await panel().getByRole("button", { name: "Try again", exact: true }).click();
  await draft.waitFor();
  assert.equal(
    calls.filter((call) => call.action === "deal_guardrails_save").length,
    writes,
    "Retry refreshes only; it cannot repeat a confirmed write",
  );
  assert.equal(await draft.inputValue(), "Agency draft to retain");
  briefStep = true;
  mode = "healthy";
  await visit("negotiation");
  await content().waitFor();
  await panel()
    .getByRole("button", { name: "Review negotiation brief", exact: true })
    .click();
  const facts = panel()
    .locator("details")
    .filter({
      has: page.getByText("Recorded facts and open questions", { exact: true }),
    });
  assert.ok(
    await facts.evaluate((node) => node.open),
    "Review brief opens its actual recorded facts",
  );
  briefStep = false;
  mode = "healthy";
  await visit("negotiation", "&role=scout");
  await content().waitFor();
  assert.equal(
    await panel()
      .getByRole("button", { name: "Save guardrail draft", exact: true })
      .count(),
    0,
    "Read-only role stays read-only",
  );
  await panel()
    .getByRole("button", { name: "Review guardrails below", exact: true })
    .waitFor();
  assert.equal(
    await panel()
      .getByRole("button", { name: "Record guardrails below", exact: true })
      .count(),
    0,
    "Read-only guidance cannot promise editing",
  );
  await visit("negotiation", "&title=long");
  await content().waitFor();
  await page.setViewportSize({ width: 320, height: 320 });
  const shell = page.locator('[class*="pageShell"]').first();
  await shell.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  const header = panel().locator("header");
  assert.ok(
    (await header.boundingBox()).height < 190,
    "Long record titles leave space for the form on short screens",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Long titles cannot force horizontal scrolling",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS deep record selection, draft retention, read-only retry after save, missing money, currency separation and role restrictions",
  );
} catch (error) {
  await page?.screenshot({ path: output + "/failure.png" });
  throw error;
} finally {
  await browser.close();
}
