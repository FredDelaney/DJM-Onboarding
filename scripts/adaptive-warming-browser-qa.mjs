import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser = await chromium.launch({executablePath: process.env.CALENDAR_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage']});
try {
  for (const connection of [{saveData: true, effectiveType: '4g'}, {saveData: false, effectiveType: '3g'}]) {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    await page.addInitScript(value => {Object.defineProperty(navigator, 'connection', {configurable: true, value: Object.assign(new EventTarget(), value)});}, connection);
    const warming = [];
    await page.route('https://example.supabase.co/**', route => {
     if(new URL(route.request().url()).pathname.endsWith('/redream_home_relevance_v1'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({visible_indices:(route.request().postDataJSON()?.p_items||[]).map((_,index)=>index),editable_indices:(route.request().postDataJSON()?.p_items||[]).map((_,index)=>index)})});
      const body = route.request().postDataJSON() || {}, path = new URL(route.request().url()).pathname;
      let data = {};
      if (body.action === 'tenants') data = {tenants: [{tenant_id: 'qa-tenant', slug: 'qa', role: 'owner', display_name: 'QA agency'}]};
      else if (body.action === 'home_focus') data = {home: {attention: {judgement: [{command_id: 'qa-task', source_type: 'task', source_id: '30000000-0000-4000-8000-000000000001', title: 'A simple follow-up'}]}}};
      else if (body.action === 'players_workspace') {warming.push('players'); data = {players: {items: [], total: 0, has_more: false}};}
      else if (/redream_autopilot_(market|relationships|calendar)$/.test(path)) {warming.push(path.split('/').at(-1)); data = {};}
      else if (path.endsWith('/redream_assigned_work_page_v1')) data = {items: [], next_cursor: null};
      else if (path.endsWith('/redream_ai_current_access')) data = {enabled: false};
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(data)});
    });
    const url = new URL('/qa-command', process.env.CALENDAR_QA_URL || 'http://127.0.0.1:3113');
    for (let i = 0; i < 60; i++) {try {await page.goto(url.href); break;} catch (error) {if (i === 59) throw error; await page.waitForTimeout(250);}}
    await page.getByText('A simple follow-up', {exact: true}).waitFor();
    await page.waitForTimeout(2000);
    assert.deepEqual(warming, [], 'Limited connections must not fetch hidden sections in the background');
    // This Pages harness holds its App Router URL context fixed. Check the
    // real navigation intent's request here; the App Router matrix checks rendering.
    const requested = page.waitForResponse(response => response.request().method() === 'POST' && response.request().postDataJSON()?.action === 'players_workspace');
    await page.getByRole('link', {name: 'Players', exact: true}).first().click(); await requested;
    assert.deepEqual(warming, ['players'], 'Explicit navigation still requests its destination immediately');
    await page.close(); console.log('Adaptive warming passed: ' + JSON.stringify(connection));
  }
} finally {await browser.close();}
