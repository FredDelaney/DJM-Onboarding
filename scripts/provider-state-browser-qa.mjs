import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
let page;
try{
 page=await browser.newPage({viewport:{width:390,height:600}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 let mode='failed',release,notifyHeld;
 await page.route('https://example.supabase.co/**',async route=>{
  const path=new URL(route.request().url()).pathname;let data={},status=200;
  if(path.endsWith('/redream_provider_connections')){
   const requestMode=mode;
   if(requestMode==='held')await new Promise(resolve=>{release=resolve;notifyHeld();});
   if(requestMode==='failed'){status=503;data={message:'Connection status is temporarily unavailable.'};}
   else if(requestMode==='missing_schema'){status=404;data={code:'PGRST202',message:'Could not find the function public.redream_provider_connections in the schema cache'};}
   else data={connections:[{provider:'google',status:requestMode==='held'?'connected':requestMode,email:'synthetic@example.test',capabilities:['calendar','contacts']}]};
  }
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 });
 const url=new URL('/qa-provider-state',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
 for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}}
 await page.getByRole('alert').filter({hasText:'Connection status is temporarily unavailable.'}).waitFor();
 assert.equal(await page.getByText('Google',{exact:true}).count(),0,'A failed provider read hides its setup controls until status is confirmed');
 mode='missing_schema';await page.getByRole('button',{name:'Retry',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Connections could not load. Try again later.'}).waitFor();
 assert.equal(await page.getByText(/Could not find the function/).count(),0,'A missing backend contract does not expose database internals');
 assert.equal(await page.getByText('Google',{exact:true}).count(),0,'Unavailable reads do not claim a provider is disconnected');
 mode='expired';await page.getByRole('button',{name:'Retry',exact:true}).click();
 const google=page.locator('article').filter({has:page.getByText('Google',{exact:true})});
 await google.getByText('Expired',{exact:true}).waitFor();
 assert.equal(await google.getByRole('button',{name:'Reconnect',exact:true}).count(),1);
 assert.equal(await google.getByRole('button',{name:'Sync now',exact:true}).count(),0);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:600});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`No connection overflow at ${width}`);
 }
 const heldStarted=new Promise(resolve=>{notifyHeld=resolve;});
 mode='held';await page.reload();await page.getByRole('status').filter({hasText:'Checking connections...'}).waitFor();await heldStarted;
 mode='missing_permissions';await page.getByRole('button',{name:'Switch test workspace',exact:true}).click();
 await google.getByText('Missing permissions',{exact:true}).waitFor();release();
 await page.waitForTimeout(100);
 assert.equal(await google.getByText('Connected',{exact:true}).count(),0,'A late old-workspace result cannot replace the current status');
 assert.deepEqual(errors,[]);
 console.log('Provider status: failed-read retry, expired/missing permissions, one recovery action, stale-workspace protection and four widths passed.');
}catch(error){console.error(await page?.locator('body').innerText());throw error;}finally{await browser.close();}
