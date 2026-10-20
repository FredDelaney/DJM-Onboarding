import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
const output = process.env.UX_QA_OUTPUT || "/tmp/redream-ux-pass";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CALENDAR_CHROMIUM,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
let page;
try {
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const root = new URL(
    "/qa-ux-pass",
    process.env.CALENDAR_QA_URL || "http://127.0.0.1:3213",
  );
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await page.goto(root.href);
      break;
    } catch (error) {
      if (attempt === 59) throw error;
      await page.waitForTimeout(250);
    }
  }
  for (const [width, height] of [
    [320, 320],
    [390, 460],
    [768, 380],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page
      .getByRole("button", { name: "Review long confirmation", exact: true })
      .click();
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor();
    const actions = dialog.getByRole("button", {
      name: "Discard changes",
      exact: true,
    });
    await actions.scrollIntoViewIfNeeded();
    const box = await actions.boundingBox();
    await page.screenshot({ path: `${output}/confirm-${width}.png` });
    assert.ok(
      box && box.y >= 0 && box.y + box.height <= height + 1,
      `Confirmation action is clipped at ${width}x${height}: ${JSON.stringify(box)}`,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      "No horizontal page overflow",
    );
    assert.equal(
      await page.evaluate(() => document.body.style.overflow),
      "hidden",
      "Confirmation locks page scroll",
    );
    await actions.focus();
    const before=await page.locator('main').getAttribute('data-refresh');
    await page.waitForFunction(value=>document.querySelector('main')?.getAttribute('data-refresh')!==value,before);
    assert.ok(await actions.evaluate(node=>node===document.activeElement),'Parent updates cannot reset confirmation focus');
    assert.equal(await actions.evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(35, 72, 63)','Warning confirmation retains the current tenant brand');
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.notEqual(
      await page.evaluate(() => document.body.style.overflow),
      "hidden",
      "Closing restores page scroll",
    );
    assert.ok(
      await page
        .getByRole("button", { name: "Review long confirmation", exact: true })
        .evaluate((node) => node === document.activeElement),
      "Focus returns to opener",
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open native dialog", exact: true })
    .click();
  await page.getByRole("dialog", { name: "Native review" }).waitFor();
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).overflowY,
    ),
    "hidden",
    "Native dialogs also prevent background scrolling",
  );
  await page.getByRole("button", { name: "Close review" }).click();
  assert.notEqual(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).overflowY,
    ),
    "hidden",
  );
  const summary=page.locator('summary');
  const refresh=page.getByRole('button',{name:'Refresh fixture',exact:true});
  for(let turn=0;turn<5;turn++){
    await summary.press('Enter');await refresh.waitFor();
    await summary.press('Escape');
    assert.equal(await summary.evaluate(node=>node.parentElement.open),false);
    assert.ok(await summary.evaluate(node=>node===document.activeElement),'Escape restores the More trigger');
  }
  await summary.press('Enter');await refresh.click();
  assert.equal(await summary.evaluate(node=>node.parentElement.open),false,'Selecting a tool dismisses More');
  assert.deepEqual(errors, []);
  console.log(
    "UX overlays: short screens, reachable confirmation actions, scroll restoration, focus restoration and native dialogs passed.",
  );
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
