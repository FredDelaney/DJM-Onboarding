import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']});
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  let prepares=0;
  let pendingReview=true;
  const dylan='30000000-0000-4000-8000-000000000001';
  const capture='40000000-0000-4000-8000-000000000001';
  await page.route('https://example.supabase.co/**',async route=>{
    const action=route.request().postDataJSON()?.action;
    let body={};
    if(action==='tenants')body={tenants:[{tenant_id:'qa-tenant',slug:'qa',role:'owner',display_name:'QA agency'}]};
    if(action==='home_focus')body={home:{attention:{judgement:[
      {command_id:'capture:'+capture,source_type:'capture',source_id:capture,title:'Arrange a call with Dejan',priority_score:90,recommended_action:'Answer the missing clarification.',actionability:{mode:'review_only',cta:'Review clarification'}},
      {command_id:'player_review:'+dylan,command_type:'Player review required',source_type:'player',player_id:dylan,source_id:dylan,title:'Dylan',priority_score:82,recommended_action:'Review the player record and resolve the flagged issue.',why_now:'Career statistics changed',evidence:{review_reason:'Career statistics changed'},actionability:{mode:'one_tap',evidence_gate:'ready',cta:'Create player action'}},
      {command_id:'task:old-reminder',source_type:'task',title:'Review the player record and resolve the flagged issue.',player_id:dylan,evidence:{player_name:'Dylan',task_count:1,tasks:[{task_id:'old-reminder',player_id:dylan}]},priority_score:85,actionability:{mode:'one_tap',evidence_gate:'ready',cta:'Complete follow-up'}}
    ].filter(command=>pendingReview || command.command_type!=='Player review required')}}};
    if(action==='action_prepare'){prepares++;body={proposal:{proposal_id:'fake',title:'Create player action: Dylan',executable:true}};}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const url=new URL('/qa-command',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
  for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(e){if(i===59)throw e;await page.waitForTimeout(500);}}
  await page.getByText('Arrange a call with Dejan',{exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Review player data',exact:true}).count(),1,'Player review must open the existing record, not create another reminder');
  const review=page.getByRole('link',{name:'Review player data',exact:true});
  assert.equal(await review.getAttribute('href'),'/agency?view=players&player='+dylan+'&profile=1');
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
  console.log('Home context: specific review reason, direct player/capture links, one review card and mobile layout passed.');
} finally {await browser.close();}
