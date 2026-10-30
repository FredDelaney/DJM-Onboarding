import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),calls=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
 const output='/tmp/redream-platform-programme/relationship-workflow';await mkdir(output,{recursive:true});
 let holdWrite=null,releaseWrite;
 let reach={email:{value:'example@example.test',is_verified:false},whatsapp:{value:'+393331234567',is_verified:false},phone:{value:'+393331234568',is_verified:false}};
 const memories=new Map();
 const memory=id=>{if(!memories.has(id))memories.set(id,{state:'current',last_meaningful_at:'2026-10-28T10:00:00Z',recent_interactions:[],followups:[],promises:[]});return memories.get(id);};
 const person=(id='person-fixture')=>({person:{person_id:id,full_name:id==='person-fixture'?'Example Contact':'Second Contact'},reach,employment:{employment_id:'employment-fixture',organisation_name:'Example FC',role_title:'Sporting director',verification_state:'recently_verified'},relationship_memory:memory(id)});
 await page.route('https://example.supabase.co/**',async route=>{
  const {action,body={}}=route.request().postDataJSON();calls.push({action,body});let result={};
  if(action==='redream_relationship_person')result=person(body.p_person_id);
  else if(action==='redream_record_contact_details_v1')result={email:reach.email?.value||null,whatsapp:reach.whatsapp?.value||null,can_edit:true};
  else if(action==='redream_relationship_save_contact_method'){reach[body.p_channel]={value:body.p_value,is_verified:body.p_mark_verified};result=person();}
  else if(action==='redream_birthday_record')result={birthday:null};
  else if(action==='redream_relationship_record_interaction'){memory(body.p_person_id).recent_interactions.push({interaction_id:'interaction-'+calls.length,summary:body.p_summary,channel:body.p_channel,occurred_at:'2026-10-28T10:00:00Z'});result=person(body.p_person_id);}
  else if(action==='redream_relationship_add_work'){if(holdWrite)await holdWrite;memory(body.p_person_id)[body.p_kind==='promise'?'promises':'followups'].push({task_id:'work-'+calls.length,title:body.p_title,due_at:body.p_due_at});result=person(body.p_person_id);}
  else if(action==='redream_relationship_update_route')result=person(body.p_person_id);
  else return route.fulfill({status:400,json:{error:'Unexpected '+action}});
  await route.fulfill({json:result});
 });
 const url=new URL('/qa-record-clean?kind=contact&relationships=1',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
 for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}}
 await page.getByText('current',{exact:true}).waitFor();
 assert.equal(await page.getByText('cold',{exact:true}).count(),0,'The current person read takes precedence over stale list summary labels');
 await page.getByRole('button',{name:'Edit details',exact:true}).click();
 await page.getByRole('checkbox',{name:/checked/}).check();
 await page.getByRole('button',{name:'Save contact details',exact:true}).click();
 await page.getByRole('button',{name:'Edit details',exact:true}).waitFor();
 assert.deepEqual(calls.filter(c=>c.action==='redream_relationship_save_contact_method').map(c=>[c.body.p_channel,c.body.p_mark_verified]),[['email',true],['whatsapp',true],['phone',true]],'Verifying unchanged contact details covers all existing channels');
 await page.evaluate(()=>{window.contactRefreshFails=true;});
 await page.getByRole('button',{name:'Log conversation',exact:true}).click();
 await page.getByRole('textbox',{name:'What mattered?',exact:true}).fill('The club asked for two verified player profiles.');
 await page.getByRole('button',{name:'Save conversation',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Conversation saved.'}).waitFor({timeout:5000});
 assert.equal(await page.getByRole('button',{name:'Save conversation',exact:true}).count(),0,'A failed list refresh must not leave a confirmed conversation ready to send again');
 const writes=()=>calls.filter(c=>c.action==='redream_relationship_record_interaction').length;
 assert.equal(writes(),1);
 await page.evaluate(()=>{window.contactRefreshFails=false;});
 await page.getByRole('button',{name:'Refresh Network',exact:true}).click();
 await page.getByRole('button',{name:'Refresh Network',exact:true}).waitFor({state:'hidden'});
 assert.equal(writes(),1,'Refreshing a confirmed save never repeats the write');
 const actions=page.getByRole('region',{name:'Relationship actions',exact:true});
 await actions.getByRole('button',{name:'Follow-up',exact:true}).click();
 await actions.getByRole('textbox',{name:'What needs to happen?',exact:true}).fill('Confirm the club shortlist');
 await actions.getByLabel('When?',{exact:true}).fill('2030-11-15T10:00');
 await actions.getByRole('button',{name:'Promise',exact:true}).click();
 assert.equal(await actions.getByRole('textbox',{name:'What did we promise?',exact:true}).inputValue(),'','A follow-up draft must never silently become a promise');
 await actions.getByRole('textbox',{name:'What did we promise?',exact:true}).fill('Send the verified dossier');
 await page.keyboard.press('Escape');
 assert.equal(await actions.getByRole('button',{name:'Promise',exact:true}).evaluate(node=>node===document.activeElement),true,'Escape returns to the person action');
 await actions.getByRole('button',{name:'Follow-up',exact:true}).click();
 assert.equal(await actions.getByRole('textbox',{name:'What needs to happen?',exact:true}).inputValue(),'Confirm the club shortlist','Closing another form preserves this person’s independent draft');
 await actions.getByRole('button',{name:'Add follow-up',exact:true}).click();
 await actions.getByRole('status').filter({hasText:'Follow-up saved.'}).waitFor();
 await actions.getByRole('button',{name:'Relationship',exact:true}).click();
 for(const label of ['Relationship','Access','Trust'])assert.equal(await actions.getByRole('combobox',{name:label,exact:true}).inputValue(),'','Relationship assessments require an explicit choice');
 const routeWrites=()=>calls.filter(c=>c.action==='redream_relationship_update_route');
 await actions.getByRole('button',{name:'Update relationship',exact:true}).click();
 assert.equal(routeWrites().length,0,'Opening the editor cannot silently submit strong/default assessments');
 await actions.getByRole('combobox',{name:'Relationship',exact:true}).selectOption('25');
 await actions.getByRole('combobox',{name:'Access',exact:true}).selectOption('45');
 await actions.getByRole('combobox',{name:'Trust',exact:true}).selectOption('50');
 await actions.getByRole('textbox',{name:'Relationship note',exact:true}).fill('Introduced at the club meeting.');
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:844});
  assert.equal(await actions.locator('button[aria-expanded][data-ui-button="primary"]').count(),1,'One primary relationship action at '+width);
  const metrics=await actions.evaluate(node=>({overflow:document.documentElement.scrollWidth-innerWidth,small:[...node.querySelectorAll('button,input,select,textarea')].filter(control=>control.getBoundingClientRect().height>0&&control.getBoundingClientRect().height<43.5).map(control=>control.getAttribute('aria-label')||control.textContent),fieldText:[...node.querySelectorAll('input,select,textarea')].map(control=>parseFloat(getComputedStyle(control).fontSize))}));
  assert.ok(metrics.overflow<=1,'Person work fits '+width);assert.deepEqual(metrics.small,[],'Comfortable controls at '+width);assert.ok(metrics.fieldText.every(size=>size>=16),'Readable fields at '+width);
  if(width===390||width===1440)await actions.screenshot({path:output+`/relationship-${width}.png`});
 }
 await page.setViewportSize({width:390,height:844});
 await actions.getByRole('button',{name:'Update relationship',exact:true}).click();
 await actions.getByRole('status').filter({hasText:'Relationship updated.'}).waitFor();
 assert.deepEqual([routeWrites()[0].body.p_strength_score,routeWrites()[0].body.p_access_score,routeWrites()[0].body.p_trust_score],[25,45,50]);
 // A slow write has an unknown outcome. Recovery reads activity; it cannot replay it.
 holdWrite=new Promise(resolve=>{releaseWrite=resolve;});
 await actions.getByRole('button',{name:'Follow-up',exact:true}).click();
 await actions.getByRole('textbox',{name:'What needs to happen?',exact:true}).fill('Check the next transfer window');
 await actions.getByLabel('When?',{exact:true}).fill('2030-11-16T10:00');
 const started=page.waitForRequest(request=>request.postData()?.includes('redream_relationship_add_work'));
 await actions.getByRole('button',{name:'Add follow-up',exact:true}).click();await started;
 assert.equal(await actions.getByRole('button',{name:'Close follow-up form',exact:true}).isDisabled(),true);
 assert.equal(await actions.getByRole('textbox',{name:'What needs to happen?',exact:true}).isDisabled(),true);
 await page.keyboard.press('Escape');
 assert.equal(await actions.getByRole('textbox',{name:'What needs to happen?',exact:true}).isVisible(),true,'Pending work stays visible');
 await actions.getByRole('button',{name:'Check latest activity',exact:true}).waitFor({timeout:15000});
 assert.equal(await actions.getByRole('textbox',{name:'What needs to happen?',exact:true}).inputValue(),'Check the next transfer window');
 assert.equal(await actions.getByRole('button',{name:'Add follow-up',exact:true}).isDisabled(),true);
 const workCount=()=>calls.filter(c=>c.action==='redream_relationship_add_work').length;
 const beforeRecovery=workCount();releaseWrite();holdWrite=null;
 await actions.getByRole('button',{name:'Check latest activity',exact:true}).click();
 await actions.getByRole('status').filter({hasText:'Latest activity loaded.'}).waitFor();
 assert.equal(workCount(),beforeRecovery,'Unknown-outcome recovery is read-only');
 // Switching people invalidates an old response and never moves its draft or success notice.
 holdWrite=new Promise(resolve=>{releaseWrite=resolve;});
 await actions.getByRole('button',{name:'Promise',exact:true}).click();
 assert.equal(await actions.getByRole('textbox',{name:'What did we promise?',exact:true}).inputValue(),'Send the verified dossier');
 await actions.getByLabel('Due by',{exact:true}).fill('2030-11-17T10:00');
 const oldWrite=page.waitForRequest(request=>request.postData()?.includes('redream_relationship_add_work'));
 await actions.getByRole('button',{name:'Save promise',exact:true}).click();await oldWrite;
 await page.getByRole('button',{name:'Switch contact',exact:true}).click();
 await page.getByRole('heading',{name:'Second Contact',exact:true}).waitFor();
 const oldResponse=page.waitForResponse(response=>response.request().postData()?.includes('redream_relationship_add_work'));
 releaseWrite();holdWrite=null;await oldResponse;
 await actions.getByRole('button',{name:'Promise',exact:true}).click();
 assert.equal(await actions.getByRole('textbox',{name:'What did we promise?',exact:true}).inputValue(),'','The second person starts with their own draft');
 assert.equal(await actions.getByRole('status').filter({hasText:'Promise saved.'}).count(),0,'An old save cannot claim success on the new person');
 assert.deepEqual(errors,[]);
 console.log('Legacy contact verification remains working for email, WhatsApp and phone');
 console.log('Relationship work passed: confirmed save/failed refresh, independent drafts, explicit assessments, responsive controls, bounded unknown outcomes and stale-person protection.');
}finally{await browser.close();}
