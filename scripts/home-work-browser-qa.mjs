import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
const player='30000000-0000-4000-8000-000000000001';
const member='10000000-0000-4000-8000-000000000001';
const task='60000000-0000-4000-8000-000000000001';
const key=kind=>kind==='task'?task:player;
const state=title=>({title,status:'open',version:1,note:''});
let work={work_kind:'player_next_action',work_id:player,title:'Catch up',display_title:'Lachlan Sattout: Catch up',due_on:'2026-10-14',due_at:'2026-10-14',note:'',status:'open',state:state('Catch up')};
let legacy={...work,work_kind:'task',work_id:task,title:'Call the club',display_title:'Call the club',state:state('Call the club')};
let undoWork,failWrite=false,delayRead=0;
const writes=[];
let activePage;
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 activePage=page;
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://example.supabase.co/**',async route=>{
  const body=route.request().postDataJSON()||{},path=new URL(route.request().url()).pathname;
  let response={};
  if(body.action==='tenants')response={tenants:[{tenant_id:'qa-tenant',slug:'qa',role:'owner',display_name:'QA agency'}]};
  else if(body.action==='home_focus')response={home:{attention:{judgement:[
   ...(work.status==='open'?[{command_id:'player_action:'+player,command_type:'Player follow-up due',source_type:'player',source_id:player,title:'Lachlan Sattout',due_at:work.due_at,evidence:{next_action:work.title,next_action_due:work.due_on},actionability:{mode:'review_only',cta:'Review'}}]:[]),
   ...(legacy.status==='open'?[{command_id:'task:'+task,source_type:'task',source_id:task,title:legacy.display_title,due_at:legacy.due_at,evidence:{task_count:1},actionability:{mode:'one_tap',evidence_gate:'ready',cta:'Complete follow-up'}}]:[]),
   {command_id:'player-review',command_type:'Player review required',source_type:'player',source_id:player,player_id:player,title:'Review Dylan data',evidence:{review_reason:'Career statistics changed'},actionability:{mode:'review_only',cta:'Review player data'}}
  ]}}};
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
 const row=()=>page.locator('article').filter({hasText:work.display_title});
 await row().getByRole('button',{name:'Update',exact:true}).waitFor();
 assert.equal(await row().count(),1,'The command and assignment feeds show one canonical follow-up');
 assert.equal(await page.getByRole('button',{name:/Complete.*Review.*data/i}).count(),0,'A data review cannot be cleared by a task tick');
 await row().getByRole('button',{name:'Update',exact:true}).click();
 const panel=page.getByRole('dialog',{name:'Update task',exact:true});
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
 assert.deepEqual(errors,[]);
 await page.screenshot({path:'/tmp/home-quick-tasks.png',fullPage:true});
 console.log('Home quick tasks: editing, saved notes, failures, direct completion, double taps, Undo and mobile touch targets passed.');
}catch(error){if(activePage){console.log(await activePage.locator('body').innerText());await activePage.screenshot({path:'/tmp/home-work-failure.png',fullPage:true});}console.log(JSON.stringify(writes));throw error;}finally{await browser.close();}
