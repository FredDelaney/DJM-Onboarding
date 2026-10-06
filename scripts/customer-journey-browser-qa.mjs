import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const port=process.env.CUSTOMER_QA_PORT||'3114',root='http://127.0.0.1:'+port;
const env={...process.env,NEXT_PUBLIC_REDREAM_ENVIRONMENT:'qa',NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'example'};
const server=spawn('npm',['run','dev','--','--webpack','--hostname','127.0.0.1','--port',port],{env,stdio:'inherit',detached:true});
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 let recoveryRequests=0,loginAllowed=false,playerAccount=false,holdLookup=false,releaseLookup,holdAuthentication=false,releaseAuthentication;
 const authenticationGate=new Promise(resolve=>{releaseAuthentication=resolve;});
 const lookupGate=new Promise(resolve=>{releaseLookup=resolve;});
 const user={id:'00000000-0000-0000-0000-000000000080',email:'fixture@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};
 const session={access_token:'fixture-access-token',refresh_token:'fixture-refresh-token',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
 // Every browser backend request is intercepted; no real email or customer data is used.
 await page.route('https://example.supabase.co/**',async route=>{
  const path=new URL(route.request().url()).pathname,body=route.request().postDataJSON()||{};
  let data={},status=200;
  if(path.includes('/auth/v1/token')){if(holdAuthentication)await authenticationGate;if(loginAllowed)data=session;else{status=400;data={error:'invalid_grant',error_description:'Invalid login credentials',msg:'Invalid login credentials'};}}
  else if(path.includes('/auth/v1/recover')){recoveryRequests++;data={};assert.match(body.redirect_to||new URL(route.request().url()).searchParams.get('redirect_to')||'',/reset-password/);}
  else if(path.includes('/auth/v1/user'))data=user;
  else if(path.endsWith('/functions/v1/agency-os')){
   if(holdLookup)await lookupGate;
   if(playerAccount){status=403;data={error:'Agency staff access required'};}
   else data={ok:true,tenants:[{tenant_id:'00000000-0000-0000-0000-000000000081',slug:'example',role:'owner',display_name:'Example Agency'}],home:{}};
  }else if(path.endsWith('/functions/v1/player-os'))data={workspaces:[{player_id:'owned-player',agency:{display_name:'Example Agency'},portal_hostname:'agency.example.test'}]};
  else if(path.includes('/rest/v1/players'))data=[{id:'owned-player',tenant_id:'00000000-0000-0000-0000-000000000081'}];
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 const visit=async path=>{
  for(let i=0;i<60;i++){try{await page.goto(root+path);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}}
  await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
 };
 await visit('/');
 assert.equal(await page.locator('a[href="/platform/sign-in"]').count(),0);
 assert.equal(await page.locator('a[href="/sign-in"]').count(),2);
 await visit('/product');
 assert.equal(await page.locator('a[href="/platform/sign-in"]').count(),0);
 assert.equal(await page.locator('a[href="/sign-in"]').count(),2);
 await page.getByRole('link',{name:'Explore the agency demo',exact:true}).click();await page.locator('#agency-demo').waitFor();await page.waitForFunction(()=>scrollY>0);
 await page.getByRole('button',{name:'Book a demo',exact:true}).first().click();
 await page.getByLabel('Your name',{exact:true}).fill('Fixture Person');
 await page.getByLabel('Agency name',{exact:true}).fill('Fixture Agency');
 await page.getByLabel('Work email',{exact:true}).fill('not-an-email');
 await page.getByRole('button',{name:'Continue',exact:true}).click();
 assert.equal(await page.getByText('Team size',{exact:true}).count(),0);
 assert.equal(await page.getByLabel('Work email',{exact:true}).evaluate(node=>node.validity.valid),false);
 await page.getByLabel('Work email',{exact:true}).fill('fixture@example.test');
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByText('Team size',{exact:true}).waitFor();await page.keyboard.press('Escape');
 await visit('/sign-in');await page.getByLabel('Email',{exact:true}).fill('fixture@example.test');await page.getByLabel('Password',{exact:true}).fill('fixture-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('alert').filter({hasText:'Invalid login credentials'}).waitFor();
 assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/);
 assert.match(await page.locator('link[rel="canonical"]').getAttribute('href'),/\/sign-in$/);
 await page.getByRole('link',{name:'Forgot password?',exact:true}).click();await page.getByRole('heading',{name:'Reset your password.',exact:true}).waitFor();
 await page.getByLabel('Email',{exact:true}).fill('fixture@example.test');await page.getByRole('button',{name:'Send secure reset link',exact:true}).click();await page.getByRole('heading',{name:'Check your email.',exact:true}).waitFor();assert.equal(recoveryRequests,1);
 await visit('/reset-password');await page.getByRole('status').filter({hasText:'no longer active'}).waitFor({timeout:10000});assert.equal(await page.getByLabel('New password',{exact:true}).count(),0);
 // Follow an actual recovery callback shape; hash-only navigation needs a new document.
 await visit('/reset-password#access_token=fixture-access-token&refresh_token=fixture-refresh-token&expires_in=3600&token_type=bearer&type=recovery');
 await page.reload();await page.getByLabel('New password',{exact:true}).waitFor();await page.waitForTimeout(5500);
 // Recovery has already been processed and removed from the URL before this subsequent mount.
 await visit('/support');await visit('/reset-password');
 await page.getByLabel('New password',{exact:true}).waitFor();await page.waitForTimeout(5500);
 assert.equal(await page.getByText('This recovery link is no longer active. Request a new one.',{exact:true}).count(),0);
 await page.getByLabel('New password',{exact:true}).fill('FixturePassword42!');
 await page.getByLabel('Confirm password',{exact:true}).fill('DifferentPassword42!');
 await page.getByRole('button',{name:'Set new password',exact:true}).click();await page.getByRole('alert').filter({hasText:'do not match'}).waitFor();
 await page.getByLabel('Confirm password',{exact:true}).fill('FixturePassword42!');await page.getByRole('button',{name:'Set new password',exact:true}).click();await page.getByRole('heading',{name:'Password updated.',exact:true}).waitFor();
 playerAccount=true;loginAllowed=true;
 await visit('/sign-in');await page.getByLabel('Email',{exact:true}).fill('fixture@example.test');await page.getByLabel('Password',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Sign in',exact:true}).click();
 await page.getByRole('heading',{name:'Choose your agency.',exact:true}).waitFor();
 assert.equal(await page.getByRole('link',{name:'Open player portal',exact:true}).getAttribute('href'),'https://agency.example.test/sign-in');
 await page.getByRole('button',{name:'Use another account',exact:true}).click();await page.getByRole('heading',{name:'Welcome back.',exact:true}).waitFor();
 holdLookup=true;
 const lookupStarted=page.waitForRequest(request=>request.url().endsWith('/functions/v1/agency-os'));
 await page.getByLabel('Email',{exact:true}).fill('fixture@example.test');await page.getByLabel('Password',{exact:true}).fill('fixture-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await lookupStarted;
 await page.getByRole('link',{name:'Forgot password?',exact:true}).click();await page.getByRole('heading',{name:'Reset your password.',exact:true}).waitFor();
 releaseLookup();await page.waitForTimeout(500);assert.match(new URL(page.url()).pathname,/forgot-password$/,'Late workspace read redirected after leaving sign-in');
 await page.evaluate(()=>localStorage.clear());
 await visit('/sign-in');holdAuthentication=true;
 const authenticationStarted=page.waitForRequest(request=>request.url().includes('/auth/v1/token'));
 await page.getByLabel('Email',{exact:true}).fill('fixture@example.test');await page.getByLabel('Password',{exact:true}).fill('fixture-password');
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await authenticationStarted;
 await page.getByRole('link',{name:'Forgot password?',exact:true}).click();await page.getByRole('heading',{name:'Reset your password.',exact:true}).waitFor();
 releaseAuthentication();await page.waitForTimeout(500);assert.match(new URL(page.url()).pathname,/forgot-password$/,'Late authentication redirected after leaving sign-in');
 await page.evaluate(()=>localStorage.clear());
 await visit('/support');await page.getByRole('heading',{name:'A clear route into your agency workspace.',exact:true}).waitFor();
 for(const path of ['/','/product','/support','/sign-in','/forgot-password','/reset-password']){
  await visit(path);
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1),'Overflow '+path+' '+width);}
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: customer links, demo validation, sign-in rejection, private metadata, recovery request/expiry/success, player entry, premounted recovery and 24 viewport checks.');
}finally{await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}}
