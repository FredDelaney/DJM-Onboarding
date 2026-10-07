import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {mkdir,cp,rm,access} from 'node:fs/promises';
const fixtureRoute=new URL('../app/workspace/qa-player-entry/',import.meta.url);
try{await access(fixtureRoute);throw new Error('Refusing to replace an existing route.');}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(fixtureRoute,{recursive:true});await cp(new URL('../tests/fixtures/player-entry/page.tsx',import.meta.url),new URL('page.tsx',fixtureRoute));
const port=process.env.PLAYER_ENTRY_QA_PORT||'3115',root='http://127.0.0.1:'+port;
const env={...process.env,NEXT_PUBLIC_REDREAM_ENVIRONMENT:'qa',NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'example'};
const server=spawn('npm',['run','dev','--','--webpack','--hostname','127.0.0.1','--port',port],{env,stdio:'inherit',detached:true});
let browser;
try {
 browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
 const user={id:'00000000-0000-0000-0000-000000000080',email:'fixture@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};
 const session={access_token:'fixture-access-token',refresh_token:'fixture-refresh-token',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
 const routes=['/home','/profile','/inbox','/career','/check-in','/cv','/documents','/connections'];
 const errors=[];
 const setup=async(mode='failed')=>{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  if(mode!=='signed-out')await context.addInitScript(session=>{if(location.hostname==='127.0.0.1')localStorage.setItem('sb-example-auth-token',JSON.stringify(session));},mode==='session-failed'?{...session,expires_at:Math.floor(Date.now()/1000)-3600}:session);
  const state={mode,agencyCalls:0,playerCalls:0};
  await context.route('https://example.supabase.co/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   let status=200,data=[];
   if(path.includes('/auth/v1/token')){if(state.mode==='session-failed'){status=500;data={message:'Authentication temporarily unavailable'};}else data=session;}
   else if(path.includes('/auth/v1/user'))data=user;
   else if(path.endsWith('/functions/v1/agency-os')){
    state.agencyCalls++;
    if(state.mode==='failed'){status=500;data={error:'Workspace backend unavailable'};}
    else if(state.mode==='hung'){await new Promise(resolve=>setTimeout(resolve,15000));status=403;data={error:'Agency staff access required'};}
    else if(state.mode==='agency')data={tenants:[{tenant_id:'tenant',slug:'example',role:'owner'}]};
    else {status=403;data={error:'Agency staff access required'};}
   } else if(path.includes('/rest/v1/profiles')){if(state.mode==='profile-failed'){status=500;data={message:'Profile temporarily unavailable'};}else data={id:user.id,full_name:'Fixture Player'};}
   else if(path.includes('/rest/v1/players')){
    state.playerCalls++;
    if(state.mode==='player-failed'){status=503;data={message:'Players unavailable'};}
    else if(state.mode==='no-player')data=[];
    else data=[{id:'owned-player',tenant_id:'tenant',user_id:user.id,first_name:'Fixture',last_name:'Player',preferred_name:'Fixture',nationalities:[],secondary_positions:[],primary_position:'CM',onboarding_status:'verified'}];
   } else if(path.includes('/rest/v1/player_private')){
    if(state.mode==='private-failed'){status=500;data={message:'Private details unavailable'};}
    else data=null;
   } else if(path.includes('/rest/v1/player_requests')&&state.mode==='requests-failed'){status=500;data={message:'Requests unavailable'};}
   else if(path.includes('/rest/v1/weekly_checkins')&&state.mode==='checkins-failed'){status=500;data={message:'Check-ins unavailable'};}
   else if(path.includes('/rest/v1/player_public_profiles'))data=null;
   else if(path.includes('/functions/'))data={};
   try{await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});}catch{}
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  return {context,page,state};
 };
 const visit=async(page,path)=>{
  for(let i=0;i<60;i++){try{await page.goto(root+'/workspace/qa-player-entry?view='+encodeURIComponent(path.slice(1)));return;}catch(e){if(i===59)throw e;await page.waitForTimeout(250);}}
 };
 // An upstream outage must never become a claim that a profile is being prepared.
 for(const path of routes){
  const {context,page}=await setup();await visit(page,path);
  await page.getByRole('alert').filter({hasText:'could not open your workspace'}).waitFor({timeout:7000});
  assert.equal(await page.getByRole('button',{name:'Try again',exact:true}).isEnabled(),true);
  assert.equal(await page.getByText('Your profile is being prepared.',{exact:true}).count(),0);
  assert.equal(new URL(page.url()).searchParams.get('view'),path.slice(1));
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:900});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1),'Overflow '+path+' '+width);
   const box=await page.getByRole('button',{name:'Try again',exact:true}).boundingBox();
   assert.ok(box&&box.height>=44,'Retry touch target is too small');
  }
  await context.close();
 }
 for(const mode of ['hung','session-failed','profile-failed','player-failed','private-failed','requests-failed','checkins-failed']){
  const {context,page,state}=await setup(mode);await visit(page,'/home');
  if(mode==='hung')await page.getByRole('status').filter({hasText:'Opening your workspace'}).waitFor();
  await page.getByRole('alert').filter({hasText:'could not open your workspace'}).waitFor({timeout:16000});
  state.mode='healthy';await page.getByRole('button',{name:'Try again',exact:true}).click();
  await page.getByRole('heading',{name:/Fixture/}).first().waitFor({timeout:10000});
  assert.equal(await page.getByRole('alert').filter({hasText:'could not open your workspace'}).count(),0);
  if(mode==='hung'){await page.waitForTimeout(3500);assert.equal(new URL(page.url()).searchParams.get('view'),'home');}
  assert.ok(state.agencyCalls>=(mode==='session-failed'?1:2),'Retry reused a failed workspace load');
  await context.close();
 }
 for(const mode of ['signed-out','no-player']){
  const {context,page,state}=await setup(mode);await visit(page,'/home');
  if(mode==='signed-out'){await page.waitForURL('**/sign-in');assert.equal(state.playerCalls,0,'Player reads ran before sign-in');}
  else {await page.getByRole('heading',{name:'Your profile is being prepared.',exact:true}).waitFor();assert.equal(await page.getByRole('alert').filter({hasText:'could not open your workspace'}).count(),0);}
  await context.close();
 }
 const {context,page}=await setup('agency');await visit(page,'/home');await page.waitForURL('**/agency');await context.close();
 assert.deepEqual(errors,[]);
 console.log('PASS: eight player routes, bounded loading, failed child reads, retry, no false empty profile, late response protection and agency routing.');
} finally {await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}await rm(fixtureRoute,{recursive:true,force:true});await rm(new URL('../.next/dev/types/',import.meta.url),{recursive:true,force:true});}
