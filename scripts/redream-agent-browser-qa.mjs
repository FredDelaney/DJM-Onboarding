import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: process.env.CALENDAR_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(()=>{
    if(location.hostname!=='127.0.0.1')return;
    if(sessionStorage.getItem('qa-auth-initialised'))return;
    sessionStorage.setItem('qa-auth-initialised','1');
    const user={id:'10000000-0000-4000-8000-000000000001',email:'synthetic@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
    const token='eyJhbGciOiJIUzI1NiJ9.'+btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600}))+'.fixture';
    localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user}));
  });
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
        ok: true, answer: 'Example Player has ten recorded appearances. [Club evidence](https://example.org/example-player)\nHis contract still needs confirming.', basis: 'mixed',
        needs_clarification: false, clarification_question: null, next_action: 'Confirm his contract end date.', evidence: ['Recorded ten appearances.'], uncertainties: ['Contract end date unverified.'],
        sources: [{ title: 'Official club', url: 'https://example.org/example-player' }, { title: 'Unsafe source', url: 'javascript:alert(1)' }],
        internal_matches: [{ id: '11111111-1111-4111-8111-111111111111', kind: 'player', title: 'Example Player' }],
      }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
  const url = new URL('/qa-redream-agent', process.env.CALENDAR_QA_URL || 'http://127.0.0.1:3113');
  for (let attempt = 0; attempt < 60; attempt++) {
    try { await page.goto(url.href); break; } catch (error) { if (attempt === 59) throw error; await page.waitForTimeout(250); }
  }
  await page.getByRole('button', { name: 'Ask a question', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your question', exact: true }).fill('What do we know about Example Player?');
  await page.getByRole('button', { name: 'Ask ReDream', exact: true }).click();
  await page.getByText('Example Player has ten recorded appearances.', { exact: false }).waitFor();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].workspace_slug, 'djm');
  assert.equal(requests[0].context.player_name, 'Example Player');
  await page.getByRole('button',{name:'Review as a task',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'Your update',exact:true}).inputValue(),'Create a task for me: Confirm his contract end date.');
  assert.equal(requests.length,1,'Preparing a proposal does not submit or approve it');
  await page.getByRole('button',{name:'Ask a question',exact:true}).click();
  await page.getByText('ReDream + public sources', { exact: true }).waitFor();
  await page.getByText('Confirm his contract end date.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Official club', exact: true }).getAttribute('href'), 'https://example.org/example-player');
  assert.equal(await page.getByRole('link', { name: 'Club evidence', exact: true }).getAttribute('href'), 'https://example.org/example-player');
  assert.equal(await page.getByRole('link', { name: 'Unsafe source' }).count(), 0);
  assert.match(await page.getByRole('link', { name: 'Example Player', exact: true }).getAttribute('href'), /^\/workspace\/djm\?view=players&player=/);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No overflow at ${width}`);
  }

  await page.getByRole('textbox', { name: 'Your question', exact: true }).fill('What do we know about Example Player?');
  await page.getByRole('button', { name: 'Assess the options', exact: true }).click();
  await page.getByRole('button', { name: 'Ask ReDream', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value === '');
  assert.equal(requests[1].history[0].content, 'What do we know about Example Player?');
  assert.equal(requests[1].history[1].role, 'assistant');
  await page.getByText('Earlier in this conversation', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'New conversation', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your question', exact: true }).fill('What do we know about Example Player?');
  fail = true;
  await page.getByRole('button', { name: 'Ask ReDream', exact: true }).click();
  await page.getByRole('alert').getByText('Please try again shortly.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('textbox', { name: 'Your question', exact: true }).inputValue(), 'What do we know about Example Player?');
  fail = false; hold = true;
  await page.getByRole('button', { name: 'Ask ReDream', exact: true }).click();
  await page.getByRole('status').getByText('Thinking...', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Switch test workspace', exact: true }).click();
  release();
  await page.getByRole('button', { name: 'Ask a question', exact: true }).click();
  assert.equal(await page.getByText('Example Player has ten recorded appearances.', { exact: false }).count(), 0, 'Old response cannot cross a workspace change');
  assert.equal(requests.length, 4, 'Questions never create a capture or save a record');
  await page.getByRole('button',{name:'Switch test workspace',exact:true}).click();
  await page.getByRole('textbox',{name:'Your update',exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Your update',exact:true}).fill('Synthetic unsent note for the current workspace.');
  await page.reload();
  await page.getByRole('textbox',{name:'Your update',exact:true}).waitFor();
  assert.equal(await page.getByRole('textbox',{name:'Your update',exact:true}).inputValue(),'Synthetic unsent note for the current workspace.');
  await page.getByRole('button',{name:'Switch test workspace',exact:true}).click();
  await page.getByRole('button',{name:'Type instead',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'Your update',exact:true}).inputValue(),'','An unsent draft cannot cross workspaces');
  await page.getByRole('textbox',{name:'Your update',exact:true}).fill('Another private unsent note.');
  await page.getByRole('button',{name:'Sign out test account',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Your update"]')?.value==='');
  assert.deepEqual(errors, []);
  console.log('ReDream questions: context, sources, safe links, retry, workspace isolation and four responsive widths passed.');
} finally { await browser.close(); }
