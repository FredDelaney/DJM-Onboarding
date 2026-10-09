import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {mkdir,cp,rm,access,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const routeDir=new URL('../app/workspace/qa-platform-polish/',import.meta.url);
const nextEnv=new URL('../next-env.d.ts',import.meta.url),nextEnvBefore=await readFile(nextEnv,'utf8');
try{await access(routeDir);throw new Error('Refusing to replace an existing route');}catch(error){if(error.code!=='ENOENT')throw error;}
const port=process.env.PLATFORM_POLISH_QA_PORT||'3117',root='http://127.0.0.1:'+port;
const env={...process.env,NEXT_PUBLIC_REDREAM_ENVIRONMENT:'qa',NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'example'};
let server,browser;
const report=[],failures=[],errors=[];
try{
 await mkdir(routeDir,{recursive:true});await cp(new URL('../tests/fixtures/platform-polish/page.tsx',import.meta.url),new URL('page.tsx',routeDir));
const dynamicDir=new URL('[slug]/[token]/[tenantSlug]/',routeDir);
await mkdir(dynamicDir,{recursive:true});await cp(new URL('../tests/fixtures/platform-polish/page.tsx',import.meta.url),new URL('page.tsx',dynamicDir));
const marketingDir=new URL('marketing/',routeDir);
await mkdir(marketingDir,{recursive:true});await cp(new URL('../tests/fixtures/platform-polish/marketing.tsx',import.meta.url),new URL('page.tsx',marketingDir));
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
 const screens={agency:['home','players','opportunities','network','calendar','business'],player:['home','profile','inbox','career','check-in','cv','documents','connections'],settings:['settings','profile','preferences','security','team','agency','billing','connections','player-experience'],detail:['deal','club','contact','negotiation','review','business'],marketing:['home','product','security','support','switch'],account:['sign-in','forgot','reset','player-invite','staff-invite','onboarding-1','onboarding-2','onboarding-3','onboarding-4'],presentation:['profile','share'],capture:['voice','text','review','complete'],recruitment:['list','detail']};
 const selectedSuites=process.env.PLATFORM_POLISH_SUITES?.split(',');
 const fixturePath='/workspace/qa-platform-polish/example-player/00000000-0000-4000-8000-000000000081/qa-platform-polish';
 const publicProfile={display_name:'Example Club Player',primary_position:'CM',current_club:'Example FC',headline:'Central midfielder',nationalities:['NZ'],key_stats:[{label:'Appearances',value:'18'},{label:'Minutes',value:'1250'}],career_history:[{club:'Example FC',season:'2025/26',appearances:18,minutes:1250}],videos:[{title:'Example highlights',url:'https://example.test/highlights',video_type:'highlight',featured:true}],transfermarkt_url:'https://www.transfermarkt.com/example/profil/spieler/1',verified_at:'2026-10-07T00:00:00Z'};
 for(const [suite,names] of Object.entries(screens)){
  if(selectedSuites&&!selectedSuites.includes(suite))continue;
  const state={screen:'',publicMode:'healthy',release:null};
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(({session,suite})=>{if(location.hostname!=='127.0.0.1')return;const screen=new URL(location.href).searchParams.get('screen')||'';if(suite==='account'&&screen!=='reset'&&!screen.startsWith('onboarding-'))localStorage.removeItem('sb-example-auth-token');else localStorage.setItem('sb-example-auth-token',JSON.stringify(session));},{session,suite});
  await context.route('https://example.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname,body=req.postDataJSON()||{};
   if(['PATCH','PUT','DELETE'].includes(req.method())||(req.method()==='POST'&&path.includes('/rest/v1/')&&!path.includes('/rest/v1/rpc/'))){
    errors.push('Unexpected write '+req.method()+' '+path);
    return route.fulfill({status:405,contentType:'application/json',body:JSON.stringify({error:'Fixture is read-only'})});
   }
   let data=[],status=200;
   if(path.includes('/auth/v1/user'))data=user;
   else if(path.includes('/auth/v1/token'))data=session;
   else if(path.endsWith('/functions/v1/player-profile-public')||path.endsWith('/functions/v1/club-share-public')){
    const mode=state.publicMode;
    if(mode==='hung')await new Promise(resolve=>{state.release=resolve;});
    if(mode==='failed'){status=503;data={error:'Profile service unavailable'};}
    else if(mode==='malformed')data={};
    else if(mode==='unavailable')data={data:null};
    else data={data:{profile:publicProfile,agency:{display_name:'Example Agency',support_email:'agent@example.test'},documents:[]}};
   }
   else if(path.endsWith('/functions/v1/player-invite-public'))data={invite:{valid:true,can_activate:true,email:'invited@example.test',full_name:'Example Player',agency:{display_name:'Example Agency',short_name:'Example'},privacy:{ready:true,noticeVersion:'fixture-v1',noticeUrl:'https://example.test/privacy',controllerName:'Example Agency'}}};
   else if(path.endsWith('/functions/v1/agency-staff-invite-public'))data={invite:{email:'invited@example.test',full_name:'Example Agent',role:'agent',tenant:{slug:'qa-platform-polish'},branding:{display_name:'Example Agency'}}};
   else if(path.endsWith('/functions/v1/agency-os')){
    if(suite==='player'){status=403;data={error:'Agency staff access required'};}
    else if(body.action==='tenants')data={tenants:[{tenant_id:'00000000-0000-0000-0000-000000000081',slug:'qa-platform-polish',role:'owner',display_name:'Example Agency'}]};
    else if(body.action==='players_workspace')data={players:{items:[{player_id:'player',identity:{name:'Example Player',current_club:'Example FC',primary_position:'Centre back'},service:{}}],total:1,has_more:false}};
    else if(body.action==='home_focus')data={home:{commands:[]}};
    else if(body.action==='recruitment_board')data={recruitment:{items:[]}};
    else data={home:{},items:[]};
   }else if(path.includes('/rest/v1/rpc/')){
    if(path.endsWith('/redream_ai_current_access'))data={enabled:true,workspace_slug:'qa-platform-polish',max_audio_seconds:240};
    else if(path.endsWith('/redream_ai_recent_captures'))data=[{id:'00000000-0000-4000-8000-000000000092',status:'needs_review',summary:'Example club update',created_at:'2026-10-08T10:00:00Z',action_count:1,question_count:0}];
    else if(path.endsWith('/redream_ai_receipt'))data={capture:{id:body.p_capture_id,status:state.screen==='complete'?'done':'needs_review',summary:'Example club update',transcript_text:'Example FC needs a central midfielder. Follow up on Friday.'},actions:[{id:'action',action_type:'create_task',status:state.screen==='complete'?'applied':'pending',evidence:'Follow up on Friday',proposed_payload:{title:'Follow up with Example FC'},undo_supported:true}]};
    else if(path.endsWith('/redream_autopilot_relationships'))data={accounts:{clubs:[{organisation_id:'club',name:'Example FC',country:'NZ'}]},contacts:{items:[{person_id:'contact',person:{full_name:'Example Director'},employment:{organisation_name:'Example FC'}}]}};
    else if(path.endsWith('/redream_autopilot_market'))data={demand:{items:[]},pursuits:{items:[]}};
    else if(path.endsWith('/redream_autopilot_deals'))data={portfolio:{deals:[]}};
    else data={items:[],accounts:{clubs:[]},contacts:{items:[]}};
   }else if(path.includes('/rest/v1/profiles'))data={id:user.id,full_name:'Example Player',role:suite==='player'?'player':'admin',tenant_role:'owner'};
   else if(path.includes('/rest/v1/players'))data=[{id:'player',tenant_id:'00000000-0000-0000-0000-000000000081',user_id:user.id,first_name:'Example',last_name:'Player',preferred_name:'Example',nationalities:[],secondary_positions:[],primary_position:'CM',current_club:'Example FC',onboarding_status:'verified'}];
   else if(path.includes('/rest/v1/player_onboarding'))data={current_step:Number(state.screen.replace('onboarding-',''))||1};
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
    state.screen=screen;
    const remaining=['marketing','account','presentation','capture','recruitment'].includes(suite);
    const query=new URLSearchParams({suite,screen,view:suite==='recruitment'?'players':screen});
    if(suite==='recruitment'){query.set('tab','recruitment');if(screen==='detail')query.set('target','00000000-0000-4000-8000-000000000091');}
    if(suite==='capture'&&['review','complete'].includes(screen))query.set('capture','00000000-0000-4000-8000-000000000092');
    if(suite==='capture'&&screen==='text')query.set('share_text','Example FC needs a central midfielder.');
    const url=root+(suite==='marketing'?'/workspace/qa-platform-polish/marketing':remaining?fixturePath:'/workspace/qa-platform-polish')+'?'+query;
    for(let i=0;i<60;i++){try{await page.goto(url);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}}
    await page.locator('h1:visible,h2:visible').first().waitFor({timeout:30000});
    if(suite==='presentation')await page.getByRole('heading',{name:'Example Club Player',exact:true}).waitFor();
    if(suite==='capture'){
     if(screen==='voice')await page.getByRole('button',{name:'Type instead',exact:true}).waitFor();
     else if(screen==='text')await page.getByRole('textbox',{name:'Your update',exact:true}).waitFor();
     else if(screen==='review')await page.getByRole('button',{name:'Approve & save',exact:true}).waitFor();
     else await page.getByText('Approved, written back and verified.',{exact:false}).waitFor();
    }
    if(suite==='recruitment'){
     if(screen==='detail')await page.getByLabel('Interaction channel',{exact:true}).waitFor();
     else await page.getByText('Example Recruitment Player',{exact:true}).first().waitFor();
    }
    if(suite==='account'){
     if(screen==='onboarding-1')await page.getByLabel('First name',{exact:true}).waitFor();
     else if(screen==='onboarding-2')await page.getByLabel('Preferred foot',{exact:true}).waitFor();
     else if(screen==='onboarding-3')await page.getByPlaceholder('Leagues, countries or regions that interest you').waitFor();
     else if(screen==='onboarding-4')await page.getByLabel('Transfermarkt optional',{exact:true}).waitFor();
     else await page.locator('input:visible').first().waitFor();
    }
    await page.waitForTimeout(350);
    await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
    const metrics=await page.evaluate(()=>{
     const visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
     const header=document.querySelector('.player-workspace-header'),tabs=document.querySelector('.player-workspace-tabs');
     const smallControls=[...document.querySelectorAll('button,input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,summary')].filter(visible).filter(n=>n.getBoundingClientRect().height<43.5).map(n=>({text:(n.getAttribute('aria-label')||n.textContent||n.getAttribute('placeholder')||n.tagName).trim().slice(0,65),height:Math.round(n.getBoundingClientRect().height)}));
     const missingLabels=[...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea')].filter(visible).filter(n=>!n.labels?.length&&!n.getAttribute('aria-label')&&!n.getAttribute('aria-labelledby')).map(n=>n.getAttribute('placeholder')||n.name||n.tagName);
     const primaryNav=document.querySelector('nav[aria-label="Primary"]');
     const navLinks=[...primaryNav?.querySelectorAll('a')||[]];
     const navigationIssues=['/product','/security','/switch','/sign-in'].filter(href=>!navLinks.some(link=>link.getAttribute('href')===href&&visible(link)&&link.getBoundingClientRect().height>=43.5));
     const navWrap=document.querySelector('[class*="navWrap"]'),heroHeading=document.querySelector('h1');
     const navigationOverlap=!!(navWrap&&heroHeading&&visible(heroHeading)&&navWrap.getBoundingClientRect().bottom>heroHeading.getBoundingClientRect().top);
     const smallText=[...document.querySelectorAll('p,small,label,[class*="receiptHead"] span,[class*="previewHead"] span,[class*="provenance"],[class*="approvalBar"] span,[class*="completeActions"] span')].filter(visible).filter(n=>parseFloat(getComputedStyle(n).fontSize)<12).map(n=>({text:n.textContent.trim().slice(0,65),size:getComputedStyle(n).fontSize}));
     return {overflow:document.documentElement.scrollWidth-innerWidth,bodyOverflow:document.body.style.overflow,header:header?getComputedStyle(header).backgroundColor:null,tabsVisible:tabs?visible(tabs):false,bottomVisible:[...document.querySelectorAll('.ux-player-mobile-nav')].some(visible),bottomLabels:[...document.querySelectorAll('.ux-player-mobile-nav a')].filter(visible).map(n=>n.textContent.trim()),primaryNavVisible:primaryNav?visible(primaryNav):false,navigationIssues,navigationOverlap,missingLabels,smallControls,smallText,headings:[...document.querySelectorAll('h1,h2')].filter(visible).map(n=>n.textContent.trim())};
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
    if(['account','capture','recruitment','marketing'].includes(suite)&&metrics.missingLabels.length)failures.push(suite+'/'+screen+' has unlabelled form controls at '+width+': '+JSON.stringify(metrics.missingLabels));
    if(suite==='marketing'){
     if(!metrics.primaryNavVisible||metrics.navigationIssues.length)failures.push(screen+' marketing navigation missing or too small at '+width+': '+metrics.navigationIssues.join(','));
     if(metrics.navigationOverlap)failures.push(screen+' marketing header overlaps the hero at '+width);
    }
    if(process.env.PLATFORM_POLISH_SCREENSHOTS&&[390,1440].includes(width)&&['home','product','sign-in','staff-invite','onboarding-1','onboarding-2','onboarding-3','onboarding-4','review','complete','detail','players','network','profile','settings','deal'].includes(screen))await page.screenshot({path:join(process.env.PLATFORM_POLISH_SCREENSHOT_DIR||tmpdir(),'platform-polish-'+suite+'-'+screen+'-'+width+'.png'),fullPage:false});

    if(width===390) {
     const disclosures=page.locator('details.interface-details');
     for(let index=0;index<await disclosures.count();index++) {
      const disclosure=disclosures.nth(index),summary=disclosure.locator(':scope > summary');
      await summary.press('Enter');
      assert.equal(await disclosure.evaluate(node=>node.open),true,suite+'/'+screen+' detail must open with keyboard');
      const expanded=await page.evaluate(()=>{
       const visible=node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
       return {
        overflow:document.documentElement.scrollWidth-innerWidth,
        smallControls:[...document.querySelectorAll('details.interface-details[open] button,details.interface-details[open] input:not([type=hidden]):not([type=checkbox]):not([type=radio]),details.interface-details[open] select,details.interface-details[open] summary')].filter(visible).filter(node=>node.getBoundingClientRect().height<43.5).map(node=>(node.getAttribute('aria-label')||node.textContent||node.tagName).trim().slice(0,60)),
        missingLabels:[...document.querySelectorAll('details.interface-details[open] input:not([type=hidden]):not([type=checkbox]):not([type=radio]),details.interface-details[open] select,details.interface-details[open] textarea')].filter(visible).filter(node=>!node.labels?.length&&!node.getAttribute('aria-label')&&!node.getAttribute('aria-labelledby')).map(node=>node.name||node.tagName)
       };
      });
      assert.ok(expanded.overflow<=1,suite+'/'+screen+' opened detail overflow');
      assert.deepEqual(expanded.smallControls,[],suite+'/'+screen+' opened detail touch controls');
      assert.deepEqual(expanded.missingLabels,[],suite+'/'+screen+' opened detail field labels');
      if((await summary.textContent()).trim()==='Research profiles') {
       await disclosure.getByRole('button',{name:'Edit profiles',exact:true}).click();
       assert.ok(await disclosure.getByRole('textbox').count()>0,'Contact research profiles must remain editable');
       await disclosure.getByRole('button',{name:'Cancel',exact:true}).click();
       await disclosure.getByRole('button',{name:'Edit profiles',exact:true}).waitFor();
      }
      await summary.press('Enter');
      assert.equal(await disclosure.evaluate(node=>node.open),false,suite+'/'+screen+' detail must close with keyboard');
     }
    }
    if(suite==='agency'&&screen==='network'&&width===390) {
     await page.getByRole('button',{name:/NEEDS ATTENTION/}).click();
     await page.getByRole('button',{name:'Show all network',exact:true}).click();
     await page.getByRole('button',{name:/Open club/}).first().waitFor();
    }
    if(suite==='agency'&&screen==='players'&&width===1440) {
     const more=page.locator('details').filter({has:page.getByRole('button',{name:'Refresh',exact:true,includeHidden:true})});
     const summary=more.locator('summary');
     assert.equal(await more.evaluate(node=>node.open),false);
     await summary.press('Enter');
     await more.getByRole('button',{name:'Import players',exact:true}).waitFor();
     await summary.press('Escape');
     assert.equal(await more.evaluate(node=>node.open),false,'Escape closes workspace tools');
     assert.equal(await summary.evaluate(node=>node===document.activeElement),true,'Escape returns focus');
     await summary.press('Enter');
     await more.getByRole('button',{name:'Refresh',exact:true}).click();
     assert.equal(await more.evaluate(node=>node.open),false,'Workspace tool selection closes the menu');
    }
   }
   console.log('SCREEN',suite,screen);
  }
  if(suite==='presentation'){
   for(const screen of names){
    for(const mode of ['failed','malformed']){
     state.publicMode=mode;await page.goto(root+fixturePath+'?suite=presentation&screen='+screen);
     try{await page.getByRole('button',{name:'Try again',exact:true}).waitFor({timeout:2500});state.publicMode='healthy';await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('heading',{name:'Example Club Player',exact:true}).waitFor({timeout:5000});}
     catch(error){failures.push(screen+' '+mode+' public read must expose a working retry: '+error.message.split('\n')[0]);}
    }
    state.publicMode='hung';await page.goto(root+fixturePath+'?suite=presentation&screen='+screen);
    await page.getByRole('button',{name:'Try again',exact:true}).waitFor({timeout:14000});
    const release=state.release;state.publicMode='healthy';
    await page.getByRole('button',{name:'Try again',exact:true}).click();
    await page.getByRole('heading',{name:'Example Club Player',exact:true}).waitFor({timeout:5000});
    state.publicMode='unavailable';await page.goto(root+fixturePath+'?suite=presentation&screen='+screen);
    release?.();
    await page.getByRole('heading',{name:screen==='profile'?'Profile unavailable.':'This club link is unavailable.',exact:true}).waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.getByRole('heading',{name:'Example Club Player',exact:true}).count(),0,'A late successful read must not replace the unavailable link');
   }
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
