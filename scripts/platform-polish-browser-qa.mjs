import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {mkdir,cp,rm,access,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const routeDir=new URL('../app/workspace/qa-platform-polish/',import.meta.url);
const nextEnv=new URL('../next-env.d.ts',import.meta.url),nextEnvBefore=await readFile(nextEnv,'utf8');
try{await access(routeDir);throw new Error('Refusing to replace an existing route');}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(routeDir,{recursive:true});await cp(new URL('../tests/fixtures/platform-polish/page.tsx',import.meta.url),new URL('page.tsx',routeDir));
const port=process.env.PLATFORM_POLISH_QA_PORT||'3117',root='http://127.0.0.1:'+port;
const env={...process.env,NEXT_PUBLIC_REDREAM_ENVIRONMENT:'qa',NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'example'};
let server,browser;
const report=[],failures=[],errors=[];
try{
 const development=process.env.PLATFORM_POLISH_DEV==='1';
 if(!development){
  const build=spawn('npm',['run','build'],{env,stdio:'inherit'});
  await new Promise((resolve,reject)=>{build.once('error',reject);build.once('exit',code=>code===0?resolve():reject(new Error('Polish fixture build failed: '+code)));});
 }
 server=spawn('npm',development?['run','dev','--','--webpack','--hostname','127.0.0.1','--port',port]:['run','start','--','--hostname','127.0.0.1','--port',port],{env,stdio:'inherit',detached:true});
 browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
 const user={id:'00000000-0000-0000-0000-000000000080',email:'fixture@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};
 const token='fixture.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
 const session={access_token:token,refresh_token:'fixture-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
 const screens={agency:['home','players','opportunities','network','calendar','business'],player:['home','profile','inbox','career','check-in','cv','documents','connections'],settings:['settings','profile','preferences','security','team','agency','billing','connections','player-experience'],detail:['deal','club','contact','negotiation','review','business']};
 for(const [suite,names] of Object.entries(screens)){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(value=>{if(location.hostname==='127.0.0.1')localStorage.setItem('sb-example-auth-token',JSON.stringify(value));},session);
  await context.route('https://example.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname,body=req.postDataJSON()||{};
   let data=[],status=200;
   if(path.includes('/auth/v1/user'))data=user;
   else if(path.includes('/auth/v1/token'))data=session;
   else if(path.endsWith('/functions/v1/agency-os')){
    if(suite==='player'){status=403;data={error:'Agency staff access required'};}
    else if(body.action==='tenants')data={tenants:[{tenant_id:'00000000-0000-0000-0000-000000000081',slug:'qa-platform-polish',role:'owner',display_name:'Example Agency'}]};
    else if(body.action==='players_workspace')data={players:{items:[{player_id:'player',identity:{name:'Example Player',current_club:'Example FC',primary_position:'Centre back'},service:{}}],total:1,has_more:false}};
    else if(body.action==='home_focus')data={home:{commands:[]}};
    else if(body.action==='recruitment_board')data={recruitment:{items:[]}};
    else data={home:{},items:[]};
   }else if(path.includes('/rest/v1/rpc/')){
    if(path.endsWith('/redream_autopilot_relationships'))data={accounts:{clubs:[{organisation_id:'club',name:'Example FC',country:'NZ'}]},contacts:{items:[{person_id:'contact',person:{full_name:'Example Director'},employment:{organisation_name:'Example FC'}}]}};
    else if(path.endsWith('/redream_autopilot_market'))data={demand:{items:[]},pursuits:{items:[]}};
    else if(path.endsWith('/redream_autopilot_deals'))data={portfolio:{deals:[]}};
    else data={items:[],accounts:{clubs:[]},contacts:{items:[]}};
   }else if(path.includes('/rest/v1/profiles'))data={id:user.id,full_name:'Example Player',role:suite==='player'?'player':'admin',tenant_role:'owner'};
   else if(path.includes('/rest/v1/players'))data=[{id:'player',tenant_id:'00000000-0000-0000-0000-000000000081',user_id:user.id,first_name:'Example',last_name:'Player',preferred_name:'Example',nationalities:[],secondary_positions:[],primary_position:'CM',current_club:'Example FC',onboarding_status:'verified'}];
   else if(path.includes('/rest/v1/player_private')||path.includes('/rest/v1/player_public_profiles'))data=null;
   else if(path.includes('/rest/v1/career_entries'))data=[{id:'career',club_name:'Example FC',start_date:'2025-01-01'}];
   else if(path.includes('/rest/v1/player_requests'))data=[{id:'agency-request',player_id:'player',title:'Confirm your availability',message:'Reply to your agency',request_type:'action',status:'open',created_by:'staff',created_at:'2026-10-07T12:00:00Z'}];
   else if(path.includes('/functions/'))data={};
   else if(!['GET','HEAD'].includes(req.method())){errors.push('Unexpected fixture write: '+path);status=405;data={error:'Read-only fixture'};}
   await route.fulfill({status,contentType:'application/json',headers:{'content-range':'0-0/1'},body:JSON.stringify(data)});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(suite+': '+error.message));
  for(const screen of names){
   for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    const url=root+'/workspace/qa-platform-polish?suite='+suite+'&screen='+screen+'&view='+screen;
    for(let i=0;i<60;i++){try{await page.goto(url);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}}
    await page.locator('h1,h2').first().waitFor({timeout:30000});
    await page.waitForTimeout(350);
    await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
    const metrics=await page.evaluate(()=>{
     const visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
     const header=document.querySelector('.player-workspace-header'),tabs=document.querySelector('.player-workspace-tabs');
     const smallControls=[...document.querySelectorAll('button,input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,summary')].filter(visible).filter(n=>n.getBoundingClientRect().height<43.5).map(n=>({text:(n.getAttribute('aria-label')||n.textContent||n.getAttribute('placeholder')||n.tagName).trim().slice(0,65),height:Math.round(n.getBoundingClientRect().height)}));
     const smallText=[...document.querySelectorAll('p,small,label')].filter(visible).filter(n=>parseFloat(getComputedStyle(n).fontSize)<12).map(n=>({text:n.textContent.trim().slice(0,65),size:getComputedStyle(n).fontSize}));
     return {overflow:document.documentElement.scrollWidth-innerWidth,bodyOverflow:document.body.style.overflow,header:header?getComputedStyle(header).backgroundColor:null,tabsVisible:tabs?visible(tabs):false,bottomVisible:[...document.querySelectorAll('.ux-player-mobile-nav')].some(visible),bottomLabels:[...document.querySelectorAll('.ux-player-mobile-nav a')].filter(visible).map(n=>n.textContent.trim()),smallControls,smallText,headings:[...document.querySelectorAll('h1,h2')].filter(visible).map(n=>n.textContent.trim())};
    });
    report.push({suite,screen,width,...metrics});
    if(metrics.overflow>1)failures.push(suite+'/'+screen+' overflows at '+width+' ('+metrics.overflow+'px)');
    if(suite==='player'){
     if(/rgba\([^)]*,\s*0\./.test(metrics.header||''))failures.push('Translucent player header at '+width);
     if(width<=760){
      if(metrics.tabsVisible&&metrics.bottomVisible)failures.push('Duplicate player navigation at '+width);
      if(!metrics.bottomVisible)failures.push('Missing player mobile navigation at '+width);
      if(JSON.stringify(metrics.bottomLabels)!==JSON.stringify(['Home','Your agency','Me']))failures.push('Player mobile navigation changed at '+width+': '+JSON.stringify(metrics.bottomLabels));
     }
    }
    if(width<=760&&metrics.smallControls.length)failures.push(suite+'/'+screen+' has small touch controls at '+width+': '+JSON.stringify(metrics.smallControls));
    if(metrics.smallText.length)failures.push(suite+'/'+screen+' has undersized guidance at '+width+': '+JSON.stringify(metrics.smallText));
    if(process.env.PLATFORM_POLISH_SCREENSHOTS&&[390,1440].includes(width)&&['home','players','network','profile','settings','deal'].includes(screen))await page.screenshot({path:join(process.env.PLATFORM_POLISH_SCREENSHOT_DIR||tmpdir(),'platform-polish-'+suite+'-'+screen+'-'+width+'.png'),fullPage:false});
   }
   console.log('SCREEN',suite,screen);
  }
  if(suite==='detail'){
   await page.setViewportSize({width:390,height:600});
   await page.goto(root+'/workspace/qa-platform-polish?suite=detail&screen=deal');
   await page.getByRole('heading',{name:'Example transfer',exact:true}).waitFor();
   const scroller=page.locator('[role="region"]').locator('..');
   await page.mouse.move(190,400);await page.mouse.wheel(0,700);
   await page.waitForFunction(()=>{const region=document.querySelector('[role="region"]');return region?.parentElement?.scrollTop>0;});
   assert.ok(await scroller.evaluate(node=>node.scrollTop>0),'Deal detail content cannot scroll');
   await page.goto(root+'/workspace/qa-platform-polish?suite=detail&screen=deal&drawer=1');
   await page.getByRole('heading',{name:'Example transfer',exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','Drawer should still lock document scroll');
  }
  await context.close();
 }
 await writeFile(process.env.PLATFORM_POLISH_REPORT||join(tmpdir(),'platform-polish-report.json'),JSON.stringify({report,failures,errors},null,2));
 assert.deepEqual(errors,[],'Browser errors');
 assert.deepEqual(failures,[],'Screen polish regressions');
 console.log('Platform polish browser QA passed: '+report.length+' screen/viewport combinations');
}finally{
 await browser?.close();
 try{if(server?.pid)process.kill(-server.pid,'SIGTERM');}catch{}
 await rm(routeDir,{recursive:true,force:true});
 await rm(new URL('../.next/dev/types/',import.meta.url),{recursive:true,force:true});
 await rm(new URL('../.next/types/',import.meta.url),{recursive:true,force:true});
 await writeFile(nextEnv,nextEnvBefore);
}
