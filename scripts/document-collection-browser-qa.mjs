// Exercises the real editor and exporters with synthetic agency identities only.
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { inflateSync } from "node:zlib";
import { chromium } from "playwright";
const base = process.env.CALENDAR_QA_URL || "http://127.0.0.1:3213";
const output =
  process.env.DOCUMENT_COLLECTION_OUTPUT || "/tmp/redream-document-collection";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CALENDAR_CHROMIUM,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const labels = [
  "Player contract",
  "Mandate",
  "Player pitch",
  "Invoice",
  "Scouting report",
];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://brand-assets.supabase.co/**", async (route) => {
    const atlas = route.request().url().includes("atlas");
    await route.fulfill({
      contentType: "image/svg+xml",
      headers: { "access-control-allow-origin": "*" },
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="96" viewBox="0 0 240 96"><rect width="240" height="96" rx="8" fill="${atlas ? "#175E70" : "#23483F"}"/><text x="120" y="64" font-family="Arial" font-size="48" text-anchor="middle" fill="${atlas ? "#E3C672" : "#FFFFFF"}">${atlas ? "ATLAS" : "NS"}</text></svg>`,
    });
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await page.goto(new URL("/qa-documents", base).href);
      break;
    } catch (error) {
      if (attempt === 59) throw error;
      await page.waitForTimeout(250);
    }
  }
  for (const tenant of ["northstar", "atlas"]) {
    const folder = `${output}/${tenant}`;
    await mkdir(folder, { recursive: true });
    const cases = labels.map((label, i) => ({
      label,
      i,
      stem: String(i),
      longInvoice: false,
    }));
    if (tenant === "northstar")
      cases.push({
        label: "Invoice",
        i: 3,
        stem: "invoice-long",
        longInvoice: true,
      });
    for (const { label: templateLabel, i, stem, longInvoice } of cases) {
      await page.goto(
        new URL(
          `/qa-documents?reviewBrand=${tenant}${longInvoice ? "&longInvoice=1" : ""}`,
          base,
        ).href,
      );
      await page
        .getByRole("button", {
          name: new RegExp(
            templateLabel +
              " \\| " +
              (tenant === "atlas" ? "Łukasz Zieliński" : "Alex Bennett"),
          ),
        })
        .click();
      const paper = page.getByRole("article", { name: "Document preview" });
      const agency =
        tenant === "atlas"
          ? "Atlas Player Advisory"
          : "Northstar Football Management";
      await paper.getByRole("img", { name: `${agency} logo` }).waitFor();
      await paper.getByRole("img").evaluate((image) => image.decode());
      assert.ok(
        await paper
          .getByRole("img")
          .evaluate((image) => image.complete && image.naturalWidth > 0),
      );
      const palette = await paper.evaluate((element) => ({
        primary: element.style.getPropertyValue("--doc-primary"),
        accent: element.style.getPropertyValue("--doc-accent"),
        surface: element.style.getPropertyValue("--doc-surface"),
      }));
      assert.equal(
        palette.accent.toUpperCase(),
        tenant === "atlas" ? "#175E70" : "#B49568",
      );
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        if (width <= 760)
          await page
            .getByRole("button", { name: "Preview", exact: true })
            .click();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${tenant} ${labels[i]} fits ${width}`,
        );
        if (width !== 320)
          await page.screenshot({
            path: `${folder}/${stem}-${width}.png`,
            fullPage: true,
          });
        if (width <= 760)
          await page.getByRole("button", { name: "Edit", exact: true }).click();
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      if (i < 2) {
        assert.equal(
          await paper.getByText("Draft for review", { exact: true }).count(),
          1,
        );
        assert.ok(
          await page
            .getByRole("button", { name: "Share", exact: true })
            .isDisabled(),
          "Unapproved agreement remains a draft",
        );
      }
      for (const [label, extension] of [
        ["Word", "docx"],
        ["PDF", "pdf"],
      ]) {
        const pending = page.waitForEvent("download");
        await page.getByRole("button", { name: label, exact: true }).click();
        const download = await pending;
        const path = `${folder}/${stem}.${extension}`;
        await download.saveAs(path);
        if (extension === "docx") {
          const unzip = (file) =>
            execFileSync("unzip", ["-p", path, file], { encoding: "utf8" });
          const header = unzip("word/header1.xml"),
            text = unzip("word/document.xml");
          assert.ok(header.includes(agency));
          assert.ok(
            header.includes(palette.accent.slice(1)),
            "Tenant accent is in Word letterhead",
          );
          assert.match(header, /a:blip/);
          assert.doesNotMatch(header + text, /DJM|ReDream/);
          assert.doesNotMatch(text, /\{\{|\[\[/);
          assert.equal(text.includes("DRAFT FOR REVIEW"), i < 2);
          if (i !== 3) assert.doesNotMatch(text, /IBAN/);
          if (i === 3)
            assert.match(
              text,
              /<w:tblHeader\/>/,
              "Word repeats the invoice column headings",
            );
          if (longInvoice)
            assert.match(
              text,
              /Agency service 30:/,
              "All invoice lines are exported",
            );
          if (i === 3 || i === 4)
            assert.match(
              unzip("word/_rels/document.xml.rels"),
              i === 3
                ? /https:\/\/wise.com\/pay\/example/
                : /https:\/\/example.com\/review-notes/,
            );
        } else {
          const bytes = await readFile(path),
            pdf = bytes.toString("latin1");
          assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
          assert.match(
            pdf,
            /\/Subtype\s*\/Image\b/,
            "Tenant logo is embedded in PDF",
          );
          if (i === 2)
            assert.equal(
              (pdf.match(/\/Type\s*\/Page\b/g) || []).length,
              6,
              "Agency details do not create an extra pitch page",
            );
          if (longInvoice)
            assert.ok(
              (pdf.match(/\/Type\s*\/Page\b/g) || []).length > 1,
              "The 30-line invoice spans pages",
            );
          if (tenant === "atlas") {
            const streams = Array.from(
              pdf.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g),
              (match) => {
                try {
                  return inflateSync(Buffer.from(match[1], "latin1")).toString(
                    "latin1",
                  );
                } catch {
                  return match[1];
                }
              },
            ).join("\n");
            assert.match(
              streams,
              /<0141>/i,
              "Ł has its real PDF Unicode mapping",
            );
            assert.match(
              streams,
              /<0144>/i,
              "ń has its real PDF Unicode mapping",
            );
          }
          if (i === 3 || i === 4)
            assert.ok(
              pdf.includes(
                i === 3
                  ? "https://wise.com/pay/example"
                  : "https://example.com/review-notes",
              ),
              "Recipient can follow the payment/source link from the PDF",
            );
        }
      }
      // Next's empty route announcer is also an alert; only actual messages count.
      assert.deepEqual(
        (await page.getByRole("alert").allTextContents())
          .map((text) => text.trim())
          .filter(Boolean),
        [],
        "Logo and exports succeed without fallback",
      );
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    "All five document types: two tenant identities, embedded logos, tenant colours, draft protection, clickable export links, Word/PDF exports and mobile layouts passed.",
  );
} finally {
  await browser.close();
}
