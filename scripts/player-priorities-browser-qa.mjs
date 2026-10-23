import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: process.env.CALENDAR_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const output = '/tmp/redream-platform-programme/roster';
await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = new URL('/qa-player-priorities', process.env.CALENDAR_QA_URL || 'http://127.0.0.1:3113');
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await page.goto(url.href); break; } catch (error) { if (attempt === 59) throw error; await page.waitForTimeout(250); }
  }
  const card = name => page.getByRole('button', { name: `Open ${name}`, exact: true });
  await card('Plan Player').waitFor();
  assert.equal(await page.getByText('Needs action', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Set one concrete player next action and due date.', { exact: true }).count(), 0);
  await card('Plan Player').getByText('Player plan', { exact: true }).waitFor();
  await card('Contract Player').getByText('Contract decision', { exact: true }).last().waitFor();
  await card('Contract Player').getByText('Agree the extension strategy.', { exact: true }).waitFor();
  await card('Overdue Player').getByText('Call the club about the trial', { exact: true }).waitFor();
  await card('Future Player').getByText('Confirm the summer schedule', { exact: true }).waitFor();
  assert.equal(await card('Assigned Player').getByRole('button').count(), 0);
  assert.equal(await card('Assigned Player').getByText('Private objective').count(), 0);
  assert.equal(await card('Quiet Player').getByRole('button', { name: /next/i }).count(), 0);

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}: no horizontal overflow`);
    const clipped = await page.locator('article[role="button"]').evaluateAll(cards => cards
      .filter(card => card.scrollWidth > card.clientWidth + 1 || card.scrollLeft !== 0)
      .map(card => ({ name: card.getAttribute('aria-label'), width: card.clientWidth, contentWidth: card.scrollWidth })));
    assert.deepEqual(clipped, [], `${width}: no content hidden inside a player card`);
    const control = page.getByRole('button', { name: 'Prepare next move for Contract Player', exact: true });
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    assert.ok(box && box.height >= 44 && box.width >= 44, `${width}: next-step target is reachable`);
    await control.click();
    let action = JSON.parse(await page.getByLabel('Prepared action').textContent());
    assert.equal(action.action, 'player_service_move_prepare');
    assert.equal(action.payload.player_id, 'contract');
    assert.equal(action.instruction, 'Agree the extension strategy.');
    assert.equal(new URL(page.url()).searchParams.has('player'), false, 'Action does not open the containing profile');
    await page.getByRole('button', { name: 'Set due date for Undated Player', exact: true }).click();
    action = JSON.parse(await page.getByLabel('Prepared action').textContent());
    assert.equal(action.action, 'player_control_fix_prepare');
    assert.equal(action.payload.player_id, 'undated');
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
    console.log(`PASS player priorities, private data, existing action routes and layout ${width}`);
  }
  await page.getByRole('button', { name: 'Open next action for Overdue Player', exact: true }).click();
  await page.getByRole('heading', { name: 'Overdue Player', exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('player'), 'overdue');
  assert.equal(new URL(page.url()).searchParams.has('profile'), false, 'Recorded work opens the existing work view');
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
