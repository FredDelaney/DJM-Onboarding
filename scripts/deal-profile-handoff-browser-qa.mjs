// Actual workspace coordinator, existing profile/share/action components, isolated HTTP fixtures.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=process.env.WORKSPACE_FLOW_QA_URL||'http://127.0.0.1:3113/workspace/qa-find-flow';
const player='00000000-0000-4000-8000-000000000091',deal='00000000-0000-4000-8000-000000000092',club='00000000-0000-4000-8000-000000000093';
const otherDeal='00000000-0000-4000-8000-000000000094',otherClub='00000000-0000-4000-8000-000000000095';
const secondPlayer='00000000-0000-4000-8000-000000000101',versionId='00000000-0000-4000-8000-000000000102';
const owner='00000000-0000-4000-8000-000000000080',ownerProposal='00000000-0000-4000-8000-000000000096',nextProposal='00000000-0000-4000-8000-000000000097';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
async function setup(width,scenario='normal'){
 const page=await browser.newPage({viewport:{width,height:844},timezoneId:'Europe/Rome'});
 const user={id:owner,email:'fixture@example.test',aud:'authenticated',role:'authenticated',created_at:'2026-01-01T00:00:00Z',app_metadata:{},user_metadata:{}};
 const token='fixture.'+Buffer.from(JSON.stringify({sub:owner,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
 const session={access_token:token,refresh_token:'fixture-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
 await page.addInitScript(({session,scenario})=>{
  if(location.hostname==='127.0.0.1')localStorage.setItem('sb-example-auth-token',JSON.stringify(session));
  if(scenario==='clipboard')Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>{window.qaClipboardCalls=(window.qaClipboardCalls||0)+1;return new Promise(()=>{});}}});
  Object.defineProperty(navigator,'connection',{configurable:true,value:Object.assign(new EventTarget(),{saveData:true,effectiveType:'4g'})});
 },{session,scenario});
 const state={phase:'overview',owner:scenario!=='unowned',prepares:0,executes:0,undos:0,shares:[],contextReads:0,held:[],allowContext:scenario!=='late'&&scenario!=='stale',failContext:scenario==='failed',failRefresh:false,followup:false,errors:[]};
 page.on('pageerror',error=>state.errors.push(error.message));
 const war=id=>({available:true,deal_room_id:id,player:{player_id:scenario==='mismatch'&&state.phase==='profile'?otherClub:player,name:'Example Player'},club:{organisation_id:id===otherDeal?otherClub:club,name:id===otherDeal?'Second Recipient FC':'Recipient United'},deal:{title:id===otherDeal?'Second recorded deal':'Example Player to Recipient United',stage:'interest',status:'active',owner_user_id:state.owner?owner:null,private_notes:'Internal-only sentinel'},control:{state:'recorded'},next_control_fix:scenario==='refresh'?{instruction:'Set the recorded follow-up.'}:{}});
 const progressive=scenario.startsWith('detail-')||scenario==='aux-hung'||scenario==='read-stale';
 Object.assign(state,{auxReads:{},auxFail:{},auxHold:{},auxHeld:[],versions:[],clubList:[{id:club,name:'Recipient United'},{id:otherClub,name:'Second Recipient FC'}],coreReads:0,versionSaves:0});
 if(scenario==='version-choice'){state.auxFail.player_profile_versions=true;}
 if(scenario==='detail-failed')state.auxFail.player_profile_detail=true;
 if(scenario==='detail-late')state.auxHold.player_profile_detail=true;
 if(scenario==='aux-hung'||scenario==='read-stale')state.auxHold={player_profile_detail:true,player_profile_versions:true,create_options:true};
 const profile={player:{id:player,first_name:'Example',last_name:'Player',date_of_birth:'2000-04-19',primary_position:'Centre back',current_club:'Current FC',current_country:'NZ',contract_status:'under_contract',contract_expiry:'2028-06-30',verification_status:'verified',verified_at:'2026-10-10T12:00:00Z'},settings:{intro_line:'Recorded first-team football experience.'},published:{published:true},career:[],videos:[],documents:[],shares:[],deals:[],clubs:[],branding:{display_name:'Example Agency',primary_color:'#24143D',accent_color:'#8B5CF6'},secondary_ready:true,auto_key_stats:[]};
 const auxiliary=async(route,name,value,body)=>{
  state.auxReads[name]=(state.auxReads[name]||0)+1;
  if(state.auxFail[name]){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic read unavailable'})});return true;}
  if(state.auxHold[name]){state.auxHeld.push({route,name,value,body});return true;}
  return false;
 };
 await page.route('https://example.supabase.co/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname,body=request.postDataJSON()||{},name=body.action||path.split('/').pop();
  let value={};
  if(path.includes('/auth/v1/user'))value=user;
  else if(path.includes('/auth/v1/token'))value=session;
  else if(name==='tenants')value={tenants:[{tenant_id:'00000000-0000-4000-8000-000000000081',slug:'qa-find-flow',role:scenario==='restricted'?'agent':'owner',display_name:'Example Agency'}]};
  else if(name==='redream_autopilot_deals'&&state.failRefresh)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Saved-view fixture read unavailable'})});
  else if(name==='redream_autopilot_deals')value={portfolio:{deals:[{deal_room_id:deal,title:'Example Player to Recipient United',organisation:'Recipient United',stage:'interest'}]}};
  else if(name==='redream_autopilot_market')value={demand:{items:[]},pursuits:{items:[]}};
  else if(name==='redream_opportunity_connected_context')value={};
  else if(name==='deal_war_room'){
   if(state.phase==='profile'){
    state.contextReads++;
    if(state.failContext)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Fixture deal read unavailable'})});
    if(!state.allowContext&&body.deal_room_id!==otherDeal){state.held.push({route,value:{war_room:war(body.deal_room_id)}});return;}
   }
   value={war_room:war(body.deal_room_id)};
  }
  else if(name==='players_workspace'){
   if(state.failRefresh)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Saved-view fixture read unavailable'})});
   value={players:{items:[{player_id:player,identity:{name:'Example Player',current_club:'Current FC',primary_position:'Centre back'},service:{}}],total:1,has_more:false}};
  }
  else if(name==='player_profile_core'||name==='player_profile'){
   state.coreReads++;
   const core={...profile,player:body.player_id===secondPlayer?{...profile.player,id:secondPlayer,first_name:'Second'}:profile.player};
   if(progressive){core.secondary_ready=false;core.branding={};}
   if(scenario==='detail-late')core.published={published:false};
   if(scenario==='version-choice'){core.player={...core.player,current_season_label:'2026/27',current_league:'Synthetic league'};core.auto_key_stats=[{label:'Apps',value:'1'}];core.auto_stats_meta={checked_at:new Date().toISOString()};}
   value={profile:scenario==='restricted'?{...core,access:{restricted:true,scope:'assigned'},settings:{},published:{}}:core};
  }
  else if(name==='player_profile_detail'){
   value={detail:{secondary_ready:true,deals:[],clubs:[],shares:[],documents:[],communication:{summary:{},items:[],open_followups:[]},branding:{display_name:'Example Agency',support_email:'replies@example.test',primary_color:'#24143D'}}};
   if(scenario==='detail-malformed')value={detail:{secondary_ready:true}};
   if(await auxiliary(route,name,value,body))return;
  }
  else if(name==='create_options'){value=scenario==='malformed-lists'?{options:{clubs:null}}:{options:{clubs:state.clubList}};if(await auxiliary(route,name,value,body))return;}
  else if(name==='player_profile_versions'){value=scenario==='malformed-lists'?{versions:null}:{versions:state.versions};if(await auxiliary(route,name,value,body))return;}
  else if(scenario==='version-choice'&&name==='player_profile_prepare')value={proposal:{headline:'Approved fixture profile',why_review:'Synthetic recorded dossier.',selected_stat_refs:[],hidden_sections:[],source_fingerprint:'synthetic-approval'},evidence:{stats:[],videos:[]},ai_available:false};
  else if(scenario==='version-choice'&&name==='player_profile_version_save'){state.versionSaves++;value={version:{id:versionId}};}
  else if(name==='player_data_status')value={job:null};
  else if(name==='player_profile_share_create'){
   state.shares.push(body);value={share:{id:'00000000-0000-4000-8000-000000000098',token:'00000000-0000-4000-8000-000000000099',club_name:body.organisation_id===otherClub?'Second Recipient FC':'Recipient United',active:true,view_count:0}};
  }
  else if(name==='deal_step_prepare'||name==='deal_control_fix_prepare'){
   state.prepares++;
   assert.equal(body.deal_room_id,deal);if(name==='deal_step_prepare')assert.equal(body.step_type,'set_next_action');
   const owned=state.owner,complete=owned?Boolean(body.input?.next_action_text&&body.input?.next_action_at):Boolean(body.input?.owner_user_id);
   value={proposal:{status:complete?'proposed':'needs_input',action_type:owned?'set_deal_next_action':'assign_deal_owner',ownership_required_first:!owned,
    executable:complete,required_inputs:owned?(complete?[]:['next_action_text','next_action_at']):['owner_user_id'],owner_candidates:[{user_id:owner,name:'Agency Owner'}],
    ...(complete?{proposal_id:owned?nextProposal:ownerProposal,payload:body.input}:{}),reminder_owner_name:owned?'Agency Owner':null,external_side_effect:false}};
  }
  else if(name==='action_execute'){
   state.executes++;if(body.proposal_id===ownerProposal)state.owner=true;else{assert.equal(body.proposal_id,nextProposal);state.followup=true;}
   value={result:{status:'applied',undo_supported:true}};
  }
  else if(name==='action_undo'){state.undos++;if(body.proposal_id===nextProposal)state.followup=false;else state.owner=false;value={ok:true};}
  else if(path.includes('/functions/v1/agency-os')&&['player_profile_publish','player_profile_save','player_profile_version_save','player_profile_prepare'].includes(name))throw new Error('No profile publication, preparation or save is authorised by this journey: '+name);
  else if(name==='redream_ai_current_access')value={enabled:false};
  else value={items:[],accounts:{clubs:[]},contacts:{items:[]}};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
 });
 const visit=async(query='view=opportunities&tab=deals')=>{
  for(let i=0;i<50;i++){try{await page.goto(root+'/qa-fixture/qa-find-flow?coordinator=1&'+query);break;}catch(error){if(i===49)throw error;await page.waitForTimeout(250);}}
  await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
 };
 const openProfile=async()=>{
  await visit();await page.locator('#opportunity-'+deal).click();
  const open=page.getByRole('button',{name:'Review player profile',exact:true});await open.waitFor();state.phase='profile';await open.click();
  await page.getByRole('heading',{name:'Example Player',exact:true}).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('source_deal'),deal);
  assert.equal(new URL(page.url()).searchParams.get('player'),player);
  assert.ok(new URL(page.url()).pathname.endsWith('/workspace/qa-find-flow'));
 };
 return {page,state,visit,openProfile,releaseAux:async(name,transform=value=>value)=>{state.auxHold[name]=false;for(const item of state.auxHeld.filter(item=>item.name===name)){await item.route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(transform(item.value))});}state.auxHeld=state.auxHeld.filter(item=>item.name!==name);},release:async()=>{state.allowContext=true;for(const item of state.held.splice(0))await item.route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(item.value)});}};
}
try{
 if(!process.env.PROFILE_READ_RECOVERY_ONLY){
 await mkdir('/tmp/redream-platform-programme/deal-profile-handoff',{recursive:true});
 for(const width of [320,390,768,1440]){
  const {page,state,openProfile}=await setup(width);await openProfile();
  const context=page.getByRole('status',{name:'Linked deal context',exact:true});await context.getByText(/Recipient United/).waitFor();
  assert.equal(await page.getByRole('heading',{name:'Example Player',exact:true}).evaluate(node=>node===document.activeElement),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(width===390)await page.screenshot({path:'/tmp/redream-platform-programme/deal-profile-handoff/02-linked-player-profile.png'});
  const shareOpen=page.getByRole('button',{name:'Share Player Profile',exact:true});await shareOpen.click();
  const share=page.getByRole('dialog',{name:'Share Player Profile',exact:true});await share.waitFor();
  assert.equal(await share.getByLabel('Club',{exact:true}).inputValue(),club);
  assert.equal(await share.getByLabel('Existing deal or opportunity',{exact:true}).inputValue(),deal,'Exact deal is usable even when omitted from the profile summary');
  assert.ok(await share.evaluate(node=>node.getBoundingClientRect().left>=0&&node.getBoundingClientRect().right<=innerWidth+1&&node.scrollWidth<=node.clientWidth+1));
  if(width===390)await page.screenshot({path:'/tmp/redream-platform-programme/deal-profile-handoff/03-exact-club-share.png'});
  assert.equal(state.shares.length,0,'No link, publication or send is created by opening a profile or composer');
  await share.getByLabel('Club-specific note',{exact:true}).fill('Please review the recorded football dossier.');
  await share.getByRole('button',{name:'Create club share',exact:true}).click();await share.getByText('Club share ready.',{exact:true}).waitFor();
  assert.equal(state.shares.length,1);assert.equal(state.shares[0].player_id,player);assert.equal(state.shares[0].deal_room_id,deal);assert.equal(state.shares[0].organisation_id,club);
  assert.equal(JSON.stringify(state.shares).includes('Internal-only sentinel'),false);
  await share.getByRole('button',{name:'Set follow-up',exact:true}).click();
  const action=page.getByRole('dialog',{name:'Example Player → Recipient United',exact:true});await action.getByLabel('Next action',{exact:true}).waitFor();
  assert.equal(state.executes,0,'Preparation creates no task');
  await action.getByLabel('Next action',{exact:true}).fill('Call the sporting director');await action.getByLabel('When',{exact:true}).fill('2031-11-01T10:00');
  await action.getByRole('button',{name:'Continue to confirmation',exact:true}).click();await action.getByRole('button',{name:'Set follow-up',exact:true}).click();
  await action.getByRole('heading',{name:'Change saved.',exact:true}).waitFor();assert.equal(state.executes,1);assert.equal(state.followup,true);
  const undone=page.waitForResponse(response=>response.request().postDataJSON()?.action==='action_undo');await action.getByRole('button',{name:'Undo',exact:true}).click();await undone;
  assert.equal(state.undos,1);assert.equal(state.followup,false);
  await action.getByRole('button',{name:'Close action workspace',exact:true}).click();await action.waitFor({state:'hidden'});
  assert.equal(await shareOpen.evaluate(node=>node===document.activeElement),true,'Follow-up returns to the player profile');
  state.phase='overview';await page.getByRole('link',{name:'Back to deal',exact:true}).click();await page.getByRole('heading',{name:'Example Player to Recipient United',exact:true}).waitFor();
  await page.getByRole('button',{name:'Back',exact:true}).click();
  await page.locator('#opportunity-'+deal).waitFor();await page.waitForFunction(id=>document.getElementById(id)===document.activeElement,'opportunity-'+deal);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(state.errors,[]);
  if(width===390){await mkdir('/tmp/redream-platform-programme/deal-profile-handoff',{recursive:true});await page.screenshot({path:'/tmp/redream-platform-programme/deal-profile-handoff/01-returned-deal-list.png'});}
  await page.close();
 }
 for(const scenario of ['late','failed','mismatch','stale']){
  const {page,state,openProfile,release}=await setup(390,scenario);await openProfile();
  const shareOpen=page.getByRole('button',{name:'Share Player Profile',exact:true}),context=page.getByRole('status',{name:'Linked deal context',exact:true});
  if(scenario==='late'){
   await context.getByText('Loading linked deal...',{exact:true}).waitFor();assert.equal(await shareOpen.isEnabled(),false);assert.equal(state.contextReads,1);
   await page.getByRole('button',{name:'Preview Player Profile',exact:true}).click();const preview=page.getByRole('dialog',{name:'Player Profile preview',exact:true});await preview.waitFor();
   await release();await page.locator('[aria-label="Linked deal context"]').getByText(/Recipient United/).waitFor();assert.equal(await preview.isVisible(),true);assert.equal(await preview.evaluate(node=>node.contains(document.activeElement)),true,'Late context never steals preview focus');
   await page.keyboard.press('Escape');await preview.waitFor({state:'hidden'});
  }else if(scenario==='failed'){
   await context.getByRole('button',{name:'Retry deal context',exact:true}).waitFor();await shareOpen.click();const share=page.getByRole('dialog',{name:'Share Player Profile',exact:true});
   assert.equal(await share.getByLabel('Club',{exact:true}).inputValue(),'');await page.keyboard.press('Escape');await share.waitFor({state:'hidden'});
   state.failContext=false;await context.getByRole('button',{name:'Retry deal context',exact:true}).click();await context.getByText(/Recipient United/).waitFor();
  }else if(scenario==='mismatch'){
   await context.getByText(/unavailable for this player/).waitFor();assert.equal(await page.getByRole('link',{name:'Back to deal',exact:true}).count(),0);
  }else{
   await context.getByText('Loading linked deal...',{exact:true}).waitFor();
   await page.evaluate(id=>{const params=new URLSearchParams(location.search);params.set('source_deal',id);history.pushState(null,'',location.pathname+'?'+params);},otherDeal);
   await context.getByText(/Second Recipient FC/).waitFor();await release();assert.equal(await context.getByText(/Second Recipient FC/).count(),1);
  }
  await shareOpen.click();const share=page.getByRole('dialog',{name:'Share Player Profile',exact:true});await share.waitFor();
  assert.equal(await share.getByLabel('Club',{exact:true}).inputValue(),scenario==='mismatch'?'':scenario==='stale'?otherClub:club);
  assert.equal(state.shares.length,0);assert.equal(state.executes,0);
  if(scenario==='stale'){await page.keyboard.press('Escape');await share.waitFor({state:'hidden'});state.phase='overview';await page.getByRole('link',{name:'Back to deal',exact:true}).click();await page.getByRole('heading',{name:'Second recorded deal',exact:true}).waitFor();await page.getByRole('button',{name:'Back',exact:true}).click();await page.waitForFunction(()=>document.activeElement?.id==='workspace-view-heading');}
  assert.deepEqual(state.errors,[]);await page.close();
 }
 {
  const {page,state,openProfile}=await setup(390,'unowned');await openProfile();await page.getByRole('link',{name:'Back to deal',exact:true}).waitFor();
  await page.getByRole('button',{name:'Share Player Profile',exact:true}).click();const share=page.getByRole('dialog',{name:'Share Player Profile',exact:true});
  await share.getByRole('button',{name:'Create club share',exact:true}).click();await share.getByText('Club share ready.',{exact:true}).waitFor();await share.getByRole('button',{name:'Set follow-up',exact:true}).click();
  const action=page.getByRole('dialog',{name:'Example Player → Recipient United',exact:true});await action.getByLabel('Responsible staff member',{exact:true}).selectOption(owner);
  await action.getByRole('button',{name:'Continue to confirmation',exact:true}).click();await action.getByRole('button',{name:'Assign owner',exact:true}).click();await action.getByRole('heading',{name:'Owner assigned.',exact:true}).waitFor();
  await page.waitForFunction(()=>document.activeElement?.textContent==='Owner assigned.');
  assert.equal(await action.getByRole('heading',{name:'Owner assigned.',exact:true}).evaluate(node=>{const r=node.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===node;}),true,'Mobile actions must not cover the confirmation');
  await page.screenshot({path:'/tmp/redream-platform-programme/deal-profile-handoff/04-owner-assigned-next-step.png'});
  assert.equal(state.executes,1);assert.equal(state.followup,false,'Owner assignment never claims the reminder is created');const prepared=state.prepares;
  await action.getByRole('button',{name:'Set follow-up',exact:true}).click();await action.getByLabel('Next action',{exact:true}).waitFor();assert.equal(state.prepares,prepared+1);assert.equal(await action.getByLabel('Next action',{exact:true}).inputValue(),'');
  await action.getByLabel('Next action',{exact:true}).fill('Agree the next recruitment call');await action.getByLabel('When',{exact:true}).fill('2031-11-01T10:00');
  await action.getByRole('button',{name:'Continue to confirmation',exact:true}).click();await action.getByRole('button',{name:'Set follow-up',exact:true}).click();
  await action.getByRole('heading',{name:'Change saved.',exact:true}).waitFor();assert.equal(state.executes,2);assert.equal(state.followup,true);
  assert.deepEqual(state.errors,[]);await page.close();
 }
 {
  const {page,state,visit}=await setup(390,'refresh');await visit();await page.locator('#opportunity-'+deal).click();await page.getByRole('button',{name:'Fix deal control',exact:true}).click();
  const action=page.getByRole('dialog');await action.getByLabel('Next action',{exact:true}).fill('Review the club response');await action.getByLabel('When',{exact:true}).fill('2031-11-01T10:00');
  await action.getByRole('button',{name:'Continue to confirmation',exact:true}).click();state.failRefresh=true;await action.getByRole('button',{name:'Confirm action',exact:true}).click();
  await action.getByRole('button',{name:'Reload latest view',exact:true}).waitFor();assert.equal(state.executes,1);assert.equal(state.followup,true);
  state.failRefresh=false;await action.getByRole('button',{name:'Reload latest view',exact:true}).click();await action.getByRole('button',{name:'Reload latest view',exact:true}).waitFor({state:'hidden'});assert.equal(state.executes,1,'A failed parent refresh never repeats the saved write');assert.deepEqual(state.errors,[]);await page.close();
 }
 {
  const {page,state,openProfile}=await setup(390);await openProfile();await page.getByRole('link',{name:'Back to deal',exact:true}).waitFor();
  await page.getByRole('button',{name:'Share Player Profile',exact:true}).click();const share=page.getByRole('dialog',{name:'Share Player Profile',exact:true});
  await share.getByLabel('Club-specific note',{exact:true}).fill('Retain my draft');
  await page.evaluate(id=>{const params=new URLSearchParams(location.search);params.set('source_deal',id);history.pushState(null,'',location.pathname+'?'+params);},otherDeal);
  await share.getByText('The linked deal changed or could not load. Choose the club and deal again.',{exact:true}).waitFor();
  assert.equal(await share.getByRole('button',{name:'Create club share',exact:true}).isEnabled(),false);assert.equal(await share.getByLabel('Club-specific note',{exact:true}).inputValue(),'Retain my draft');assert.equal(state.shares.length,0);
  await share.getByLabel('Club',{exact:true}).selectOption(otherClub);assert.equal(await share.getByLabel('Existing deal or opportunity',{exact:true}).inputValue(),'');assert.equal(await share.getByRole('button',{name:'Create club share',exact:true}).isEnabled(),true);assert.deepEqual(state.errors,[]);await page.close();
 }
 {
  const {page,state,openProfile}=await setup(390,'clipboard');await openProfile();await page.getByRole('link',{name:'Back to deal',exact:true}).waitFor();await page.getByRole('button',{name:'Share Player Profile',exact:true}).click();
  const share=page.getByRole('dialog',{name:'Share Player Profile',exact:true});await share.getByRole('button',{name:'Create club share',exact:true}).click();await share.getByText('Club share ready.',{exact:true}).waitFor();
  await page.waitForFunction(()=>{const button=Array.from(document.querySelectorAll('[role=dialog] button')).find(node=>node.textContent==='Done');return button&&!button.disabled;});
  assert.equal(await page.evaluate(()=>window.qaClipboardCalls||0),0,'Creating a link must never wait for optional clipboard access');assert.equal(state.shares.length,1);await share.getByRole('button',{name:'Done',exact:true}).click();await share.waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'Share Player Profile',exact:true}).isEnabled(),true);assert.deepEqual(state.errors,[]);await page.close();
 }
 {
  const {page,state,visit}=await setup(390,'restricted');state.phase='profile';await visit('view=players&player='+player+'&profile=1&source_deal='+deal);
  await page.getByRole('heading',{name:'Assigned player profile',exact:true}).waitFor();assert.equal(state.contextReads,0);assert.equal(await page.getByRole('button',{name:'Share Player Profile',exact:true}).count(),0);assert.equal(await page.getByText('Recipient United',{exact:true}).count(),0);assert.deepEqual(state.errors,[]);await page.close();
 }

 }
 const evidence='/tmp/redream-platform-programme/profile-secondary-recovery';await mkdir(evidence,{recursive:true});
 for(const width of [390,320,768,1440]){
  const {page,state,openProfile,releaseAux}=await setup(width,'detail-late');await openProfile();
  if(process.env.PROFILE_READ_BEFORE&&width===390)await page.screenshot({path:evidence+'/01-pending-before.png'});
  assert.equal(await page.getByText('Add the agency support email',{exact:true}).count(),0,'Pending agency data must not become a missing-data requirement');
  const status=page.getByRole('status',{name:'Profile details',exact:true});await status.getByText('Checking agency details and profile activity...',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Preview Player Profile',exact:true}).isEnabled(),false);
  assert.equal(state.coreReads,1);assert.equal(state.auxReads.player_profile_detail,1);assert.equal(state.shares.length,0);
  if(width===390)await page.screenshot({path:evidence+'/02-pending-after.png'});
  await releaseAux('player_profile_detail');await page.getByRole('button',{name:'Publish Player Profile',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Publish Player Profile',exact:true}).isEnabled(),true);
  assert.equal(await page.getByText('Add the agency support email',{exact:true}).count(),0);assert.equal(state.coreReads,1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(state.errors,[]);await page.close();
 }
 {
  const {page,state,openProfile}=await setup(390,'detail-failed');await openProfile();
  const error=page.getByRole('alert',{name:'Profile details',exact:true});await error.getByRole('button',{name:'Retry profile details',exact:true}).waitFor();
  assert.equal(await page.getByText('Add the agency support email',{exact:true}).count(),0);assert.equal(state.auxReads.player_profile_detail,1);
  await page.screenshot({path:evidence+'/03-profile-details-retry.png'});await page.getByRole('button',{name:'Edit profile',exact:true}).click();const editor=page.getByRole('dialog',{name:'Edit Player Profile',exact:true});
  await editor.getByLabel('Profile headline',{exact:true}).fill('Preserved drafted introduction');state.auxFail.player_profile_detail=false;
  await editor.getByRole('button',{name:'Retry profile details',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('button[aria-label="Preview Player Profile"]')?.disabled);
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Profile headline');assert.equal(await editor.getByLabel('Profile headline',{exact:true}).inputValue(),'Preserved drafted introduction');assert.equal(await editor.getByRole('button',{name:'Save and update live profile',exact:true}).isEnabled(),true);
  assert.equal(state.auxReads.player_profile_detail,2);assert.equal(state.coreReads,1,'Retry details never reloads or resets the core dossier');assert.deepEqual(state.errors,[]);await page.close();
 }
 {
  const {page,state,openProfile,releaseAux}=await setup(390,'detail-late');await openProfile();await page.getByRole('status',{name:'Profile details',exact:true}).waitFor();
  await releaseAux('player_profile_detail',value=>({...value,detail:{...value.detail,branding:{}}}));await page.getByRole('link',{name:'Add support email',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Publish Player Profile',exact:true}).count(),0);assert.deepEqual(state.errors,[]);await page.close();
 }
 {
  const {page,state,openProfile}=await setup(390,'detail-malformed');await openProfile();await page.getByRole('alert',{name:'Profile details',exact:true}).waitFor();assert.equal(await page.getByText('Add the agency support email',{exact:true}).count(),0);assert.equal(state.coreReads,1);assert.deepEqual(state.errors,[]);await page.close();
 }
 {
  const {page,state,openProfile,releaseAux}=await setup(390,'detail-share');state.auxHold.player_profile_detail=true;await openProfile();await page.getByRole('button',{name:'Share Player Profile',exact:true}).click();
  const share=page.getByRole('dialog',{name:'Share Player Profile',exact:true});const note=share.getByLabel('Club-specific note',{exact:true});await note.fill('Keep this introduction while agency details load');
  await releaseAux('player_profile_detail');await page.waitForFunction(()=>!document.querySelector('button[aria-label="Preview Player Profile"]')?.disabled);
  assert.equal(await note.inputValue(),'Keep this introduction while agency details load');assert.equal(await note.evaluate(node=>node===document.activeElement),true);assert.equal(await share.getByLabel('Club',{exact:true}).inputValue(),club);assert.equal(state.shares.length,0);assert.deepEqual(state.errors,[]);await page.close();
 }
 {
  const {page,state,openProfile}=await setup(390,'malformed-lists');await openProfile();await page.getByRole('button',{name:'Share Player Profile',exact:true}).click();const share=page.getByRole('dialog',{name:'Share Player Profile',exact:true});
  await share.getByRole('button',{name:'Retry saved profiles',exact:true}).waitFor();await share.getByRole('button',{name:'Retry club list',exact:true}).waitFor();assert.equal(await share.getByText('Prepare a club profile first to share a tailored version.',{exact:true}).count(),0);assert.equal(state.auxReads.create_options,1);assert.equal(state.auxReads.player_profile_versions,1);assert.deepEqual(state.errors,[]);await page.close();
 }
 for(const outcome of ['available','unlisted']){
  const {page,state,openProfile}=await setup(390,'version-choice');await openProfile();
  await page.locator('[class*="profileTools"] > summary').click();await page.getByRole('button',{name:'Prepare for a club',exact:true}).click();
  const preparation=page.locator('#player-profile-prepare');await preparation.getByLabel('Club',{exact:true}).selectOption(club);
  await preparation.getByRole('button',{name:'Prepare for club',exact:true}).click();await preparation.getByRole('button',{name:'Save profile',exact:true}).waitFor();
  await preparation.getByRole('button',{name:'Save profile',exact:true}).click();await preparation.getByRole('button',{name:'Share with club',exact:true}).click();
  const share=page.getByRole('dialog',{name:'Share Player Profile',exact:true});await share.getByRole('button',{name:'Retry saved profiles',exact:true}).waitFor();
  assert.equal(await share.getByLabel('Profile to share',{exact:true}).inputValue(),versionId,'A failed read never silently downgrades the explicitly saved club version');
  assert.equal(await share.getByRole('button',{name:'Create club share',exact:true}).isEnabled(),false);assert.equal(state.versionSaves,1);
  await share.getByLabel('Club-specific note',{exact:true}).fill('Retain this club introduction');state.auxFail.player_profile_versions=false;
  state.versions=outcome==='available'?[{id:versionId,status:'approved',organisation_id:club,headline:'Approved fixture profile',presentation:{headline:'Approved fixture profile'}}]:[];
  const reads=state.auxReads.player_profile_versions;await share.getByRole('button',{name:'Retry saved profiles',exact:true}).click();await share.getByRole('button',{name:'Retry saved profiles',exact:true}).waitFor({state:'hidden'});await page.waitForFunction(()=>!document.querySelector('[role="dialog"] select[aria-label="Profile to share"]')?.disabled);
  await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Profile to share');assert.equal(state.auxReads.player_profile_versions,reads+1);assert.equal(await share.getByLabel('Profile to share',{exact:true}).inputValue(),versionId);assert.equal(await share.getByLabel('Club-specific note',{exact:true}).inputValue(),'Retain this club introduction');assert.equal(await share.getByLabel('Club',{exact:true}).inputValue(),club);
  if(outcome==='unlisted'){
   assert.equal(await share.getByRole('button',{name:'Create club share',exact:true}).isEnabled(),false);await share.getByLabel('Profile to share',{exact:true}).selectOption('');
  }
  assert.equal(await share.getByRole('button',{name:'Create club share',exact:true}).isEnabled(),true);assert.equal(state.shares.length,0);assert.deepEqual(state.errors,[]);await page.close();
 }
 {
  const {page,state,openProfile,releaseAux}=await setup(390,'aux-hung');await page.clock.install();await openProfile();
  await page.getByRole('link',{name:'Back to deal',exact:true}).waitFor();await page.getByRole('button',{name:'Share Player Profile',exact:true}).click();
  const share=page.getByRole('dialog',{name:'Share Player Profile',exact:true});await share.getByLabel('Club-specific note',{exact:true}).fill('Retain the pending introduction');
  await page.waitForFunction(()=>document.querySelector('[aria-label="Profile to share"]')?.disabled);await page.clock.runFor(12_050);
  await share.getByRole('button',{name:'Retry saved profiles',exact:true}).waitFor();await share.getByRole('button',{name:'Retry club list',exact:true}).waitFor();
  assert.equal(state.auxReads.create_options,1);assert.equal(state.auxReads.player_profile_versions,1);assert.equal(state.auxReads.player_profile_detail,1);
  assert.equal(await share.getByRole('button',{name:'Create club share',exact:true}).isEnabled(),true,'Known exact club/general sharing stays usable after optional reads fail');
  await page.screenshot({path:evidence+'/04-share-read-recovery.png'});await releaseAux('create_options');await releaseAux('player_profile_versions');
  assert.equal(await share.getByRole('button',{name:'Retry saved profiles',exact:true}).count(),1,'Late success cannot erase a settled error');
  await share.getByRole('button',{name:'Retry saved profiles',exact:true}).click();await share.getByRole('button',{name:'Retry saved profiles',exact:true}).waitFor({state:'hidden'});
  await share.getByRole('button',{name:'Retry club list',exact:true}).click();await share.getByRole('button',{name:'Retry club list',exact:true}).waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('[role="dialog"] select[aria-label="Club"]')?.getAttribute('aria-busy')==='false');
  assert.equal(await share.getByLabel('Club-specific note',{exact:true}).inputValue(),'Retain the pending introduction');assert.equal(await share.getByLabel('Club',{exact:true}).inputValue(),club);
  await share.getByRole('button',{name:'Cancel',exact:true}).click();const detailError=page.getByRole('alert',{name:'Profile details',exact:true});await detailError.waitFor();
  await releaseAux('player_profile_detail');await detailError.getByRole('button',{name:'Retry profile details',exact:true}).click();await detailError.waitFor({state:'hidden'});await page.waitForFunction(()=>!document.querySelector('button[aria-label="Preview Player Profile"]')?.disabled);assert.equal(state.coreReads,1);assert.deepEqual(state.errors,[]);await page.close();
 }
 {
  const {page,state,openProfile,releaseAux}=await setup(390,'read-stale');await openProfile();await page.getByRole('link',{name:'Back to deal',exact:true}).waitFor();await page.getByRole('button',{name:'Share Player Profile',exact:true}).click();
  await page.getByRole('dialog',{name:'Share Player Profile',exact:true}).waitFor();state.auxHold={};state.clubList=[{id:otherClub,name:'Second Recipient FC'}];
  state.versions=[{id:otherDeal,status:'approved',organisation_id:otherClub,headline:'Second player version'}];
  await page.evaluate(id=>{const params=new URLSearchParams(location.search);params.set('player',id);params.delete('source_deal');history.pushState(null,'',location.pathname+'?'+params);},secondPlayer);
  await page.getByRole('heading',{name:'Second Player',exact:true}).waitFor();await page.getByRole('button',{name:'Share Player Profile',exact:true}).click();const share=page.getByRole('dialog',{name:'Share Player Profile',exact:true});
  await share.getByLabel('Club',{exact:true}).selectOption(otherClub);await share.getByLabel('Club-specific note',{exact:true}).fill('Second player introduction');
  await releaseAux('player_profile_detail',value=>({...value,detail:{...value.detail,branding:{display_name:'Stale agency',support_email:null}}}));await releaseAux('player_profile_versions');await releaseAux('create_options');
  assert.equal(await share.getByLabel('Club',{exact:true}).inputValue(),otherClub);assert.equal(await share.getByLabel('Club-specific note',{exact:true}).inputValue(),'Second player introduction');assert.equal(await share.getByRole('option',{name:'Recipient United',exact:true}).count(),0);assert.equal(await share.getByRole('option',{name:'Second player version',exact:true}).count(),1);assert.equal(await page.getByText('Add the agency support email',{exact:true}).count(),0);assert.equal(state.shares.length,0);assert.deepEqual(state.errors,[]);await page.close();
 }
 console.log('Profile read recovery passed: four widths, source readiness, explicit retry, saved-version retention, bounded hung reads, late results and player isolation.');
 if(!process.env.PROFILE_READ_RECOVERY_ONLY)console.log('Deal/profile handoff passed: four widths, exact omitted-record context, private share approval, owned/unowned follow-up and Undo, late/failure/mismatch/stale/role boundaries, parent refresh recovery.');
}finally{await browser.close();}
