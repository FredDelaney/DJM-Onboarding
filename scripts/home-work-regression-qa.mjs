import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
const id='30000000-0000-4000-8000-000000000001',member='10000000-0000-4000-8000-000000000001';
const failures=[];
try{
 for(const scenario of ['reply','date','refresh']){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const openDay=async()=>{const summary=page.locator('details > summary').filter({hasText:'Your day'});await summary.waitFor();if(!(await summary.evaluate(node=>node.parentElement.open)))await summary.click();};
  let kind=scenario==='date'?'calendar_task':scenario==='reply'?'task':'player_next_action';
  let work={work_kind:kind,work_id:id,title:'Call the player',display_title:'Call the player',due_on:'2026-10-16',due_at:kind==='calendar_task'?null:'2026-10-16',note:'',status:'open',state:{revision:1,status:'open'}};
  let before,delayHome=false,homeReads=0;
  await page.route('https://example.supabase.co/**',async route=>{
   if(new URL(route.request().url()).pathname.endsWith('/redream_home_relevance_v1'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({visible_indices:(route.request().postDataJSON()?.p_items||[]).map((_,index)=>index),editable_indices:(route.request().postDataJSON()?.p_items||[]).map((_,index)=>index)})});
   const body=route.request().postDataJSON()||{},path=new URL(route.request().url()).pathname;
   let value={};
   if(body.action==='tenants')value={tenants:[{tenant_id:'qa-tenant',slug:'qa',role:'owner',display_name:'QA agency'}]};
   else if(body.action==='home_focus'){
    if(delayHome)await new Promise(resolve=>setTimeout(resolve,800));
    homeReads++;value={home:{attention:{judgement:scenario==='reply'?[{command_id:'task:'+id,source_type:'task',source_id:id,title:work.title,due_at:work.due_at,reply_interaction_id:id,evidence:{task_count:1},actionability:{mode:'one_tap',cta:'Complete follow-up',evidence_gate:'ready'}}]:[]}}};
   }else if(path.endsWith('/redream_assigned_work_page_v1'))value={items:scenario!=='reply'&&work.status==='open'?[{work_kind:kind,work_id:id,title:work.display_title,due_at:work.due_at||work.due_on,date_only:true}]:[],next_cursor:null};
   else if(path.endsWith('/redream_work_responsibility_v1'))value={user_ids:[member],people:[{user_id:member,display_name:'Jesse Edge'}],revision:1};
   else if(path.endsWith('/redream_home_work_v1')){
    if(body.p_action!=='read'){
     assert.deepEqual(body.p_expected_state,work.state);
     before=work;
     if(body.p_action==='update')work={...work,title:body.p_input.title,display_title:body.p_input.title,due_on:body.p_input.due_on,note:body.p_input.note,state:{...work.state,revision:work.state.revision+1}};
     if(body.p_action==='complete')work={...work,status:'done',state:{...work.state,status:'done',revision:work.state.revision+1}};
     if(body.p_action==='undo')work={...before,status:'open',state:{...work.state,status:'open',revision:work.state.revision+1}};
    }
    value={work,undo_token:body.p_action==='complete'?'token':null};
   }
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
  });
  try{
   const url=new URL('/qa-command',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
   for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}}
  await openDay();
   const row=()=>page.locator('article').filter({hasText:work.display_title});
   await row().getByRole('button',{name:'Update',exact:true}).waitFor();
   if(scenario==='reply')assert.equal(await row().getByRole('button',{name:'Prepare reply',exact:true}).count(),1,'Home retains reply preparation alongside task controls');
   if(scenario==='date'){
    await row().getByRole('button',{name:'Update',exact:true}).click();
    const panel=page.getByRole('dialog',{name:'Update task',exact:true});
    await panel.getByLabel('Note (optional)',{exact:true}).fill('Trial details recorded.');
    delayHome=true;
    await panel.getByRole('button',{name:'Save changes',exact:true}).click();
    await panel.waitFor({state:'hidden'});
    assert.equal(await row().getByText('No date',{exact:true}).count(),0,'A saved calendar date is retained before refresh confirms');
    await row().getByRole('button',{name:'Complete Call the player',exact:true}).click();
    await page.getByRole('button',{name:'Undo completion of Call the player',exact:true}).waitFor();
   }
   if(scenario==='refresh'){
    await row().getByRole('button',{name:'Complete Call the player',exact:true}).click();
    await page.getByRole('button',{name:'Undo completion of Call the player',exact:true}).waitFor();
    for(let i=0;i<50&&homeReads<2;i++)await page.waitForTimeout(50);
    assert.equal(await row().count(),0);
    work={...work,title:'New follow-up from a colleague',display_title:'New follow-up from a colleague',status:'open',state:{...work.state,status:'open',revision:work.state.revision+1}};
    await page.evaluate(()=>window.dispatchEvent(new Event('redream:responsibilities-updated')));
    await row().getByRole('button',{name:'Update',exact:true}).waitFor({timeout:3000});
    assert.equal(await row().count(),1,'A confirmed refresh shows newly reopened work');
   }
   console.log('Home regression passed: '+scenario);
  }catch(error){failures.push({scenario,message:error.message});}finally{await page.close();}
 }
 assert.deepEqual(failures,[]);
}finally{await browser.close();}
