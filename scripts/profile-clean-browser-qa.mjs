// Real profile UI; all external reads and writes use isolated fixture responses.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser = await chromium.launch({executablePath: process.env.CALENDAR_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage']});
const failures = [];
try {
  for (const scenario of process.env.PROFILE_CLEAN_SCENARIOS?.split(',') || ['compact', 'prepare', 'queued', 'fresh', 'context', 'context-failed', 'context-timeout', 'failure', 'links', 'layout']) {
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    const calls = [], errors = []; page.on('pageerror', error => errors.push(error.message));
    let refreshed = false, saved = null, failed = scenario === 'failure', delayApply = scenario === 'context-timeout', releaseApply, statusReads = 0;
    const player = {id: 'fixture-profile', first_name: 'Example', last_name: 'Player', primary_position: 'Centre back', current_club: scenario.startsWith('context') ? '' : 'Example FC', current_league: 'National League', current_country: 'NZ', current_season_label: '2026', nationalities: ['NZ'], contract_status: 'under_contract', contract_expiry: '2027-06-30', verified_at: '2026-10-10T12:00:00Z', verification_status: 'verified'};
    const profile = () => ({player, settings: saved || {intro_line: 'A centre back with senior experience.', why_review: 'Review the recorded figures and footage together.'}, published: {published: false}, career: [{id: 'season', season_label: '2026', club_name: player.current_club, league: 'National League', country: 'NZ', appearances: 17, starts: 16, minutes: refreshed ? 1420 : null, goals: 1, assists: 0, source_name: 'Official competition reports', source_url: 'https://example.test/season', source_reviewed_at: '2026-10-10T12:00:00Z'}], videos: [], documents: [], shares: [{id: 'old', club_name: 'Archived club example', active: false, expires_at: '2026-01-01T00:00:00Z', view_count: 3}], deals: [], clubs: [], communication: {summary: {}, items: [], open_followups: []}, secondary_ready: true, auto_key_stats: [{label: 'Apps', value: 17}, {label: 'Starts', value: 16}], auto_stats_meta: {checked_at: '2026-10-01T12:00:00Z'}, branding: {display_name: 'Example Agency', support_email: 'agent@example.test'}});
    await page.route('https://example.supabase.co/**', async route => {
      const {action, body = {}} = route.request().postDataJSON(); calls.push({action, body});
      let value = {}, status = 200;
      if (['player_profile_core', 'player_profile'].includes(action)) {
        if (refreshed && scenario === 'queued') await new Promise(resolve => setTimeout(resolve, 500));
        const data = profile();
        if (scenario === 'fresh') data.auto_stats_meta.checked_at = new Date().toISOString();
        if (scenario === 'links') data.shares.unshift(...Array.from({length: 12}, (_, i) => ({id: 'active-' + i, club_name: 'Current club ' + i, active: true, expires_at: '2099-01-01T00:00:00Z', view_count: 0})));
        value = {profile: data};
      }
      else if (action === 'player_data_status') value = {job: {id: 'stats-check', status: refreshed && scenario === 'queued' && ++statusReads < 3 ? 'running' : refreshed && scenario === 'context-failed' ? 'failed' : 'applied', summary: {message: refreshed && scenario === 'context-failed' ? 'Reliable new figures could not be confirmed.' : 'Source check completed. Recorded figures were retained where no reliable change was found.', checked_at: '2026-10-15T12:00:00Z'}}};
      else if (action === 'player_data_refresh') {refreshed = true; value = {job: {id: 'stats-check', status: 'queued'}};}
      else if (action === 'player_context_research') value = {proposal: {fields: {current_club: 'Suggested FC'}, confidence: 0.96, reason: 'The competition profile confirms the current squad.', sources: [{title: 'Official player page', url: 'https://example.test/player'}]}};
      else if (action === 'player_context_apply') {if (delayApply) {delayApply = false; await new Promise(resolve => {releaseApply = resolve;});} Object.assign(player, body.fields); value = {ok: true, player};}
      else if (action === 'player_profile_prepare') {
        if (failed) {status = 503; value = {error: 'Preparation temporarily unavailable'};}
        else value = {ai_available: true, proposal: {kind: 'general', headline: 'A centre back with 17 appearances.', why_review: 'Recorded first-team experience with current-season evidence.', selected_stat_refs: ['season:appearances'], selected_video_id: null, hidden_sections: [], source_fingerprint: 'fixture-current-evidence'}, evidence: {stats: [{ref: 'season:appearances', label: 'Apps', value: 17, seasonLabel: '2026', competition: 'National League', source: {name: 'Official competition reports', status: 'verified'}}], videos: []}};
      } else if (action === 'player_profile_save') {saved = body.settings; value = {ok: true};}
      else if (action === 'player_profile_versions') value = {versions: []};
      else if (action === 'profile_share_clubs') value = {clubs: []};
      else if (action === 'create_options') value = {options: {clubs: [], players: []}};
      else {status = 400; value = {error: 'Unexpected fixture action ' + action};}
      await route.fulfill({status, contentType: 'application/json', body: JSON.stringify(value)});
    });
    try {
      const url = new URL('/qa-profile-clean', process.env.CALENDAR_QA_URL || 'http://127.0.0.1:3113');
      const initialStatus = page.waitForResponse(response => response.request().postDataJSON()?.action === 'player_data_status');
      for (let i = 0; i < 60; i++) {try {await page.goto(url.href); break;} catch (error) {if (i === 59) throw error; await page.waitForTimeout(250);}}
      await page.getByRole('heading', {name: 'Example Player', exact: true}).waitFor();
      await initialStatus;
      await page.getByText('Source check finished', {exact: true}).waitFor({state: 'attached'});
      if (scenario === 'compact') {
        if (process.env.PROFILE_CLEAN_SCREENSHOT_DIR) {await mkdir(process.env.PROFILE_CLEAN_SCREENSHOT_DIR, {recursive: true}); await page.screenshot({path: process.env.PROFILE_CLEAN_SCREENSHOT_DIR + '/clean-profile-390.png', fullPage: true});}
        assert.equal(await page.getByText('Source check finished', {exact: true}).isVisible().catch(() => false), false, 'A completed old check does not occupy the default profile');
        assert.equal(await page.getByText('No conversations linked to this player yet.', {exact: true}).isVisible().catch(() => false), false, 'Empty activity does not occupy a separate card');
        assert.equal(await page.getByText('Archived club example', {exact: true}).isVisible().catch(() => false), false, 'Archived links are outside the default view');
        await page.getByRole('group').filter({has: page.locator('summary', {hasText: 'Sources and history'})}).locator('summary').click();
        await page.getByText('Official competition reports', {exact: true}).first().waitFor();
      } else if (scenario === 'layout') {
        for (const width of [320, 390, 768, 1440]) {
          await page.setViewportSize({width, height: 844});
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Profile fits ' + width);
          const unknown = page.getByLabel('Minutes not available', {exact: true});
          await unknown.waitFor({timeout: 2000});
          assert.ok((await unknown.boundingBox()).height < 35, 'Unknown statistics stay compact');
        }
      } else if (scenario === 'links') {
        await page.getByText('Current club 11', {exact: true}).waitFor();
        assert.equal(await page.getByText('Archived club example', {exact: true}).isVisible().catch(() => false), false);
        await page.getByRole('button', {name: 'Older links (1)', exact: true}).click();
        await page.getByText('Archived club example', {exact: true}).waitFor({timeout: 2000});
        assert.equal(await page.getByRole('button', {name: 'Revoke profile link', exact: true}).count(), 12, 'Only current links offer revoke');
      } else {
        const started = page.waitForRequest(request => request.postDataJSON()?.action === (scenario.startsWith('context') ? 'player_context_research' : scenario === 'fresh' ? 'player_profile_prepare' : 'player_data_refresh'), {timeout: 2500});
        await page.getByRole('button', {name: /Complete with AI|Prepare Profile/}).first().click(); await started;
        if (scenario.startsWith('context')) {
          const input = page.getByRole('textbox', {name: 'Current club', exact: true}); await input.waitFor(); await input.fill('Reviewed FC');
          if (scenario === 'context-timeout') await page.clock.install();
          const applied = page.waitForRequest(request => request.postDataJSON()?.action === 'player_context_apply');
          await page.getByRole('button', {name: 'Apply & continue', exact: true}).click();
          await applied;
          if (scenario === 'context-timeout') {
            await page.clock.fastForward(35001);
            await page.getByText('The request took too long. Please try again.', {exact: true}).first().waitFor();
            assert.equal(calls.filter(call => call.action === 'player_profile_prepare').length, 0, 'A timed-out context write cannot implicitly prepare or save');
            const late = page.waitForResponse(response => response.request().postDataJSON()?.action === 'player_context_apply');
            releaseApply(); await late;
            assert.ok(await page.getByRole('button', {name: 'Apply & continue', exact: true}).isEnabled(), 'A stalled stage releases busy controls');
            await page.getByRole('button', {name: 'Apply & continue', exact: true}).click();
          }
        }
        if (scenario === 'failure') {
          await page.getByText('Preparation temporarily unavailable', {exact: true}).first().waitFor();
          assert.equal(calls.filter(c => c.action === 'player_profile_save').length, 0);
          failed = false;
          await page.getByRole('button', {name: /Complete with AI|Prepare general profile/}).first().click();
        }
        const headline = page.getByRole('textbox', {name: /Headline/}).first(); await headline.waitFor({timeout: 12_000});
        assert.equal(await headline.inputValue(), 'A centre back with 17 appearances.');
        if (scenario === 'fresh') assert.equal(calls.filter(c => c.action === 'player_data_refresh').length, 0, 'Fresh recorded statistics avoid an unnecessary refresh');
        if (scenario === 'context-failed') {
          assert.ok(await page.getByRole('region', {name: 'Player data', exact: true}).getByText('2026 · Reviewed FC · National League', {exact: true}).isVisible(), 'Saved player details appear even when the statistics check fails');
          await page.getByText('Update needs attention', {exact: true}).waitFor({timeout: 2000});
        }
        await headline.fill('My reviewed player headline');
        let typedOverview;
        if (scenario === 'prepare') {
          const overview = page.getByRole('textbox', {name: 'Why this player?', exact: true});
          await overview.fill('x'.repeat(1200));
          await overview.press('Space');
          await overview.press('Enter');
          assert.equal(await overview.inputValue(), 'x'.repeat(1200) + ' \n', 'A full AI draft must not block spaces or Enter');
          await overview.fill('');
          await overview.pressSequentially('A left footed  defender.');
          await overview.press('Enter');
          await overview.press('Enter');
          await overview.pressSequentially('A clear role in possession.');
          typedOverview = 'A left footed  defender.\n\nA clear role in possession.';
          assert.equal(await overview.inputValue(), typedOverview);
        }

        if (scenario === 'prepare') {
          await page.getByRole('button', {name: 'Close profile preparation', exact: true}).click();
          await page.locator('summary').filter({hasText: /^More/}).click();
          assert.equal(await page.getByRole('button', {name: 'Prepare for a club', exact: true}).count(), 0, 'An unsaved draft cannot be silently replaced from More');
          await page.locator('summary').filter({hasText: /^More/}).click();
          await page.getByRole('button', {name: 'Complete with AI', exact: true}).first().click();
          assert.equal(await headline.inputValue(), 'My reviewed player headline', 'Closing and resuming preserves the edited proposal');
        }
        assert.equal(calls.filter(c => c.action === 'player_profile_save' || c.action.includes('publish')).length, 0, 'AI preparation never publishes or saves its draft implicitly');
        await page.getByRole('button', {name: 'Save profile', exact: true}).click();
        for (let i = 0; i < 40 && !saved; i++) await page.waitForTimeout(50);
        assert.equal(saved?.intro_line, 'My reviewed player headline', 'Saved presentation uses the user edit');
        if (typedOverview) assert.equal(saved?.why_review, typedOverview, 'AI draft saves the exact typed spaces and paragraphs');
        assert.deepEqual(saved?.selected_stat_refs, ['season:appearances']);
        assert.equal(calls.filter(c => c.action.includes('publish')).length, 0, 'Saving a prepared draft never publishes it');
        if (scenario === 'queued') {
          assert.ok(statusReads >= 3, 'The UI observes queued/running statistics before completion');
          assert.deepEqual((await page.getByRole('alert').allTextContents()).filter(value=>value.trim()), [], 'Concurrent status observers cannot report a successful reload as failed');
        }
        if (scenario.startsWith('context')) assert.equal(calls.find(c => c.action === 'player_context_apply')?.body.fields.current_club, 'Reviewed FC');
      }
      assert.deepEqual(errors, []); console.log('Clean profile passed: ' + scenario);
    } catch (error) {failures.push({scenario, message: error.message, alerts:await page.getByRole('alert').allTextContents(), actions: calls.map(c => c.action), errors, text: await page.locator('body').innerText()});}
    finally {await page.close();}
  }
  assert.deepEqual(failures, []);
} finally {await browser.close();}
