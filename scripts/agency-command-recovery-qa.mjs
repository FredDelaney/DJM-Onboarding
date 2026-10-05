import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']});
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('https://example.supabase.co/**',async route=>{
    const action=route.request().postDataJSON()?.action;
    let status=200,body={};
    if(action==='tenants')body={tenants:[{tenant_id:'qa-tenant',slug:'qa',role:'owner',display_name:'QA agency',primary_color:'#12364c'}]};
    if(action==='home_focus')body={home:{attention:{confirm:[{command_id:'complete-task',source_type:'task',title:'Speak with player',priority_score:80,actionability:{mode:'one_tap',evidence_gate:'ready',cta:'Complete follow-up'}}]}}};
    if(action==='action_prepare')body={proposal:{proposal_id:'qa-proposal',title:'Complete: Speak with player',status:'proposed',executable:true}};
    if(action==='action_execute'){
      await page.evaluate(()=>{window.commandExecutions=(window.commandExecutions||0)+1;});
      status=409;body={error:'This approval has expired. Cancel and open the action again to review a fresh approval.',code:'proposal_expired'};
    }
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  const url=new URL('/qa-command',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
  for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(e){if(i===59)throw e;await page.waitForTimeout(500);}}
  await page.getByRole('button',{name:'Complete follow-up',exact:true}).click();
  // The existing markup is intentionally selected before it gains dialog semantics.
  const confirmation=page.locator('section').filter({hasText:'Nothing changes until you confirm.'});
  await confirmation.getByRole('button',{name:'Confirm',exact:true}).click();
  await page.waitForFunction(()=>window.commandExecutions===1);
  await page.getByText('This approval has expired.',{exact:false}).first().waitFor();
  assert.equal(await confirmation.getByRole('alert').count(),1,'Failure must be readable inside the open confirmation, not hidden behind its backdrop');
  assert.ok(await confirmation.getByRole('button',{name:'Cancel',exact:true}).isEnabled(),'A rejected action must leave the user able to cancel');
  const dialog=page.getByRole('dialog',{name:'Complete: Speak with player'});
  await dialog.waitFor();
  assert.ok(await dialog.evaluate(el=>el.contains(document.elementFromPoint(innerWidth/2,el.getBoundingClientRect().top+30))),'Confirmation must not be obscured');
  assert.ok(await dialog.evaluate(el=>el.parentElement.contains(document.elementFromPoint(innerWidth-30,innerHeight-100))),'Backdrop must cover floating controls');
  await dialog.getByRole('button',{name:'Confirm',exact:true}).focus();
  await page.keyboard.press('Tab');
  assert.ok(await dialog.getByRole('button',{name:'Cancel',exact:true}).evaluate(el=>el===document.activeElement),'Keyboard focus stays inside the confirmation');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.ok(await page.getByRole('button',{name:'Complete follow-up',exact:true}).evaluate(el=>el===document.activeElement),'Closing returns focus to the originating action');
  await page.getByRole('button',{name:'Complete follow-up',exact:true}).click();
  await page.getByRole('dialog').waitFor();
  await page.evaluate(()=>window.endFixtureSession());
  await page.getByRole('heading',{name:'Open your workspace.'}).waitFor();
  assert.ok(await page.evaluate(()=>document.body.style.overflow!=='hidden'),'A session ending with a confirmation open must release its body lock');
  await page.getByLabel('Email',{exact:true}).focus();
  assert.ok(await page.getByLabel('Email',{exact:true}).evaluate(el=>el===document.activeElement),'Sign-in must remain interactive after the confirmation disappears');
  console.log('Real workspace confirmation: visible error, accessible dialog and cancel recovery passed.');
} finally {await browser.close();}
