import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';

const browser = await chromium.launch({executablePath: process.env.CALENDAR_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage']});
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({viewport: {width, height: 844}, isMobile: width === 390, hasTouch: width === 390});
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const root = process.env.WORKSPACE_FLOW_QA_URL || 'http://127.0.0.1:3113/workspace/qa-find-flow';
    for (let attempt = 0; attempt < 60; attempt++) {
      try {await page.goto(root + '?view=players&player=qa-player-0&profile=1&scenario=populated'); break;}
      catch (error) {if (attempt === 59) throw error; await page.waitForTimeout(250);}
    }
    await page.getByRole('button', {name: 'Edit profile', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Edit Player Profile', exact: true});
    const overview = dialog.getByLabel('Why this player?', {exact: true});
    await overview.fill('');
    // Typing every key catches controlled-input whitespace bugs that fill/paste misses.
    await overview.pressSequentially('Left footed  defender ');
    await overview.press('Enter');
    await overview.press('Enter');
    await overview.pressSequentially('Creates space for team mates.');
    const typed = 'Left footed  defender \n\nCreates space for team mates.';
    assert.equal(await overview.inputValue(), typed, 'Spaces and blank paragraphs survive each keystroke');
    // Home scrolls without moving the caret on macOS. Set the intended edit
    // position explicitly, then keep real keystrokes to catch controlled-input jumps.
    await overview.evaluate((node,position)=>node.setSelectionRange(position,position),typed.indexOf('Creates'));
    await overview.pressSequentially('Also ');
    const revised = typed.replace('Creates', 'Also Creates');
    assert.equal(await overview.inputValue(), revised, 'Editing in the middle keeps the caret in place');
    const story = revised + '\n\n' + 'Recorded first-team experience with a clear role in possession. '.repeat(10) + '\n\nFinal overview sentence must appear in the PDF.';
    const summary = 'Career context.\n\n' + 'Progressed through academy football into the first team. '.repeat(8) + '\n\nFinal career sentence must appear in the PDF.';
    await overview.fill('x'.repeat(1201));
    await overview.press('Space');
    await overview.press('Enter');
    assert.equal(await overview.inputValue(), 'x'.repeat(1201) + ' \n', 'Typing never silently stops at the storage limit');
    await dialog.getByRole('button', {name: 'Save', exact: true}).click();
    await dialog.getByRole('alert').filter({hasText: 'Your full draft is still here.'}).waitFor();
    await overview.fill(story);
    await dialog.getByLabel('Career summary', {exact: true}).fill(summary);
    await dialog.getByRole('button', {name: 'Save', exact: true}).click();
    await dialog.getByRole('status').filter({hasText: 'Player Profile saved.'}).waitFor();
    const saved = await page.evaluate(() => window.qaProfileSave);
    assert.equal(saved.why_review, story);
    assert.equal(saved.career_summary, summary);
    await dialog.getByRole('button', {name: 'Close', exact: true}).click();
    await page.getByRole('button', {name: 'Edit profile', exact: true}).click();
    assert.equal(await overview.inputValue(), story, 'Reopening retains the full saved story');
    await dialog.getByRole('button', {name: 'Close', exact: true}).click();
    await page.getByRole('button', {name: 'Preview Player Profile', exact: true}).click();
    const preview = page.locator('.dossier-root');
    assert.equal(await preview.locator('.dossier-why').textContent(), story);
    const metrics = await preview.locator('.dossier-why').evaluate(el => ({space: getComputedStyle(el).whiteSpace, size: parseFloat(getComputedStyle(el).fontSize)}));
    assert.ok(['pre-wrap', 'break-spaces'].includes(metrics.space), 'The preview displays the written paragraph breaks');
    assert.ok(metrics.size <= 19, 'Long overview uses body typography');
    assert.ok(await preview.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'The preview fits its viewport');
    if (process.env.PROFILE_STORY_SCREENSHOT_DIR) {
      await mkdir(process.env.PROFILE_STORY_SCREENSHOT_DIR, {recursive: true});
      await page.screenshot({path: process.env.PROFILE_STORY_SCREENSHOT_DIR + '/story-preview-' + width + '.png', fullPage: true});
    }
    const download = page.waitForEvent('download');
    await preview.getByRole('button', {name: /PDF|Download/}).click();
    const file = await download;
    const output = process.env.PROFILE_STORY_PDF_DIR || '/tmp/redream-profile-story';
    await mkdir(output, {recursive: true});
    await file.saveAs(output + '/profile-' + width + '.pdf');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Profile story: real typing, caret editing, multiline save/reopen, readable preview and PDF downloads passed.');
} finally {await browser.close();}
