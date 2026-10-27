import {captureCascade,finishCascade} from './css-cascade-snapshot.mjs';
import assert from 'node:assert/strict';
import {verifyMobileChrome} from './mobile-workspace-chrome-qa.mjs';
import {verifyDailyMobileNavigation,verifyInPlaceCaptureCompletion,verifyDealRecordCapture,verifyDealHistoryAndCrossView} from './daily-mobile-journey-qa.mjs';
import {verifyCaptureFollowupJourney} from './capture-followup-journey-qa.mjs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {mkdir,cp,rm,access,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const routeDir=new URL('../app/workspace/qa-platform-polish/',import.meta.url);
const nextEnv=new URL('../next-env.d.ts',import.meta.url),nextEnvBefore=await readFile(nextEnv,'utf8');
try{await access(routeDir);throw new Error('Refusing to replace an existing route');}catch(error){if(error.code!=='ENOENT')throw error;}
const port=process.env.PLATFORM_POLISH_QA_PORT||'3117',root='http://127.0.0.1:'+port;
const env={...process.env,PLATFORM_POLISH_FIXTURE:'1',NEXT_PUBLIC_REDREAM_ENVIRONMENT:'qa',NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'example'};
let server,browser;
const report=[],failures=[],errors=[],cascade={};
try{
 if(process.env.PLATFORM_POLISH_SCREENSHOT_DIR)await mkdir(process.env.PLATFORM_POLISH_SCREENSHOT_DIR,{recursive:true});
 await mkdir(routeDir,{recursive:true});await cp(new URL('../tests/fixtures/platform-polish/page.tsx',import.meta.url),new URL('page.tsx',routeDir));
const dynamicDir=new URL('[slug]/[token]/[tenantSlug]/',routeDir);
await mkdir(dynamicDir,{recursive:true});await cp(new URL('../tests/fixtures/platform-polish/page.tsx',import.meta.url),new URL('page.tsx',dynamicDir));
const marketingDir=new URL('marketing/',routeDir);
await mkdir(marketingDir,{recursive:true});await cp(new URL('../tests/fixtures/platform-polish/marketing.tsx',import.meta.url),new URL('page.tsx',marketingDir));
 const development=process.env.PLATFORM_POLISH_DEV==='1';
 if(!development&&process.env.PLATFORM_POLISH_SKIP_BUILD!=='1'){
  const build=spawn('npm',['run','build'],{env,stdio:'inherit'});
  await new Promise((resolve,reject)=>{build.once('error',reject);build.once('exit',code=>code===0?resolve():reject(new Error('Polish fixture build failed: '+code)));});
 }
 server=spawn('npm',development?['run','dev','--','--webpack','--hostname','127.0.0.1','--port',port]:['run','start','--','--hostname','127.0.0.1','--port',port],{env,stdio:'inherit',detached:true});
 browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
 const user={id:'00000000-0000-0000-0000-000000000080',email:'fixture@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};
 const token='fixture.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
 const session={access_token:token,refresh_token:'fixture-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
 const screens={agency:['home','players','opportunities','network','calendar','business'],player:['home','profile','inbox','career','check-in','cv','documents','connections'],settings:['settings','profile','preferences','security','team','agency','billing','connections','player-experience'],detail:['deal','club','contact','negotiation','review','business'],marketing:['home','product','security','support','switch'],account:['sign-in','forgot','reset','player-invite','staff-invite','onboarding-1','onboarding-2','onboarding-3','onboarding-4'],presentation:['profile','share'],capture:['voice','text','review','complete'],recruitment:['list','detail'],setup:['branding','privacy','first_player','first_relationship','first_opportunity','owner_setup_complete'],misc:['privacy','workspaces']};
 const selectedSuites=process.env.PLATFORM_POLISH_SUITES?.split(',');
 const selectedScreens=process.env.PLATFORM_POLISH_SCREENS?.split(',');
 const widths=process.env.PLATFORM_POLISH_WIDTHS?process.env.PLATFORM_POLISH_WIDTHS.split(',').map(Number):[320,390,768,1440];
 const fixturePath='/workspace/qa-platform-polish/example-player/00000000-0000-4000-8000-000000000081/qa-platform-polish';
 const publicProfile={display_name:'Example Club Player',primary_position:'CM',current_club:'Example FC',headline:'Central midfielder',nationalities:['NZ'],key_stats:[{label:'Appearances',value:'18'},{label:'Minutes',value:'1250'}],career_history:[{club:'Example FC',season:'2025/26',appearances:18,minutes:1250}],videos:[{title:'Example highlights',url:'https://example.test/highlights',video_type:'highlight',featured:true}],transfermarkt_url:'https://www.transfermarkt.com/example/profil/spieler/1',verified_at:'2026-10-07T00:00:00Z'};
 for(const [suite,names] of Object.entries(screens)){
  if(selectedSuites&&!selectedSuites.includes(suite))continue;
  const state={screen:'',publicMode:'healthy',release:null,approved:false,taskDone:false,approvals:0,completions:0,failRelationships:false,recordWrites:0};
  const taskId='00000000-0000-4000-8000-000000000094',clubId='00000000-0000-4000-8000-000000000095';
  const dealA='00000000-0000-4000-8000-000000000096',dealB='00000000-0000-4000-8000-000000000097';
  const dueAt=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())+'T12:00:00Z';
  const receipt=captureId=>{const applied=state.screen==='complete'||state.approved;return {capture:{id:captureId,status:applied?'done':'needs_review',summary:'Example club update',transcript_text:'Example FC needs a central midfielder. Follow up today.'},actions:[{id:'action',action_type:'create_task',status:applied?'applied':'pending',evidence:'Follow up today',proposed_payload:{title:'Follow up with Example FC',owner_name:'Jesse',due_at:dueAt},resolved_payload:applied?{title:'Follow up with Example FC',organisation_id:clubId}:undefined,target_type:applied?'task':undefined,target_id:applied?taskId:undefined,undo_supported:true}]};};
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Rome'});
  await context.addInitScript(({session,suite})=>{if(location.hostname!=='127.0.0.1')return;const screen=new URL(location.href).searchParams.get('screen')||'';if(suite==='account'&&screen!=='reset'&&!screen.startsWith('onboarding-'))localStorage.removeItem('sb-example-auth-token');else localStorage.setItem('sb-example-auth-token',JSON.stringify(session));},{session,suite});
  await context.route('https://example.supabase.co/**',async route=>{
   if(new URL(route.request().url()).pathname.endsWith('/redream_home_relevance_v1'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({visible_indices:(route.request().postDataJSON()?.p_items||[]).map((_,index)=>index),editable_indices:(route.request().postDataJSON()?.p_items||[]).map((_,index)=>index)})});
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
   else if(path.endsWith('/functions/v1/agency-launch'))data={launch:{tenant_id:'00000000-0000-0000-0000-000000000081',tenant_slug:'qa-platform-polish',branding:{display_name:'Example Agency',portal_name:'Example Agency',primary_color:'#111827',accent_color:'#64748b',support_email:'agent@example.test'},owner_setup:{next_step:state.screen,completed_count:0,total_count:5,steps:[{key:'branding',label:'Agency identity',complete:false},{key:'privacy',label:'Privacy notice',complete:false},{key:'first_player',label:'First player',complete:false},{key:'first_relationship',label:'Club contact',complete:false},{key:'first_opportunity',label:'Live opportunity',complete:false}]},players:[{id:'player',name:'Example Player'}]}};
   else if(path.endsWith('/functions/v1/player-os')&&body.action==='workspaces')data={workspaces:[{player_id:'player',portal_hostname:'example.redreamsystems.com',agency:{display_name:'Example Agency'}}]};
   else if(path.endsWith('/functions/v1/agency-os')){
    if(suite==='player'){status=403;data={error:'Agency staff access required'};}
    else if(body.action==='tenants')data={tenants:[{tenant_id:'00000000-0000-0000-0000-000000000081',slug:'qa-platform-polish',role:'owner',display_name:'Example Agency'}]};
    else if(body.action==='players_workspace')data={players:{items:[{player_id:'player',identity:{name:'Example Player',current_club:'Example FC',primary_position:'Centre back'},service:{}}],total:1,has_more:false}};
    else if(body.action==='home_focus')data={home:{attention:{confirm:state.approved&&!state.taskDone?[{command_id:'capture-follow-up',source_type:'task',source_id:taskId,title:'Follow up with Example FC',due_at:dueAt,owner_name:'Jesse',priority_score:99,actionability:{mode:'one_tap',evidence_gate:'ready',cta:'Complete follow-up'}}]:[],judgement:[{command_id:'example-follow-up',source_type:'task',source_id:'60000000-0000-4000-8000-000000000001',title:'Confirm the trial dates',why_now:'The club is waiting for availability.',recommended_action:'Agree a week with the sporting director.',owner_name:'Jesse',priority_score:90},{command_id:'example-player',source_type:'task',source_id:'60000000-0000-4000-8000-000000000002',title:'Review the club shortlist',why_now:'Your player has new options to consider.',recommended_action:'Choose the two strongest routes.',owner_name:'Dapo',priority_score:80}]}}};
    else if(body.action==='club_account')data={club:{club:{id:clubId,name:'Example FC',country:'NZ'},summary:{},people:[],needs:[],commercial:{deals:[{deal_room_id:dealB,title:'Example transfer B',stage:'open'}]}}};
    else if(body.action==='deal_war_room')data={war_room:{available:true,deal:{id:body.deal_room_id,title:body.deal_room_id===dealB?'Example transfer B':'Example transfer A',stage:'open'},control:{},next_control_fix:{}}};
    else if(body.action==='action_prepare'&&state.approved)data={proposal:{proposal_id:'capture-follow-up-proposal',title:'Complete: Follow up with Example FC',status:'proposed',executable:true}};
    else if(body.action==='action_execute'&&state.approved){state.completions++;state.taskDone=true;data={ok:true};}
    else if(body.action==='recruitment_board')data={recruitment:{items:[]}};
    else data={home:{},items:[]};
   }else if(path.includes('/rest/v1/rpc/')){
    if(path.endsWith('/redream_home_work_v1')){
     if(body.p_action==='complete'){state.completions++;state.taskDone=true;}
     if(body.p_action==='undo')state.taskDone=false;
     const title=body.p_work_id===taskId?'Follow up with Example FC':body.p_work_id==='60000000-0000-4000-8000-000000000001'?'Confirm the trial dates':'Review the club shortlist';
     const status=body.p_work_id===taskId&&state.taskDone?'done':'open';
     data={work:{work_kind:'task',work_id:body.p_work_id,title,display_title:title,due_at:dueAt,due_on:dueAt.slice(0,10),note:'',status,state:{title,status,version:state.completions+1}},undo_token:body.p_action==='complete'?'fixture-undo':null};
    }
    else if(path.endsWith('/redream_work_responsibility_v1')&&state.approved)data={user_ids:['10000000-0000-4000-8000-000000000001'],people:[{user_id:'10000000-0000-4000-8000-000000000001',display_name:'Jesse'}],revision:1};
    else if(path.endsWith('/redream_work_responsibility_v1'))data={user_ids:['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'],people:[{user_id:'10000000-0000-4000-8000-000000000001',display_name:'Jesse'},{user_id:'10000000-0000-4000-8000-000000000002',display_name:'Dapo'}],revision:1};
    else if(path.endsWith('/redream_ai_current_access'))data={enabled:true,workspace_slug:'qa-platform-polish',max_audio_seconds:240};
    else if(path.endsWith('/redream_ai_recent_captures'))data=[{id:'00000000-0000-4000-8000-000000000092',status:'needs_review',summary:'Example club update',created_at:'2026-10-08T10:00:00Z',action_count:1,question_count:0}];
    else if(path.endsWith('/redream_ai_receipt'))data=receipt(body.p_capture_id);
    else if(path.endsWith('/redream_ai_approve_capture')){state.approvals++;state.approved=true;data={receipt:receipt(body.p_capture_id)};}
    else if(path.endsWith('/redream_calendar_range'))data={follow_ups:{items:state.approved&&!state.taskDone?[{task_id:taskId,title:'Follow up with Example FC',due_at:dueAt,organisation_id:clubId,organisation_name:'Example FC',source:'tell_djm:fixture'}]:[]}};
    else if(path.endsWith('/redream_entity_patch')){state.recordWrites++;data={ok:true};}
    else if(path.endsWith('/redream_autopilot_relationships')){
     if(state.failRelationships){status=503;data={message:'The list is temporarily unavailable'};}
     else data={accounts:{clubs:[{organisation_id:'club',name:'Example FC',country:'NZ'}]},contacts:{items:[{person_id:'contact',person:{full_name:'Example Director'},employment:{organisation_name:'Example FC'}}]}};
    }
    else if(path.endsWith('/redream_autopilot_market'))data={demand:{items:[]},pursuits:{items:[]}};
    else if(path.endsWith('/redream_autopilot_deals'))data={portfolio:{deals:[{deal_room_id:dealA,title:'Example transfer A',stage:'open'},{deal_room_id:dealB,title:'Example transfer B',stage:'open'}]}};
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
  for(const screen of names.filter(name=>!selectedScreens||selectedScreens.includes(name))){
   for(const width of widths){
    await page.setViewportSize({width,height:900});
    state.screen=screen;state.approved=false;state.taskDone=false;state.approvals=0;state.completions=0;
    const remaining=['agency','marketing','account','presentation','capture','recruitment'].includes(suite);
    const query=new URLSearchParams({suite,screen,view:suite==='recruitment'?'players':screen});
    if(suite==='recruitment'){query.set('tab','recruitment');if(screen==='detail')query.set('target','00000000-0000-4000-8000-000000000091');}
    if(suite==='capture'&&['review','complete'].includes(screen))query.set('capture','00000000-0000-4000-8000-000000000092');
    if(suite==='capture'&&screen==='text')query.set('share_text','Example FC needs a central midfielder.');
    const url=root+(suite==='marketing'?'/workspace/qa-platform-polish/marketing':remaining?fixturePath:'/workspace/qa-platform-polish')+'?'+query;
    for(let i=0;i<60;i++){try{await page.goto(url);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}}
    await page.locator('h1:visible,h2:visible').first().waitFor({timeout:30000});
    if(suite==='presentation')await page.getByRole('heading',{name:'Example Club Player',exact:true}).waitFor();
    if(suite==='detail'&&screen==='review')await page.getByText('MEETING POSITION',{exact:true}).waitFor();
    if(suite==='capture'){
     if(screen==='voice')await page.getByRole('button',{name:'Type instead',exact:true}).waitFor();
     else if(screen==='text')await page.getByRole('textbox',{name:'Your update',exact:true}).waitFor();
     else if(screen==='review')await page.getByRole('button',{name:'Approve & save',exact:true}).waitFor();
     else await page.getByText('Follow-up created',{exact:true}).waitFor();
    }
    if(suite==='setup') {
     if(screen==='owner_setup_complete')await page.getByText('Owner setup complete',{exact:true}).waitFor();
     else await page.locator('input:visible').first().waitFor();
    }
    if(suite==='misc'&&screen==='workspaces')await page.getByRole('link',{name:/Open player portal/}).waitFor();
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
     const networkTabs=document.querySelector('[data-people-internal-tabs]'),networkSearch=document.querySelector('[aria-label="Search Network"]');
     const networkToolbarOverlap=!!(networkTabs&&networkSearch&&visible(networkSearch)&&[...networkTabs.querySelectorAll('button')].filter(visible).some(button=>{const a=button.getBoundingClientRect(),b=networkSearch.getBoundingClientRect();return a.right>b.left+1&&a.left<b.right-1&&a.bottom>b.top+1&&a.top<b.bottom-1;}));
     const primaryNav=document.querySelector('nav[aria-label="Primary"]');
     const navLinks=[...primaryNav?.querySelectorAll('a')||[]];
     const navigationIssues=['/product','/security','/switch','/sign-in'].filter(href=>!navLinks.some(link=>link.getAttribute('href')===href&&visible(link)&&link.getBoundingClientRect().height>=43.5));
     const navWrap=document.querySelector('[class*="navWrap"]'),heroHeading=document.querySelector('h1');
     const navigationOverlap=!!(navWrap&&heroHeading&&visible(heroHeading)&&navWrap.getBoundingClientRect().bottom>heroHeading.getBoundingClientRect().top);
     const smallText=[...document.querySelectorAll('p,small,label,[class*="receiptHead"] span,[class*="previewHead"] span,[class*="provenance"],[class*="approvalBar"] span,[class*="completeActions"] span')].filter(visible).filter(n=>parseFloat(getComputedStyle(n).fontSize)<12).map(n=>({text:n.textContent.trim().slice(0,65),size:getComputedStyle(n).fontSize}));
     const reviewHero=document.querySelector('[aria-label="Player Service Review"] section[class*="_hero"]');
     const reviewHeroContrast=reviewHero?[...reviewHero.querySelectorAll(':scope > div > span')].map(n=>{
      const fg=getComputedStyle(n).color.match(/[\d.]+/g).map(Number),bg=getComputedStyle(reviewHero).backgroundColor.match(/[\d.]+/g).map(Number),alpha=fg[3]??1;
      const luminance=values=>values.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((total,v,i)=>total+v*[.2126,.7152,.0722][i],0);
      const levels=[luminance(fg.slice(0,3).map((v,i)=>alpha*v+(1-alpha)*bg[i])),luminance(bg)].sort((a,b)=>b-a);
      return {text:n.textContent.trim(),ratio:(levels[0]+.05)/(levels[1]+.05)};
     }):[];
     const careerCopy=document.querySelector('.career-hub-copy'),careerPanel=document.querySelector('.career-score-panel');
     const careerStacked=!(careerCopy&&careerPanel)||careerPanel.getBoundingClientRect().top>=careerCopy.getBoundingClientRect().bottom-1;
     return {reviewHeroContrast,careerStacked,overflow:document.documentElement.scrollWidth-innerWidth,bodyOverflow:document.body.style.overflow,header:header?getComputedStyle(header).backgroundColor:null,tabsVisible:tabs?visible(tabs):false,bottomVisible:[...document.querySelectorAll('.ux-player-mobile-nav')].some(visible),bottomLabels:[...document.querySelectorAll('.ux-player-mobile-nav a')].filter(visible).map(n=>n.textContent.trim()),networkToolbarOverlap,primaryNavVisible:primaryNav?visible(primaryNav):false,navigationIssues,navigationOverlap,missingLabels,smallControls,smallText,headings:[...document.querySelectorAll('h1,h2')].filter(visible).map(n=>n.textContent.trim())};
    });
    if(process.env.CSS_CASCADE_SNAPSHOT||process.env.CSS_CASCADE_COMPARE)cascade[suite+'/'+screen+'/'+width]=await captureCascade(page);
     if(suite==='agency'&&screen==='home'&&width<=680)await verifyDailyMobileNavigation(page);
    if(suite==='agency'&&screen==='home'&&[390,768,1440].includes(width)){
     state.approved=false;state.taskDone=false;state.approvals=0;state.completions=0;
     await verifyInPlaceCaptureCompletion(page,url,width===390);
    }
    if(suite==='agency'&&screen==='opportunities'&&width===390){await verifyDealRecordCapture(page,url,dealA,dealB);await verifyDealHistoryAndCrossView(page,url,dealA,dealB);}
    await verifyMobileChrome(page,suite,screen,width);
    if(suite==='agency'&&screen==='players'){
     const search=page.getByRole('searchbox',{name:'Search players',exact:true}),add=page.getByRole('button',{name:'Add player',exact:true});
     await search.waitFor();await add.waitFor();
     const a=await search.boundingBox(),b=await add.boundingBox();
     assert.ok(a.width>=110&&b.width>=90&&b.height>=44,'Roster controls remain usable rather than being compressed at '+width+': '+JSON.stringify({search:a,add:b}));
     assert.ok(Math.abs((a.y+a.height/2)-(b.y+b.height/2))<=3,'Player search and creation stay together at '+width);
     assert.ok(a.x<b.x,'Player search precedes Add, consistently with Network at '+width+': '+JSON.stringify({search:a,add:b,styles:await search.evaluate(node=>({input:getComputedStyle(node).order,field:getComputedStyle(node.parentElement).order,parent:getComputedStyle(node.parentElement.parentElement).display,direction:getComputedStyle(node.parentElement.parentElement).flexDirection}))}));
     assert.equal(await add.count(),1,'The roster has one Add player action');
    }
    if(suite==='agency'&&screen==='home')assert.doesNotMatch(await page.getByRole('article').filter({has:page.getByRole('button',{name:/^Complete /})}).locator('[class*="_meta"]').allTextContents().then(values=>values.join('\n')),/Waiting\s*Waiting/i,'Home status labels never repeat');
    if(suite==='player'&&screen==='career'){
     const tools=page.getByRole('navigation',{name:'My career areas',exact:true});
     assert.equal(await tools.locator('details').evaluate(node=>node.open),false,'Optional career tools start collapsed');
     await tools.locator('summary').press('Enter');
     assert.equal(await tools.getByRole('link').count(),7,'Every career destination remains reachable');
     const clipped=await tools.getByRole('link').evaluateAll(nodes=>nodes.some(node=>{const r=node.getBoundingClientRect();return r.left<0||r.right>innerWidth+1;}));
     assert.equal(clipped,false,'Career tools never require a hidden sideways swipe');
     await tools.locator('summary').press('Enter');
    }
    report.push({suite,screen,width,...metrics});
    if(metrics.networkToolbarOverlap)failures.push('Network tabs overlap search at '+width);
    if(suite==='detail'&&screen==='review'){
     if(!metrics.reviewHeroContrast.length)failures.push('Service-review summary is missing at '+width);
     else if(metrics.reviewHeroContrast.some(item=>item.ratio<4.5))failures.push('Service-review summary has unreadable contrast at '+width);
    }
    if(suite==='player'&&screen==='career'&&width<=1000&&!metrics.careerStacked)failures.push('Career title and actions must have a full row above readiness at '+width);
    if(metrics.overflow>1)console.log('Overflow elements',suite,screen,width,await page.evaluate(()=>[...document.querySelectorAll('*')].map(node=>({tag:node.tagName,class:typeof node.className==='string'?node.className:'',right:node.getBoundingClientRect().right,width:node.getBoundingClientRect().width})).filter(node=>node.width>0&&node.right>innerWidth+1).slice(-15)));
    if(metrics.overflow>1)failures.push(suite+'/'+screen+' overflows at '+width+' ('+metrics.overflow+'px)');
    if(suite==='player'){
     if(/rgba\([^)]*,\s*0\./.test(metrics.header||''))failures.push('Translucent player header at '+width);
     if(width>760&&metrics.bottomVisible)failures.push('Player desktop navigation repeats the mobile bar at '+width);
     if(width>760&&!metrics.tabsVisible)failures.push('Missing player header navigation at '+width);
     if(width<=760){
      if(metrics.tabsVisible&&metrics.bottomVisible)failures.push('Duplicate player navigation at '+width);
      if(!metrics.bottomVisible)failures.push('Missing player mobile navigation at '+width);
      if(JSON.stringify(metrics.bottomLabels)!==JSON.stringify(['Home','Your agency','Me']))failures.push('Player mobile navigation changed at '+width+': '+JSON.stringify(metrics.bottomLabels));
     }
    }
    if(width<=760&&metrics.smallControls.length)failures.push(suite+'/'+screen+' has small touch controls at '+width+': '+JSON.stringify(metrics.smallControls));
    if(metrics.smallText.length)failures.push(suite+'/'+screen+' has undersized guidance at '+width+': '+JSON.stringify(metrics.smallText));
    if(['account','capture','recruitment','marketing','setup'].includes(suite)&&metrics.missingLabels.length)failures.push(suite+'/'+screen+' has unlabelled form controls at '+width+': '+JSON.stringify(metrics.missingLabels));
    if(suite==='marketing'){
     if(!metrics.primaryNavVisible||metrics.navigationIssues.length)failures.push(screen+' marketing navigation missing or too small at '+width+': '+metrics.navigationIssues.join(','));
     if(metrics.navigationOverlap)failures.push(screen+' marketing header overlaps the hero at '+width);
    }
    if(process.env.PLATFORM_POLISH_SCREENSHOTS&&[390,1440].includes(width))await page.screenshot({path:join(process.env.PLATFORM_POLISH_SCREENSHOT_DIR||tmpdir(),'platform-polish-'+suite+'-'+screen+'-'+width+'.png'),fullPage:false});

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
    if(suite==='capture'&&screen==='review'&&width===390)await verifyCaptureFollowupJourney(page,()=>({approvals:state.approvals,completions:state.completions,dueAt,taskId}));
    if(suite==='detail'&&['club','contact','deal'].includes(screen)&&width===390){
     const label=screen==='club'?'Example FC':screen==='contact'?'Example Director':'Example transfer';
     const edit=page.getByRole('button',{name:'Edit '+label,exact:true});await edit.click();
     const editor=page.getByRole('dialog',{name:'Manage '+label,exact:true});await editor.waitFor();
     const field=editor.getByLabel(screen==='club'?'Club name':screen==='contact'?'Full name':'Deal title',{exact:true});
     assert.equal(await field.inputValue(),label,'Direct edit opens the existing record');
     assert.equal(await field.evaluate(node=>node===document.activeElement),true,'Record edit receives focus');
     await field.fill('Temporary draft');await page.keyboard.press('Escape');
     const discard=page.getByRole('alertdialog',{name:'Discard these changes?',exact:true});await discard.waitFor();
     await discard.getByRole('button',{name:'Discard changes',exact:true}).click();await editor.waitFor({state:'hidden'});
     assert.equal(await edit.evaluate(node=>node===document.activeElement),true,'Record edit returns focus');
     await edit.click();await editor.waitFor();assert.equal(await field.inputValue(),label,'Cancelled drafts do not change the record');
     await editor.getByRole('button',{name:'Cancel',exact:true}).click();await editor.waitFor({state:'hidden'});
     assert.equal(await page.evaluate(()=>document.body.style.overflow),'','Page records restore document scrolling after editing');
     if(screen==='contact'||screen==='club'){
      const identity=page.locator(screen==='contact'?'[class*="headerIdentity"]':'[class*="headerTop"] > div:first-child').first();
      const controls=page.locator('[class*="headerControls"]').first();
      const a=await identity.boundingBox(),b=await controls.boundingBox();
      assert.ok(a.width>270,'The record identity gets the full phone width');
      assert.ok(b.y>=a.y+a.height-1,'Record controls use a separate row on phones');
     }
    }
    if(suite==='agency'&&screen==='network'&&width===390) {
     await page.getByText('Relationship signals',{exact:true}).click();
     await page.getByRole('button',{name:/Needs attention/}).click();
     await page.getByRole('button',{name:'Show all network',exact:true}).click();
     await page.getByRole('button',{name:'Open Example FC',exact:true}).first().waitFor();
     await page.getByRole('button',{name:'Manage Example FC',exact:true}).click();
     const editor=page.getByRole('dialog',{name:'Manage Example FC',exact:true});
     await editor.getByRole('button',{name:'Edit Change the details.',exact:true}).click();
     await editor.getByLabel('Country',{exact:true}).fill('AU');state.failRelationships=true;
     await editor.getByRole('button',{name:'Save changes',exact:true}).click();
     await editor.getByRole('heading',{name:'Changes saved',exact:true}).waitFor();
     assert.equal(state.recordWrites,1,'The Network edit is saved once');
     state.failRelationships=false;await editor.getByRole('button',{name:'Refresh list',exact:true}).click();await editor.waitFor({state:'hidden'});
     assert.equal(state.recordWrites,1,'Retrying a failed Network refresh never repeats the saved mutation');
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
   for(const screen of ['club','contact','deal']){
    await page.goto(root+'/workspace/qa-platform-polish?suite=detail&screen='+screen+'&read=post-save-failed');
    const label=screen==='club'?'Example FC':screen==='contact'?'Example Director':'Example transfer';
    await page.getByRole('button',{name:'Edit '+label,exact:true}).click();
    const editor=page.getByRole('dialog',{name:'Manage '+label,exact:true});
    await editor.getByLabel(screen==='club'?'Club name':screen==='contact'?'Full name':'Deal title',{exact:true}).fill('Updated record');
    await editor.getByRole('button',{name:'Save changes',exact:true}).click();
    await editor.getByRole('heading',{name:'Changes saved',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.__recordRefreshWrites),1,'Detail edit saves once before a failed '+screen+' refresh');
    await page.evaluate(()=>{window.__recordRefreshAllow=true;});
    await editor.getByRole('button',{name:'Refresh list',exact:true}).click();await editor.waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>window.__recordRefreshWrites),1,'Detail refresh does not repeat the '+screen+' write');
   }
   for(const screen of ['club','contact']){
    const label=screen==='club'?'Example FC':'Example Director';
    await page.goto(root+'/workspace/qa-platform-polish?suite=detail&screen='+screen+'&read=delayed');
    await page.getByText(screen==='club'?'Loading club':'Loading relationship context',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Edit '+label,exact:true}).count(),0,'Record editing waits for its complete read');
    const edit=page.getByRole('button',{name:'Edit '+label,exact:true});await edit.waitFor();await edit.click();
    const editor=page.getByRole('dialog',{name:'Manage '+label,exact:true});await editor.waitFor();
    assert.equal(await editor.getByLabel('Country',{exact:true}).inputValue(),'NZ','Editing retains metadata loaded from the current record');
    await editor.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.goto(root+'/workspace/qa-platform-polish?suite=detail&screen='+screen+'&read=failed');
    await page.getByRole('alert').first().waitFor();
    assert.equal(await page.getByRole('button',{name:'Edit '+label,exact:true}).count(),0,'An unconfirmed record cannot be edited');
   }
   await page.setViewportSize({width:390,height:600});
   await page.goto(root+'/workspace/qa-platform-polish?suite=detail&screen=deal');
   await page.getByRole('heading',{name:'Example transfer',exact:true}).waitFor();
   await page.getByRole('button',{name:'Edit Example transfer',exact:true}).waitFor();
   assert.equal(await page.evaluate(()=>document.body.style.overflow),'','A page record allows document scrolling');
   await page.getByRole('heading',{name:'Confirm the trial dates',exact:true}).waitFor();
   await page.getByText('Forward movement recorded',{exact:true}).waitFor();
   assert.equal(await page.getByRole('region',{name:'Latest activity',exact:true}).locator('time').textContent(),'8 Oct 2026','Activity shows the recorded date rather than a due-date warning');
   const scroller=page.locator('[role="region"]').locator('..');
   await page.mouse.move(190,400);await page.mouse.wheel(0,700);
   await page.waitForFunction(()=>{const region=document.querySelector('[role="region"]');return region?.parentElement?.scrollTop>0;});
   assert.ok(await scroller.evaluate(node=>node.scrollTop>0),'Deal detail content cannot scroll');
   await page.goto(root+'/workspace/qa-platform-polish?suite=detail&screen=deal&drawer=1');
   await page.getByRole('heading',{name:'Example transfer',exact:true}).waitFor();
   await page.waitForFunction(()=>document.body.style.overflow==='hidden');
   assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','Drawer should still lock document scroll');
   await page.goto(root+'/workspace/qa-platform-polish?suite=detail&screen=deal&readonly=1');
   await page.getByRole('heading',{name:'Confirm the trial dates',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Edit Example transfer',exact:true}).count(),0,'A read-only record never exposes editing');
  }
  await context.close();
 }
 // Development permits JS eval, which previously concealed the PDF renderer's
 // WebAssembly requirement. Exercise the real exporter under production headers.
 if(!development){
  const exportContext=await browser.newContext();
  try{
   const exportPage=await exportContext.newPage();
   const response=await exportPage.goto(root+'/workspace/qa-platform-polish?suite=documents');
   await exportPage.getByRole('button',{name:/Harbour FC \| Agency services/}).click();
   const pending=exportPage.waitForEvent('download',{timeout:15000});
   await exportPage.getByRole('button',{name:'PDF',exact:true}).click();
   let download;
   try{download=await pending;}catch(error){throw new Error('Production PDF export failed: '+(await exportPage.getByRole('alert').allTextContents()).join(' '),{cause:error});}
   const bytes=await readFile(await download.path());
   assert.equal(bytes.subarray(0,5).toString(),'%PDF-','Production PDF export must download an actual PDF');
   assert.ok(bytes.length>1000);
   const scriptPolicy=response.headers()['content-security-policy'].split(';').find(value=>value.trim().startsWith('script-src ')).trim().split(/\s+/);
   assert.ok(!scriptPolicy.includes("'unsafe-eval'"),'Production must continue blocking JavaScript eval');
   console.log('Production CSP: real document PDF download passed; JavaScript eval remains disallowed');
  }finally{await exportContext.close();}
 }
 await writeFile(process.env.PLATFORM_POLISH_REPORT||join(tmpdir(),'platform-polish-report.json'),JSON.stringify({report,failures,errors},null,2));
 assert.deepEqual(errors,[],'Browser errors');
 assert.deepEqual(failures,[],'Screen polish regressions');
 console.log('Platform polish browser QA passed: '+report.length+' screen/viewport combinations');
 await finishCascade(cascade);
}finally{
 try { await browser?.close(); } finally {
 await rm(routeDir,{recursive:true,force:true});
 await rm(new URL('../.next/dev/types/',import.meta.url),{recursive:true,force:true});
 await rm(new URL('../.next/types/',import.meta.url),{recursive:true,force:true});
 await writeFile(nextEnv,nextEnvBefore);
 try{if(server?.pid)process.kill(-server.pid,'SIGTERM');}catch{}
 }
}
