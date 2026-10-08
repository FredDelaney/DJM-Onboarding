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
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Europe/Rome'});
  if(mode!=='signed-out')await context.addInitScript(session=>{if(location.hostname==='127.0.0.1')localStorage.setItem('sb-example-auth-token',JSON.stringify(session));},mode==='session-failed'?{...session,expires_at:Math.floor(Date.now()/1000)-3600}:session);
  const state={mode,agencyCalls:0,playerCalls:0,secondaryCalls:0,writes:0,checkin:null,savedNames:[],submittedWeeks:[],privateWrites:0,videoAdds:[],videoDeletes:[],videoRows:new Map(),videoDeleted:false,photoUploads:[],photoAttaches:[],hasPhoto:mode.startsWith('photo'),photoPath:user.id+'/existing.png',releaseMedia:null,inboxReads:0,requestInserts:[],requestUpdates:[],requestRows:new Map(),requestNotifications:0,requestLookups:[],contextReads:0,releaseContext:null,completionResponses:0};
  if(mode.startsWith('inbox')){
   state.requestRows.set('agency-action',{id:'agency-action',player_id:'owned-player',title:'Confirm your availability',message:'Reply to your agency',request_type:'action',status:'open',player_reply:null,created_by:'staff',created_at:'2026-10-07T12:00:00Z',completed_at:null});
   state.requestRows.set('internal-signal',{id:'internal-signal',player_id:'owned-player',title:'Internal agency signal',request_type:'signal',status:'open'});
  }
  const holdMedia=()=>new Promise(resolve=>{state.releaseMedia=resolve;});
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
   } else if(path.includes('/rest/v1/profiles')){if(state.mode==='inbox-refresh-hung'&&state.requestUpdates.length){state.contextReads++;await new Promise(resolve=>{state.releaseContext=resolve;});status=500;data={message:'Profile temporarily unavailable'};}else if(state.mode==='profile-failed'||(state.mode==='inbox-refresh-failed'&&state.requestUpdates.length)){status=500;data={message:'Profile temporarily unavailable'};}else data={id:user.id,full_name:'Fixture Player'};}
   else if(path.includes('/rest/v1/players')&&route.request().method()==='PATCH'&&route.request().postDataJSON().profile_photo_path){
    state.photoAttaches.push(route.request().postDataJSON().profile_photo_path);
    assert.equal(new URL(route.request().url()).searchParams.get('id'),'eq.owned-player');
    if(state.mode==='photo-attach-network'){await route.abort('failed');return;}
    if(state.mode==='photo-attach-hung')await holdMedia();
    if(state.mode==='photo-attach-failed'){status=403;data={code:'42501',message:'Photo attach denied'};}
    else if(state.mode==='photo-attach-zero'&&route.request().headers().accept.includes('vnd.pgrst.object')){status=406;data={code:'PGRST116',message:'No rows returned'};}
    else if(state.mode==='photo-attach-zero'){status=204;data=null;}
    else {data={id:'owned-player'};state.photoPath=route.request().postDataJSON().profile_photo_path;}
   }
   else if(path.includes('/rest/v1/players')&&route.request().method()==='PATCH'){
    state.writes++;state.savedNames.push(route.request().postDataJSON().first_name);
    assert.equal(new URL(route.request().url()).searchParams.get('id'),'eq.owned-player');
    if(state.mode==='save-network'){await route.abort('failed');return;}
    if(state.mode==='save-delayed')await new Promise(resolve=>setTimeout(resolve,1000));
    if(state.mode==='save-zero-failed'&&route.request().headers().accept.includes('vnd.pgrst.object')){status=406;data={code:'PGRST116',message:'No rows returned',details:'The result contains 0 rows',hint:null};}
    else if(state.mode==='save-zero-failed'){status=204;data=null;}
    else if(state.mode==='save-failed'){status=500;data={code:'XX000',message:'Save failed'};}
    else if(state.mode==='save-hung'){await new Promise(resolve=>setTimeout(resolve,20000));data={id:'owned-player'};}
    else data={id:'owned-player'};
   }
   else if(path.includes('/rest/v1/weekly_checkins')&&route.request().method()==='POST'){
    state.writes++;const body=route.request().postDataJSON();state.submittedWeeks.push(body.week_start);
    assert.equal(body.player_id,'owned-player');assert.equal(typeof body.week_start,'string');
    assert.equal(new URL(route.request().url()).searchParams.get('on_conflict'),'player_id,week_start');
    assert.ok(route.request().headers().prefer.includes('resolution=merge-duplicates'));
    if(state.mode==='submit-network'){await route.abort('failed');return;}
    if(state.mode==='submit-delayed')await new Promise(resolve=>setTimeout(resolve,1000));
    if(state.mode==='submit-failed'){status=500;data={code:'XX000',message:'Submit failed'};}
    else if(state.mode==='submit-hung'){await new Promise(resolve=>setTimeout(resolve,20000));state.checkin=body;data={id:'checkin'};}
    else {state.checkin=body;data={id:'checkin'};}
   }
   else if(path.includes('/rest/v1/resources')){
    assert.equal(new URL(route.request().url()).searchParams.get('tenant_id'),'eq.tenant');
    assert.equal(new URL(route.request().url()).searchParams.get('published'),'eq.true');
   }
   else if(path.includes('/rest/v1/career_entries')){
    if(state.mode==='career-failed'){status=500;data={message:'Career unavailable'};}
    else if(state.mode==='career-hung'){await new Promise(resolve=>setTimeout(resolve,15000));data=[];}
    else data=[{id:'career',club_name:'Fixture career club',start_date:'2025-01-01'}];
   }
   else if(path.includes('/rest/v1/player_videos')&&route.request().method()==='POST'){
    const body=route.request().postDataJSON();state.videoAdds.push({body,url:route.request().url(),prefer:route.request().headers().prefer});
    assert.equal(body.player_id,'owned-player');
    if(state.mode==='video-add-network'){await route.abort('failed');return;}
    if(state.mode==='video-add-failed'){status=403;data={code:'42501',message:'Video denied'};}
    else {data={...body,id:body.id||'generated-'+state.videoAdds.length};state.videoRows.set(data.id,data);if(state.mode==='video-add-hung')await holdMedia();}
   }
   else if(path.includes('/rest/v1/player_videos')&&route.request().method()==='DELETE'){
    state.videoDeletes.push(route.request().url());
    if(state.mode==='video-delete-network'){await route.abort('failed');return;}
    if(state.mode==='video-delete-failed'){status=403;data={code:'42501',message:'Remove denied'};}
    else if(state.mode==='video-delete-zero')data=[];
    else {data=state.videoDeleted?[]:[{id:'video'}];state.videoDeleted=true;if(state.mode==='video-delete-hung')await holdMedia();}
   }
   else if(path.includes('/rest/v1/player_videos')){
    const videoId=new URL(route.request().url()).searchParams.get('id');
    if(videoId)data=state.videoDeleted?null:{id:'video',title:'Fixture highlight'};
    else if(state.mode==='media-failed'){status=500;data={message:'Videos unavailable'};}
    else if(state.mode==='media-hung'){await new Promise(resolve=>setTimeout(resolve,15000));data=[];}
    else data=[...(state.videoDeleted?[]:[{id:'video',title:'Fixture highlight',url:'https://example.test/video',video_type:'highlight',featured:true}]),...state.videoRows.values()];
   }
   else if(path.includes('/rest/v1/players')){
    state.playerCalls++;
    if(state.mode==='player-failed'){status=503;data={message:'Players unavailable'};}
    else if(state.mode==='no-player')data=[];
    else data=[{id:'owned-player',tenant_id:'tenant',user_id:user.id,first_name:'Fixture',last_name:'Player',preferred_name:'Fixture',nationalities:[],secondary_positions:[],primary_position:'CM',onboarding_status:'verified',...(state.hasPhoto?{profile_photo_path:state.photoPath}:{})}];
   } else if(path.includes('/rest/v1/player_private')){
    if(route.request().method()==='POST'){
     state.privateWrites++;
     assert.equal(route.request().postDataJSON().player_id,'owned-player');
     if(state.mode==='save-private-failed'){status=500;data={code:'XX000',message:'Private save failed'};}
     else if(state.mode==='save-private-hung'){await new Promise(resolve=>setTimeout(resolve,20000));data={player_id:'owned-player'};}
     else data={player_id:'owned-player'};
    }
    else if(state.mode==='private-failed'){status=500;data={message:'Private details unavailable'};}
    else data=null;
   } else if(path.includes('/rest/v1/player_requests')&&route.request().method()==='POST'){
    const body=route.request().postDataJSON();state.requestInserts.push(body);
    assert.equal(body.player_id,'owned-player');assert.equal(body.request_type,'message');assert.equal(body.created_by,null);
    if(state.mode==='inbox-send-failed'){status=403;data={code:'42501',message:'Note denied'};}
    else if(body.id&&state.requestRows.has(body.id)){status=409;data={code:'23505',message:'Duplicate request ID'};if(state.mode==='inbox-conflict-hung')await holdMedia();}
    else {
     data={...body,id:body.id||'generated-'+state.requestInserts.length,created_at:'2026-10-08T05:00:00Z'};state.requestRows.set(data.id,data);state.requestNotifications++;
     if(state.mode==='inbox-send-network'){await route.abort('failed');return;}
     if(state.mode==='inbox-send-hung')await holdMedia();
     if(state.mode==='inbox-send-zero')data=null;
    }
   } else if(path.includes('/rest/v1/player_requests')&&route.request().method()==='PATCH'){
    const body=route.request().postDataJSON(),query=new URL(route.request().url()).searchParams;state.requestUpdates.push({body,url:route.request().url()});
    if(state.mode==='inbox-complete-before-commit'&&state.requestUpdates.length===1)await holdMedia();
    if(state.mode==='inbox-complete-network'){await route.abort('failed');return;}
    if(state.mode==='inbox-complete-failed'){status=403;data={code:'42501',message:'Completion denied'};}
    else {
     const current=state.requestRows.get(query.get('id')?.replace('eq.',''));
     const noMatch=state.mode==='inbox-complete-zero'||(query.get('status')==='eq.open'&&current?.status!=='open');
     if(noMatch){if(route.request().headers().accept?.includes('vnd.pgrst.object')){status=406;data={code:'PGRST116',message:'No rows returned',details:'The result contains 0 rows',hint:null};}else{status=204;data=null;}}
     else if(current?.status==='completed'&&body.completed_at&&body.completed_at!==current.completed_at){status=400;data={code:'P0001',message:'Completion time is managed by the player workspace'};}
     else {
      data={...current,...body,completed_at:current?.completed_at||'2026-10-08T05:08:00Z'};
      if(state.mode==='inbox-complete-mismatch')data={...data,player_reply:'Stale reply'};
      state.requestRows.set(data.id,data);if(state.mode==='inbox-complete-hung')await holdMedia();
     }
    }
    state.completionResponses++;
   } else if(path.includes('/rest/v1/player_requests')){
    const query=new URL(route.request().url()).searchParams,id=query.get('id');
    if(id){state.requestLookups.push(route.request().url());assert.equal(query.get('player_id'),'eq.owned-player');data=state.requestRows.get(id.replace('eq.',''))||null;if(state.mode==='inbox-note-lookup-failed'){status=500;data={code:'XX000',message:'Lookup unavailable'};}}
    else {data=[...state.requestRows.values()];if(query.has('status'))data=data.filter(row=>row.status!=='completed');
     else {state.inboxReads++;if(state.mode==='inbox-read-failed'){status=500;data={code:'XX000',message:'Inbox unavailable'};}else if(state.mode==='inbox-read-network'){await route.abort('failed');return;}else if(state.mode==='inbox-read-hung'){data=data.map(row=>row.id==='agency-action'?{...row,title:'Stale agency request'}:row);await holdMedia();}}
     if(state.mode==='requests-failed'){status=500;data={message:'Requests unavailable'};}
    }
   }
   else if(path.includes('/rest/v1/weekly_checkins')&&state.mode==='checkins-failed'){status=500;data={message:'Check-ins unavailable'};}
   else if(path.includes('/rest/v1/player_public_profiles')){
    state.secondaryCalls++;
    if(state.mode==='cv-failed'){status=500;data={message:'Presentation unavailable'};}
    else if(state.mode==='cv-hung'){await new Promise(resolve=>setTimeout(resolve,15000));data=null;}
    else if(state.mode==='secondary-healthy')data={id:'presentation',player_id:'owned-player',display_name:'Fixture CV',published:false,primary_position:'CM',nationalities:[],career_history:[],videos:[]};
    else data=null;
   } else if(path.includes('/rest/v1/player_documents')){
    state.secondaryCalls++;
    if(route.request().method()==='POST'){
     const body=route.request().postDataJSON();assert.equal(body.player_id,'owned-player');assert.equal(body.club_shareable,false);assert.equal(body.bucket_id,'player-private');
     data={...body,id:'new-document'};
    }else if(state.mode==='documents-failed'){status=500;data={message:'Files unavailable'};}
    else if(state.mode==='documents-hung'){await new Promise(resolve=>setTimeout(resolve,15000));data=[];}
    else if(state.mode==='secondary-healthy')data=[{id:'document',title:'Existing fixture document',document_type:'passport',bucket_id:'player-private',object_path:'fixture/document.pdf'}];
   } else if(path.includes('/rest/v1/player_agreements')){
    state.secondaryCalls++;
    assert.equal(new URL(route.request().url()).searchParams.get('visible_to_player'),'eq.true');
    if(state.mode==='agreements-failed'){status=500;data={message:'Agreements unavailable'};}
   } else if(path.includes('/storage/v1/object/public/player-public/')){
    await route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')});return;
   } else if(path.includes('/storage/v1/object/player-public/')){
    const objectPath=decodeURIComponent(path.split('/storage/v1/object/player-public/')[1]);state.photoUploads.push(objectPath);
    assert.ok(objectPath.startsWith(user.id+'/'),'Photo path escaped the current user');
    if(state.mode==='photo-upload-network'){await route.abort('failed');return;}
    if(state.mode==='photo-upload-hung')await holdMedia();
    if(state.mode==='photo-upload-failed'){status=400;data={statusCode:'400',error:'InvalidMimeType',message:'Upload rejected'};}
    else data={Id:'photo-object',Key:'player-public/'+objectPath};
   } else if(path.includes('/storage/v1/object/'))data={Key:'player-private/fixture/upload.pdf'};
   else if(path.includes('/functions/'))data={};
   try{await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});}catch{}
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  return {context,page,state};
 };
 const visit=async(page,path)=>{
  for(let i=0;i<60;i++){try{await page.goto(root+'/workspace/qa-player-entry?view='+encodeURIComponent(path.slice(1)));return;}catch(e){if(i===59)throw e;await page.waitForTimeout(250);}}
 };
 const waitForMedia=async(list)=>{for(let i=0;i<200&&!list.length;i++)await new Promise(resolve=>setTimeout(resolve,25));assert.ok(list.length,'Media request did not start');};
 const inboxCase=process.env.PLAYER_INBOX_CASE;
 if(!process.env.PLAYER_MEDIA_ONLY&&!process.env.PLAYER_REVIEW_ONLY&&!process.env.PLAYER_WRITE_ONLY&&!process.env.PLAYER_NETWORK_ONLY&&!process.env.PLAYER_SECONDARY_ONLY){
 for(const mode of ['inbox-read-hung','inbox-read-failed','inbox-read-network'].filter(mode=>!inboxCase||inboxCase===mode)){
  const {context,page,state}=await setup(mode);await page.clock.install();await visit(page,'/inbox');
  for(let i=0;i<200&&!state.inboxReads;i++)await new Promise(resolve=>setTimeout(resolve,25));
  assert.ok(state.inboxReads,'Inbox read did not start');
  assert.equal(await page.getByText('You’re all clear.',{exact:true}).count(),0,'Inbox claims all clear without a confirmed read');
  if(mode==='inbox-read-hung'||mode==='inbox-read-network'){await page.getByRole('status').filter({hasText:'Loading your agency updates'}).waitFor({timeout:4000});await page.clock.runFor(12500);}
  await page.getByRole('alert').filter({hasText:'agency updates'}).waitFor({timeout:4000});
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1),'Inbox recovery overflow '+width);
   const box=await page.getByRole('button',{name:'Try again',exact:true}).boundingBox();assert.ok(box&&box.height>=44,'Inbox retry touch target too small');
  }
  state.mode='inbox-healthy';await page.getByRole('button',{name:'Try again',exact:true}).click();
  await page.getByRole('heading',{name:'Confirm your availability',exact:true}).waitFor();
  assert.equal(await page.getByText('Internal agency signal',{exact:true}).count(),0,'Inbox exposed an internal signal');
  if(state.releaseMedia){const response=page.waitForResponse(response=>response.url().includes('/rest/v1/player_requests')&&!new URL(response.url()).searchParams.has('status'));state.releaseMedia();await response;await page.clock.runFor(1);}
  assert.equal(await page.getByRole('heading',{name:'Confirm your availability',exact:true}).count(),1,'Late read replaced the recovered Inbox');
  assert.equal(await page.getByText('Stale agency request',{exact:true}).count(),0,'Late Inbox response exposed stale actions');
  await context.close();
 }
 for(const mode of ['inbox-send-hung','inbox-send-network','inbox-send-failed','inbox-send-zero'].filter(mode=>!inboxCase||inboxCase===mode)){
  const {context,page,state}=await setup(mode);await page.clock.install();await visit(page,'/inbox');await page.getByRole('heading',{name:'Confirm your availability',exact:true}).waitFor();
  await page.getByRole('button',{name:'Send a note',exact:true}).click();const input=page.getByPlaceholder('Type your note…');await input.fill('Keep my agency note');
  await page.getByRole('button',{name:'Send to your agency',exact:true}).click();await waitForMedia(state.requestInserts);
  if(mode.endsWith('hung')){assert.equal(await input.isDisabled(),true,'Inbox accepts unsent edits during a send');await page.clock.runFor(12500);}
  await page.getByRole('alert').filter({hasText:'note'}).waitFor({timeout:4000});
  assert.equal(await input.inputValue(),'Keep my agency note','Inbox recovery discarded the note');assert.equal(await input.isEnabled(),true);
  assert.equal(state.requestInserts.length,1,'Agency note was automatically retried');
  if(mode==='inbox-send-network'){
   state.mode='inbox-note-lookup-failed';await page.getByRole('button',{name:'Send to your agency',exact:true}).click();
   await page.getByRole('alert').filter({hasText:'note'}).waitFor();assert.equal(await input.inputValue(),'Keep my agency note','Failed conflict lookup discarded the note');
  }
  state.mode='inbox-healthy';await page.getByRole('button',{name:'Send to your agency',exact:true}).click();
  await page.getByText('Sent to your agency',{exact:true}).waitFor();assert.equal(await input.count(),0,'Confirmed send kept the composer open');
  assert.ok(state.requestInserts[0].id,'Agency note has no stable retry ID');
  for(const body of state.requestInserts)assert.equal(body.id,state.requestInserts[0].id,'Agency note retry changed the record ID');
  assert.equal([...state.requestRows.values()].filter(row=>row.request_type==='message').length,1,'Retry duplicated an agency note');
  assert.equal(state.requestNotifications,1,'Duplicate note queued another agency notification');
  state.releaseMedia?.();await context.close();
 }
 for(const mode of ['inbox-complete-hung','inbox-complete-network','inbox-complete-failed','inbox-complete-zero'].filter(mode=>!inboxCase||inboxCase===mode)){
  const {context,page,state}=await setup(mode);await page.clock.install();await visit(page,'/inbox');await page.getByRole('heading',{name:'Confirm your availability',exact:true}).waitFor();
  await page.getByRole('button',{name:'Open',exact:true}).click();const input=page.getByPlaceholder('Anything your agency should know?');await input.fill('Keep my availability reply');
  await page.getByRole('button',{name:'Done',exact:true}).click();await waitForMedia(state.requestUpdates);
  if(mode.endsWith('hung')){assert.equal(await input.isDisabled(),true,'Inbox accepts unsent edits during completion');await page.clock.runFor(12500);}
  await page.getByRole('alert').filter({hasText:'action'}).waitFor({timeout:4000});assert.equal(await input.inputValue(),'Keep my availability reply');
  assert.equal(await input.isEnabled(),true);assert.equal(state.requestUpdates.length,1,'Completion was automatically retried');
  await page.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('button',{name:'Open',exact:true}).click();
  assert.equal(await input.inputValue(),'Keep my availability reply','Closing the action lost an unconfirmed reply');
  state.mode='inbox-healthy';await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByText('Completed',{exact:true}).waitFor();
  assert.equal(state.requestUpdates.length,2);
  for(const {body,url} of state.requestUpdates){const query=new URL(url).searchParams;assert.equal(query.get('id'),'eq.agency-action');assert.equal(query.get('player_id'),'eq.owned-player');assert.equal(body.completed_at,undefined,'Client overwrote the database completion time');assert.equal(body.player_reply,'Keep my availability reply');}
  assert.equal(state.requestRows.get('agency-action').completed_at,'2026-10-08T05:08:00Z');
  state.releaseMedia?.();await context.close();
 }
 if(!inboxCase||inboxCase==='inbox-refresh-new-draft'){
  const {context,page,state}=await setup('inbox-healthy');await visit(page,'/inbox');await page.getByRole('heading',{name:'Confirm your availability',exact:true}).waitFor();
  await page.getByRole('button',{name:'Open',exact:true}).click();state.mode='inbox-refresh-hung';await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByText('Completed',{exact:true}).waitFor();
  for(let i=0;i<200&&!state.releaseContext;i++)await new Promise(resolve=>setTimeout(resolve,25));assert.ok(state.releaseContext,'Completion did not refresh the shared workspace');
  await page.getByRole('button',{name:'Send a note',exact:true}).click();const input=page.getByPlaceholder('Type your note…');await input.fill('A draft started during refresh');
  state.mode='inbox-send-network';await page.getByRole('button',{name:'Send to your agency',exact:true}).click();await page.getByRole('alert').filter({hasText:'note'}).waitFor();
  const response=page.waitForResponse(response=>response.url().includes('/rest/v1/profiles'));state.releaseContext();await response;
  await page.getByRole('button',{name:'Try again',exact:true}).waitFor();state.mode='inbox-healthy';await page.getByRole('button',{name:'Try again',exact:true}).click();
  await page.getByRole('heading',{name:'Your agency updates.',exact:true}).waitFor();assert.equal(await input.count(),1,'Context recovery discarded a newly started note');
  assert.equal(await input.inputValue(),'A draft started during refresh');await page.getByRole('button',{name:'Send to your agency',exact:true}).click();await page.getByText('Sent to your agency',{exact:true}).waitFor();
  assert.equal(state.requestInserts[0].id,state.requestInserts[1].id,'Context recovery discarded the pending note identity');assert.equal(state.requestNotifications,1);await context.close();
 }
 if(!inboxCase||inboxCase==='inbox-complete-before-commit'){
  const {context,page,state}=await setup('inbox-complete-before-commit');await page.clock.install();await visit(page,'/inbox');await page.getByRole('heading',{name:'Confirm your availability',exact:true}).waitFor();
  await page.getByRole('button',{name:'Open',exact:true}).click();const input=page.getByPlaceholder('Anything your agency should know?');await input.fill('Older unconfirmed reply');
  await page.getByRole('button',{name:'Done',exact:true}).click();await waitForMedia(state.requestUpdates);await page.clock.runFor(12500);await page.getByRole('alert').filter({hasText:'action'}).waitFor();
  const release=state.releaseMedia;await input.fill('Newest confirmed reply');state.mode='inbox-healthy';await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByText('Completed',{exact:true}).waitFor();
  assert.equal(state.requestRows.get('agency-action').player_reply,'Newest confirmed reply');
  release();for(let i=0;i<200&&state.completionResponses<2;i++)await new Promise(resolve=>setTimeout(resolve,25));assert.equal(state.completionResponses,2);
  assert.equal(state.requestRows.get('agency-action').player_reply,'Newest confirmed reply','An older timed-out completion overwrote a confirmed reply');
  for(const {url}of state.requestUpdates)assert.equal(new URL(url).searchParams.get('status'),'eq.open','Completion lacks an atomic status guard');
  await context.close();
 }
 for(const mode of ['inbox-complete-first-wins','inbox-complete-mismatch'].filter(mode=>!inboxCase||inboxCase===mode)){
  const {context,page,state}=await setup(mode==='inbox-complete-first-wins'?'inbox-complete-hung':mode);await page.clock.install();await visit(page,'/inbox');await page.getByRole('heading',{name:'Confirm your availability',exact:true}).waitFor();
  await page.getByRole('button',{name:'Open',exact:true}).click();const input=page.getByPlaceholder('Anything your agency should know?');await input.fill('Original completion reply');
  await page.getByRole('button',{name:'Done',exact:true}).click();await waitForMedia(state.requestUpdates);
  if(mode==='inbox-complete-first-wins'){
   await page.clock.runFor(12500);await page.getByRole('alert').filter({hasText:'action'}).waitFor();await input.fill('Keep this newer reply as a draft');
   state.mode='inbox-healthy';await page.getByRole('button',{name:'Done',exact:true}).click();
  }
  await page.getByRole('heading',{name:'Your edited reply is still a draft',exact:true}).waitFor({timeout:4000});
  const draft=page.getByLabel('Unsent reply for Confirm your availability');assert.equal(await draft.inputValue(),mode==='inbox-complete-first-wins'?'Keep this newer reply as a draft':'Original completion reply');
  assert.equal(state.requestRows.get('agency-action').player_reply,mode==='inbox-complete-first-wins'?'Original completion reply':'Stale reply','Recovery changed an already completed reply');
  assert.equal(await page.getByRole('button',{name:'Done',exact:true}).count(),0,'Completed action is still presented as pending');
  state.mode='inbox-healthy';await page.getByRole('button',{name:'Use as a note',exact:true}).click();assert.equal(state.requestInserts.length,0,'Moving a reply sent a note automatically');
  await page.getByRole('button',{name:'Send to your agency',exact:true}).click();await page.getByText('Sent to your agency',{exact:true}).waitFor();
  assert.equal([...state.requestRows.values()].filter(row=>row.request_type==='message')[0].player_reply,mode==='inbox-complete-first-wins'?'Keep this newer reply as a draft':'Original completion reply');
  state.releaseMedia?.();await context.close();
 }
 if(!inboxCase||inboxCase==='inbox-conflict-unmount'){
  const {context,page,state}=await setup('inbox-send-network');await page.clock.install();await visit(page,'/inbox');await page.getByRole('heading',{name:'Confirm your availability',exact:true}).waitFor();
  await page.getByRole('button',{name:'Send a note',exact:true}).click();await page.getByPlaceholder('Type your note…').fill('Keep the original note');
  await page.getByRole('button',{name:'Send to your agency',exact:true}).click();await page.getByRole('alert').filter({hasText:'note'}).waitFor();
  state.mode='inbox-conflict-hung';await page.getByRole('button',{name:'Send to your agency',exact:true}).click();
  for(let i=0;i<200&&state.requestInserts.length<2;i++)await new Promise(resolve=>setTimeout(resolve,25));assert.equal(state.requestInserts.length,2);
  await page.evaluate(()=>window.history.pushState({},'',location.pathname+'?view=documents'));await page.locator('.djm-updates-page').waitFor({state:'detached'});
  const response=page.waitForResponse(response=>response.url().includes('/rest/v1/player_requests')&&response.request().method()==='POST');
  state.releaseMedia();await response;await page.clock.runFor(50);
  assert.equal(state.requestLookups.length,0,'Leaving Inbox started a follow-on note lookup');
  assert.equal(state.requestNotifications,1);await context.close();
 }
 if(!inboxCase||inboxCase==='inbox-independent-drafts'){
  const {context,page,state}=await setup('inbox-healthy');await visit(page,'/inbox');await page.getByRole('heading',{name:'Confirm your availability',exact:true}).waitFor();
  await page.getByRole('button',{name:'Send a note',exact:true}).click();const input=page.getByPlaceholder('Type your note…');await input.fill('My separate unsent note');
  await page.getByRole('button',{name:'Open',exact:true}).click();await page.getByPlaceholder('Anything your agency should know?').fill('My completed reply');
  state.mode='inbox-refresh-failed';await page.getByRole('button',{name:'Done',exact:true}).click();await page.getByText('Completed',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Try again',exact:true}).waitFor();state.mode='inbox-healthy';await page.getByRole('button',{name:'Try again',exact:true}).click();
  await page.getByRole('heading',{name:'Your agency updates.',exact:true}).waitFor();
  assert.equal(await input.count(),1,'Context recovery discarded an unrelated draft');
  assert.equal(await input.inputValue(),'My separate unsent note','Completing an action cleared the unsent note');await context.close();
 }
 if(!inboxCase||inboxCase==='inbox-distinct-drafts'){
  const {context,page,state}=await setup('inbox-send-network');await visit(page,'/inbox');await page.getByRole('heading',{name:'Confirm your availability',exact:true}).waitFor();
  await page.getByRole('button',{name:'Send a note',exact:true}).click();const input=page.getByPlaceholder('Type your note…');await input.fill('Original unconfirmed note');
  await page.getByRole('button',{name:'Send to your agency',exact:true}).click();await page.getByRole('alert').filter({hasText:'note'}).waitFor();
  await input.fill('A different intended note');state.mode='inbox-healthy';await page.getByRole('button',{name:'Send to your agency',exact:true}).click();await page.getByText('Sent to your agency',{exact:true}).waitFor();
  assert.notEqual(state.requestInserts[0].id,state.requestInserts[1].id,'Distinct note drafts share an identity');
  assert.deepEqual([...state.requestRows.values()].filter(row=>row.request_type==='message').map(row=>row.player_reply),['Original unconfirmed note','A different intended note']);await context.close();
 }
 if(!inboxCase||inboxCase==='inbox-no-player'){
  const {context,page}=await setup('no-player');await visit(page,'/inbox');await page.getByRole('heading',{name:'No player profile is linked yet',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Send a note',exact:true}).count(),0);assert.equal(await page.getByText('You’re all clear.',{exact:true}).count(),0);await context.close();
 }
 }
 if(!process.env.PLAYER_INBOX_ONLY){
 const mediaCase=process.env.PLAYER_MEDIA_CASE;
 for(const mode of ['video-add-hung','video-add-network','video-add-failed'].filter(mode=>!mediaCase||mode===mediaCase)){
  const {context,page,state}=await setup(mode);await page.clock.install();await visit(page,'/profile');
  await page.getByRole('button',{name:/^Media /}).click();
  const input=page.getByPlaceholder(/YouTube, Vimeo/);await input.fill('https://example.test/new-highlight');
  await page.getByRole('button',{name:'Add',exact:true}).click();await waitForMedia(state.videoAdds);
  if(mode.endsWith('hung')){assert.equal(await input.isDisabled(),true);await page.clock.runFor(12500);}
  await page.getByRole('alert').filter({hasText:'video'}).waitFor({timeout:4000});
  assert.equal(await input.inputValue(),'https://example.test/new-highlight','Video recovery discarded the URL');
  assert.equal(await input.isEnabled(),true);assert.equal(state.videoAdds.length,1,'Video was automatically retried');
  if(!mode.endsWith('failed'))assert.match(await page.getByRole('alert').filter({hasText:'video'}).innerText(),/could not confirm/i);
  state.mode='healthy';await page.getByRole('button',{name:'Add',exact:true}).click();
  await page.getByText('Video added',{exact:true}).waitFor();
  assert.equal(state.videoAdds.length,2);assert.ok(state.videoAdds[0].body.id,'Video retry has no stable record ID');
  assert.equal(state.videoAdds[0].body.id,state.videoAdds[1].body.id,'Video retry changed the record ID');
  for(const request of state.videoAdds){assert.equal(new URL(request.url).searchParams.get('on_conflict'),'id');assert.ok(request.prefer.includes('resolution=merge-duplicates'));}
  assert.equal(state.videoRows.size,1,'Retry duplicated a saved video');
  state.releaseMedia?.();await context.close();
 }
 for(const mode of ['video-delete-hung','video-delete-network','video-delete-failed','video-delete-zero'].filter(mode=>!mediaCase||mode===mediaCase)){
  const {context,page,state}=await setup(mode);await page.clock.install();await visit(page,'/profile');
  await page.getByRole('button',{name:/^Media /}).click();await page.getByRole('button',{name:'Remove video',exact:true}).click();await waitForMedia(state.videoDeletes);
  if(mode.endsWith('hung'))await page.clock.runFor(12500);
  await page.getByRole('alert').filter({hasText:'video'}).waitFor({timeout:4000});
  assert.equal(await page.getByText('Fixture highlight',{exact:true}).count(),1,'Unconfirmed removal hid the video');
  assert.equal(await page.getByRole('button',{name:'Remove video',exact:true}).isEnabled(),true);
  assert.equal(state.videoDeletes.length,1,'Removal was automatically retried');
  state.mode='healthy';await page.getByRole('button',{name:'Remove video',exact:true}).click();
  await page.getByText('Video removed',{exact:true}).waitFor();assert.equal(state.videoDeletes.length,2);
  for(const url of state.videoDeletes){assert.equal(new URL(url).searchParams.get('id'),'eq.video');assert.equal(new URL(url).searchParams.get('player_id'),'eq.owned-player');}
  assert.equal(await page.getByText('Fixture highlight',{exact:true}).count(),0);
  state.releaseMedia?.();await context.close();
 }
 for(const mode of ['photo-upload-hung','photo-upload-network','photo-upload-failed','photo-attach-hung','photo-attach-network','photo-attach-failed','photo-attach-zero'].filter(mode=>!mediaCase||mode===mediaCase)){
  const {context,page,state}=await setup(mode);await page.clock.install();await visit(page,'/profile');
  const input=page.locator('input[type="file"]');
  await input.setInputFiles({name:'Profile photo.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')});
  await waitForMedia(mode.startsWith('photo-upload')?state.photoUploads:state.photoAttaches);
  if(mode.endsWith('hung')){assert.equal(await input.isDisabled(),true);await page.clock.runFor(mode.startsWith('photo-upload')?30500:12500);}
  const recovery=page.getByRole('alert').filter({hasText:'photo'});await recovery.waitFor({timeout:4000});
  assert.equal(await input.isEnabled(),true,'Photo picker did not unlock');assert.equal(state.photoUploads.length,1,'Photo was automatically retried');
  assert.ok((await page.locator('.profile-21-photo img').getAttribute('src')).includes('existing.png'),'Unconfirmed photo replaced the current photo');
  assert.equal(state.photoAttaches.length,mode.startsWith('photo-upload')?0:1);
  for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1),'Photo recovery overflows '+width);if(process.env.PLAYER_MEDIA_SCREENSHOT&&mode==='photo-upload-hung')await page.screenshot({path:'/private/tmp/player-media-recovery-'+width+'.png',fullPage:true});}
  state.mode='healthy';await recovery.getByRole('button',{name:'Try again',exact:true}).click();
  if(mode.endsWith('hung'))state.releaseMedia?.();
  await page.getByText('Photo updated',{exact:true}).waitFor();
  assert.equal(state.photoUploads.length,mode==='photo-upload-failed'||mode==='photo-upload-network'?2:1,'Retry started another confirmed/in-flight upload');
  assert.ok(state.photoUploads.every(path=>path===state.photoUploads[0]),'Retry changed the photo object path');
  assert.equal(state.photoAttaches.length,mode.startsWith('photo-upload')?1:2);
  assert.ok(state.photoAttaches.every(path=>path===state.photoUploads[0]));
  assert.ok((await page.locator('.profile-21-photo img').getAttribute('src')).includes(state.photoUploads[0]),'Confirmed photo did not replace the current photo');
  await context.close();
 }
 if(!mediaCase||mediaCase==='photo-error-during-video'){
  const {context,page,state}=await setup('photo-upload-failed');await visit(page,'/profile');
  await page.locator('input[type="file"]').setInputFiles({name:'Selected.png',mimeType:'image/png',buffer:Buffer.from('photo')});
  await page.getByRole('alert').filter({hasText:'photo'}).waitFor();
  state.mode='video-add-hung';await page.getByRole('button',{name:/^Media /}).click();
  const input=page.getByPlaceholder(/YouTube, Vimeo/);await input.fill('https://example.test/another-video');
  await page.getByRole('button',{name:'Add',exact:true}).click();await waitForMedia(state.videoAdds);
  assert.equal(await input.isDisabled(),true);
  assert.equal(await page.getByRole('alert').filter({hasText:'photo'}).count(),1,'A video write changed the failed photo into an uploading status');
  state.releaseMedia();await page.getByText('Video added',{exact:true}).waitFor();await context.close();
 }
 if(!mediaCase||mediaCase==='photo-upload-late'){
  const {context,page,state}=await setup('photo-upload-hung');await page.clock.install();await visit(page,'/profile');
  await page.locator('input[type="file"]').setInputFiles({name:'Late.png',mimeType:'image/png',buffer:Buffer.from('photo')});
  await waitForMedia(state.photoUploads);await page.clock.runFor(30500);
  const recovery=page.getByRole('alert').filter({hasText:'photo'});await recovery.waitFor();
  const reply=page.waitForResponse(response=>response.url().includes('/storage/v1/object/player-public/')&&response.request().method()==='POST');
  state.releaseMedia();await reply;await page.clock.runFor(1);
  assert.equal(state.photoAttaches.length,0,'A late upload started an attachment after the deadline');
  assert.equal(await recovery.count(),1);
  state.mode='healthy';await recovery.getByRole('button',{name:'Try again',exact:true}).click();await page.getByText('Photo updated',{exact:true}).waitFor();
  assert.equal(state.photoUploads.length,1);assert.equal(state.photoAttaches.length,1);await context.close();
 }
 if(!mediaCase||mediaCase==='photo-discard'){
  const {context,page,state}=await setup('photo-healthy');await visit(page,'/profile');
  await page.getByRole('button',{name:/^Football /}).click();
  await page.getByRole('region',{name:'Edit profile',exact:true}).locator('input').first().fill('Unsaved football draft');
  await page.locator('input[type="file"]').setInputFiles({name:'Confirmed.png',mimeType:'image/png',buffer:Buffer.from('photo')});
  await page.getByText('Photo updated',{exact:true}).waitFor();
  const path=state.photoUploads[0];assert.ok(path);
  await page.getByRole('button',{name:'Discard',exact:true}).click();
  await page.getByRole('region',{name:'Edit profile',exact:true}).waitFor({state:'hidden'});
  assert.ok((await page.locator('.profile-21-photo img').getAttribute('src')).includes(path),'Discard reverted a separately confirmed photo');
  await page.getByRole('button',{name:/^Football /}).click();
  assert.equal(await page.getByRole('region',{name:'Edit profile',exact:true}).locator('input').first().inputValue(),'Fixture','Discard retained the football draft');
  await context.close();
 }
 if(!mediaCase||mediaCase==='photo-unmount'){
  const {context,page,state}=await setup('photo-upload-hung');await page.clock.install();await visit(page,'/profile');
  await page.locator('input[type="file"]').setInputFiles({name:'Leaving.png',mimeType:'image/png',buffer:Buffer.from('photo')});
  await waitForMedia(state.photoUploads);
  await page.evaluate(()=>window.history.pushState({},'',location.pathname+'?view=documents'));
  await page.locator('.profile-21').waitFor({state:'detached'});
  const reply=page.waitForResponse(response=>response.url().includes('/storage/v1/object/player-public/')&&response.request().method()==='POST');
  state.releaseMedia();await reply;await page.clock.runFor(1);
  assert.equal(state.photoAttaches.length,0,'Upload attached a photo after leaving Profile');
  await context.close();
 }
 }
 if(!process.env.PLAYER_MEDIA_ONLY&&!process.env.PLAYER_INBOX_ONLY){
 {
  const {context,page}=await setup('save-delayed');await visit(page,'/profile');
  await page.getByRole('button',{name:/^Football /}).click();
  const input=page.getByRole('region',{name:'Edit profile',exact:true}).locator('input').first();await input.fill('Confirmed draft');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  assert.equal(await input.isDisabled(),true,'Profile accepts unsent edits during a save');
  await page.getByRole('region',{name:'Edit profile',exact:true}).waitFor({state:'hidden'});
  await context.close();
 }
 {
  const {context,page}=await setup('submit-delayed');await visit(page,'/check-in');
  const input=page.locator('textarea').first();await input.fill('Confirmed weekly draft');
  await page.getByRole('button',{name:'Send weekly update',exact:true}).click();
  assert.equal(await input.isDisabled(),true,'Weekly form accepts unsent edits during a save');
  await page.getByRole('heading',{name:'You’re done.',exact:true}).waitFor();
  await context.close();
 }
 {
  const {context,page,state}=await setup('submit-failed');
  await page.clock.setFixedTime(new Date('2026-10-04T23:59:50+02:00'));await visit(page,'/check-in');
  await page.locator('textarea').first().fill('Sunday draft');
  await page.getByRole('button',{name:'Send weekly update',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'send'}).waitFor();
  await page.clock.setFixedTime(new Date('2026-10-05T00:00:10+02:00'));
  await page.locator('textarea').first().fill('Draft after midnight');
  state.mode='healthy';await page.getByRole('button',{name:'Send weekly update',exact:true}).click();
  await page.getByRole('heading',{name:'You’re done.',exact:true}).waitFor();
  assert.deepEqual(state.submittedWeeks,['2026-09-28','2026-09-28'],'Retry changed the weekly record key');
  await context.close();
 }
 if(!process.env.PLAYER_REVIEW_ONLY){
 for(const [path,mode] of (process.env.PLAYER_WRITE_ONLY?[]:[['/career','career-failed'],['/career','career-hung'],['/profile','media-failed'],['/profile','media-hung']])){
  const {context,page,state}=await setup(mode);await visit(page,path);
  await page.getByRole('alert').filter({hasText:'information could not load'}).waitFor({timeout:mode.endsWith('hung')?16000:7000});
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:900});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1),'Recovery overflow '+path+' '+width);
  }
  state.mode='healthy';await page.getByRole('button',{name:'Try again',exact:true}).click();
  if(path==='/career')await page.getByRole('heading',{name:'Build the career, not just the profile.',exact:true}).waitFor();
  else await page.getByText('1 video saved',{exact:true}).waitFor();
  if(mode.endsWith('hung')){
   await page.waitForTimeout(3500);
   assert.equal(await page.getByRole('alert').filter({hasText:'information could not load'}).count(),0);
   if(path==='/profile')assert.equal(await page.getByText('1 video saved',{exact:true}).count(),1);
  }
  await context.close();
 }
 for(const mode of (process.env.PLAYER_NETWORK_ONLY?['save-network']:['save-failed','save-hung','save-network','save-private-failed','save-private-hung','save-zero-failed'])){
  const {context,page,state}=await setup(mode);await visit(page,'/profile');
  await page.getByRole('button',{name:/^Football /}).click();
  const input=page.getByRole('region',{name:'Edit profile',exact:true}).locator('input').first();await input.fill('Draft name');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  if(mode.endsWith('hung'))assert.equal(await input.isDisabled(),true);
  await page.getByRole('alert').filter({hasText:!mode.endsWith('failed')?'could not confirm':'save'}).waitFor({timeout:mode.endsWith('hung')?16000:7000});
  assert.equal(await input.inputValue(),'Draft name','Save recovery discarded the draft');
  assert.equal(await input.isEnabled(),true,'Profile did not unlock after save recovery');
  assert.equal(await page.getByRole('button',{name:'Save changes',exact:true}).isEnabled(),true);
  assert.equal(state.writes,1,'Save was automatically retried');
  assert.equal(state.privateWrites,1,'Private save was automatically retried');
  state.mode='healthy';await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('region',{name:'Edit profile',exact:true}).waitFor({state:'hidden'});
  assert.equal(state.writes,2);
  assert.deepEqual(state.savedNames,['Draft name','Draft name']);
  assert.equal(state.privateWrites,2);
  await context.close();
 }
 for(const mode of (process.env.PLAYER_NETWORK_ONLY?['submit-network']:['submit-failed','submit-hung','submit-network'])){
  const {context,page,state}=await setup(mode);await visit(page,'/check-in');
  await page.locator('textarea').first().fill('Keep this draft');
  await page.getByRole('button',{name:'Send weekly update',exact:true}).click();
  await page.getByRole('alert').filter({hasText:!mode.endsWith('failed')?'could not confirm':'send'}).waitFor({timeout:mode.endsWith('hung')?16000:7000});
  assert.equal(await page.locator('textarea').first().inputValue(),'Keep this draft');
  assert.equal(await page.locator('textarea').first().isEnabled(),true,'Weekly form did not unlock after save recovery');
  assert.equal(await page.getByRole('button',{name:'Send weekly update',exact:true}).isEnabled(),true);
  assert.equal(state.writes,1,'Weekly update was automatically retried');
  state.mode='healthy';await page.getByRole('button',{name:'Send weekly update',exact:true}).click();
  await page.getByRole('heading',{name:'You’re done.',exact:true}).waitFor();
  assert.equal(state.checkin.player_notes,'Keep this draft');
  assert.equal(state.writes,2);
  await context.close();
 }
 if(!process.env.PLAYER_SECONDARY_ONLY){
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
 }
 for(const [path,mode] of [['/cv','cv-failed'],['/cv','cv-hung'],['/documents','documents-failed'],['/documents','agreements-failed'],['/documents','documents-hung']]){
  const {context,page,state}=await setup(mode);await visit(page,path);
  await page.getByRole('alert').filter({hasText:'information could not load'}).waitFor({timeout:mode.endsWith('hung')?16000:7000});
  assert.equal(await page.getByText('No documents yet.',{exact:true}).count(),0);
  assert.equal(await page.getByRole('heading',{name:'Your agency is preparing your presentation.',exact:true}).count(),0);
  assert.equal(await page.locator('input[type="file"]').count(),0,'Upload remained available without a loaded snapshot');
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:900});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth<=1),'Secondary page overflow '+path+' '+width);
   const box=await page.getByRole('button',{name:'Try again',exact:true}).boundingBox();
   assert.ok(box&&box.height>=44,'Secondary retry touch target is too small');
  }
  await page.setViewportSize({width:390,height:900});
  state.mode='secondary-healthy';await page.getByRole('button',{name:'Try again',exact:true}).click();
  if(path==='/cv')await page.getByRole('heading',{name:'Fixture CV',exact:true}).waitFor();
  else await page.getByText('Existing fixture document',{exact:true}).waitFor();
  if(mode.endsWith('hung')){
   await page.waitForTimeout(3500);
   assert.equal(await page.getByRole('alert').filter({hasText:'information could not load'}).count(),0);
   if(path==='/cv')assert.equal(await page.getByRole('heading',{name:'Fixture CV',exact:true}).count(),1);
   else assert.equal(await page.getByText('Existing fixture document',{exact:true}).count(),1);
  }
  assert.ok(state.secondaryCalls>=2,'Retry did not reread the page data');
  await context.close();
 }
 for(const path of ['/cv','/documents','/profile']){
  const {context,page}=await setup('no-player');await visit(page,path);
  await page.getByRole('heading',{name:'No player profile is linked yet',exact:true}).waitFor();
  assert.equal(await page.locator('input[type="file"]').count(),0);
  await context.close();
 }
 {
  const {context,page}=await setup('secondary-healthy');await visit(page,'/documents');
  await page.getByText('Existing fixture document',{exact:true}).waitFor();
  await page.locator('select').first().selectOption('passport');
  await page.locator('input[type="file"]').setInputFiles({name:'Fixture upload.pdf',mimeType:'application/pdf',buffer:Buffer.from('fixture')});
  await page.getByText('Fixture upload.pdf',{exact:true}).waitFor();
  assert.equal(await page.getByText('Existing fixture document',{exact:true}).count(),1);
  await context.close();
 }
 }
 }
 assert.deepEqual(errors,[]);
 console.log(process.env.PLAYER_INBOX_ONLY?'PASS: Inbox read/write recovery, preserved drafts, owned confirmation, stable note retry IDs, late responses and mobile layouts.':process.env.PLAYER_MEDIA_ONLY?'PASS: photo/video recovery, stable manual retries, confirmed attachments, late replies and responsive layouts.':'PASS: full player entry/read/write recovery, photo/video recovery, stable retries, transport failures, responsive layouts, late responses and private upload. Entry cases run unless PLAYER_SECONDARY_ONLY is set.');
} finally {await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}await rm(fixtureRoute,{recursive:true,force:true});await rm(new URL('../.next/dev/types/',import.meta.url),{recursive:true,force:true});}
