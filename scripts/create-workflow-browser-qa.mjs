// Exercise the real drawer with external requests mocked; never write customer records.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser = await chromium.launch({executablePath: process.env.CALENDAR_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage']});
const failures = [];
const titles = {player: 'Add player', club: 'Add club', contact: 'Add contact', club_need: 'Add club need', deal: 'Add deal'};
const playerOptions = {options: {players: [{player_id: 'fixture-player', name: 'Example Player', current_club: 'Example FC'}]}};
try {
  for (const scenario of process.env.CREATE_SCENARIOS?.split(',') || ['draft', 'layout', 'refresh', 'options', 'forms', 'brief', 'write', 'write-timeout', 'keyboard', 'timeout', 'empty']) {
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const writes = [], pendingOptions = [];
    let options = 0, refreshFails = true, optionsMode = scenario === 'options' ? 'malformed' : scenario === 'timeout' ? 'hang' : scenario === 'empty' ? 'empty' : 'ready', releaseWrite;
    await page.route('https://example.supabase.co/**', async route => {
      const {action, body} = route.request().postDataJSON(); let value = {ok: true}, status = 200;
      if (action === 'create_options') {
        options++;
        if (optionsMode === 'hang') {pendingOptions.push(route); return;}
        value = optionsMode === 'malformed' ? {options: {players: null}} : optionsMode === 'empty' ? {options: {players: []}} : playerOptions;
      } else if (action === 'fixture_refresh') {
        if (scenario === 'refresh' && refreshFails) {status = 503; value = {error: 'List refresh unavailable'};}
      } else {
        assert.ok(/^create_(player|club|contact|club_need_brief|deal)$/.test(action));
        if(action==='create_club_need_brief')value={created:{created:true,club_need_id:'20000000-0000-4000-8000-000000000001',brief_version:1}};
        writes.push({action, body});
        if(scenario==='write-timeout')await new Promise(resolve=>{releaseWrite=resolve;});
        if (scenario === 'write') {
          if (writes.length === 1) {status = 503; value = {error: 'Please try saving again'};}
          else await new Promise(resolve => {releaseWrite = resolve;});
        }
      }
      await route.fulfill({status, contentType: 'application/json', body: JSON.stringify(value)});
    });
    const open = async kind => {
      const trigger = page.getByRole('button', {name: 'Open ' + kind, exact: true}); await trigger.click();
      const dialog = page.getByRole('dialog', {name: titles[kind], exact: true}); await dialog.waitFor();
      return {trigger, dialog};
    };
    const fill = async (dialog, kind) => {
      if (kind === 'player') {
        await dialog.getByLabel('First name', {exact: true}).fill('Example');
        await dialog.getByLabel('Primary position', {exact: true}).fill('Centre back');
      } else if (kind === 'club') await dialog.getByLabel('Club name', {exact: true}).fill('Example FC');
      else {
        await dialog.getByLabel('Club', {exact: true}).fill('Example FC');
        if (kind === 'club_need') await dialog.getByLabel('Position', {exact: true}).fill('Centre back');
        if (kind === 'contact') await dialog.getByLabel('Contact name', {exact: true}).fill('Example Contact');
        if (kind === 'deal') await dialog.getByRole('combobox', {name: 'Player', exact: true}).selectOption('fixture-player');
      }
    };
    try {
      const url = new URL('/qa-create', process.env.CALENDAR_QA_URL || 'http://127.0.0.1:3113');
      for (let i = 0; i < 60; i++) {try {await page.goto(url.href); break;} catch (error) {if (i === 59) throw error; await page.waitForTimeout(250);}}
      if (scenario === 'timeout'||scenario==='write-timeout') await page.clock.install();
      const kind = scenario==='brief'?'club_need':['options', 'timeout', 'empty'].includes(scenario) ? 'deal' : 'player';
      let {trigger, dialog} = await open(kind);
      if(scenario==='brief'){
        await fill(dialog,kind);
        await dialog.getByText('Budget, contract & availability',{exact:true}).click();
        assert.equal(await dialog.getByLabel('Currency',{exact:true}).inputValue(),'','No assumed currency');
        await dialog.getByLabel('Salary budget (maximum)',{exact:true}).fill('5000');
        await dialog.getByLabel('Currency',{exact:true}).fill('EUR');
        await dialog.getByLabel('Salary period',{exact:true}).selectOption('monthly');
        await dialog.getByLabel('Initial contract (months)',{exact:true}).fill('12');
        await dialog.getByLabel('Guaranteed initial term requested?',{exact:true}).selectOption('true');
        await dialog.getByLabel('Optional extension (months)',{exact:true}).fill('12');
        await dialog.getByLabel('Transfer preference',{exact:true}).selectOption('free_agent');
        await dialog.getByLabel('Availability / joining deadline',{exact:true}).fill('Within two weeks');
        await dialog.getByLabel('Source status',{exact:true}).selectOption('reported');
        await dialog.getByText('EUR 60,000',{exact:true}).waitFor();
        await dialog.getByText('Optional extension budget (not guaranteed)',{exact:true}).waitFor();
        for(const width of [320,390,768,1440]){
          await page.setViewportSize({width,height:600});
          await dialog.getByLabel('Source status',{exact:true}).scrollIntoViewIfNeeded();
          assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Brief fits '+width);
          const save=await dialog.getByRole('button',{name:'Add club need',exact:true}).boundingBox();assert.ok(save&&save.height>=44&&save.y+save.height<=601,'Visible save at '+width);
          if((width===390||width===1440)&&process.env.CREATE_QA_SCREENSHOT)await page.screenshot({path:process.env.CREATE_QA_SCREENSHOT.replace('.png','-'+width+'.png')});
        }
        await dialog.getByRole('button',{name:'Add club need',exact:true}).click();await dialog.waitFor({state:'hidden'});
        assert.deepEqual(writes[0].body.brief,{salary_budget:'5000',currency:'EUR',salary_period:'monthly',salary_tax_basis:null,contract_months:'12',contract_guaranteed:'true',option_months:'12',transfer_type:'free_agent',transfer_budget:null,availability_notes:'Within two weeks',source_status:'reported'});
        assert.equal(writes.length,1);
      } else if (scenario === 'draft') {
        const name = dialog.getByLabel('First name', {exact: true});
        assert.ok(await name.evaluate(node => node === document.activeElement), 'The first field receives focus');
        await name.fill('Draft Player');
        await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
        const discard = page.getByRole('alertdialog', {name: 'Discard these changes?', exact: true}); await discard.waitFor({timeout: 2500});
        await page.keyboard.press('Escape'); await discard.waitFor({state: 'hidden'}); assert.equal(await name.inputValue(), 'Draft Player');
        await page.keyboard.press('Escape'); await discard.waitFor();
        await discard.getByRole('button', {name: 'Discard changes', exact: true}).click(); await dialog.waitFor({state: 'hidden'});
        assert.ok(await trigger.evaluate(node => node === document.activeElement), 'Close restores focus to the Add trigger');
        ({trigger, dialog} = await open('player'));
        await dialog.getByRole('button', {name: 'Close Add player', exact: true}).click(); await dialog.waitFor({state: 'hidden'});
        assert.ok(await trigger.evaluate(node => node === document.activeElement), 'Clean close restores focus');
      } else if (scenario === 'layout') {
        assert.ok(await dialog.getByRole('button', {name: 'Add player', exact: true}).evaluate(node => getComputedStyle(node).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(node).backgroundColor !== 'rgb(255, 255, 255)'), 'Portalled Save keeps its tenant theme');
        await dialog.getByRole('button', {name: /More details/}).click();
        for (const width of [320, 390, 768, 1440]) {
          await page.setViewportSize({width, height: 460});
          await page.waitForFunction(() => {const modal = document.querySelector('[role="dialog"]'); return modal && Math.abs(modal.parentElement.getBoundingClientRect().height - visualViewport.height) < 1;});
          const box = await dialog.getByRole('button', {name: 'Add player', exact: true}).boundingBox();
          assert.ok(box && box.height >= 44 && box.y >= 0 && box.y + box.height <= 461, 'Save stays visible at ' + width + ' with the keyboard-height viewport: ' + JSON.stringify(box));
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No overflow at ' + width);
        }
        await page.setViewportSize({width: 390, height: 844});
        if (process.env.CREATE_QA_SCREENSHOT) await page.screenshot({path: process.env.CREATE_QA_SCREENSHOT});
      } else if (scenario === 'refresh') {
        await fill(dialog, kind); await dialog.getByRole('button', {name: titles[kind], exact: true}).click();
        await dialog.getByRole('heading', {name: 'Player added', exact: true}).waitFor({timeout: 2500});
        await dialog.getByRole('alert').waitFor(); assert.equal(writes.length, 1);
        await dialog.getByRole('button', {name: 'Refresh list', exact: true}).click(); await dialog.getByRole('alert').waitFor();
        assert.ok(await dialog.evaluate(node => node.contains(document.activeElement)), 'Failed refresh retry keeps focus in the saved panel');
        refreshFails = false; await dialog.getByRole('button', {name: 'Refresh list', exact: true}).click(); await dialog.waitFor({state: 'hidden'}); assert.equal(writes.length, 1, 'Refresh retries do not create another player');
      } else if (scenario === 'forms') {
        for (const formKind of Object.keys(titles)) {
          if (formKind !== 'player') ({trigger, dialog} = await open(formKind));
          await fill(dialog, formKind);
          await dialog.getByRole('button', {name: titles[formKind], exact: true}).click(); await dialog.waitFor({state: 'hidden'});
          assert.equal(writes.at(-1).action, 'create_' + (formKind==='club_need'?'club_need_brief':formKind));
          assert.ok(await trigger.evaluate(node => node === document.activeElement), 'Saved ' + formKind + ' restores focus');
        }
        assert.equal(writes.length, 5);
      } else if(scenario==='write-timeout'){
        await fill(dialog,kind);await dialog.getByRole('button',{name:titles[kind],exact:true}).click();await dialog.locator('fieldset:disabled').waitFor();
        await page.clock.fastForward(12_100);await dialog.getByRole('alert').filter({hasText:'Could not confirm the save'}).waitFor();
        assert.equal(await dialog.getByLabel('First name',{exact:true}).inputValue(),'Example');
        assert.equal(await dialog.getByRole('button',{name:titles[kind],exact:true}).count(),0,'An unknown creation outcome cannot be resent');
        assert.equal(writes.length,1);assert.equal(await dialog.getByRole('heading',{name:'Player added',exact:true}).count(),0);
        releaseWrite();await dialog.getByRole('button',{name:'Close and review the list',exact:true}).click();await dialog.waitFor({state:'hidden'});
      } else if (scenario === 'write') {
        await fill(dialog, kind); const save = dialog.getByRole('button', {name: titles[kind], exact: true}); await save.click();
        await dialog.getByRole('alert').waitFor(); assert.equal(await dialog.getByLabel('First name', {exact: true}).inputValue(), 'Example');
        await page.keyboard.press('Shift+Tab');
        assert.ok(await dialog.evaluate(node => node.contains(document.activeElement)), 'Failed save keeps reverse keyboard navigation in the dialog');
        await save.click();
        await dialog.locator('fieldset:disabled').waitFor();
        await dialog.locator('form').evaluate(node => {node.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})); node.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));});
        assert.ok(await dialog.evaluate(node => node.contains(document.activeElement)), 'Focus remains in the dialog during a pending write');
        await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Escape');
        assert.ok(await dialog.evaluate(node => node.contains(document.activeElement)), 'Pending save traps keyboard focus');
        assert.equal(await page.getByRole('alertdialog').count(), 0); assert.equal(writes.length, 2, 'No duplicate writes while saving');
        assert.deepEqual(writes[0], writes[1], 'Retry preserves the entered record');
        releaseWrite(); await dialog.waitFor({state: 'hidden'});
      } else if (scenario === 'keyboard') {
        const close = dialog.getByRole('button', {name: 'Close Add player', exact: true}); await close.focus();
        await page.keyboard.press('Shift+Tab'); assert.ok(await dialog.getByRole('button', {name: titles[kind], exact: true}).evaluate(node => node === document.activeElement));
        await page.keyboard.press('Tab'); assert.ok(await close.evaluate(node => node === document.activeElement));
        await fill(dialog, kind); await page.setViewportSize({width: 1440, height: 900}); await page.mouse.click(5, 5);
        const discard = page.getByRole('alertdialog'); await discard.waitFor();
        assert.ok(await dialog.evaluate(node => node.inert));
        await discard.getByRole('button', {name: 'Cancel', exact: true}).click(); await discard.waitFor({state: 'hidden'});
        assert.equal(await dialog.getByLabel('First name', {exact: true}).inputValue(), 'Example');
      } else if (scenario === 'empty') {
        await dialog.getByText(/Add a player first/).waitFor();
        assert.ok(await dialog.getByRole('button', {name: titles[kind], exact: true}).isDisabled());
      } else {
        if (scenario === 'timeout') {
          await dialog.getByText('Loading your players', {exact: true}).waitFor();
          await page.clock.fastForward(12_100);
        }
        await dialog.getByRole('alert').waitFor({timeout: 3000});
        assert.equal(await dialog.getByText(/Add a player first/).count(), 0, 'A failed options request is not an empty player list');
        await dialog.getByLabel('Club', {exact: true}).fill('Example FC'); optionsMode = 'ready';
        await dialog.getByRole('button', {name: 'Retry players', exact: true}).click();
        assert.ok(await dialog.evaluate(node => node.contains(document.activeElement)), 'Retry keeps keyboard focus in the form after replacing its button');
        await dialog.getByRole('combobox', {name: 'Player', exact: true}).selectOption('fixture-player');
        for (const route of pendingOptions) await route.fulfill({contentType: 'application/json', body: JSON.stringify({options: {players: []}})});
        assert.equal(await dialog.getByLabel('Club', {exact: true}).inputValue(), 'Example FC', 'Retry retains the entered deal');
        assert.equal(await dialog.getByRole('combobox', {name: 'Player', exact: true}).inputValue(), 'fixture-player', 'Late old options do not overwrite a recovered list');
      }
      assert.deepEqual(errors, []); console.log('Create workflow passed: ' + scenario);
    } catch (error) {failures.push({scenario, message: error.message, writes, options, errors});}
    finally {releaseWrite?.(); await page.close();}
  }
  assert.deepEqual(failures, []);
} finally {await browser.close();}
