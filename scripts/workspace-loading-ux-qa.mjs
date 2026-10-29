// Real workspace coordinator with read-only network faults; no live data or credentials.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
const root=process.env.WORKSPACE_FLOW_QA_URL||'http://127.0.0.1:3113/workspace/qa-find-flow';
let page, held=[];const reads=[];
try {
 page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const user={id:'00000000-0000-0000-0000-000000000080',email:'fixture@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};
 const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.fixture';
 const session={access_token:token,refresh_token:'fixture-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
 await page.addInitScript(value=>{
  if(location.hostname==='127.0.0.1')localStorage.setItem('sb-example-auth-token',JSON.stringify(value));
  Object.defineProperty(navigator,'connection',{configurable:true,value:Object.assign(new EventTarget(),{saveData:true,effectiveType:'4g'})});
 },session);
 let stalled=new Set(),started;
 await page.route('https://example.supabase.co/**',async route=>{
  if(new URL(route.request().url()).pathname.endsWith('/redream_home_relevance_v1'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({visible_indices:(route.request().postDataJSON()?.p_items||[]).map((_,index)=>index),editable_indices:(route.request().postDataJSON()?.p_items||[]).map((_,index)=>index)})});
  const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON()||{};
  const name=body.action||path.split('/').pop();reads.push(name);
  if(stalled.has(name)){held.push(route);started?.();return;}
  let result={};
  if(path.includes('/auth/v1/user'))result=user;
  else if(path.includes('/auth/v1/token'))result=session;
  else if(name==='tenants')result={tenants:[{tenant_id:'00000000-0000-0000-0000-000000000081',slug:'qa-find-flow',role:'owner',display_name:'Selected Fixture Agency',short_name:'Selected Agency'}]};
  else if(name==='home_focus')result={home:{commands:[]}};
  else if(name==='redream_autopilot_operations')result={deadlines:{items:[{entity_type:'club_need',entity_id:'00000000-0000-4000-8000-000000000091',deadline_type:'club_need_expiry',title:'Recorded club need expires',deadline_at:new Date(Date.now()-86400000).toISOString()}]}};
  else if(name==='players_workspace')result={players:{items:[{player_id:'fixture-player',identity:{name:'Example Player',primary_position:'Centre back',current_club:'Example FC',next_action:'Call the club about the trial',next_action_due:'2020-01-01',contract_expiry:'2027-06-30'},service:{next_control_fix:{fix_type:'set_player_next_action',instruction:'Review the representation plan'},next_service_move:{move_type:'maintain_player_plan',instruction:'Agree the next career step with the player'}}}],total:1,has_more:false}};
  else if(name==='redream_autopilot_relationships')result={accounts:{clubs:[{organisation_id:'current',name:'Current Club',country:'NZ'}]},contacts:{items:[]}};
  else if(name==='redream_ai_current_access')result={enabled:false};
  else result={items:[],accounts:{clubs:[]},contacts:{items:[]}};
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 const waitForRead=async pending=>{let timer;try{await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Expected workspace read did not start')),30000);})]);}finally{clearTimeout(timer);}};
 const visit=async query=>{
  for(let attempt=0;attempt<60;attempt++)try{await page.goto(root+'/qa-fixture/qa-find-flow?coordinator=1&'+query);return;}catch(error){if(attempt===59)throw error;await new Promise(resolve=>setTimeout(resolve,250));}
 };
 // Every previously unbounded primary read reaches the existing recoverable error.
 for(const [query,names] of [
  ['view=network',['redream_autopilot_relationships']],
  // Calendar's actual range RPC now owns its errors and retry; there is no overview RPC.
  ['view=calendar',['redream_calendar_range']],
  ['view=opportunities',['redream_autopilot_market']],
  // Keep the commercial error contract covered independently of the Market tab.
  ['view=opportunities&tab=deals',['redream_autopilot_deals']],
  ['view=players&tab=recruitment',['recruitment_board']],
  ['view=business',['agency_control_centre']],
  ['view=home',['home_focus','redream_autopilot_home']],
 ].filter(([query])=>!process.env.WORKSPACE_LOADING_CASE||query==='view='+process.env.WORKSPACE_LOADING_CASE||(process.env.WORKSPACE_LOADING_CASE==='deals'&&query==='view=opportunities&tab=deals'))) {
  stalled=new Set(names);const pending=new Promise(resolve=>{started=resolve;});
  await visit(query);await waitForRead(pending);const readStarted=performance.now();
  const calendar=query==='view=calendar';
  const deadlineAlert=page.getByRole('alert').filter({hasText:calendar?'Could not load meetings and agency dates.':'took too long'});
  // Calendar reports its scoped date error without blocking the workspace shell.
  await deadlineAlert.waitFor({timeout:30000});
  if(query==='view=home'){const elapsed=Math.round(performance.now()-readStarted);await writeFile(process.env.HOME_LOADING_REPORT||'/tmp/redream-home-loading-timing.json',JSON.stringify({elapsed_ms:elapsed,environment:'local Chromium, intercepted stalled reads',budget_ms:16500}));assert.ok(elapsed<16500,'Home must reach recovery within one 12-second read budget plus browser overhead; observed '+elapsed+'ms');}
  assert.equal(await page.getByText('Loading current agency position...',{exact:true}).count(),0);
  stalled.clear();const recovered=page.waitForResponse(response=>response.url().endsWith('/'+names[0])||response.request().postDataJSON()?.action===names[0]);
  if(calendar) await deadlineAlert.getByRole('button',{name:'Retry meetings and agency dates',exact:true}).click();
  else await page.getByRole('button',{name:'Try again',exact:true}).click();
  await recovered;
  await deadlineAlert.waitFor({state:'hidden'});
  assert.equal(await page.getByRole('link',{name:'Selected Fixture Agency workspace',exact:true,includeHidden:true}).count(),2,'Both desktop and mobile brand links use the authorised selected agency');
  if(query==='view=home')await page.locator('a[href$="&tab=needs&record=00000000-0000-4000-8000-000000000091"]').waitFor();
  if(query==='view=network')await page.getByRole('heading',{name:'Current Club',exact:true}).waitFor();
  for(const route of held.splice(0))await route.fulfill({contentType:'application/json',body:JSON.stringify({accounts:{clubs:[{organisation_id:'old',name:'Old Club'}]},contacts:{items:[]}})});
  assert.equal(await page.getByRole('heading',{name:'Old Club',exact:true}).count(),0,'Expired reads cannot replace the recovered view');
  console.log('PASS: '+query+' deadline and retry');
 }
 // Navigation must not wait indefinitely for a stalled speculative warm read.
 stalled.clear();await visit('view=home');await page.getByRole('heading',{name:'Your day',exact:true}).waitFor();
 stalled.add('redream_autopilot_relationships');const warmStarted=new Promise(resolve=>{started=resolve;});
 await page.getByRole('link',{name:'Network',exact:true}).click();await waitForRead(warmStarted);
 stalled.clear();
 await page.getByRole('heading',{name:'Current Club',exact:true}).waitFor();
 for(const route of held.splice(0))await route.fulfill({contentType:'application/json',body:JSON.stringify({accounts:{clubs:[{organisation_id:'old',name:'Old Club'}]},contacts:{items:[]}})});
 await page.getByRole('link',{name:'Home',exact:true}).click();await page.getByRole('heading',{name:'Your day',exact:true}).waitFor();
 await page.getByRole('link',{name:'Network',exact:true}).click();await page.getByRole('heading',{name:'Current Club',exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Old Club',exact:true}).count(),0,'Timed out warming cannot poison the view cache');
 await visit('view=players');
 const player=page.getByRole('button',{name:'Open Example Player',exact:true});await player.waitFor();
 await player.getByText('Call the club about the trial',{exact:true}).waitFor();
 assert.equal(await player.getByText('Review the representation plan',{exact:true}).count(),0,'Generic setup cannot mask actual overdue work');
 assert.equal(await player.getByText('Agree the next career step with the player',{exact:true}).count(),0,'Routine planning cannot mask actual overdue work');
 const review=player.getByRole('button',{name:'Open next action for Example Player',exact:true});await review.waitFor();
 const bounds=await player.boundingBox();assert.ok(bounds.height<220,'Desktop roster keeps the next step and work view together without a third empty row');
 const label=review.getByText('Next action',{exact:true}),timing=review.locator('small');
 assert.equal(await player.getByText('No due date',{exact:true}).count(),0,'The recorded due date must not disappear');
 const labelBox=await label.boundingBox(),timingBox=await timing.boundingBox();
 assert.ok(timingBox.x>=labelBox.x+labelBox.width+4 || timingBox.y>=labelBox.y+labelBox.height,'Next action and its timing must remain visually distinct');
 await mkdir('/tmp/redream-ux-pass',{recursive:true});await page.screenshot({path:'/tmp/redream-ux-pass/players-desktop.png'});
 await page.locator('main header summary').filter({hasText:'More'}).click();
 const documents=page.getByRole('link',{name:'Documents',exact:true});await documents.waitFor();
 assert.ok((await documents.boundingBox()).height>=44,'Documents shares the same usable menu target size as other tools');
 assert.ok(await documents.evaluate(node=>getComputedStyle(node).display.includes('flex')),'Document icon and label retain menu spacing');
 await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});
 const work=player.getByRole('button',{name:'Open Example Player work view',exact:true});await work.waitFor();
 assert.ok((await work.boundingBox()).height>=44,'Mobile work view remains easy to tap');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Roster has no horizontal overflow');
 await page.screenshot({path:'/tmp/redream-ux-pass/players-mobile.png'});
 await review.click();
 await page.waitForURL(url=>url.searchParams.get('player')==='fixture-player');
 assert.equal(new URL(page.url()).searchParams.has('profile'),false,'Recorded work opens its existing work view');
 assert.equal(reads.includes('action_prepare'),false,'Opening recorded work never prepares an unrelated setup write');
 assert.deepEqual(errors,[],'No browser runtime failures');
 console.log('PASS: Home, Network, Calendar, Market, Live Deals, Recruitment and Business deadlines, retry, late response rejection and stalled warming recovery.');
}catch(error){console.error('Failed URL:',page?.url(),'Recent reads:',reads.slice(-20));await mkdir('/tmp/redream-ux-pass',{recursive:true});await page?.screenshot({path:'/tmp/redream-ux-pass/loading-failure.png'});throw error;}finally{await browser.close();}
