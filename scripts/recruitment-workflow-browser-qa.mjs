import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--no-sandbox','--disable-dev-shm-usage']});
const first='30000000-0000-4000-8000-000000000001',second='30000000-0000-4000-8000-000000000002',created='30000000-0000-4000-8000-000000000003',playerId='40000000-0000-4000-8000-000000000001';
const output='/tmp/redream-platform-programme/recruitment-workflow';await mkdir(output,{recursive:true});
const root=process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113';
try{
 for(const scenario of process.env.RECRUITMENT_SCENARIOS?.split(',')||['journey','failure','scope','permissions','layout','promotion','invalid-create','create-refresh','loading','unknown-write','wrong-record','agent','operations','invalid-promotion']){
  const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Europe/Rome'}),calls=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
  const records=new Map([[first,{id:first,full_name:'Alpha Prospect',primary_position:'Centre back',current_club:'Example FC',raw_stage:['promotion','agent','operations','invalid-promotion'].includes(scenario)?'agreement_sent':'identified',ui_stage:['promotion','agent','operations','invalid-promotion'].includes(scenario)?'offer':'identified',interactions:[]}],[second,{id:second,full_name:'Beta Prospect',raw_stage:'identified',ui_stage:'identified',interactions:[]}]]);
  let failWrite=false,failRefresh=false,hold=null,release;
  let releaseRead,holdRead=scenario==='loading'?new Promise(resolve=>{releaseRead=resolve;}):null,wrongRecord=scenario==='wrong-record';
  await page.route('https://example.supabase.co/**',async route=>{
   const {action,body={}}=route.request().postDataJSON();calls.push({action,body});let value={};
   if(action==='fixture_refresh'){if(failRefresh)return route.fulfill({status:503,json:{error:'List refresh unavailable'}});}
   else if(action==='recruitment_board')value={directory:{},recruitment:{items:[...records.values()]}};
   else if(action==='recruitment_target'){const record=structuredClone(records.get(wrongRecord?second:body.prospect_id));if(holdRead){record.full_name='Stale Alpha';await holdRead;}value={recruitment:{target:record,interactions:record?.interactions||[]}};}
   else if(action==='redream_entity_archives')value={items:[]};
   else if(action==='redream_record_contact_details_v1')value={email:null,whatsapp:null,can_edit:scenario!=='permissions'};
   else if(action==='recruitment_create'){
    if(scenario==='invalid-create')value={result:{created:'false',prospect_id:created}};
    else{records.set(created,{id:created,full_name:body.full_name,current_club:body.current_club,primary_position:body.primary_position,raw_stage:'identified',ui_stage:'identified',interactions:[]});value={result:{prospect_id:created,created:true}};}
   }else if(action==='recruitment_log_interaction'){
    if(failWrite)return route.fulfill({status:400,json:{error:'This action is not available right now.'}});
    if(hold)await hold;
    records.get(body.prospect_id).interactions.push({id:'interaction-'+calls.length,summary:body.summary,channel:body.channel,direction:body.direction,occurred_at:'2026-10-28T10:00:00Z'});value={result:{prospect_id:body.prospect_id,interaction_id:'interaction-fixture'}};
   }else if(action==='recruitment_set_next_action'){records.get(body.prospect_id).next_action_at=body.next_action_at;value={result:{prospect_id:body.prospect_id,next_action_at:body.next_action_at}};}
   else if(action==='recruitment_set_stage'){Object.assign(records.get(body.prospect_id),{raw_stage:body.stage,ui_stage:body.stage==='signed'?'represented':'contact'});value={result:{prospect_id:body.prospect_id,stage:body.stage}};}
   else if(action==='recruitment_promote'){records.delete(body.prospect_id);value={result:{prospect_id:body.prospect_id,player_id:scenario==='invalid-promotion'?'not-a-player-id':playerId}};}
   else if(action==='player_workspace')value={player:{identity:{name:'Alpha Prospect'},service:{}}};
   else if(action==='player_profile')value={bundle:null};
   else if(action==='redream_player_staff_tags_v1')value={player_id:playerId,all_staff:false,user_ids:[],people:[],revision:0,can_edit:false};
   else return route.fulfill({status:400,json:{error:'Unexpected '+action}});
   await route.fulfill({json:value});
  });
  const url=new URL('/qa-recruitment-workflow?view=players&tab=recruitment'+(scenario==='permissions'?'&readonly=1':'')+(['agent','operations'].includes(scenario)?'&role='+scenario:''),root);
  for(let i=0;i<60;i++)try{await page.goto(url.href);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}
  const row=page.getByRole('button').filter({hasText:'Alpha Prospect'});
  await row.waitFor();
  const writes=action=>calls.filter(call=>call.action===action);
  if(scenario==='journey'||scenario==='layout'||scenario==='invalid-create'||scenario==='create-refresh'){
   assert.equal(await page.getByRole('button',{name:'Our Players',exact:true}).isVisible(),true,'An unloaded roster count must not appear as zero');
   await page.getByRole('button',{name:'Add target',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Add target',exact:true});await dialog.waitFor();
   assert.equal(await dialog.getByLabel('Player name',{exact:true}).evaluate(node=>node===document.activeElement),true);
   await dialog.getByLabel('Player name',{exact:true}).fill('QA New Prospect');
   if(scenario==='create-refresh')failRefresh=true;
   if(scenario==='layout'){
    await page.keyboard.press('Escape');const discard=page.getByRole('alertdialog',{name:'Discard these changes?',exact:true});await discard.waitFor();
    await page.keyboard.press('Escape');await discard.waitFor({state:'hidden'});assert.equal(await dialog.getByLabel('Player name',{exact:true}).inputValue(),'QA New Prospect');
    await dialog.getByRole('button',{name:/More details/}).click();
    for(const width of [320,390,768,1440]){
     await page.setViewportSize({width,height:460});
     await page.waitForFunction(()=>Math.abs(document.querySelector('[role="dialog"]').parentElement.getBoundingClientRect().height-visualViewport.height)<1);
     const box=await dialog.getByRole('button',{name:'Add target',exact:true}).boundingBox();assert.ok(box.height>=44&&box.y>=0&&box.y+box.height<=461,'Save remains reachable with the keyboard at '+width);
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    }
    await page.setViewportSize({width:390,height:844});await dialog.screenshot({path:output+'/intake-390.png'});
    await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Discard changes',exact:true}).click();await dialog.waitFor({state:'hidden'});
    assert.equal(await page.getByRole('button',{name:'Add target',exact:true}).evaluate(node=>node===document.activeElement),true);
    const longName='AlexandertheLongRecruitmentProspect'.repeat(5);records.get(first).full_name=longName;
    await row.click();await page.getByRole('heading',{name:longName,exact:true}).waitFor();
    const target=page.getByRole('region',{name:'Recruitment target workspace',exact:true});
    for(const width of [320,390,768,1440]){
     await page.setViewportSize({width,height:844});
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Long prospect names fit '+width);
     assert.equal(await target.getByRole('button',{name:'Move to Contact',exact:true}).evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(21, 94, 89)','Prospect actions retain the agency colour');
     const fields=await target.locator('input,select,textarea').evaluateAll(nodes=>nodes.filter(node=>node.getBoundingClientRect().height).map(node=>({height:node.getBoundingClientRect().height,font:parseFloat(getComputedStyle(node).fontSize)})));
     assert.ok(fields.every(field=>field.height>=44&&field.font>=16),'Readable prospect work controls at '+width);
    }
   }else{
    await dialog.getByRole('button',{name:'Add target',exact:true}).click();
    if(scenario==='create-refresh'){
     await dialog.getByRole('heading',{name:'Target added',exact:true}).waitFor();await dialog.getByRole('alert').waitFor();
     await dialog.getByRole('button',{name:'Open target',exact:true}).click();await page.getByRole('heading',{name:'QA New Prospect',exact:true}).waitFor();assert.equal(writes('recruitment_create').length,1);
    }else if(scenario==='invalid-create'){
     await dialog.getByRole('alert').filter({hasText:'Could not confirm the save'}).waitFor();assert.equal(await dialog.getByLabel('Player name',{exact:true}).inputValue(),'QA New Prospect');
     assert.equal(await dialog.getByRole('button',{name:'Add target',exact:true}).count(),0);assert.equal(writes('recruitment_create').length,1);
    }else{
     await page.getByRole('heading',{name:'QA New Prospect',exact:true}).waitFor();await page.waitForURL(url=>url.searchParams.get('target')===created);assert.equal(new URL(page.url()).searchParams.get('target'),created);assert.equal(new URL(page.url()).searchParams.has('player'),false);
     assert.equal(writes('recruitment_create').length,1);assert.equal(writes('create_player').length,0);
     await page.getByRole('textbox',{name:'Interaction note',exact:true}).fill('Spoke about the player’s plans for next season.');
     await page.getByRole('combobox',{name:'Contact direction',exact:true}).selectOption('inbound');
     await page.getByRole('button',{name:'Save interaction',exact:true}).click();await page.getByRole('status').filter({hasText:'Interaction saved.'}).waitFor();
     await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='status'&&document.activeElement.textContent.includes('Interaction saved.'));
     await page.getByLabel('Follow-up date and time',{exact:true}).fill('2030-03-31T02:30');await page.getByRole('button',{name:'Save follow-up',exact:true}).click();await page.getByRole('alert').filter({hasText:'clock change'}).waitFor();assert.equal(writes('recruitment_set_next_action').length,0,'A nonexistent local time must never become a silent shifted reminder');
     await page.getByLabel('Follow-up date and time',{exact:true}).fill('2030-11-15T10:30');await page.getByRole('button',{name:'Save follow-up',exact:true}).click();
     await page.getByRole('status').filter({hasText:'Follow-up date saved.'}).waitFor();assert.equal(new Date(writes('recruitment_set_next_action')[0].body.next_action_at).toISOString(),'2030-11-15T09:30:00.000Z');
     await page.getByRole('button',{name:'Move to Contact',exact:true}).click();await page.getByRole('heading',{name:'Contact',exact:true}).waitFor();
     assert.equal(writes('recruitment_log_interaction').length,1);assert.equal(writes('recruitment_log_interaction')[0].body.direction,'inbound');await page.screenshot({path:output+'/prospect-390.png',fullPage:true});
    }
   }
  }else if(scenario==='loading'||scenario==='wrong-record'){
   if(scenario==='loading')await page.clock.install();
   const request=page.waitForRequest(request=>request.postData()?.includes('recruitment_target'));
   await row.click();await request;
   if(scenario==='loading')await page.clock.fastForward(12_100);
   await page.getByRole('alert').filter({hasText:'Recruitment target unavailable'}).waitFor();
   assert.equal(await page.getByRole('heading',{name:'Beta Prospect',exact:true}).count(),0,'A mismatched response cannot open a different prospect');
   wrongRecord=false;holdRead=null;await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('heading',{name:'Alpha Prospect',exact:true}).waitFor();
   releaseRead?.();assert.equal(await page.getByRole('heading',{name:'Stale Alpha',exact:true}).count(),0);
  }else{
   await row.click();await page.getByRole('heading',{name:'Alpha Prospect',exact:true}).waitFor();
   if(scenario==='permissions'){
    assert.equal(await page.getByRole('button',{name:/Move to|Save interaction|Save follow-up|Add to Our Players/}).count(),0);
   }else if(['promotion','agent','operations','invalid-promotion'].includes(scenario)){
    if(['agent','operations'].includes(scenario)){assert.equal(await page.getByRole('button',{name:'Manage Alpha Prospect',exact:true}).count(),0,'Staff work access does not grant admin record management');await page.getByRole('textbox',{name:'Interaction note',exact:true}).fill('Authorised staff note.');await page.getByRole('button',{name:'Save interaction',exact:true}).click();await page.getByRole('status').filter({hasText:'Interaction saved.'}).waitFor();}
    await page.getByRole('button',{name:'Move to Represented',exact:true}).click();const stage=page.getByRole('alertdialog',{name:'Confirm signed representation?',exact:true});await stage.waitFor();
    await page.keyboard.press('Escape');assert.equal(writes('recruitment_set_stage').length,0);
    await page.getByRole('button',{name:'Move to Represented',exact:true}).click();await stage.getByRole('button',{name:'Confirm represented',exact:true}).click();
    if(scenario==='operations'){assert.equal(await page.getByRole('button',{name:'Add to Our Players',exact:true}).count(),0,'Operations cannot promote a represented player');}
    else{await page.getByRole('button',{name:'Add to Our Players',exact:true}).click();const promote=page.getByRole('alertdialog',{name:'Add this player to Our Players?',exact:true});await promote.waitFor();
    assert.equal(writes('recruitment_promote').length,0);await promote.getByRole('button',{name:'Add represented player',exact:true}).click();
    if(scenario==='invalid-promotion'){await page.getByRole('button',{name:'Check latest details',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Open player',exact:true}).count(),0);assert.equal(await page.getByRole('status').filter({hasText:'Added to Our Players.'}).count(),0,'A malformed response cannot claim promotion or open an arbitrary record');}
    else{await page.getByRole('status').filter({hasText:'Added to Our Players.'}).waitFor();assert.equal(writes('recruitment_promote').length,1);
    await page.getByRole('button',{name:'Open player',exact:true}).click();await page.waitForURL(url=>url.searchParams.get('player')===playerId);assert.equal(new URL(page.url()).searchParams.has('target'),false);}}
   }else{
    await page.getByRole('textbox',{name:'Interaction note',exact:true}).fill('Keep this note with Alpha.');
    if(scenario==='unknown-write'){
     await page.clock.install();hold=new Promise(resolve=>{release=resolve;});
     const request=page.waitForRequest(request=>request.postData()?.includes('recruitment_log_interaction'));await page.getByRole('button',{name:'Save interaction',exact:true}).click();await request;
     await page.clock.fastForward(12_100);await page.getByRole('button',{name:'Check latest details',exact:true}).waitFor();
     await page.waitForFunction(()=>document.activeElement?.getAttribute('role')==='alert'&&document.activeElement.textContent.includes('Could not confirm the save'));
     assert.equal(await page.getByRole('textbox',{name:'Interaction note',exact:true}).inputValue(),'Keep this note with Alpha.');assert.equal(await page.getByRole('button',{name:'Save interaction',exact:true}).isDisabled(),true);
     release();hold=null;await page.getByRole('button',{name:'Check latest details',exact:true}).click();await page.getByRole('status').filter({hasText:'Latest details loaded.'}).waitFor();assert.equal(writes('recruitment_log_interaction').length,1);
    }else if(scenario==='failure'){
     failWrite=true;await page.getByRole('button',{name:'Save interaction',exact:true}).click();await page.getByRole('alert').filter({hasText:'not available right now'}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Interaction note',exact:true}).inputValue(),'Keep this note with Alpha.');
     failWrite=false;failRefresh=true;await page.getByRole('button',{name:'Save interaction',exact:true}).click();await page.getByRole('status').filter({hasText:'Interaction saved.'}).waitFor();await page.getByRole('button',{name:'Refresh details',exact:true}).waitFor();
     const count=writes('recruitment_log_interaction').length;failRefresh=false;await page.getByRole('button',{name:'Refresh details',exact:true}).click();await page.getByRole('button',{name:'Refresh details',exact:true}).waitFor({state:'hidden'});assert.equal(writes('recruitment_log_interaction').length,count);
    }else{
     hold=new Promise(resolve=>{release=resolve;});const started=page.waitForRequest(request=>request.postData()?.includes('recruitment_log_interaction'));await page.getByRole('button',{name:'Save interaction',exact:true}).click();await started;
     assert.equal(await page.getByRole('textbox',{name:'Interaction note',exact:true}).isDisabled(),true);
     await page.getByRole('button',{name:'Open another prospect',exact:true}).click();await page.getByRole('heading',{name:'Beta Prospect',exact:true}).waitFor();
     const response=page.waitForResponse(response=>response.request().postData()?.includes('recruitment_log_interaction'));release();hold=null;await response;
     assert.equal(await page.getByRole('textbox',{name:'Interaction note',exact:true}).inputValue(),'');assert.equal(await page.getByRole('status').filter({hasText:'Interaction saved.'}).count(),0);
    }
   }
  }
  assert.deepEqual(errors,[],scenario);console.log('Recruitment workflow passed: '+scenario);release?.();await page.close();
 }
}finally{await browser.close();}
