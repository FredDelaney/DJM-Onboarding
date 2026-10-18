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
  const setTitle = async (value) => {
    await page.getByRole("button", { name: "Details", exact: true }).click();
    const field = page.getByLabel("Document title", { exact: true });
    if (!(await field.isVisible()))
      await page.getByText("Document name", { exact: true }).click();
    await field.fill(value);
  };
  const showPlayerImport = async () => {
    await page
      .getByText("Copy details from an existing workspace player", {
        exact: true,
      })
      .click();
  };
  const setWording = async (index, value) => {
    const field = page.getByRole("textbox", {
      name: `Section ${index + 1} wording`,
      exact: true,
    });
    if (!(await field.isVisible()))
      await page
        .getByLabel(`Section ${index + 1}`, { exact: true })
        .locator("summary")
        .click();
    await field.fill(value);
  };

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
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [label, nameLabel] of [
    ["Player contract", "Player full legal name"],
    ["Mandate", "Player name"],
    ["Player pitch", "Target player"],
    ["Invoice", "Bill to"],
    ["Scouting report", "Player name"],
  ]) {
    await page
      .getByRole("button", { name: new RegExp(label + ".*Create document") })
      .click();
    if (label !== "Invoice") {
      assert.equal(
        await page
          .getByRole("combobox", { name: "Player to fill" })
          .isVisible(),
        false,
        "Roster import is optional and collapsed",
      );
      await page
        .getByText("This document does not add or change a roster player.", {
          exact: true,
        })
        .waitFor();
    }
    await page.getByLabel(nameLabel, { exact: false }).fill("New Prospect");
    assert.equal(
      await page.getByLabel("Document title", { exact: true }).inputValue(),
      label + " for New Prospect",
    );
    if (label === "Invoice") {
      await page.getByLabel("Issue date", { exact: false }).fill("2026-10-18");
      await page.getByRole("button", { name: "14 days", exact: true }).click();
      assert.equal(
        await page.getByLabel("Due date", { exact: false }).inputValue(),
        "2026-11-01",
      );
      await page
        .getByLabel("Invoice number", { exact: false })
        .fill("QA-2026-001");
      assert.equal(
        await page
          .getByLabel("Payment reference", { exact: true })
          .inputValue(),
        "QA-2026-001",
      );
      await page
        .getByLabel("Service 1", { exact: true })
        .fill("Agreed services");
      await page.getByLabel("Unit price", { exact: true }).fill("100");
      await page
        .getByLabel("Invoice estimate", { exact: true })
        .getByText("€100.00", { exact: true })
        .last()
        .waitFor();
      assert.ok(
        await page.getByLabel("Bank details", { exact: true }).isVisible(),
      );
    }
    assert.ok(
      await page
        .getByRole("button", {
          name: "Share",
          exact: true,
          includeHidden: true,
        })
        .isDisabled(),
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      label + " prospect editor fits a phone",
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${output}/prospect-${label.replaceAll(" ", "-").toLowerCase()}-390.png`,
      fullPage: true,
    });
    if (label === "Player contract") {
      await page.getByRole("button", { name: "Review", exact: true }).click();
      await page
        .getByRole("button", {
          name: "Add agent notice address and email",
          exact: true,
        })
        .click();
      assert.equal(
        await page.evaluate(() => document.activeElement.id),
        "document-field-agent_notice_contact",
        "Review opens advanced terms and focuses the missing field",
      );
    }
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Unsaved document changes" })
      .getByRole("button", { name: "Discard changes", exact: true })
      .click();
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
  await setTitle("Alex Bennett | Club briefing");
  await showPlayerImport();
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
  await page.getByLabel("Report date", { exact: false }).fill("2026-10-18");
  await page
    .getByLabel("Scout or report author", { exact: false })
    .fill("Sam Taylor");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  const wordings = page.getByRole("textbox", {
    name: /^Section \d+ wording$/,
    includeHidden: true,
  });
  await wordings.first().waitFor({ state: "attached" });
  for (let i = 0; i < (await wordings.count()); i++) {
    const value = await wordings.nth(i).inputValue();
    if (value.includes("[["))
      await setWording(
        i,
        "Observed in the full-match review on 14 October 2026. A further live observation is recommended.",
      );
  }
  await page.getByRole("button", { name: "Review", exact: true }).click();
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
  const reportBrief = page
    .getByRole("article", { name: "Document preview" })
    .getByRole("definition");
  assert.deepEqual(await reportBrief.allTextContents(), [
    "Alex Bennett",
    "Harbour FC",
    "CM",
    "Harbour FC",
    "18 Oct 2026",
    "Sam Taylor",
  ]);
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
      assert.match(xml, /Prepared for/);
      assert.match(xml, /Sam Taylor/);
      assert.doesNotMatch(xml, /\{\{player_name\}\}/);
    } else {
      assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
      assert.equal(
        (bytes.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length,
        1,
        "The concise report keeps its sources on the same page",
      );
    }
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
  await setTitle("Unsaved edit");
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
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await page
    .getByRole("button", { name: /Player pitch.*Create document/ })
    .click();
  await setTitle("Alex Bennett | A future together");
  await showPlayerImport();
  await page
    .getByRole("combobox", { name: "Player to fill" })
    .selectOption("player-a");
  await page
    .getByRole("button", { name: "Fill player details", exact: true })
    .click();
  await page
    .getByLabel(/The player.s priorities/)
    .fill("Consistent first-team football and a clear development plan");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await wordings.first().waitFor({ state: "attached" });
  const pitchWording = [
    "{{player_name}}, your priority is {{purpose}}.\n\nWe would start with a conversation about your current role, the support you need and the decisions ahead. Together, we would agree what good representation should look like for you.",
    "One point of contact. A clear plan. Regular conversations.\n\nWe would agree the scope of support before you sign, including contract preparation, career planning and the practical details that let you focus on football.",
    "The next move should serve your football.\n\nWe would review playing opportunities, the role on offer and the environment around you. Each conversation would begin with your priorities and a shared understanding of the evidence.",
    "You should know who is representing you.\n\nMeet the people responsible for your day-to-day support, ask how decisions are made and agree how often we will speak. The relationship should feel personal, clear and accountable.",
    "Let us begin with your questions.\n\nA private conversation gives us the chance to understand what matters to you and explain how we work. No promise of a transfer, just a clear discussion about the support you want.\n\n{{agency_email}}",
  ];
  for (let i = 0; i < pitchWording.length; i++)
    await setWording(i, pitchWording[i]);
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("checkbox", { name: /I have reviewed/ }).check();
  await page.getByText("Ready for your recipient", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page.getByText("Draft saved", { exact: true }).waitFor();
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (width <= 760)
      await page.getByRole("button", { name: "Preview", exact: true }).click();
    const pitch = page.getByRole("article", { name: "Document preview" });
    await pitch.getByText("Prepared for", { exact: true }).waitFor();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `Pitch fits ${width}`,
    );
    assert.equal(await pitch.getByText("01 / 05", { exact: true }).count(), 1);
    if (width !== 320)
      await page.screenshot({
        path: `${output}/pitch-${width}.png`,
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
    const path = `${output}/player-pitch.${extension}`;
    await download.saveAs(path);
    if (extension === "docx") {
      const xml = execFileSync("unzip", ["-p", path, "word/document.xml"], {
        encoding: "utf8",
      });
      assert.match(xml, /Prepared for/);
      assert.match(xml, /Alex Bennett/);
      assert.match(xml, /05 \/ 05/);
      assert.equal(
        (xml.match(/<w:pageBreakBefore\/>/g) || []).length,
        5,
        "Cover and five editable chapters",
      );
      assert.doesNotMatch(xml, /\{\{player_name\}\}/);
    } else {
      const bytes = await readFile(path);
      assert.equal(
        (bytes.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length,
        6,
        "Cover and five landscape PDF chapters",
      );
    }
  }
  await page.goto(root.href + "?scenario=save-failed");
  await page
    .getByRole("button", { name: /Player contract.*Create document/ })
    .click();
  await setTitle("Retain this draft");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: /The save failed|The document could not open/ })
    .waitFor();
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
  await page
    .getByRole("alert")
    .filter({ hasText: /The save failed|The document could not open/ })
    .waitFor();
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
    "Documents: four viewport widths, five templates, recipient briefs, player pitch cover/chapters, editable Word/PDF exports, draft recovery, snapshot sharing and manual invoice payment passed.",
  );
} finally {
  await browser.close();
}
