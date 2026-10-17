import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/playwright`:'playwright');
const browser=await (process.env.CALENDAR_BROWSER==='webkit'?webkit.launch({executablePath:process.env.CALENDAR_WEBKIT}):chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process','--no-zygote']}));
try {
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const saved={objective:'Earn a first-team role',next_checkpoint:'Speak with the coach',notes:'Keep these notes',target_markets:['Australia'],avoid_markets:[],player_priorities:{playing_time:5},non_negotiables:['Clear sporting role']};
  let strategy={...saved},confirmation='unconfirmed',state='draft',failConfirmation=true,approvals=0;
  await page.route('https://example.supabase.co/**',async route=>{
    const input=route.request().postDataJSON()||{};
    const action=input.action;
    let status=200,body={ok:true};
    if(action==='career_strategy_action_prepare'){
      const type=!strategy.preferred_pathway||!strategy.fallback_pathway?'define_career_strategy':confirmation!=='confirmed'?'confirm_strategy_with_player':'complete_strategy_approval';
      body={ok:true,proposal:state==='approved'?{status:'no_action_required',strategy_action_type:'maintain_strategy'}:{status:'needs_human_input',strategy_action_type:type,allowed_next_steps:type==='define_career_strategy'?['save_career_strategy']:type==='confirm_strategy_with_player'?['record_player_confirmation']:['approve_career_strategy'],career_strategy:{state,confirmation_state:confirmation,strategy:{id:'qa-strategy',strategy,review_due_at:'2099-10-21'}},suggested_input:{career_objective:strategy.objective,career_preferred_pathway:strategy.preferred_pathway||'',career_fallback_pathway:strategy.fallback_pathway||'',career_next_checkpoint:strategy.next_checkpoint,career_notes:strategy.notes,career_target_markets:'Australia',career_review_due_at:'2099-10-21'}}};
    }
    if(action==='career_strategy_save'){
      assert.equal(input.strategy.preferred_pathway,'Progress at the current club');
      assert.equal(input.strategy.fallback_pathway,'Review a loan');
      assert.deepEqual(input.strategy.player_priorities,{playing_time:5});
      assert.deepEqual(input.strategy.non_negotiables,['Clear sporting role']);
      assert.equal(input.strategy.notes,'Keep these notes');
      strategy=input.strategy;
      confirmation='needs_reconfirmation';
    }
    if(action==='career_strategy_confirm'){
      if(failConfirmation){failConfirmation=false;status=409;body={error:'Player confirmation could not be recorded. Try again.',code:'confirmation_failed'};}
      else confirmation='confirmed';
    }
    if(action==='career_strategy_approve'){
      assert.equal(confirmation,'confirmed');
      approvals++;
      state='approved';
    }
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  const url=new URL('/qa-career-strategy',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
  for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(e){if(i===59)throw e;await page.waitForTimeout(500);}}
  const dialog=page.getByRole('dialog',{name:'Dylan Gardiner'});
  await dialog.getByRole('button',{name:'Save strategy and continue'}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Approve career strategy'}).count(),0,'An incomplete plan must not offer agency approval');
  assert.equal(await dialog.getByLabel('Career objective',{exact:true}).inputValue(),saved.objective);
  await dialog.getByRole('button',{name:'Save strategy and continue'}).click();
  await dialog.getByRole('alert').waitFor();
  await dialog.getByLabel('Preferred route',{exact:true}).fill('Progress at the current club');
  await dialog.getByLabel('Fallback route',{exact:true}).fill('Review a loan');
  await dialog.getByRole('button',{name:'Save strategy and continue'}).click();
  await dialog.getByRole('button',{name:'Record player confirmation'}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Approve career strategy'}).count(),0,'Unconfirmed direction must not be labelled confirmed');
  await dialog.getByRole('button',{name:'Record player confirmation'}).click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Approve career strategy'}).count(),0,'A failed confirmation must not advance the workflow');
  await dialog.getByRole('button',{name:'Record player confirmation'}).click();
  await dialog.getByRole('button',{name:'Approve career strategy'}).waitFor();
  await dialog.getByRole('button',{name:'Approve career strategy'}).click();
  await dialog.getByRole('heading',{name:'Nothing else is needed right now.'}).waitFor();
  assert.equal(approvals,1);
  assert.equal(state,'approved');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'The mobile career flow must fit the viewport');
  console.log('Career plan: retained draft, required routes, confirmation recovery and explicit approval passed at 390px.');
} finally {await browser.close();}
