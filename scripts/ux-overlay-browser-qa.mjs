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
  if (process.env.UX_QA_ONLY !== 'overlays') {
    await page.emulateMedia({reducedMotion: 'reduce'});
    for (const width of [320, 390, 768, 1440]) for (const brand of ['teal', 'navy', 'gold']) {
      await page.setViewportSize({width, height: 844});
      const url = new URL(root); url.searchParams.set('screen', 'controls'); url.searchParams.set('brand', brand);
      await page.goto(url.href); await page.getByRole('heading', {name: 'Workspace controls', exact: true}).waitFor();
      await page.mouse.move(0, 0);
      const save = page.getByRole('button', {name: 'Save changes', exact: true});
      const palette = await save.evaluate(node => {
        const theme = getComputedStyle(node.closest('main')), css = getComputedStyle(node);
        return {background: css.backgroundColor, foreground: css.color, primary: theme.getPropertyValue('--agency-primary').trim(), raw: theme.getPropertyValue('--agency-primary-raw').trim()};
      });
      const rgb = hex => 'rgb(' + hex.slice(1).match(/../g).map(part => parseInt(part, 16)).join(', ') + ')';
      assert.equal(palette.background, rgb(palette.primary), 'Primary action must follow the safe agency colour: ' + brand + '/' + width);
      if (brand === 'gold') assert.notEqual(palette.primary, palette.raw, 'Light brand colours retain the contrast guardrail');
      const link = page.getByRole('link', {name: 'Open player profile', exact: true});
      assert.equal(await link.evaluate(node => getComputedStyle(node).backgroundColor), palette.background);
      const contrast = await save.evaluate(node => {
        const css = getComputedStyle(node);
        const luminance = value => value.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        const a = luminance(css.color), b = luminance(css.backgroundColor); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      });
      assert.ok(contrast >= 4.5, 'Primary label remains readable: ' + brand + '/' + width);
      await save.focus();
      assert.equal(await save.evaluate(node => getComputedStyle(node).outlineStyle), 'solid');
      assert.equal(await save.evaluate(node => getComputedStyle(node).outlineColor), palette.background, 'Keyboard focus follows the tenant');
      const inverse = page.getByRole('button', {name: 'View work', exact: true});
      assert.deepEqual(await inverse.evaluate(node => {const css = getComputedStyle(node); return [css.backgroundColor, css.color];}), ['rgb(255, 255, 255)', 'rgb(11, 45, 73)'], 'Inverse controls retain their dark-surface contrast');
      assert.equal(await page.getByRole('link', {name: 'WhatsApp', exact: true}).evaluate(node => getComputedStyle(node).color), 'rgb(22, 113, 71)');
      assert.equal(await page.getByRole('link', {name: 'Email', exact: true}).evaluate(node => getComputedStyle(node).color), 'rgb(35, 91, 148)');
      assert.equal(await page.getByRole('alert').filter({hasText: 'Could not load record'}).evaluate(node => getComputedStyle(node).color), 'rgb(180, 35, 24)');
      assert.equal(await page.getByRole('status').filter({hasText: 'Changes saved'}).evaluate(node => getComputedStyle(node).color), 'rgb(26, 107, 64)');
      assert.ok(await page.getByRole('button', {name: 'Saving changes', exact: true}).isDisabled());
      if (width <= 390) assert.ok((await save.boundingBox()).height >= 44);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
      await save.hover();
      await page.waitForFunction(({background}) => getComputedStyle([...document.querySelectorAll('button')].find(node => node.textContent === 'Save changes')).backgroundColor !== background, {background: palette.background});
      assert.notEqual(await save.evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(0, 102, 204)', 'Hover cannot revert to fixed blue');
      if (width === 390 || width === 1440 && brand === 'teal') await page.screenshot({path: `${output}/controls-${brand}-${width}.png`});
      console.log('PASS tenant control palette', brand, width);
    }
  }
  if (process.env.UX_QA_ONLY !== 'controls') {
  await page.goto(root.href);
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
  }
  assert.deepEqual(errors, []);
  console.log(
    process.env.UX_QA_ONLY === 'controls'
      ? "Tenant controls: three brands, four widths, contrast, focus, hover and semantic colours passed."
      : "UX overlays: short screens, reachable confirmation actions, scroll restoration, focus restoration and native dialogs passed.",
  );
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
