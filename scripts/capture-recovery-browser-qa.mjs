import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
const actor='10000000-0000-4000-8000-000000000001',otherActor='10000000-0000-4000-8000-000000000002';
const ids={text:'50000000-0000-4000-8000-000000000001',voice:'50000000-0000-4000-8000-000000000002',agency:'50000000-0000-4000-8000-000000000003',other:'50000000-0000-4000-8000-000000000004',legacy:'50000000-0000-4000-8000-000000000005',late:'50000000-0000-4000-8000-000000000006',timeout:'50000000-0000-4000-8000-000000000007'};
const session=id=>{
 const user={id,email:id===actor?'synthetic@example.test':'other@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
 const token='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64')+'.fixture';
 return {access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user};
};
const modes=new Map(),releases=new Map(),uploads=[],reads=[],errors=[];let approvals=0;
const captured=new Map();
const eventually=async(check,label)=>{for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Timed out waiting for '+label);};
const seed=async(page,records)=>page.evaluate(async records=>{
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('djm-tell-djm',1);r.onupgradeneeded=()=>r.result.createObjectStore('pending-captures',{keyPath:'id'});r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result);});
 try{await new Promise((resolve,reject)=>{const tx=db.transaction('pending-captures','readwrite');for(const record of records)tx.objectStore('pending-captures').put({...record,blob:record.voice?new Blob(['original voice evidence'],{type:'audio/webm'}):null});tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);});}finally{db.close();}
 window.dispatchEvent(new Event('redream:pending-captures-changed'));
},records);
const saved=async page=>page.evaluate(async()=>{
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('djm-tell-djm',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result);});
 try{return await new Promise((resolve,reject)=>{const r=db.transaction('pending-captures').objectStore('pending-captures').getAll();r.onsuccess=()=>resolve(r.result.map(x=>({id:x.id,userId:x.userId,workspaceSlug:x.workspaceSlug,text:x.text,voiceSize:x.blob?.size||0})));r.onerror=()=>reject(r.error);});}finally{db.close();}
});
const note=(id,extra={})=>({id,userId:actor,workspaceSlug:'qa-tell-work',createdAt:'2026-10-28T09:00:00Z',channel:'typed_debrief',text:'Original written evidence for the selected agency.',context:{label:'Original player context'},mimeType:null,fileName:null,durationSeconds:null,parentCaptureId:null,...extra});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.addInitScript(({session})=>{
  if(location.hostname!=='127.0.0.1')return;
  if(!sessionStorage.getItem('qa-recovery-auth')){sessionStorage.setItem('qa-recovery-auth','1');localStorage.setItem('sb-example-auth-token',JSON.stringify(session));}
  const original=window.setTimeout.bind(window);
  window.setTimeout=(handler,delay,...args)=>original(handler,delay===90000&&window.qaFastUploadTimeout?180:delay,...args);
 },{session:session(actor)});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://example.supabase.co/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;let data=[];
  if(path.endsWith('/token'))data=session(otherActor);
  else if(path.endsWith('/redream-ai-capture')){
   const form=await new Response(request.postDataBuffer(),{headers:request.headers()}).formData();
   const id=String(form.get('client_capture_id')),file=form.get('file');
   uploads.push({id,workspace:form.get('workspace_slug'),text:form.get('text'),voice:file&&typeof file!=='string'?await file.text():null});
   const mode=modes.get(id)||'fail';
   if(mode==='fail')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Connection unavailable'})});
   if(mode==='hold'||mode==='timeout')await new Promise(resolve=>releases.set(id,resolve));
   captured.set(id,String(form.get('text')||'Voice evidence recorded.'));
   data={capture_id:id};
  }else if(path.endsWith('/redream_ai_receipt')){
   const id=request.postDataJSON().p_capture_id;reads.push(id);
   const active=captured.has(id);
   data={capture:{id,status:active?'needs_review':'done',transcript_text:captured.get(id)||'Existing fixture update'},actions:active?[{id:'proposed',status:'pending',action_type:'create_task',confidence:0.99,evidence:captured.get(id),resolved_payload:{title:'Review the saved note',owner_display_name:'You'}}]:[],questions:[]};
  }else if(path.endsWith('/redream_ai_approve_capture')){approvals++;data={};}
  else if(path.endsWith('/redream_ai_capture_workspace'))data='qa-tell-work';
  try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});}catch(error){if(!/closed|handled|cancel|disposed/i.test(String(error)))throw error;}
 });
 const root=new URL('/qa-tell-work',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
 for(let i=0;i<60;i++){try{await page.goto(root.href);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}}
 await page.getByRole('button',{name:'Start new test note',exact:true}).click();
 await page.getByRole('button',{name:'Type instead',exact:true}).waitFor();
 await seed(page,[note(ids.text),note(ids.voice,{voice:true,text:'',channel:'voice_debrief',durationSeconds:15,mimeType:'audio/webm',fileName:'original.webm'}),note(ids.agency,{workspaceSlug:'other-workspace',text:'Other agency evidence'}),note(ids.other,{userId:otherActor,text:'Other account evidence'}),note(ids.legacy,{userId:undefined,text:'Unattributed legacy evidence'})]);
 const queue=()=>page.getByRole('region',{name:'Notes saved on this device',exact:true});
 const expand=async()=>{await queue().getByText('Saved on this device',{exact:true}).waitFor();const details=queue().locator('> details');if(!(await details.evaluate(node=>node.open)))await details.locator('> summary').click();};
 await expand();await queue().getByText('2 notes',{exact:true}).waitFor();
 assert.equal(await queue().locator('ol > li').count(),2);
 await queue().getByText('Read original note',{exact:true}).click();await queue().getByText('Original written evidence for the selected agency.',{exact:true}).waitFor();
 assert.equal(await page.getByText(/Other agency evidence|Other account evidence|Unattributed legacy evidence/).count(),0);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Saved notes fit at '+width);
  assert.ok(await queue().getByRole('button').evaluateAll(nodes=>nodes.every(node=>node.getBoundingClientRect().height>=44)),'Saved-note actions remain tappable at '+width);
  if(width===390||width===1440){const out='/tmp/redream-platform-programme/capture-recovery';await mkdir(out,{recursive:true});await queue().screenshot({path:out+'/saved-notes-'+width+'.png'});}
 }
 await page.reload();await page.getByRole('button',{name:'Start new test note',exact:true}).click();await expand();await queue().getByText('2 notes',{exact:true}).waitFor();
 assert.equal((await saved(page)).length,5,'Reload and failed uploads preserve every original record');
 assert.equal(uploads.some(x=>x.id===ids.other||x.id===ids.legacy),false,'Background retry never borrows another account or unattributed note');
 await page.getByRole('button',{name:'Switch test workspace',exact:true}).click();await expand();
 await queue().getByText('1 note',{exact:true}).waitFor();await queue().getByText('Read original note',{exact:true}).click();await queue().getByText('Other agency evidence',{exact:true}).waitFor();
 assert.equal(await page.getByText('Original written evidence for the selected agency.',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Switch test workspace',exact:true}).click();await expand();
 await page.getByRole('button',{name:'Type instead',exact:true}).click();
 const input=page.getByRole('textbox',{name:'Your update',exact:true});await input.fill('Keep my unfinished current note');
 assert.ok(await queue().getByRole('button',{name:'Upload and review saved note 1',exact:true}).isDisabled());
 modes.set(ids.voice,'success');await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await page.waitForFunction(async id=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('djm-tell-djm',1);r.onsuccess=()=>resolve(r.result);});
  try{return await new Promise(resolve=>{const r=db.transaction('pending-captures').objectStore('pending-captures').get(id);r.onsuccess=()=>resolve(!r.result);});}finally{db.close();}
 },ids.voice);
 assert.equal(await input.inputValue(),'Keep my unfinished current note','Reconnect cannot replace a note being composed with another receipt');
 assert.equal(reads.includes(ids.voice),false,'Background completion does not take over the current input');
 assert.equal(uploads.find(x=>x.id===ids.voice)?.voice,'original voice evidence');
 await input.fill('');
 modes.set(ids.text,'hold');
 const before=uploads.filter(x=>x.id===ids.text).length;
 await queue().getByRole('button',{name:'Upload and review saved note 1',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('button[aria-label="Upload and review saved note 1"]')?.textContent==='Uploading...');
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 assert.equal(await page.locator('[data-qa-unsafe]').textContent(),'safe','Retrying an already durable note never traps the user in the capture window');
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await eventually(()=>releases.has(ids.text),'shared foreground upload');
 releases.get(ids.text)();await eventually(()=>reads.includes(ids.text),'the explicitly retried written receipt');await page.getByRole('button',{name:'Approve & save',exact:true}).waitFor();
 assert.equal(uploads.filter(x=>x.id===ids.text).length-before,1,'Foreground and reconnect share the original client capture ID and one in-flight request');
 assert.equal(approvals,0,'Uploading a proposed task does not approve it');
 assert.ok(uploads.filter(x=>x.id===ids.text||x.id===ids.voice).every(x=>x.workspace==='qa-tell-work'));
 assert.ok(uploads.filter(x=>x.id===ids.agency).every(x=>x.workspace==='other-workspace'),'Automatic retry retains each note’s saved agency');
 assert.deepEqual((await saved(page)).map(x=>x.id).sort(),[ids.agency,ids.other,ids.legacy].sort());
 await seed(page,[note(ids.timeout,{text:'Timeout evidence'})]);modes.set(ids.timeout,'timeout');await expand();
 await page.evaluate(()=>{window.qaFastUploadTimeout=true;});
 await queue().getByRole('button',{name:'Upload and review saved note 1',exact:true}).click();
 await page.getByText('Upload was not confirmed. You can retry the saved note.',{exact:true}).waitFor();
 assert.ok((await saved(page)).some(x=>x.id===ids.timeout),'A timed-out request never consumes the original note');
 await page.evaluate(()=>{window.qaFastUploadTimeout=false;});
 releases.get(ids.timeout)?.();modes.set(ids.timeout,'success');
 await queue().getByRole('button',{name:'Upload and review saved note 1',exact:true}).click();await page.getByRole('button',{name:'Approve & save',exact:true}).waitFor();
 await eventually(()=>reads.includes(ids.timeout),'retried capture receipt');
 assert.equal(uploads.filter(x=>x.id===ids.timeout).length,2,'Retry reuses the exact stable ID after the actual SDK deadline abort');
 await seed(page,[note(ids.late,{text:'Late old-account transcript'})]);modes.set(ids.late,'hold');await expand();
 await queue().getByRole('button',{name:'Upload and review saved note 1',exact:true}).click();
 await eventually(()=>releases.has(ids.late),'old-account upload');
 await page.getByRole('button',{name:'Sign in other test account',exact:true}).click();
 await queue().getByText('Other account evidence',{exact:true}).waitFor({state:'attached'});await expand();
 await queue().getByText('Read original note',{exact:true}).click();await queue().getByText('Other account evidence',{exact:true}).waitFor();
 releases.get(ids.late)();
 await page.waitForFunction(()=>document.querySelector('button[aria-label="Upload and review saved note 1"]')?.textContent==='Upload & review');
 assert.equal(reads.includes(ids.late),false,'A late upload from the previous account cannot open its receipt');
 assert.equal(await page.getByText('Late old-account transcript',{exact:true}).count(),0);
 await page.getByRole('button',{name:'Switch test workspace',exact:true}).click();
 await page.getByRole('button',{name:'Type instead',exact:true}).waitFor();
 await page.getByRole('button',{name:'Switch test workspace',exact:true}).click();
 await queue().getByText('Other account evidence',{exact:true}).waitFor({state:'attached'});
 assert.equal(reads.includes(ids.voice),false,'Remounting after an account change cannot resume the previous account’s uploaded voice receipt');
 await page.getByRole('button',{name:'Sign out test account',exact:true}).click();await queue().waitFor({state:'detached'});
 assert.equal(await page.getByText('Other account evidence',{exact:true}).count(),0,'Signing out hides retained private notes immediately');
 await page.evaluate(()=>{window.qaOriginalIndexedOpen=indexedDB.open.bind(indexedDB);indexedDB.open=()=>{throw Error('Synthetic storage unavailable');};});
 await page.getByRole('button',{name:'Sign in other test account',exact:true}).click();
 await page.getByText('Could not check saved notes on this device.',{exact:true}).waitFor();
 assert.equal(await page.getByText('Other account evidence',{exact:true}).count(),0,'Unreadable storage cannot claim that retained notes were loaded');
 await page.evaluate(()=>{indexedDB.open=window.qaOriginalIndexedOpen;});
 await page.getByRole('button',{name:'Check saved notes again',exact:true}).click();
 await queue().getByText('Other account evidence',{exact:true}).waitFor({state:'attached'});await expand();
 assert.deepEqual((await saved(page)).map(x=>x.id).sort(),[ids.agency,ids.other,ids.legacy].sort(),'Storage retry retains all untouched agency, account and legacy records');
 assert.deepEqual(errors,[]);
 console.log('PASS saved-note recovery: real IndexedDB text/voice/reload, exact actor/agency visibility, preserved drafts, original-ID retry/deduplication, real SDK timeout, explicit proposal review and late-account protection at four widths');
}finally{for(const release of releases.values())release();await browser.close();}
