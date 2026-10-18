import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
const root = new URL(
  "/qa-documents",
  process.env.CALENDAR_QA_URL || "http://127.0.0.1:3113",
);
const output = process.env.DOCUMENT_QA_OUTPUT || "/tmp/redream-document-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CALENDAR_CHROMIUM,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (let i = 0; i < 60; i++) {
    try {
      await page.goto(root.href);
      break;
    } catch (error) {
      if (i === 59) throw error;
      await page.waitForTimeout(250);
    }
  }
  await page.getByRole("heading", { name: /Good work deserves/ }).waitFor();
  for (const label of [
    "Player contract",
    "Mandate",
    "Player pitch",
    "Invoice",
    "Scouting report",
  ]) {
    await page
      .getByRole("button", { name: new RegExp(label + ".*Create document") })
      .click();
    assert.equal(
      await page.getByLabel("Document title", { exact: true }).inputValue(),
      label,
    );
    await page.getByRole("button", { name: "Library", exact: true }).click();
  }
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Library fits ${width}`,
    );
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `${output}/library-${width}.png`,
        fullPage: true,
      });
  }
  await page
    .getByRole("button", { name: /Scouting report.*Create document/ })
    .click();
  await page
    .getByLabel("Document title", { exact: true })
    .fill("Alex Bennett | Club briefing");
  await page
    .getByRole("combobox", { name: "Player to fill" })
    .selectOption("player-a");
  await page
    .getByRole("button", { name: "Fill player details", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Player name", { exact: false }).inputValue(),
    "Alex Bennett",
  );
  await page.getByLabel("Prepared for", { exact: false }).fill("Harbour FC");
  await page
    .getByLabel("Scout or report author", { exact: false })
    .fill("Sam Taylor");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  const wordings = page.getByRole("textbox", { name: /^Section \d+ wording$/ });
  await wordings.first().waitFor();
  for (let i = 0; i < (await wordings.count()); i++) {
    const value = await wordings.nth(i).inputValue();
    if (value.includes("[["))
      await wordings
        .nth(i)
        .fill(
          "Observed in the full-match review on 14 October 2026. A further live observation is recommended.",
        );
  }
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page.getByRole("checkbox", { name: /I have reviewed/ }).check();
  await page
    .getByText("Ready for your recipient", { exact: true })
    .waitFor({ timeout: 3000 })
    .catch(async (error) => {
      await page.screenshot({
        path: `${output}/readiness-failure.png`,
        fullPage: true,
      });
      throw new Error(
        error.message +
          "\nChecklist: " +
          JSON.stringify(await page.locator("details").allTextContents()),
      );
    });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByText("Draft saved", { exact: true }).waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Editor fits ${width}`,
    );
    if (width <= 760)
      await page.getByRole("button", { name: "Preview", exact: true }).click();
    const paper = page.getByRole("article", { name: "Document preview" });
    assert.ok(await paper.isVisible());
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Preview fits ${width}`,
    );
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `${output}/editor-${width}.png`,
        fullPage: true,
      });
    if (width <= 760)
      await page.getByRole("button", { name: "Edit", exact: true }).click();
  }
  for (const [label, extension] of [
    ["Word", "docx"],
    ["PDF", "pdf"],
  ]) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const download = await pending;
    const path = `${output}/club-briefing.${extension}`;
    await download.saveAs(path);
    const bytes = await readFile(path);
    assert.ok(bytes.length > (extension === "docx" ? 4000 : 1000));
    if (extension === "docx") {
      assert.equal(bytes.subarray(0, 2).toString(), "PK");
      const xml = execFileSync("unzip", ["-p", path, "word/document.xml"], {
        encoding: "utf8",
      });
      assert.match(xml, /Alex Bennett/);
      assert.match(xml, /Observed in the full-match review/);
      assert.doesNotMatch(xml, /\{\{player_name\}\}/);
    } else assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  }
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share document" });
  await dialog
    .getByRole("button", { name: "Create review link", exact: true })
    .click();
  await dialog.getByLabel("Document link").waitFor();
  assert.match(
    await dialog.getByLabel("Document link").inputValue(),
    /\/workspace\/qa-agency\/documents\/view\/[a-f0-9]{64}$/,
  );
  await dialog.getByRole("button", { name: "Close document dialog" }).click();
  await page.getByLabel("Document title", { exact: true }).fill("Unsaved edit");
  await page.getByRole("button", { name: "Library", exact: true }).click();
  const discard = page.getByRole("dialog", {
    name: "Unsaved document changes",
  });
  await discard.getByRole("button", { name: "Keep editing" }).click();
  assert.equal(
    await page.getByLabel("Document title", { exact: true }).inputValue(),
    "Unsaved edit",
  );
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await discard.getByRole("button", { name: "Discard changes" }).click();
  await page
    .getByRole("button", { name: /Harbour FC \| Agency services/ })
    .click();
  await page.getByRole("button", { name: "Activity", exact: true }).click();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await page
    .getByLabel("Payment date and reference")
    .fill("Received 18 October, bank reference TEST-123");
  await page.getByRole("button", { name: "Confirm manual record" }).click();
  await page
    .getByText("Payment (manually recorded)", { exact: true })
    .waitFor();
  assert.ok(
    await page
      .getByRole("button", { name: "Record payment", exact: true })
      .isDisabled(),
  );
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page.screenshot({ path: `${output}/invoice-1440.png`, fullPage: true });
  for (const [label, extension] of [
    ["Word", "docx"],
    ["PDF", "pdf"],
  ]) {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: label, exact: true }).click();
    const download = await pending;
    await download.saveAs(`${output}/agency-invoice.${extension}`);
  }
  await page.goto(root.href + "?scenario=save-failed");
  await page
    .getByRole("button", { name: /Player contract.*Create document/ })
    .click();
  await page
    .getByLabel("Document title", { exact: true })
    .fill("Retain this draft");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(
    await page.getByLabel("Document title", { exact: true }).inputValue(),
    "Retain this draft",
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByText("Draft saved", { exact: true }).waitFor();
  let recipientRequests = 0;
  await page.route(
    "https://example.supabase.co/rest/v1/rpc/redream_document_open",
    async (route) => {
      recipientRequests++;
      const body = route.request().postDataJSON();
      assert.equal(body.p_workspace_slug, "qa-agency");
      await route.fulfill({
        status: recipientRequests === 1 ? 503 : 200,
        contentType: "application/json",
        body: JSON.stringify(
          recipientRequests === 1
            ? { message: "Temporary outage" }
            : {
                title: "A reviewed club report",
                kind: "scouting_report",
                status: "ready",
                content: {
                  brand: {
                    name: "Northstar Football Management",
                    legalName: "Northstar Football Management Ltd",
                    primary: "#23483F",
                    accent: "#B49568",
                    logoUrl: "",
                    email: "team@example.com",
                    phone: "",
                    website: "",
                    address: "",
                    registration: "",
                    bankDetails: "",
                  },
                  fields: {
                    player_name: "Alex Bennett",
                    recipient_name: "Harbour FC",
                    report_date: "2026-10-18",
                    author: "Sam Taylor",
                  },
                  sections: [
                    {
                      id: "one",
                      title: "Player overview",
                      body: "Reviewed player information.",
                    },
                  ],
                  lines: [],
                  sources: [],
                  reviewed: true,
                },
              },
        ),
      });
    },
  );
  await page.goto(
    new URL("/workspace/qa-agency/documents/view/" + "a".repeat(64), root).href,
  );
  await page.getByRole("heading", { name: "A document for you" }).waitFor();
  assert.equal(
    recipientRequests,
    0,
    "Previewing a link is not counted as an open",
  );
  await page.getByRole("button", { name: "View document" }).click();
  await page.getByRole("alert").waitFor();
  await page.getByRole("button", { name: "View document" }).click();
  await page.getByRole("article", { name: "Document preview" }).waitFor();
  assert.equal(recipientRequests, 2);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await page.screenshot({
    path: `${output}/recipient-390.png`,
    fullPage: true,
  });
  await page.goto(new URL("/workspace/qa-agency/documents", root).href);
  await page.getByRole("heading", { name: "Your agency documents" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Documents: four viewport widths, five templates, player fill, editable content, Word/PDF exports, draft recovery, snapshot sharing and manual invoice payment passed.",
  );
} finally {
  await browser.close();
}
