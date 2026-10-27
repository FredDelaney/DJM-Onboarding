import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
const browser = await chromium.launch({
  executablePath: process.env.CALENDAR_CHROMIUM,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const root = process.env.CALENDAR_QA_URL || "http://127.0.0.1:3113";
const capture = "30000000-0000-4000-8000-000000000001";
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.qaDocumentCalls = [];
    window.addEventListener("qa-document-request", (event) =>
      window.qaDocumentCalls.push(event.detail),
    );
  });
  for (const kind of [
    "player_contract",
    "mandate",
    "agency_pitch",
    "invoice",
    "scouting_report",
    "player_profile",
  ]) {
    const url = new URL("/qa-documents", root);
    url.search = new URLSearchParams({
      capture,
      preparation: "prepare_1",
      kind,
    });
    for (let i = 0; i < 60; i++) {
      try {
        await page.goto(url.href);
        break;
      } catch (error) {
        if (i === 59) throw error;
        await page.waitForTimeout(250);
      }
    }
    const panel = page.getByRole("region", {
      name: "Tell ReDream preparation",
    });
    await panel.getByText("Original note", { exact: true }).waitFor();
    if (kind === "player_profile") {
      const choose = panel.getByRole("combobox");
      assert.equal(
        await choose.inputValue(),
        "",
        "A prospect is not auto-attached to a signed player",
      );
      await choose.selectOption("player-a");
      // This fixture uses non-UUID player ids. The production link builder must reject them.
      assert.equal(
        await panel
          .getByRole("link", { name: "Open profile preparation" })
          .count(),
        0,
      );
    } else {
      await panel
        .getByRole("button", { name: "Open editable draft", exact: true })
        .click();
      const brief = page.getByRole("textbox", {
        name: "Your brief",
        exact: true,
      });
      await brief.waitFor();
      assert.match(await brief.inputValue(), /Private: internal negotiations/);
      const data = await page
        .getByRole("textbox")
        .evaluateAll((fields) =>
          fields
            .filter((field) => field.id !== "document-assist-brief")
            .map((field) => field.value),
        );
      assert.ok(
        !data.join("").includes("Private: internal negotiations"),
        "Private notes are not copied into recipient-facing text",
      );
      assert.equal(
        await page.evaluate(() =>
          window.qaDocumentCalls.some((action) =>
            ["assist", "save", "share", "paid", "sent"].includes(action),
          ),
        ),
        false,
      );
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          kind + " fits " + width,
        );
      }
      if (kind === "agency_pitch") {
        await page
          .getByRole("button", { name: "Prepare suggestions", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: "Apply selected suggestions",
            exact: true,
          })
          .waitFor();
        assert.equal(
          await page.evaluate(() =>
            window.qaDocumentCalls.some((action) =>
              ["save", "share"].includes(action),
            ),
          ),
          false,
        );
        await page
          .getByRole("button", {
            name: "Apply selected suggestions",
            exact: true,
          })
          .click();
        assert.equal(
          await page.evaluate(() =>
            window.qaDocumentCalls.some((action) =>
              ["save", "share"].includes(action),
            ),
          ),
          false,
        );

        await page.setViewportSize({ width: 390, height: 844 });
        await mkdir("/tmp/redream-preparation-qa", { recursive: true });
        await page.screenshot({
          path: "/tmp/redream-preparation-qa/player-pitch-390.png",
          fullPage: true,
        });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
  }
  const retry = new URL("/qa-documents", root);
  retry.search = new URLSearchParams({
    capture,
    preparation: "prepare_1",
    kind: "agency_pitch",
    scenario: "brief-retry",
  });
  await page.goto(retry.href);
  await page
    .getByRole("alert")
    .filter({ hasText: "This brief could not open" })
    .waitFor();
  await page
    .getByRole("region", { name: "Tell ReDream preparation" })
    .getByRole("button", { name: "Try again" })
    .click();
  await page
    .getByRole("button", { name: "Open editable draft", exact: true })
    .waitFor();
  const capturePage = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await capturePage.addInitScript(() => {
    const user = {
      id: "10000000-0000-4000-8000-000000000001",
      email: "synthetic@example.test",
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
    };
    const token =
      "eyJhbGciOiJIUzI1NiJ9." +
      btoa(
        JSON.stringify({
          sub: user.id,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ) +
      ".fixture";
    localStorage.setItem(
      "sb-example-auth-token",
      JSON.stringify({
        access_token: token,
        refresh_token: "fixture",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        token_type: "bearer",
        user,
      }),
    );
  });
  await capturePage.route("https://example.supabase.co/**", async (route) => {
    const isReceipt = new URL(route.request().url()).pathname.endsWith(
      "/redream_ai_receipt",
    );
    const notes =
      "Prepare a player pitch for Milo Carter. His priority is a clear development plan.";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        isReceipt
          ? {
              capture: { id: capture, status: "done", transcript_text: notes },
              actions: [],
              questions: [],
              preparations: [
                {
                  key: "prepare_1",
                  kind: "agency_pitch",
                  player_name: "Milo Carter",
                  club_name: null,
                  evidence: "Prepare a player pitch for Milo Carter.",
                },
              ],
            }
          : [],
      ),
    });
  });
  await capturePage.goto(new URL("/qa-tell-work", root).href);
  const open = capturePage.getByRole("link", {
    name: "Player pitch Milo Carter",
    exact: true,
  });
  await open.waitFor();
  assert.equal(
    await open.getAttribute("href"),
    "/workspace/qa-tell-work/documents?capture=" +
      capture +
      "&preparation=prepare_1",
  );
  await capturePage
    .getByText("Your brief is ready. Open a draft to review and edit it.", {
      exact: true,
    })
    .waitFor();
  await capturePage.screenshot({
    path: "/tmp/redream-preparation-qa/tell-preparation-390.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Tell preparation: five editable document drafts, private source boundary, no automatic model/save/share calls, scoped profile choice, retry and four viewport widths passed.",
  );
} finally {
  await browser.close();
}
