import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
const root=process.env.WORKSPACE_FLOW_QA_URL||'http://127.0.0.1:3113/workspace/qa-find-flow',errors=[];
const page=await browser.newPage({viewport:{width:390,height:844}});
page.on('pageerror',error=>errors.push(error.message));
try{
 const visit=async(query='')=>{
  for(let i=0;i<50;i++){try{await page.goto(root+query);break;}catch(error){if(i===49)throw error;await page.waitForTimeout(500);}}
  await page.getByRole('button',{name:'Find in this agency',exact:true}).waitFor();
  await page.locator('[data-qa-ready="true"]').waitFor();
  await page.addStyleTag({content:'nextjs-portal { display: none !important; }'});
 };
 const find=()=>page.getByRole('button',{name:'Find in this agency',exact:true});
 const open=async()=>{await find().click();const dialog=page.getByRole('dialog',{name:'Find in this agency',exact:true});await dialog.waitFor();return dialog;};
 const box=dialog=>dialog.getByRole('combobox');
 const choose=async(text)=>{const dialog=await open();await box(dialog).fill(text);return dialog;};
 for(const width of [320,390,430,768,1440]){
  await page.setViewportSize({width,height:900});await visit('?width='+width);
  const dialog=await choose('jose');
  const option=dialog.getByRole('option',{name:/José Silva/});await option.waitFor();await dialog.getByText('1 matching record',{exact:true}).waitFor();
  assert.match(await option.getAttribute('href'),/player=qa-player-0&profile=1$/);
  assert.ok(await box(dialog).evaluate(node=>node===document.activeElement));
  await page.keyboard.press('Shift+Tab');assert.ok(await dialog.evaluate(node=>node.contains(document.activeElement)),'Focus left search');
  await page.keyboard.press('Tab');assert.ok(await box(dialog).evaluate(node=>node===document.activeElement),'Focus did not cycle to search input');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1),'Horizontal overflow at '+width);
  const heights=await dialog.getByRole('button').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().height));
  assert.ok(heights.every(height=>height>=44),'Search controls under 44px at '+width);
  await page.keyboard.press('Escape');assert.ok(await find().evaluate(node=>node===document.activeElement));
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'');
  if(width===320||width===1440){
   const profileDialog=await choose('jose');await profileDialog.getByRole('option',{name:/José Silva/}).waitFor();
   await page.keyboard.press('Enter');await page.getByRole('region',{name:'Player data',exact:true}).waitFor();
   assert.equal(new URL(page.url()).searchParams.get('player'),'qa-player-0');
   assert.equal(new URL(page.url()).searchParams.get('profile'),'1');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1),'Direct profile overflow at '+width);
   const work=page.getByRole('link',{name:'Work view',exact:true});
   assert.match(await work.getAttribute('href'),/view=players&player=qa-player-0$/);
   assert.ok((await work.boundingBox()).height>=44,'Work view target under 44px at '+width);
   await page.getByRole('link',{name:'Back to players',exact:true}).click();
  }
 }
 await page.setViewportSize({width:390,height:844});await visit();
 await page.keyboard.press('Control+k');
 let dialog=page.getByRole('dialog',{name:'Find in this agency',exact:true});await dialog.waitFor();await box(dialog).fill('Dapo');
 await dialog.getByRole('option',{name:/Dapo Director/}).waitFor();
 assert.match(await dialog.getByRole('option',{name:/Dapo Director/}).getAttribute('href'),/view=network&person=qa-contact$/);
 await box(dialog).fill('Centre back needed');await dialog.getByRole('option',{name:/Centre back needed/}).waitFor();
 assert.match(await dialog.getByRole('option',{name:/Centre back needed/}).getAttribute('href'),/tab=needs&record=qa-need$/);
 await page.keyboard.press('Enter');await page.locator('#opportunity-qa-need[data-search-match="true"]').waitFor();
 await page.waitForFunction(()=>document.activeElement?.id==='opportunity-qa-need');
 assert.equal(new URL(page.url()).searchParams.get('record'),'qa-need');
 await page.getByRole('navigation',{name:'Agency workspace'}).getByRole('link',{name:'Players',exact:true}).click();
 dialog=await choose('Add player');await page.keyboard.press('Enter');await page.getByRole('status').getByText('Create player',{exact:true}).waitFor();
 await page.locator('[data-qa-dialog]').click();await page.keyboard.press('Control+k');
 assert.equal(await page.getByRole('dialog',{name:'Find in this agency',exact:true}).count(),0,'Search opened over another dialog');
 await page.getByRole('button',{name:'Close other dialog'}).click();
 await page.getByRole('textbox',{name:'Search players',exact:true}).fill('Example');
 const card=page.getByRole('button',{name:'Open Example Player 5',exact:true});await card.scrollIntoViewIfNeeded();
 const before=await page.evaluate(()=>window.scrollY);assert.ok(before>100);
 await card.click();await page.getByRole('region',{name:'Player data',exact:true}).waitFor();
 assert.equal(new URL(page.url()).searchParams.get('profile'),'1','Card added an intermediate screen');
 assert.equal(await page.getByRole('link',{name:'Work view',exact:true}).count(),1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1),'Profile overflow');
 await page.getByRole('link',{name:'Back to players',exact:true}).click();
 await page.getByRole('textbox',{name:'Search players',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('input[aria-label="Search players"]')?.value==='Example');
 await page.waitForFunction(top=>Math.abs(window.scrollY-top)<5,before);
 await page.getByRole('navigation',{name:'Agency workspace'}).getByRole('link',{name:'Network',exact:true}).click();
 await page.getByRole('button',{name:/^People/}).click();await page.getByRole('textbox',{name:'Search Network'}).fill('Director');
 await page.getByRole('navigation',{name:'Agency workspace'}).getByRole('link',{name:'Home',exact:true}).click();
 await page.getByRole('navigation',{name:'Agency workspace'}).getByRole('link',{name:'Network',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('input[aria-label="Search Network"]')?.value==='Director');
 assert.equal(await page.getByRole('textbox',{name:'Search Network'}).getAttribute('placeholder'),'Search person, club, role or country');
 await page.reload();await page.getByRole('textbox',{name:'Search Network'}).waitFor();
 await page.waitForFunction(()=>document.querySelector('input[aria-label="Search Network"]')?.value==='Director');
 await page.locator('[data-qa-switch]').click();await page.waitForFunction(()=>document.querySelector('input[aria-label="Search Network"]')?.value==='');
 dialog=await choose('jose');await dialog.getByText('No matching records',{exact:true}).waitFor();
 assert.equal(await dialog.getByRole('option',{name:/José Silva/}).count(),0,'Previous account search result leaked');
 await box(dialog).fill('Other Account');await dialog.getByRole('option',{name:/Other Account Player/}).waitFor();await page.keyboard.press('Escape');
 await visit('?scenario=partial');dialog=await choose('jose');await dialog.getByRole('alert').waitFor();
 await dialog.getByRole('button',{name:'Try again',exact:true}).click();await box(dialog).fill('Dapo');await dialog.getByRole('option',{name:/Dapo Director/}).waitFor();
 assert.equal(await dialog.getByRole('alert').count(),0);
 await page.keyboard.press('Escape');await visit();dialog=await choose('Example Player 249');await dialog.getByRole('option',{name:/Example Player 249/}).waitFor();
 await box(dialog).fill('Example Player 248');await dialog.getByText('No matching records',{exact:true}).waitFor();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Load more players',exact:true}).click();await page.getByText(/^200 of 250 players loaded\./).waitFor();
 await page.getByRole('button',{name:'Load more players',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Load more players',exact:true}).count(),0);
 await page.getByRole('textbox',{name:'Search players',exact:true}).fill('Example Player 249');await page.getByRole('button',{name:'Open Example Player 249',exact:true}).waitFor();
 await visit('?scenario=page-failure');await page.getByRole('button',{name:'Load more players',exact:true}).click();await page.getByRole('alert').filter({hasText:'Next page unavailable'}).waitFor();await page.getByRole('button',{name:'Retry loading players',exact:true}).click();await page.getByText(/^200 of 250 players loaded\./).waitFor();
 await visit('?scenario=stale');dialog=await choose('jose');await page.waitForTimeout(300);await box(dialog).fill('Dapo');await dialog.getByRole('option',{name:/Dapo Director/}).waitFor();await page.waitForTimeout(850);assert.equal(await dialog.getByRole('option',{name:/José Silva/}).count(),0);await page.keyboard.press('Escape');
 await visit('?scenario=hung');dialog=await choose('jose');await dialog.getByRole('alert').filter({hasText:'took too long'}).waitFor({timeout:15000});await dialog.getByRole('button',{name:'Try again',exact:true}).click();await dialog.getByRole('option',{name:/José Silva/}).waitFor();
 for(const [query,kind,id] of [['Beyond Summary Director','contact','beyond-contact'],['Beyond Summary Club','club','beyond-club'],['Beyond Summary Need','need','beyond-need'],['Beyond Summary Deal','deal','beyond-deal']]){
  await visit();dialog=await choose(query);const option=dialog.getByRole('option',{name:new RegExp(query)}).first();await option.waitFor();await option.click();
  if(kind==='need'){
   await page.locator('#opportunity-'+id).waitFor();await page.waitForFunction(id=>document.activeElement?.id==='opportunity-'+id,id);
   await page.locator('#opportunity-'+id+' small').filter({hasText:'Best route: Recorded Candidate'}).waitFor();
  }else await page.getByRole('heading',{name:query,exact:true}).waitFor();
 }
 await visit('?scenario=record-failure&view=opportunities&tab=needs&record=beyond-need');
 await page.getByRole('alert').filter({hasText:'Exact opportunity temporarily unavailable'}).waitFor();
 await page.getByRole('alert').getByRole('button',{name:'Try again',exact:true}).click();await page.locator('#opportunity-beyond-need').waitFor();
 await visit('?role=scout&view=players&player=qa-player-0&profile=1');
 await page.getByRole('heading',{name:'Assigned player profile',exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Work view',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Player intelligence',exact:true}).count(),0);
 assert.equal(await page.getByText('Profile tools',{exact:true}).count(),0);
 assert.equal(await page.getByText('Sharing history',{exact:true}).count(),0);
 // Exercise AgencyOperatingWorkspace itself: cached refresh and pagination share the real coordinator.
 const userA={id:'00000000-0000-0000-0000-000000000080',email:'a@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};
 const userB={...userA,id:'00000000-0000-0000-0000-000000000082',email:'b@example.test'};
 const token=user=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.fixture';
 const session=user=>({access_token:token(user),refresh_token:'fixture-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user});
 let slowRefresh=false,slowPage=false,releaseRefresh,releasePage,refreshStarted,pageStarted;
 const refreshGate=new Promise(resolve=>{releaseRefresh=resolve;}),pageGate=new Promise(resolve=>{releasePage=resolve;});
 const refreshRead=new Promise(resolve=>{refreshStarted=resolve;}),nextRead=new Promise(resolve=>{pageStarted=resolve;});
 let currentUser=userA,currentRole='owner';
 const restrictedRequests=[];
 await page.route('https://example.supabase.co/**',async route=>{
  const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON()||{};
  let result={};
  const restricted=currentRole!=='owner';
  if(restricted && (/redream_autopilot_(?:operations|market|deals)|redream_entity_archives/.test(path) ||
    ['agency_decisions','agency_roi_proof','team_capacity','workspace_need_record'].includes(body.action)))restrictedRequests.push(path+':'+body.action);
  if(path.includes('/auth/v1/token')){currentUser=userB;result=session(userB);}
  else if(path.includes('/auth/v1/user'))result=currentUser;
  else if(path.endsWith('/functions/v1/agency-os')){
   if(body.action==='tenants')result={tenants:[{tenant_id:'00000000-0000-0000-0000-000000000081',slug:'qa-find-flow',role:currentRole,display_name:'Example Agency'}]};
   else if(body.action==='players_workspace'){
    const account=route.request().headers().authorization?.includes(token(userB))?'b':'a';
    const offset=Number(body.offset)||0;
    if(slowRefresh&&account==='a'&&offset===0){refreshStarted();await refreshGate;}
    if(slowPage&&account==='a'&&offset===200){pageStarted();await pageGate;}
    const items=Array.from({length:Math.min(100,250-offset)},(_,i)=>({player_id:account+'-coordinator-'+(offset+i),identity:{name:(account==='a'?'Coordinator Player ':'Other Account Player ')+(offset+i),current_club:'Example FC',primary_position:'Centre back'},service:{}}));
    result={players:{items,total:250,next_offset:offset+items.length,has_more:offset+items.length<250}};
   }else if(body.action==='home_focus')result={home:{access:{restricted},commands:[]}};
   else result={home:{},items:[]};
  }else if(path.endsWith('/rest/v1/rpc/redream_autopilot_relationships')&&restricted)result={
    access:{restricted:true},accounts:{clubs:[{organisation_id:'staff-club',name:'Shared Staff Club',country:'NZ'}]},
    contacts:{items:[{person_id:'staff-contact',person:{full_name:'Shared Staff Contact'},employment:{organisation_name:'Shared Staff Club'},access:{restricted:true}}]}};
  else if(path.includes('/rest/v1/rpc/'))result={items:[],accounts:{clubs:[]},contacts:{items:[]}};
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.addInitScript(value=>localStorage.setItem('sb-example-auth-token',JSON.stringify(value)),session(userA));
 await page.goto(root+'?coordinator=1&view=players');
 await page.getByRole('button',{name:'Open Coordinator Player 0',exact:true}).waitFor();
 await page.getByRole('button',{name:'Load more players',exact:true}).click();await page.getByText(/^200 of 250 players loaded\./).waitFor();
 const coordinatorView=async view=>page.evaluate(({url,view})=>{const next=new URL(url);next.searchParams.set('view',view);window.history.pushState(null,'',next.pathname+next.search);},{url:page.url(),view});
 await coordinatorView('network');await page.getByRole('textbox',{name:'Search Network',exact:true}).waitFor();
 slowRefresh=true;await coordinatorView('players');await refreshRead;
 const refreshing=page.getByRole('button',{name:'Refreshing players...',exact:true});await refreshing.waitFor();assert.equal(await refreshing.isDisabled(),true);
 releaseRefresh();await page.getByRole('button',{name:'Load more players',exact:true}).waitFor();await page.getByText(/^200 of 250 players loaded\./).waitFor();
 slowPage=true;await page.getByRole('button',{name:'Load more players',exact:true}).click();await nextRead;
 await page.evaluate(()=>window.qaSignIn('b@example.test'));
 await page.getByRole('button',{name:'Open Other Account Player 0',exact:true}).waitFor();
 releasePage();await page.waitForTimeout(500);
 assert.equal(await page.getByRole('button',{name:/^Open Coordinator Player/}).count(),0,'Previous account page leaked');
 await page.getByText(/^100 of 250 players loaded\./).waitFor();
 for(const role of ['agent','scout','operations']){
  currentRole=role;currentUser=userA;await page.goto(root+'?coordinator=1&view=players&role='+role);
  await page.getByRole('button',{name:'Open Coordinator Player 0',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Opportunities',exact:true}).count(),0);
  assert.equal(await page.getByRole('link',{name:'Business',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:/^Manage /}).count(),0);
  if(role==='scout')assert.equal(await page.getByRole('button',{name:'Add player',exact:true}).count(),0);
  await page.goto(root+'?coordinator=1&role='+role+'&view=network');await page.getByText('Shared clubs and contacts. Your contact pages show your own activity. Commercial agency context requires administrator access.',{exact:true}).waitFor();
  await page.getByRole('heading',{name:'Shared Staff Club',exact:true}).waitFor();
  assert.equal(await page.getByText('LIVE OPPORTUNITIES',{exact:true}).count(),0);
  assert.equal(await page.getByText('BEST ROUTE',{exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:/^Manage /}).count(),0);
  await page.getByRole('button',{name:/^People/}).click();
  await page.getByRole('heading',{name:'Shared Staff Contact',exact:true}).waitFor();
  assert.equal(await page.getByText('RELATIONSHIP OWNER',{exact:true}).count(),0);
  await coordinatorView('home');await page.getByText('Your personal work',{exact:true}).waitFor();
  await page.getByText('No personal task, meeting or commitment currently needs your attention.',{exact:true}).waitFor();
  await coordinatorView('opportunities');await page.getByRole('heading',{name:'Administrator access required',exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1));
 }
 assert.deepEqual(restrictedRequests,[],'Restricted workspace requested private agency or archive data');
 currentRole='owner';
 await visit();dialog=await choose('jose');await dialog.getByRole('option',{name:/José Silva/}).waitFor();
 const shotDir=process.env.WORKSPACE_QA_SCREEN_DIR||'/tmp/redream-find-flow-screens';await mkdir(shotDir,{recursive:true});
 await page.screenshot({path:shotDir+'/mobile-search.png',fullPage:false});
 await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:900});dialog=await choose('jose');await dialog.getByRole('option',{name:/José Silva/}).waitFor();
 await page.screenshot({path:shotDir+'/desktop-search.png',fullPage:false});
 assert.deepEqual(errors,[],'Browser runtime errors');
 console.log('PASS: 5 viewports, exact links, keyboard/focus, quick add, direct player profile, filters/scroll/reload, account separation, complete 250-player pagination, exact records beyond summaries, real refresh/page/account coordination, retry, stale response and timeout recovery');
}finally{await browser.close();}
