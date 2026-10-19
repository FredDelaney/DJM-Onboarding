import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser = await chromium.launch({executablePath: process.env.CALENDAR_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage']});
try {
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  const errors = [], chunks = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://example.supabase.co/**', route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/redream_ai_current_access') ? {enabled: true, workspace_slug: 'qa-capture-loading'} : path.endsWith('/redream_ai_context_for_route') ? {} : [];
    return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(data)});
  });
  let release;
  const held = new Promise(resolve => {release = resolve;});
  await page.route('**/*.js', async route => {
    if (route.request().url().includes('AiCapture')) {
      chunks.push(route.request().url());
      await held;
    }
    await route.continue();
  });
  const url = new URL('/qa-capture-loading', process.env.CALENDAR_QA_URL || 'http://127.0.0.1:3113');
  for (let i = 0; i < 60; i++) {
    try {await page.goto(url.href); break;} catch (error) {if (i === 59) throw error; await page.waitForTimeout(250);}
  }
  const trigger = page.getByRole('button', {name: 'Tell ReDream', exact: true});
  await trigger.waitFor();
  assert.equal(chunks.length, 0, 'Closed capture must not load its code');
  await trigger.click();
  const dialog = page.getByRole('dialog', {name: 'Tell ReDream', exact: true});
  await dialog.getByRole('status').getByText('Opening Tell ReDream...', {exact: true}).waitFor();
  assert.equal(chunks.length, 1, 'Capture code starts only on intent/open');
  const close = dialog.getByRole('button', {name: 'Close Tell ReDream', exact: true});
  await close.click();
  await dialog.waitFor({state: 'hidden'});
  assert.ok(await trigger.evaluate(node => node === document.activeElement), 'Closing a loading sheet restores focus');
  release();
  await trigger.click();
  await dialog.getByRole('button', {name: 'Start recording', exact: true}).waitFor();
  // Simulate a phone keyboard/zoomed visual viewport without touching real permissions.
  await page.evaluate(() => {
    const viewport = window.visualViewport;
    Object.defineProperty(viewport, 'height', {configurable: true, value: 310});
    Object.defineProperty(viewport, 'offsetTop', {configurable: true, value: 90});
    viewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const box = dialog?.getBoundingClientRect();
    return box && box.top >= 90 && box.bottom <= 401;
  });
  await dialog.evaluate(node => {node.scrollTop = node.scrollHeight;});
  const closeBox = await close.boundingBox();
  assert.ok(closeBox && closeBox.y >= 90 && closeBox.y + closeBox.height <= 400, 'Close stays reachable above the keyboard while the sheet scrolls');
  await page.keyboard.press('Escape');
  await dialog.waitFor({state: 'hidden'});
  assert.ok(await trigger.evaluate(node => node === document.activeElement));
  assert.equal(chunks.length, 1, 'Opening again reuses the downloaded capture module');
  assert.deepEqual(errors, []);
  console.log('Capture loading: no closed-tool download, visible delayed-chunk feedback, usable close/focus and cached reopen passed.');
} finally {
  await browser.close();
}
