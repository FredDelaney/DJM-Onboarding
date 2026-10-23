import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']});
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let prepares=0;
  let pendingReview=true;
  let dense=false,relevanceFailure=false,assignedFailure=false;
  const dylan='30000000-0000-4000-8000-000000000001';
  const privatePlayer='30000000-0000-4000-8000-000000000099';
  const capture='40000000-0000-4000-8000-000000000001';
  await page.route('https://example.supabase.co/**',async route=>{
   if(new URL(route.request().url()).pathname.endsWith('/redream_home_relevance_v1')){
    const visible=(route.request().postDataJSON()?.p_items||[]).flatMap((item,index)=>item.player_id===privatePlayer||item.source_id===privatePlayer?[]:[index]);
    return route.fulfill({status:relevanceFailure?503:200,contentType:'application/json',body:JSON.stringify(relevanceFailure?{message:'Temporary outage'}:{visible_indices:visible,editable_indices:visible})});
   }
   if(new URL(route.request().url()).pathname.endsWith('/redream_assigned_work_page_v1'))return route.fulfill({status:assignedFailure?503:200,contentType:'application/json',body:JSON.stringify(assignedFailure?{message:'Temporary outage'}:{items:[],next_cursor:null})});
    const action=route.request().postDataJSON()?.action;
    let body={};
    if(action==='tenants')body={tenants:[{tenant_id:'qa-tenant',slug:'qa',role:'owner',display_name:'QA agency'}]};
    if(action==='home_focus')body={home:{attention:{judgement:[
      {command_id:'capture:'+capture,source_type:'capture',source_id:capture,title:'Arrange a call with Dejan',priority_score:90,recommended_action:'Answer the missing clarification.',actionability:{mode:'review_only',cta:'Review clarification'}},
      {command_id:'player_review:'+dylan,command_type:'Player review required',source_type:'player',player_id:dylan,source_id:dylan,title:'Dylan',priority_score:82,recommended_action:'Review the player record and resolve the flagged issue.',why_now:'Career statistics changed',evidence:{review_reason:'Career statistics changed'},actionability:{mode:'one_tap',evidence_gate:'ready',cta:'Create player action'}},
      {command_id:'task:old-reminder',source_type:'task',title:'Review the player record and resolve the flagged issue.',player_id:dylan,evidence:{player_name:'Dylan',task_count:1,tasks:[{task_id:'old-reminder',player_id:dylan}]},priority_score:85,actionability:{mode:'one_tap',evidence_gate:'ready',cta:'Complete follow-up'}}
    ].filter(command=>pendingReview || command.command_type!=='Player review required')}}};
    if(action==='home_focus'&&dense)body={home:{attention:{judgement:[
      ...Array.from({length:12},(_,index)=>({command_id:'player_review:'+index,command_type:'Player review required',source_type:'player',player_id:'review-'+index,source_id:'review-'+index,title:'Player '+index,priority_score:100,due_at:'2020-01-01T00:00:00Z',evidence:{review_reason:'Career statistics changed'}})),
      {command_id:'player_review:private',command_type:'Player review required',source_type:'player',player_id:privatePlayer,source_id:privatePlayer,title:'Private colleague player',priority_score:100},
      {command_id:'contract:due',command_type:'Contract decision approaching',source_type:'player',player_id:dylan,source_id:dylan,title:'Confirm contract extension',due_at:'2020-01-01T00:00:00Z',priority_score:1},
      {command_id:'capture:undated',source_type:'capture',source_id:capture,title:'Clarify the trial location',priority_score:1},
    ]}}};
    if(action==='action_prepare'){prepares++;body={proposal:{proposal_id:'fake',title:'Create player action: Dylan',executable:true}};}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const url=new URL('/qa-command',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
  for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(e){if(i===59)throw e;await page.waitForTimeout(500);}}
  await page.getByText('Arrange a call with Dejan',{exact:true}).waitFor();
  await page.locator('summary').filter({hasText:'Player data to review'}).click();
  assert.equal(await page.getByRole('link',{name:'Review player data',exact:true}).count(),1,'Player review must open the existing record, not create another reminder');
  const review=page.getByRole('link',{name:'Review player data',exact:true});
  assert.equal(await review.getAttribute('href'),'/agency?view=players&player='+dylan+'&profile=1');
  const reviewRow=page.locator('article').filter({has:review});
  await reviewRow.locator('summary').filter({hasText:'Details'}).click();
  await page.getByText('Career statistics changed',{exact:true}).waitFor();
  assert.equal(await page.getByText('Review the player record and resolve the flagged issue.',{exact:true}).count(),0,'Generic reminder must not duplicate the same player review card');
  assert.equal(await page.getByRole('link',{name:'Answer question',exact:true}).getAttribute('href'),'/workspace/qa/capture?capture='+capture);
  assert.equal(prepares,0,'Opening Home must not prepare writes for data reviews');
  for(const width of [320,390,430,768]) {
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow at '+width);
    assert.ok(await review.isVisible());
    assert.ok(await review.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=12),'Action labels must be readable, not hidden behind an arrow at '+width);
  }
  pendingReview=false;
  await page.goto(url.href);
  await page.getByText('Arrange a call with Dejan',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Mark reminder done',exact:true}).count(),1,'An existing review reminder must remain manageable after the player data is verified');
  await page.getByRole('button',{name:'Mark reminder done',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(prepares,1,'Only explicit reminder completion prepares a write');
  dense=true;
  await page.goto(url.href);
  const priorities=page.getByRole('region',{name:'Today priorities',exact:true});
  await priorities.getByText('Confirm contract extension',{exact:true}).waitFor();
  await priorities.getByText('Clarify the trial location',{exact:true}).waitFor();
  assert.equal(await priorities.getByText(/Review Player \d+/).count(),0,'Review flags cannot consume the five business priority slots, even beyond the old ten-item cap');
  await priorities.locator('article').filter({hasText:'Clarify the trial location'}).getByText('No date',{exact:true}).waitFor();
  assert.equal(await page.getByText('Private colleague player',{exact:true}).count(),0,'Unassigned private reviews are absent, including collapsed content');
  const summary=page.locator('summary').filter({hasText:'Player data to review'});
  const group=summary.locator('..');
  assert.equal((await summary.innerText()).trim().replace(/\s+/g,' '),'Player data to review 12','The count includes only server-authorised reviews');
  assert.equal(await group.getByRole('link',{name:'Review player data',exact:true}).count(),0,'Routine reviews start collapsed');
  await summary.focus();await page.keyboard.press('Enter');
  assert.equal(await group.getByRole('link',{name:'Review player data',exact:true}).count(),12,'All reviews remain reachable through the existing actions');
  await mkdir('/tmp/redream-platform-programme/home',{recursive:true});
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Home fits '+width);
    assert.ok(await group.evaluate(node=>node.scrollWidth<=node.clientWidth+1),'Expanded reviews do not clip at '+width);
    const link=group.getByRole('link',{name:'Review player data',exact:true}).first();
    assert.equal(await link.getAttribute('href'),'/agency?view=players&player=review-0&profile=1');
    assert.ok((await link.boundingBox()).height>=44,'Review action is tappable at '+width);
    await page.screenshot({path:'/tmp/redream-platform-programme/home/'+width+'.png',fullPage:true});
  }
  await summary.focus();await page.keyboard.press('Enter');
  assert.equal(await group.getByRole('link',{name:'Review player data',exact:true}).count(),0,'Keyboard users can collapse the reviews again');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/tmp/redream-platform-programme/home/390-collapsed.png',fullPage:true});
  relevanceFailure=true;
  await page.goto(url.href);
  await page.getByRole('button',{name:'Retry updates',exact:true}).waitFor();
  assert.equal(await page.getByText('Player data to review',{exact:true}).count(),0,'A failed permission read reveals no grouped counts or content');
  assert.equal(await page.getByText('All clear',{exact:true}).count(),0,'A failed permission read is never all clear');
  relevanceFailure=false;
  await page.getByRole('button',{name:'Retry updates',exact:true}).click();
  await priorities.getByText('Confirm contract extension',{exact:true}).waitFor();
  assignedFailure=true;
  await page.goto(url.href);
  await page.getByRole('button',{name:'Retry tasks',exact:true}).waitFor();
  assignedFailure=false;
  await page.getByRole('button',{name:'Retry tasks',exact:true}).click();
  await page.getByRole('button',{name:'Retry tasks',exact:true}).waitFor({state:'hidden'});
  assert.equal(await page.getByText('Could not load your assigned tasks.',{exact:true}).count(),0,'Assigned-task errors recover through the existing Home refresh');
  assert.equal(prepares,1,'Grouping, keyboard expansion and retry do not prepare any writes');
  assert.deepEqual(errors,[]);
  console.log('Home context: grouped authorised reviews, real business priorities/deadlines, keyboard, retry, existing actions and four widths passed.');
} finally {await browser.close();}
