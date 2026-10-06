import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const port=process.env.ONBOARDING_QA_PORT||'3115',root='http://127.0.0.1:'+port;
const runtimeServer=createServer((req,res)=>{if(!req.url?.startsWith('/functions/v1/platform-tenant-runtime')){res.writeHead(404);res.end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({resolved:true,tenant_id:'00000000-0000-0000-0000-000000000081',slug:'onboarding-fixture',branding:{display_name:'Example Agency'}}));});
await new Promise(resolve=>runtimeServer.listen(0,'127.0.0.1',resolve));
const backend='http://127.0.0.1:'+runtimeServer.address().port;
const env={...process.env,NEXT_PUBLIC_REDREAM_ENVIRONMENT:'qa',NEXT_PUBLIC_SUPABASE_URL:backend,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'example'};
const server=spawn('npm',['run','dev','--','--webpack','--hostname','127.0.0.1','--port',port],{env,stdio:'inherit',detached:true});
let browser;const failures=[];
const user={id:'00000000-0000-0000-0000-000000000080',email:'fixture@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};
const token=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
const session={access_token:token,refresh_token:'fixture-refresh-token',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
const original={id:'00000000-0000-0000-0000-000000000082',tenant_id:'00000000-0000-0000-0000-000000000081',user_id:user.id,first_name:'Fixture',last_name:'Player',primary_position:'Centre back',preferred_foot:'Right',nationalities:['NZ'],secondary_positions:[],football_status:'active',onboarding_status:'in_progress',updated_at:'2026-10-06T12:00:00.000Z'};
try{
 browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
 async function scenario(name,run){
  // CSP is bypassed only in this isolated fixture to use a local mock backend. Production headers stay unchanged.
  const page=await browser.newPage({viewport:{width:390,height:844},bypassCSP:true}),errors=[];
  const state={player:{...original},step:3,private:{phone:'+64 21234567',market_preferences:'NZ',updated_at:'2026-10-06T12:00:00.000Z'},draft:{},videos:[],loadFails:false,saveFails:false,videoFails:false,reads:0,writes:0};
  page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(({value,root})=>{if(location.origin===root)localStorage.setItem('sb-127-auth-token',JSON.stringify(value));},{value:session,root});
  await page.route(backend+'/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname,method=req.method(),body=req.postDataJSON();let data={},status=200;
   if(path.endsWith('/auth/v1/user'))data=user;
   else if(path.endsWith('/rest/v1/rpc/player_save_onboarding')){
    assert.equal(body.p_player_id,original.id);assert.equal(body.p_tenant_id,original.tenant_id);assert.equal(body.p_expected_updated_at,state.player.updated_at);assert.equal(body.p_expected_private_updated_at,state.private.updated_at);state.writes++;if(state.saveDelay)await new Promise(resolve=>setTimeout(resolve,state.saveDelay));if(state.saveFails||state.videoFails||state.saveMessage){status=500;data={message:state.saveMessage||'fixture_save_failure',code:state.saveMessage?'40001':'XX000'};}
    else{state.player={...state.player,...body.p_profile,onboarding_status:body.p_finishing?'submitted':'in_progress',updated_at:'2026-10-06T13:00:00.000Z'};state.private={...state.private,...body.p_private,updated_at:'2026-10-06T13:00:00.000Z'};state.step=body.p_next_step;state.draft={video_url:body.p_video_url};if(body.p_finishing&&body.p_video_url&&!state.videos.length)state.videos.push({url:body.p_video_url});data={saved:true,completed:body.p_finishing,updated_at:state.player.updated_at,private_updated_at:state.private.updated_at};}
   }else if(path.startsWith('/rest/v1/')){
    const table=path.split('/').pop();if(method==='GET'){
     state.reads++;if(state.loadFails&&(!state.loadTable||state.loadTable===table)){status=503;data={message:'fixture_read_failure',code:'XX000'};}
     else if(table==='players'){state.playerQuery=url;data=[state.player];}
     else if(table==='player_private')data=state.private;
     else if(table==='player_onboarding')data={current_step:state.step,draft:state.draft,draft_state:state.draft};
     else if(table==='player_videos')data=null;
    }else{
     state.writes++;if(state.saveFails||(table==='player_videos'&&state.videoFails)){status=500;data={message:'fixture_save_failure',code:'XX000'};}
     else{if(table==='players')state.player={...state.player,...body};if(table==='player_private')state.private={...state.private,...body};if(table==='player_onboarding'){state.step=body.current_step;state.draft=body.draft;}if(table==='player_videos')state.videos.push(body);status=204;}
    }
   }else throw new Error('Unintercepted fixture path '+path);
   await route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':root,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'},body:status===204?'':JSON.stringify(data)});
  });
  const visit=async()=>{for(let i=0;i<60;i++){try{await page.goto(root+'/onboarding',{waitUntil:'domcontentloaded',timeout:10000});break;}catch(e){if(i===59)throw e;await page.waitForTimeout(250);}}await page.addStyleTag({content:'nextjs-portal{display:none!important}'});};
  try{await run({page,state,visit});assert.deepEqual(errors,[]);console.log('PASS: '+name);}catch(e){console.error('BODY: '+(await page.locator('body').innerText()).slice(0,2000));console.error('ERRORS: '+JSON.stringify(errors));failures.push(name+': '+e.message);console.error('FAIL: '+name+': '+e.message);}finally{await page.close();}
 }
 await scenario('read failure is recoverable, not a missing invitation',async({page,state,visit})=>{
  state.loadFails=true;await visit();await page.getByRole('button',{name:/Try again|Retry/}).waitFor({timeout:12000});assert.equal(state.writes,0);state.loadFails=false;await page.getByRole('button',{name:/Try again|Retry/}).click();await page.getByRole('heading',{name:'Tell us what matters next.',exact:true}).waitFor();
 });
 await scenario('failed Back save keeps the step and private draft',async({page,state,visit})=>{
  await visit();await page.getByRole('heading',{name:'Tell us what matters next.',exact:true}).waitFor();state.saveFails=true;await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('button',{name:'Looks right',exact:true}).waitFor();await page.waitForTimeout(500);assert.equal(await page.getByRole('heading',{name:'Tell us what matters next.',exact:true}).count(),1);assert.equal(state.private.market_preferences,'NZ');
 });
 await scenario('failed video save cannot mark onboarding complete',async({page,state,visit})=>{
  state.step=4;await visit();await page.getByRole('heading',{name:'Add what we can’t create for you.',exact:true}).waitFor();await page.getByLabel(/Current highlight video/).fill('https://youtu.be/fixture');state.videoFails=true;await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('button',{name:'Finish setup',exact:true}).waitFor();await page.waitForTimeout(500);assert.equal(state.player.onboarding_status,'in_progress');assert.equal(state.videos.length,0);assert.equal(await page.getByPlaceholder('YouTube, Vimeo, Google Drive…').inputValue(),'https://youtu.be/fixture');
  state.videoFails=false;await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('heading',{name:'You’re in.',exact:true}).waitFor();assert.equal(state.player.onboarding_status,'submitted');assert.equal(state.videos.length,1);
 });
 await scenario('all onboarding inputs have accessible labels',async({page,state,visit})=>{
  state.step=1;await visit();await page.getByRole('heading',{name:'We’ve already started your profile.',exact:true}).waitFor();
  assert.equal(await page.getByLabel('First name',{exact:true}).inputValue(),'Fixture');
  for(let step=0;step<4;step++){
   assert.deepEqual(await page.locator('input,select,textarea').evaluateAll(nodes=>nodes.filter(node=>!node.labels?.length).map(node=>node.tagName)),[]);
   if(step<3){await page.getByRole('button',{name:'Looks right',exact:true}).click();await page.getByText('STEP '+(step+2)+' OF 4',{exact:true}).waitFor();}
  }
 });
 await scenario('private read failure cannot turn saved preferences into empty editable fields',async({page,state,visit})=>{
  state.loadFails=true;state.loadTable='player_private';await visit();await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
  assert.equal(await page.locator('input,textarea,select').count(),0);assert.equal(state.writes,0);
  state.loadFails=false;await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('heading',{name:'Tell us what matters next.',exact:true}).waitFor();
  assert.ok((await page.locator('input,textarea').evaluateAll(nodes=>nodes.map(node=>node.value))).includes('NZ'));
 });
 await scenario('optional video draft survives Back and reload without publishing footage',async({page,state,visit})=>{
  state.step=4;await visit();await page.getByLabel(/Current highlight video/).fill('https://youtu.be/resume');
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('heading',{name:'Tell us what matters next.',exact:true}).waitFor();
  assert.equal(state.draft.video_url,'https://youtu.be/resume');assert.equal(state.videos.length,0);
  await visit();await page.getByRole('heading',{name:'Tell us what matters next.',exact:true}).waitFor();await page.getByRole('button',{name:'Looks right',exact:true}).click();await page.getByLabel(/Current highlight video/).waitFor();
  assert.equal(await page.getByLabel(/Current highlight video/).inputValue(),'https://youtu.be/resume');assert.equal(state.videos.length,0);
 });
 await scenario('a changed profile requires explicit reload before another write',async({page,state,visit})=>{
  state.step=4;await visit();await page.getByLabel(/Current highlight video/).fill('https://youtu.be/unsaved');state.saveMessage='onboarding_changed';
  await page.getByRole('button',{name:'Finish setup',exact:true}).click();await page.getByRole('button',{name:'Reload saved details',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Finish setup',exact:true}).isDisabled(),true);assert.equal(await page.getByLabel(/Current highlight video/).inputValue(),'https://youtu.be/unsaved');
  assert.equal(state.writes,1);state.saveMessage='';await page.getByRole('button',{name:'Reload saved details',exact:true}).click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(button=>button.textContent?.includes('Finish setup')&&!button.disabled));assert.equal(await page.getByRole('button',{name:'Finish setup',exact:true}).isDisabled(),false);
 });
 await scenario('tenant-scoped loading exposes safe fields and fits four viewports',async({page,state,visit})=>{
  await visit();await page.getByRole('heading',{name:'Tell us what matters next.',exact:true}).waitFor();
  assert.equal(state.playerQuery.searchParams.get('tenant_id'),'eq.'+original.tenant_id);
  assert.equal(state.playerQuery.searchParams.get('user_id'),'eq.'+user.id);
  assert.doesNotMatch(state.playerQuery.searchParams.get('select'),/verification_notes|agency_priority|next_action/);
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1),'Onboarding overflow '+width);}
 });
 await scenario('repeated continue clicks cannot submit the same draft twice',async({page,state,visit})=>{
  state.step=1;state.saveDelay=200;await visit();await page.getByRole('heading',{name:'We’ve already started your profile.',exact:true}).waitFor();
  await page.getByRole('button',{name:'Looks right',exact:true}).evaluate(button=>{button.click();button.click();});
  await page.getByRole('heading',{name:'Check your football now.',exact:true}).waitFor();assert.equal(state.writes,1);
 });
 if(failures.length)throw new Error(failures.join('\n'));
 console.log('PASS: player onboarding failure/retry, draft resume, concurrency recovery, labels, tenant scope and four viewport checks.');
}finally{await browser?.close();runtimeServer.close();try{process.kill(-server.pid,'SIGTERM');}catch{}}