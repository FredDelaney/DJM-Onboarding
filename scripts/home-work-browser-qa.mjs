import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
const player='30000000-0000-4000-8000-000000000001';
const member='10000000-0000-4000-8000-000000000001';
const task='60000000-0000-4000-8000-000000000001';
const key=kind=>kind==='task'?task:player;
const state=title=>({title,status:'open',version:1,note:''});
let work={work_kind:'player_next_action',work_id:player,title:'Catch up',display_title:'Lachlan Sattout: Catch up',due_on:'2026-10-14',due_at:'2026-10-14',note:'',status:'open',state:state('Catch up')};
let legacy={...work,work_kind:'task',work_id:task,title:'Call the club',display_title:'Call the club',state:state('Call the club'),context:{player_id:player,person_id:null,organisation_id:null,club_need_id:null}};
let undoWork,failWrite=false,delayRead=0;
let contextMode=false,contextTitle='Call the club',contextCopies=1;
const writes=[];
let activePage;
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
  const openDay=async()=>{const summary=page.locator('details > summary').filter({hasText:'Your day'});await summary.waitFor();if(!(await summary.evaluate(node=>node.parentElement.open)))await summary.click();};
 activePage=page;
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://example.supabase.co/**',async route=>{
  if(new URL(route.request().url()).pathname.endsWith('/redream_home_relevance_v1'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({visible_indices:(route.request().postDataJSON()?.p_items||[]).map((_,index)=>index),editable_indices:(route.request().postDataJSON()?.p_items||[]).map((_,index)=>index)})});
  const body=route.request().postDataJSON()||{},path=new URL(route.request().url()).pathname;
  let response={};
  if(body.action==='tenants')response={tenants:[{tenant_id:'qa-tenant',slug:'qa',role:'owner',display_name:'QA agency'}]};
  else if(body.action==='home_focus')response={home:{attention:{judgement:[
   ...(work.status==='open'?[{command_id:'player_action:'+player,command_type:'Player follow-up due',source_type:'player',source_id:player,title:'Lachlan Sattout',due_at:work.due_at,evidence:{next_action:work.title,next_action_due:work.due_on},actionability:{mode:'review_only',cta:'Review'}}]:[]),
   ...(legacy.status==='open'?[{command_id:'task:'+task,source_type:'task',source_id:task,priority_score:contextMode?95:0,title:contextMode?contextTitle+' · Dylan'+(contextCopies>1?' (2 active copies)':''):legacy.display_title,...(contextMode?{task_title:contextTitle}:{}),due_at:legacy.due_at,evidence:{task_count:contextCopies,...(contextMode?{tasks:[{task_id:task,...legacy.context,updated_at:legacy.state.version},...(contextCopies>1?[{task_id:'60000000-0000-4000-8000-000000000002'}]:[])]}:{})},actionability:{mode:'one_tap',evidence_gate:'ready',cta:'Complete follow-up'}}]:[]),
   {command_id:'player-review',command_type:'Player review required',source_type:'player',source_id:player,player_id:player,title:'Review Dylan data',evidence:{review_reason:'Career statistics changed'},actionability:{mode:'review_only',cta:'Review player data'}}
  ]}}};
  else if(path.endsWith('/redream_autopilot_operations'))response={deadlines:{items:contextMode?Array.from({length:5},(_,i)=>({item_id:'qa-date-'+i,title:'Recorded agency date '+(i+1),deadline_at:'2026-09-01T12:00:00Z'})):[]}};
  else if(path.endsWith('/redream_assigned_work_page_v1'))response={items:work.status==='open'?[{work_kind:work.work_kind,work_id:player,title:work.display_title,due_at:work.due_at,date_only:true,responsible_people:[{user_id:member,display_name:'Jesse Edge'}]}]:[],next_cursor:null};
  else if(path.endsWith('/redream_work_responsibility_v1'))response={user_ids:[member],people:[{user_id:member,display_name:'Jesse Edge'}],revision:1};
  else if(path.endsWith('/redream_home_work_v1')){
   let current=body.p_work_kind==='task'?legacy:work;
   if(body.p_action==='read'&&delayRead)await new Promise(resolve=>setTimeout(resolve,delayRead));
   if(body.p_action!=='read'){
    writes.push(body);
    if(failWrite){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Temporary connection failure'})});return;}
    assert.deepEqual(body.p_expected_state,current.state);
    const input=body.p_input;
    if(body.p_action==='update')current={...current,title:input.title,display_title:body.p_work_kind==='task'?input.title:'Lachlan Sattout: '+input.title,note:input.note,due_on:input.due_on,due_at:input.due_on,state:{...current.state,title:input.title,note:input.note,version:current.state.version+1}};
    if(body.p_action==='complete'){
     undoWork=current;
     current=input.next_title?{...current,title:input.next_title,display_title:'Lachlan Sattout: '+input.next_title,due_on:input.next_due_on,due_at:input.next_due_on,note:'',status:'open',state:{...current.state,title:input.next_title,status:'open',version:current.state.version+1}}:{...current,status:'done',state:{...current.state,status:'done',version:current.state.version+1}};
    }
    if(body.p_action==='undo')current={...undoWork,state:{...undoWork.state,version:current.state.version+1}};
    if(body.p_work_kind==='task')legacy=current;else work=current;
   }
   response={work:current,undo_token:body.p_action==='complete'?'undo-token':null};
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
 });
 const url=new URL('/qa-command',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
 for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(e){if(i===59)throw e;await page.waitForTimeout(250);}}
  await openDay();
 const row=()=>page.locator('article').filter({hasText:work.display_title});
 await row().getByRole('button',{name:'Update',exact:true}).waitFor();
 assert.equal(await row().count(),1,'The command and assignment feeds show one canonical follow-up');
 assert.equal(await page.getByRole('button',{name:/Complete.*Review.*data/i}).count(),0,'A data review cannot be cleared by a task tick');
 delayRead=180;await row().getByRole('button',{name:'Update',exact:true}).click();
 const panel=page.getByRole('dialog',{name:'Update task',exact:true});
 await panel.getByRole('button',{name:'Close task editor',exact:true}).click();await panel.waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.activeElement?.textContent?.trim()==='Update');
 assert.equal(await row().getByRole('button',{name:'Update',exact:true}).evaluate(node=>node===document.activeElement),true,'Home restores the exact opener after its async read');
 const saveOpener=await row().getByRole('button',{name:'Update',exact:true}).elementHandle();
 delayRead=0;await row().getByRole('button',{name:'Update',exact:true}).click();
 await panel.getByLabel('Action',{exact:true}).fill('Confirm the trial');
 await panel.getByLabel('Due date',{exact:true}).fill('2026-10-20');
 await panel.getByLabel('Note (optional)',{exact:true}).fill('Club is available Tuesday.');
 failWrite=true;
 await panel.getByRole('button',{name:'Save changes',exact:true}).click();
 await panel.getByRole('alert').waitFor();
 assert.equal(await panel.getByLabel('Action',{exact:true}).inputValue(),'Confirm the trial','Failed saves retain the draft');
 failWrite=false;
 await panel.getByRole('button',{name:'Save changes',exact:true}).click();
 await panel.waitFor({state:'hidden'});
 await page.waitForFunction(()=>document.activeElement?.textContent?.trim()==='Update'||document.activeElement?.id==='workspace-view-heading',undefined,{timeout:3000});
 if(!await row().getByRole('button',{name:'Update',exact:true}).evaluate(node=>node===document.activeElement)){
  assert.equal(await saveOpener.evaluate(node=>node.isConnected),false,'Heading fallback is used only when Home replaced the original row');
  assert.equal(await page.locator('#workspace-view-heading').evaluate(node=>node===document.activeElement&&node.textContent?.trim()==='Dashboard'),true,'A replaced row returns to the current Home heading');
 }
 await row().getByRole('button',{name:'Update',exact:true}).click();
 assert.equal(await panel.getByLabel('Note (optional)',{exact:true}).inputValue(),'Club is available Tuesday.');
 for(const width of [320,390,430,768]){
  await page.setViewportSize({width,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Home editor fits '+width);
  assert.ok(await panel.getByRole('button',{name:'Save changes',exact:true}).evaluate(node=>node.getBoundingClientRect().height>=44),'Save is a comfortable touch target');
 }
 await panel.getByRole('button',{name:'Close task editor',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 const complete=row().getByRole('button',{name:'Complete '+work.display_title,exact:true});
 assert.ok(await complete.evaluate(node=>node.getBoundingClientRect().height>=44&&node.getBoundingClientRect().width>=44));
 delayRead=180;
 await complete.dblclick();
 await page.getByRole('button',{name:'Undo completion of '+work.display_title,exact:true}).waitFor();
 assert.equal(writes.filter(body=>body.p_action==='complete').length,1,'A double tap completes only once');
 assert.equal(await page.getByRole('dialog').count(),0,'The tick completes directly without a second confirmation');
 assert.equal(await row().count(),0,'Confirmed completion removes the task');
 await page.getByRole('button',{name:'Undo completion of '+work.display_title,exact:true}).click();
 await row().getByRole('button',{name:'Update',exact:true}).waitFor();
 const legacyRow=page.locator('article').filter({hasText:'Call the club'});
 failWrite=true;await legacyRow.getByRole('button',{name:'Complete Call the club',exact:true}).click();
 await legacyRow.getByRole('alert').waitFor();assert.ok(await legacyRow.isVisible(),'Failed completion keeps the row');
 failWrite=false;await legacyRow.getByRole('button',{name:'Complete Call the club',exact:true}).click();
 await page.getByRole('button',{name:'Undo completion of Call the club',exact:true}).waitFor();
 assert.equal(await legacyRow.count(),0);
 const completedTitle=work.display_title;
 await row().getByRole('button',{name:'Update',exact:true}).click();
 await panel.getByRole('checkbox',{name:'Add a follow-up when completing',exact:true}).check();
 await panel.getByLabel('Next action',{exact:true}).fill('Send the trial details');
 await panel.getByLabel('Next due date',{exact:true}).fill('2026-10-21');
 await panel.getByRole('button',{name:'Complete & save follow-up',exact:true}).click();
 await panel.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Undo completion of '+completedTitle,exact:true}).waitFor();
 assert.equal(work.title,'Send the trial details');assert.equal(work.due_on,'2026-10-21');
 await page.getByRole('button',{name:'Undo completion of '+completedTitle,exact:true}).click();
 await row().getByRole('button',{name:'Update',exact:true}).waitFor();
 // A server-labelled task uses the saved task title for stale-work checks,
 // while confirmation retains the player context the user actually selected.
 contextMode=true;legacy={...legacy,status:'open',state:{...legacy.state,status:'open',version:legacy.state.version+1}};
 await page.reload();await openDay();
 const labelledTitle=contextTitle+' · Dylan';
 const labelled=()=>page.locator('article').filter({hasText:labelledTitle});
 // Five overdue calendar rows must not crowd a genuinely high-priority task out of Home.
 await labelled().getByRole('button',{name:'Complete '+labelledTitle,exact:true}).click();
 await page.getByRole('button',{name:'Undo completion of '+labelledTitle,exact:true}).waitFor();
 assert.equal(await panel.count(),0,'A player label must not trigger a false task-changed editor');
 await page.getByRole('button',{name:'Undo completion of '+labelledTitle,exact:true}).click();
 await labelled().getByRole('button',{name:'Update',exact:true}).waitFor();
 const savedCount=writes.filter(body=>body.p_action==='complete').length;
 legacy={...legacy,title:'Changed in another session',display_title:'Changed in another session',state:{...legacy.state,title:'Changed in another session',version:legacy.state.version+1}};
 await labelled().getByRole('button',{name:'Complete '+labelledTitle,exact:true}).click();
 await panel.waitFor();
 await panel.getByText('The saved task has changed. Check these details before completing it.',{exact:true}).waitFor();
 assert.equal(writes.filter(body=>body.p_action==='complete').length,savedCount,'A real canonical title change still requires review');
 await panel.getByRole('button',{name:'Close task editor',exact:true}).click();
 contextTitle=legacy.title;await page.reload();await openDay();
 const currentLabel=contextTitle+' · Dylan';
 await page.getByRole('button',{name:'Complete '+currentLabel,exact:true}).waitFor();
 legacy={...legacy,context:{...legacy.context,player_id:'30000000-0000-4000-8000-000000000002'},state:{...legacy.state,version:legacy.state.version+1}};
 await page.getByRole('button',{name:'Complete '+currentLabel,exact:true}).click();await panel.waitFor();
 assert.equal(writes.filter(body=>body.p_action==='complete').length,savedCount,'Changed player context cannot silently complete a task selected for another player');
 await panel.getByRole('button',{name:'Close task editor',exact:true}).click();
 legacy={...legacy,context:{...legacy.context,player_id:player}};await page.reload();await openDay();
 await page.getByRole('button',{name:'Complete '+currentLabel,exact:true}).waitFor();
 legacy={...legacy,note:'A newer saved note',state:{...legacy.state,note:'A newer saved note',version:legacy.state.version+1}};
 await page.getByRole('button',{name:'Complete '+currentLabel,exact:true}).click();await panel.waitFor();
 assert.equal(await panel.getByLabel('Note (optional)',{exact:true}).inputValue(),'A newer saved note');
 assert.equal(writes.filter(body=>body.p_action==='complete').length,savedCount,'An updated record version still requires review when title and date match');
 await panel.getByRole('button',{name:'Close task editor',exact:true}).click();
 contextTitle=legacy.title;contextCopies=2;await page.reload();await openDay();
 const groupedTitle=contextTitle+' · Dylan (2 active copies)';
 const grouped=page.locator('article').filter({hasText:groupedTitle});
 await grouped.waitFor();
 assert.equal(await grouped.getByRole('button',{name:'Complete '+groupedTitle,exact:true}).count(),0,'Grouped work never gets a direct task-completion tick');
 const details=grouped.locator('summary').filter({hasText:/^Details$/});
 await details.click();
 assert.equal(await details.evaluate(node=>node.parentElement.open),true);
 assert.equal(writes.filter(body=>body.p_action==='complete').length,savedCount,'Possible copies stay in the existing review flow without completing a saved task');
 assert.deepEqual(errors,[]);
 await page.screenshot({path:'/tmp/home-quick-tasks.png',fullPage:true});
 console.log('Home quick tasks: editing, failures, direct completion/Undo, named player context, canonical title/context/version conflicts, grouped review and mobile touch targets passed.');
}catch(error){if(activePage){console.log(await activePage.locator('body').innerText());await activePage.screenshot({path:'/tmp/home-work-failure.png',fullPage:true});}console.log(JSON.stringify(writes));throw error;}finally{await browser.close();}
