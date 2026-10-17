import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: process.env.CALENDAR_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(15000);
  const requests = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let fail = false, hold = false, release;
  await page.route('https://example.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/redream-agent')) {
      requests.push(route.request().postDataJSON());
      if (hold) await new Promise(resolve => { release = resolve; });
      if (fail) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Please try again shortly.' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        ok: true, answer: 'Kota has ten recorded appearances. [Club evidence](https://example.org/kota)\nHis contract still needs confirming.', basis: 'mixed',
        needs_clarification: false, clarification_question: null, next_action: 'Confirm his contract end date.',
        sources: [{ title: 'Official club', url: 'https://example.org/kota' }, { title: 'Unsafe source', url: 'javascript:alert(1)' }],
        internal_matches: [{ id: '11111111-1111-4111-8111-111111111111', kind: 'player', title: 'Kota Sakurai' }],
      }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
  const url = new URL('/qa-redream-agent', process.env.CALENDAR_QA_URL || 'http://127.0.0.1:3113');
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await page.goto(url.href); break; } catch (error) { if (attempt === 59) throw error; await page.waitForTimeout(250); }
  }
  await page.getByRole('button', { name: 'Ask a question', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your question', exact: true }).fill('What do we know about Kota?');
  await page.getByRole('button', { name: 'Ask ReDream', exact: true }).click();
  await page.getByText('Kota has ten recorded appearances.', { exact: false }).waitFor();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].workspace_slug, 'djm');
  assert.equal(requests[0].context.player_name, 'Kota Sakurai');
  await page.getByText('ReDream + public sources', { exact: true }).waitFor();
  await page.getByText('Confirm his contract end date.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Official club', exact: true }).getAttribute('href'), 'https://example.org/kota');
  assert.equal(await page.getByRole('link', { name: 'Club evidence', exact: true }).getAttribute('href'), 'https://example.org/kota');
  assert.equal(await page.getByRole('link', { name: 'Unsafe source' }).count(), 0);
  assert.match(await page.getByRole('link', { name: 'Kota Sakurai', exact: true }).getAttribute('href'), /^\/workspace\/djm\?view=players&player=/);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No overflow at ${width}`);
  }
  await page.screenshot({ path: process.env.AGENT_SCREENSHOT || '/workspace/scratch/1cbc2ad37ff3/agent-preview.png', fullPage: true });
  fail = true;
  await page.getByRole('button', { name: 'Ask ReDream', exact: true }).click();
  await page.getByRole('alert').getByText('Please try again shortly.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Your question', exact: true }).inputValue(), 'What do we know about Kota?');
  fail = false; hold = true;
  await page.getByRole('button', { name: 'Ask ReDream', exact: true }).click();
  await page.getByRole('status').getByText('Thinking...', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Switch test workspace', exact: true }).click();
  release();
  await page.getByRole('button', { name: 'Ask a question', exact: true }).click();
  assert.equal(await page.getByText('Kota has ten recorded appearances.', { exact: false }).count(), 0, 'Old response cannot cross a workspace change');
  assert.equal(requests.length, 3, 'Questions never create a capture or save a record');
  assert.deepEqual(errors, []);
  console.log('ReDream questions: context, sources, safe links, retry, workspace isolation and four responsive widths passed.');
} finally { await browser.close(); }
