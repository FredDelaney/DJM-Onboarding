import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser = await chromium.launch({executablePath: process.env.CALENDAR_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage']});
const failures = [];
try {
  for (const kind of ['club', 'contact', 'deal']) {
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    const calls = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const person = {person: {person_id: 'person-fixture', full_name: 'Example Contact'}, reach: {email: {value: 'example@example.test'}}, employment: {employment_id: 'employment-fixture', organisation_name: 'Example FC', role_title: 'Sporting director', verification_state: 'recently_verified', last_verified_at: '2026-10-15T10:00:00Z'}, relationship_memory: {state: 'current', recent_interactions: [], promises: [], followups: []}};
    await page.route('https://example.supabase.co/**', async route => {
      const {action, body = {}} = route.request().postDataJSON(); calls.push({action, body});
      let value = {}, status = 200;
      if (action === 'club_account') value = {club: {club: {organisation_id: 'club-fixture', name: 'Example FC'}, access: {}, demand: {items: []}, relationship_activity: {recent: []}, open_work: {tasks: [], commitments: []}, commercial: {deals: []}, pursuits: []}};
      else if (action === 'redream_relationship_person' || action === 'redream_relationship_confirm_employment') value = person;
      else if (action === 'redream_birthday_record') value = {birthday: null};
      else if (action === 'deal_war_room') value = {war_room: {deal: {id: 'deal-fixture', stage: 'negotiation', next_action_text: 'Review the recorded club terms'}, decision_pressure: {state: 'monitor', observed_days_in_stage: 12}}};
      else {status = 400; value = {error: 'Unexpected fixture action ' + action};}
      await route.fulfill({status, contentType: 'application/json', body: JSON.stringify(value)});
    });
    try {
      const url = new URL('/qa-record-clean', process.env.CALENDAR_QA_URL || 'http://127.0.0.1:3113');
      url.searchParams.set('kind', kind);
      for (let i = 0; i < 60; i++) {try {await page.goto(url.href); break;} catch (error) {if (i === 59) throw error; await page.waitForTimeout(250);}}
      const supporting = page.getByText(kind === 'club' ? 'No conversation yet' : kind === 'contact' ? 'LAST CHECKED' : '12 observed days in stage', {exact: true});
      await supporting.waitFor({state: 'attached', timeout: 5000});
      assert.equal(await supporting.isVisible(), false, kind + ' supporting detail starts collapsed');
      await page.locator('summary').filter({hasText: kind === 'club' ? /^Conversations/ : kind === 'contact' ? /^Employment details/ : /^Deal details/}).click();
      assert.ok(await supporting.isVisible(), 'Supporting information remains accessible');
      if (kind === 'club') {
        await page.getByRole('button', {name: 'Open Opportunities', exact: true}).click();
        await page.getByText('Opportunities opened', {exact: true}).waitFor();
      } else if (kind === 'contact') {
        const confirmed = page.waitForResponse(response => response.request().postDataJSON()?.action === 'redream_relationship_confirm_employment');
        await page.getByRole('button', {name: 'Confirm still at Example FC', exact: true}).click();
        await confirmed;
        assert.equal(calls.find(call => call.action === 'redream_relationship_confirm_employment')?.body.p_employment_id, 'employment-fixture');
      } else {
        assert.ok(await page.getByText('Review the recorded club terms', {exact: true}).isVisible());
        await page.getByRole('button', {name: 'Negotiation room', exact: true}).click();
        await page.getByText('Negotiation opened', {exact: true}).waitFor();
      }
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({width, height: 844});
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), kind + ' fits ' + width);
      }
      assert.deepEqual(errors, []); console.log('Clean record passed: ' + kind);
    } catch (error) {failures.push({kind, message: error.message, calls, errors, text: await page.locator('body').innerText()});}
    finally {await page.close();}
  }
  assert.deepEqual(failures, []);
} finally {await browser.close();}
