import {startLoopbackHttpsFixture} from './loopback-https-fixture.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium,webkit} from 'playwright';
import {mkdir,cp,rm,access,readFile,writeFile} from 'node:fs/promises';
const route=new URL('../app/workspace/qa-design-system/',import.meta.url);
const nextEnv=new URL('../next-env.d.ts',import.meta.url),before=await readFile(nextEnv,'utf8');
try{await access(route);throw new Error('Refusing to replace existing fixture route');}catch(e){if(e.code!=='ENOENT')throw e;}
const port=process.env.DESIGN_QA_PORT||'3129';let base;
const env={...process.env,NEXT_PUBLIC_REDREAM_ENVIRONMENT:'qa',NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'example'};
const failures=[],errors=[];let server,browser,httpsFixture;
const check=async(name,fn)=>{try{await fn();console.log('PASS',name);}catch(e){failures.push(name+': '+e.message);console.log('FAIL',name,e.message);}};
try{
 await mkdir(route,{recursive:true});await cp(new URL('../tests/fixtures/design-system/page.tsx',import.meta.url),new URL('page.tsx',route));
 const build=spawn('npm',['run','build'],{env,stdio:'inherit'});await new Promise((resolve,reject)=>{build.once('error',reject);build.once('exit',c=>c===0?resolve():reject(new Error('Fixture build failed '+c)));});
 server=spawn('npm',['run','start','--','--hostname','127.0.0.1','--port',port],{env,stdio:'inherit',detached:true});
 let ready=false;
 for(let i=0;i<80;i++){try{const response=await fetch('http://127.0.0.1:'+port+'/robots.txt',{signal:AbortSignal.timeout(1000)});await response.text();if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
 assert.ok(ready,'The loopback Next server must be ready');
 httpsFixture=await startLoopbackHttpsFixture(Number(port));base=httpsFixture.origin+'/workspace/qa-design-system';
 browser=await (process.env.DESIGN_QA_BROWSER==='webkit'?webkit:chromium).launch(process.env.DESIGN_QA_BROWSER==='webkit'?{}:{executablePath:process.env.CALENDAR_CHROMIUM});
 const page=await browser.newPage({viewport:{width:390,height:844},ignoreHTTPSErrors:true});page.on('pageerror',e=>errors.push(e.message));
 if(process.env.DESIGN_QA_DIAGNOSTICS)page.on('requestfailed',request=>console.log('ASSET_FAILURE',JSON.stringify({url:request.url(),resource:request.resourceType(),error:request.failure()?.errorText})));

 for(let i=0;i<80;i++){try{await page.goto(base);break;}catch{await new Promise(r=>setTimeout(r,250));}}
 await page.getByRole('heading',{name:'Interface checks'}).waitFor();
 const policy=await page.request.get(base);assert.match(policy.headers()['content-security-policy']||'',/upgrade-insecure-requests/,'The production security policy stays enabled');
 if(!process.env.DESIGN_QA_ONLY||process.env.DESIGN_QA_ONLY==='feedback')for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:844});await page.goto(base);
  await check('feedback semantics and shared tokens '+width,async()=>{
   const loading=page.getByRole('status').filter({hasText:'Loading record'});await loading.waitFor();assert.equal(await loading.getAttribute('aria-busy'),'true');
   const error=page.getByRole('alert').filter({hasText:'Could not load record'});assert.equal(await error.locator('svg').first().evaluate(n=>getComputedStyle(n).color),'rgb(180, 35, 24)');
   const saved=page.getByRole('status').filter({hasText:'Changes saved'});assert.equal(await saved.locator('svg').first().evaluate(n=>getComputedStyle(n).color),'rgb(20, 90, 50)');
   assert.equal(await saved.getAttribute('aria-busy'),null);
    const contrast=await page.locator('main section[role=status],main section[role=alert]').evaluateAll(nodes=>{
     const luminance=rgb=>rgb.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
     return nodes.map(node=>{const css=getComputedStyle(node),fg=luminance(css.color.match(/[\d.]+/g).map(Number)),bg=luminance(css.backgroundColor.match(/[\d.]+/g).map(Number));return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);});
    });assert.equal(contrast.length,6);assert.ok(contrast.every(ratio=>ratio>=4.5),'Every feedback state has readable text contrast');
   await error.getByRole('button',{name:'Try again',exact:true}).click();await page.getByText('Retry attempts: 1',{exact:true}).waitFor();
   const retry=page.getByRole('alert').filter({hasText:'Retry in progress'}).getByRole('button',{name:'Reload record',exact:true});assert.equal(await retry.isDisabled(),true);
   assert.ok(await retry.evaluate(n=>n.getBoundingClientRect().height)>=44);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await loading.locator('svg').evaluate(n=>getComputedStyle(n).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
  });
 }
 let mode='success',release=null,writes=0;
 await page.route('https://example.supabase.co/rest/v1/rpc/**',async route=>{
  const body=route.request().postDataJSON();assert.equal(body.p_entity_id,'fixture-club');assert.equal(body.p_patch.name,'Updated Club');writes++;
  if(mode==='pending')await new Promise(resolve=>{release=resolve;});
  await route.fulfill({status:mode==='failed'?500:200,contentType:'application/json',body:JSON.stringify(mode==='failed'?{message:'Save temporarily unavailable'}:{ok:true})});
 });
 if(!process.env.DESIGN_QA_ONLY||process.env.DESIGN_QA_ONLY==='editor'){
  await check('pending save keeps the editor and draft; confirmed save closes it',async()=>{
   await page.goto(base+'?screen=editor');await page.getByRole('button',{name:'Edit Example Club',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Manage Example Club',exact:true});
   await dialog.getByLabel('Club name').fill('Updated Club');mode='pending';await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('button[type=submit]')?.disabled===true);assert.equal(await dialog.isVisible(),true);
   await dialog.getByRole('button',{name:'Close',exact:true}).click();assert.equal(await dialog.isVisible(),true);assert.equal(await dialog.getByLabel('Club name').inputValue(),'Updated Club');
   for(let i=0;i<20&&!release;i++)await page.waitForTimeout(50);mode='success';release();await page.getByText('Current name: Updated Club',{exact:true}).waitFor();
   await dialog.waitFor({state:'hidden',timeout:2500});assert.equal(writes,1);
  });
  await check('failed save retains the draft and exposes an accessible error',async()=>{
   await page.goto(base+'?screen=editor');await page.getByRole('button',{name:'Edit Example Club',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Manage Example Club',exact:true});
   await dialog.getByLabel('Club name').fill('Updated Club');mode='failed';await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
   await page.getByText('Save temporarily unavailable',{exact:true}).waitFor();assert.equal(await dialog.isVisible(),true);assert.equal(await dialog.getByLabel('Club name').inputValue(),'Updated Club');
   assert.equal(await dialog.getByRole('alert').count(),1);assert.equal(await page.getByText('Changes saved',{exact:true}).count(),0);
  });
 }
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);console.log('Design-system browser QA passed');
}finally{
 if(browser)await browser.close();if(httpsFixture)await httpsFixture.close();if(server?.pid){try{process.kill(-server.pid,'SIGTERM');}catch{}}
 await rm(route,{recursive:true,force:true});await writeFile(nextEnv,before);
}
