import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
const browser = await chromium.launch({executablePath: process.env.CALENDAR_CHROMIUM, args: ['--no-sandbox', '--disable-dev-shm-usage']});
const failures = [];
try {
  for (const kind of process.env.ENTITY_QA_ONLY==='1'?[]:['club', 'contact', 'deal']) {
    const page = await browser.newPage({viewport: {width: 390, height: 844}});
    const calls = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const person = {person: {person_id: 'person-fixture', full_name: 'Example Contact'}, reach: {email: {value: 'example@example.test'}}, employment: {employment_id: 'employment-fixture', organisation_name: 'Example FC', role_title: 'Sporting director', verification_state: 'recently_verified', last_verified_at: '2026-10-15T10:00:00Z'}, relationship_memory: {state: 'current', recent_interactions: [], promises: [], followups: []}};
    await page.route('https://example.supabase.co/**', async route => {
      const {action, body = {}} = route.request().postDataJSON(); calls.push({action, body});
      let value = {}, status = 200;
      if (action === 'club_account') value = {club: {club: {organisation_id: 'club-fixture', name: 'Example FC'}, access: {}, demand: {items: [{club_need_id:'need-outside-summary',title:'Recorded centre-back need'}]}, relationship_activity: {recent: []}, open_work: {tasks: [], commitments: []}, commercial: {deals: []}, pursuits: []}};
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
        await page.getByRole('button', {name: 'Work need', exact: true}).click();
        await page.getByText('Need opened: need-outside-summary', {exact: true}).waitFor();
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
  const setup=async(scenario,width=390)=>{
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const target=new URL('/qa-entity-actions',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');target.searchParams.set('scenario',scenario);
    for(let attempt=0;attempt<60;attempt++){try{await page.goto(target.href);break;}catch(error){if(attempt===59)throw error;await page.waitForTimeout(250);}}
    await page.locator('[data-qa-ready="true"]').waitFor();
    const dialog=()=>page.getByRole('dialog',{name:'Manage Example FC',exact:true});
    const open=async(mode='Edit')=>{await page.getByRole('button',{name:'Manage Example FC',exact:true}).click();await dialog().getByRole('button',{name:new RegExp('^'+mode)}).click();};
    const edit=async()=>{await open();await dialog().getByLabel('Club name',{exact:true}).fill('Updated FC');};
    const writes=()=>page.evaluate(()=>window.entityQa.calls.filter(call=>call.name!=='redream_entity_action_preview').length);
    const done=async()=>{assert.deepEqual(errors,[]);await page.close();};
    return {page,dialog,open,edit,writes,done};
  };
  for(const scenario of ['empty-ack','wrong-id','wrong-kind','network']){
    const {page,dialog,edit,writes,done}=await setup(scenario);await edit();
    await dialog().getByRole('button',{name:'Save changes',exact:true}).click();
    await page.waitForFunction(()=>window.entityQa.refreshes.length>0||[...document.querySelectorAll('[role="alert"]')].some(node=>node.textContent?.includes('Could not confirm')));
    assert.equal(await page.evaluate(()=>window.entityQa.refreshes.length),0,'An unconfirmed response cannot refresh as though it saved: '+scenario);
    await dialog().getByRole('alert').filter({hasText:'Could not confirm'}).waitFor();
    assert.equal(await dialog().getByRole('button',{name:'Save changes',exact:true}).count(),0,'Uncertain changes cannot be blindly repeated');
    await dialog().getByText('Retained draft',{exact:true}).click();await dialog().getByText('Updated FC',{exact:true}).waitFor();
    await dialog().getByRole('button',{name:'Close',exact:true}).last().click();
    const discard=page.getByRole('alertdialog',{name:'Discard these changes?',exact:true});await discard.waitFor();
    await discard.getByRole('button',{name:'Cancel',exact:true}).click();await discard.waitFor({state:'hidden'});
    if(scenario==='empty-ack'){await mkdir('/tmp/redream-platform-programme/entity-actions',{recursive:true});await page.screenshot({path:'/tmp/redream-platform-programme/entity-actions/retained-draft-390.png'});}
    assert.equal(await writes(),1);await done();
  }
  for(const width of [320,390,768,1440]){
    const {page,dialog,edit,writes,done}=await setup('refresh-failed',width);await edit();
    await dialog().getByRole('button',{name:'Save changes',exact:true}).evaluate(node=>{node.click();node.click();});
    await dialog().getByRole('status').filter({hasText:'Changes saved'}).waitFor();
    await dialog().getByText('Your change is saved, but the list could not refresh. Refresh the list or close this panel.',{exact:true}).waitFor();
    assert.equal(await writes(),1,'Two activations admit one write');
    if(width===390||width===1440){await mkdir('/tmp/redream-platform-programme/entity-actions',{recursive:true});await page.screenshot({path:`/tmp/redream-platform-programme/entity-actions/confirmed-refresh-${width}.png`});}
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    for(const button of await dialog().getByRole('button').all())if(await button.isVisible())assert.ok((await button.boundingBox()).height>=44,'Recovery controls retain touch size');
    await dialog().getByRole('button',{name:'Refresh list',exact:true}).click();await dialog().waitFor({state:'hidden'});
    assert.equal(await writes(),1,'Refresh retries only the read');await page.getByText('Current record: Updated FC',{exact:true}).waitFor();
    await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Manage Example FC');
    assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
    await done();
  }
  {
    const {page,dialog,edit,writes,done}=await setup('denied');await edit();await dialog().getByRole('button',{name:'Save changes',exact:true}).click();
    await dialog().getByRole('alert').waitFor();assert.equal(await dialog().getByLabel('Club name').inputValue(),'Updated FC');
    assert.equal(await dialog().getByRole('button',{name:'Save changes',exact:true}).isEnabled(),true,'A known transactional rejection preserves a correctable draft');
    await page.evaluate(()=>window.entityQa.scenario='');await dialog().getByRole('button',{name:'Save changes',exact:true}).click();await dialog().waitFor({state:'hidden'});assert.equal(await writes(),2);await done();
  }
  for(const action of ['Archive','Delete']){
    const {page,dialog,open,writes,done}=await setup('refresh-failed');await open(action);
    const label=action==='Delete'?'Delete permanently':'Archive';
    assert.equal(await writes(),0,'Opening confirmation never changes a record');
    await dialog().getByRole('button',{name:label,exact:true}).click();
    await dialog().getByRole('status').filter({hasText:action==='Delete'?'Record deleted':'Record archived'}).waitFor();
    await dialog().getByRole('button',{name:'Refresh list',exact:true}).waitFor({state:'visible'});
    await page.waitForFunction(()=>!document.querySelector('button[class*=retry]')?.disabled);
    await dialog().getByRole('button',{name:'Refresh list',exact:true}).click();await dialog().waitFor({state:'hidden'});
    assert.equal(await writes(),1);assert.deepEqual(await page.evaluate(()=>window.entityQa.refreshes.map(item=>item.change)),[action==='Delete'?'delete':'archive',action==='Delete'?'delete':'archive']);await done();
  }
  for(const action of ['Edit','Archive','Delete']){
    const {page,dialog,open,edit,writes,done}=await setup('write-hung');await page.clock.install();
    if(action==='Edit')await edit();else await open(action);
    const label=action==='Edit'?'Save changes':action==='Delete'?'Delete permanently':'Archive';
    await dialog().getByRole('button',{name:label,exact:true}).click();
    await page.waitForFunction(()=>typeof window.entityQa.releaseWrite==='function');
    assert.equal(await dialog().getByRole('button',{name:'Close',exact:true}).first().isDisabled(),true);
    await page.keyboard.press('Escape');assert.equal(await dialog().isVisible(),true);
    await page.clock.fastForward(12100);await dialog().getByRole('alert').filter({hasText:'Could not confirm'}).waitFor();
    assert.equal(await dialog().getByRole('button',{name:label,exact:true}).count(),0);
    await page.evaluate(()=>window.entityQa.releaseWrite());
    assert.equal(await page.evaluate(()=>window.entityQa.refreshes.length),0,'Late acknowledgements cannot change unknown into confirmed');
    assert.equal(await writes(),1);assert.ok(await page.evaluate(()=>window.entityQa.aborts>0),'Timed out transport receives an abort signal');
    await dialog().getByRole('button',{name:'Reload record',exact:true}).click();await dialog().waitFor({state:'hidden'});
    assert.equal(await writes(),1,'Outcome recovery never repeats the write');
    assert.equal(await page.evaluate(()=>window.entityQa.refreshes[0].change),'edit','Unknown outcomes only request latest details, never report an archive/deletion');await done();
  }
  for(const scenario of ['preview-failed','preview-hung','preview-wrong-id']){
    const {page,dialog,open,writes,done}=await setup(scenario);if(scenario==='preview-hung')await page.clock.install();await open('Delete');
    if(scenario==='preview-hung'){await page.waitForFunction(()=>typeof window.entityQa.releasePreview==='function');await page.clock.fastForward(12100);}
    await dialog().getByRole('alert').waitFor();assert.equal(await dialog().getByRole('button',{name:'Delete permanently',exact:true}).isDisabled(),true);assert.equal(await writes(),0);
    await page.evaluate(()=>window.entityQa.scenario='');await dialog().getByRole('button',{name:'Retry safety check',exact:true}).click();
    await dialog().getByRole('button',{name:'Delete permanently',exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('button[class*="danger"]')?.disabled);
    assert.equal(await writes(),0,'A preview retry never deletes');await done();
  }
  {
    const {page,dialog,open,writes,done}=await setup('protected');await open('Delete');
    await dialog().getByText('This record cannot be permanently deleted. Archive it to retain its history.',{exact:true}).waitFor();
    assert.equal(await dialog().getByRole('button',{name:'Delete permanently',exact:true}).isDisabled(),true);assert.equal(await writes(),0);await done();
  }
  for(const change of ['record','account','unmount']){
    const {page,dialog,edit,writes,done}=await setup('write-hung');await edit();await dialog().getByRole('button',{name:'Save changes',exact:true}).click();
    await page.waitForFunction(()=>typeof window.entityQa.releaseWrite==='function');
    const label=change==='record'?'Open another record':change==='account'?'Switch account':'Unmount controls';
    await page.getByRole('button',{name:label,exact:true}).evaluate(node=>node.click());await dialog().waitFor({state:'hidden'});
    if(change==='unmount')await page.getByRole('button',{name:'Reopen controls',exact:true}).click();
    await page.evaluate(()=>window.entityQa.scenario='');
    const name=change==='record'?'Another FC':'Example FC';await page.getByRole('button',{name:'Manage '+name,exact:true}).click();
    const fresh=page.getByRole('dialog',{name:'Manage '+name,exact:true});await fresh.getByRole('button',{name:/^Edit/}).click();assert.equal(await fresh.getByLabel('Club name',{exact:true}).inputValue(),name,'New scope starts with its own fields');await fresh.getByLabel('Club name',{exact:true}).fill('Fresh draft');
    await page.evaluate(()=>window.entityQa.releaseWrite());assert.equal(await fresh.getByLabel('Club name',{exact:true}).inputValue(),'Fresh draft');
    assert.equal(await page.evaluate(()=>window.entityQa.refreshes.length),0,'A previous record/account/mount cannot refresh or close its successor');assert.equal(await writes(),1);await done();
  }
  {
    const {page,dialog,open,writes,done}=await setup('preview-hung');await open('Delete');await page.waitForFunction(()=>typeof window.entityQa.releasePreview==='function');
    await page.getByRole('button',{name:'Open another record',exact:true}).evaluate(node=>node.click());await dialog().waitFor({state:'hidden'});
    await page.evaluate(()=>window.entityQa.scenario='protected');await page.getByRole('button',{name:'Manage Another FC',exact:true}).click();
    const fresh=page.getByRole('dialog',{name:'Manage Another FC',exact:true});await fresh.getByRole('button',{name:/^Delete/}).click();await fresh.getByText('This record cannot be permanently deleted. Archive it to retain its history.',{exact:true}).waitFor();
    await page.evaluate(()=>window.entityQa.releasePreview());assert.equal(await fresh.getByRole('button',{name:'Delete permanently',exact:true}).isDisabled(),true,'An old preview cannot authorise deletion of another record');assert.equal(await writes(),0);await done();
  }
  {
    const {page,dialog,edit,writes,done}=await setup('refresh-hung');await edit();await dialog().getByRole('button',{name:'Save changes',exact:true}).click();await page.waitForFunction(()=>typeof window.entityQa.releaseRefresh==='function');
    await page.getByRole('button',{name:'Unmount controls',exact:true}).evaluate(node=>node.click());await dialog().waitFor({state:'hidden'});await page.getByRole('button',{name:'Reopen controls',exact:true}).click();
    await page.evaluate(()=>window.entityQa.releaseRefresh());await page.getByText('Current record: Example FC',{exact:true}).waitFor();assert.equal(await writes(),1);await done();
  }
  {
    const {page,dialog,edit,writes,done}=await setup('refresh-hung');await page.clock.install();await edit();await dialog().getByRole('button',{name:'Save changes',exact:true}).click();
    await page.waitForFunction(()=>typeof window.entityQa.releaseRefresh==='function');await page.clock.fastForward(12100);
    await dialog().getByText('Your change is saved, but the list could not refresh. Refresh the list or close this panel.',{exact:true}).waitFor();
    await page.evaluate(()=>window.entityQa.releaseRefresh());await dialog().getByRole('status').filter({hasText:'Changes saved'}).waitFor();
    await page.evaluate(()=>window.entityQa.scenario='');await dialog().getByRole('button',{name:'Refresh list',exact:true}).click();await dialog().waitFor({state:'hidden'});assert.equal(await writes(),1);await done();
  }
  console.log('Shared record actions: exact acknowledgements, retained drafts, all three bounded writes, read-only retries, protected deletion, stale account/record/mount results and four-width recovery pass.');
} finally {await browser.close();}
