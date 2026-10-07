import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=process.env.DEEP_JOURNEY_QA_URL||'http://127.0.0.1:3113/workspace/qa-deep-journey';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox']});
const page=await browser.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(/same key|Each child|hydration/i.test(message.text()))errors.push(message.text());});
await mkdir('/private/tmp/redream-deep-qa',{recursive:true});
let captureScenario='failed',recentScenario='normal',accessReads=0;
await page.route('https://example.supabase.co/rest/v1/rpc/**',async route=>{
 const name=new URL(route.request().url()).pathname.split('/').pop();
 if(name==='redream_ai_current_access'){
  accessReads++;
  if(captureScenario==='hung')return;
  if(captureScenario==='failed')return route.fulfill({status:503,json:{message:'Connection temporarily unavailable'}});
  return route.fulfill({json:{enabled:captureScenario!=='disabled',workspace_slug:'qa-deep-journey',max_audio_seconds:240}});
 }
 if(name==='redream_ai_recent_captures'){
  if(recentScenario==='failed')return route.fulfill({status:503,json:{message:'Recent updates temporarily unavailable'}});
  return route.fulfill({json:recentScenario==='populated'?[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',summary:'Call with the sporting director',status:'needs_review',created_at:'2026-10-07T10:00:00Z',action_count:1,question_count:0}]:[]});
 }
 throw new Error('Unexpected fixture RPC '+name);
});
const visit=async(query)=>{
 for(let i=0;i<50;i++){try{await page.goto(root+query);break;}catch(error){if(i===49)throw error;await page.waitForTimeout(500);}}
 await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
};
const geometry=async(panel,width)=>{
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Overflow at '+width);
 assert.ok(await panel.getByRole('button',{name:'Try again',exact:true}).evaluate(node=>{const rect=node.getBoundingClientRect();return rect.height>=44&&rect.width>=44;}),'Retry target below 44px');
 assert.ok(await panel.evaluate(node=>parseFloat(getComputedStyle(node.querySelector('p')).fontSize)>=14),'Recovery explanation too small');
};
try{
 if(process.env.DEEP_QA_ONLY!=='session'){
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:844});
  await visit('?scenario=failed');
  await page.getByText('Connection temporarily unavailable',{exact:true}).waitFor();
  const error=page.getByRole('alert').filter({hasText:'Connection temporarily unavailable'});
  assert.equal(await page.getByRole('button',{name:/^(Create private pitch|Publish dossier|Review career plan)$/}).count(),0,'A failed read exposed a material action');
  await geometry(error,width);
  await page.evaluate(()=>{window.qaReadHealthy=true;});
  await error.getByRole('button',{name:'Try again',exact:true}).click();
  await page.getByRole('button',{name:'Create private pitch',exact:true}).first().waitFor();
  assert.equal(await error.count(),0);
  assert.ok(await page.getByText('Create the private pitch draft for this exact player-club route.',{exact:true}).evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=14),'Opportunity instruction too small');
  if(width===390)await page.screenshot({path:'/private/tmp/redream-deep-qa/opportunity-mobile.png'});
  captureScenario='failed';accessReads=0;await visit('?view=capture&share_text=Call%20the%20sporting%20director');
  const captureError=page.getByRole('alert').filter({hasText:'Could not open Capture'});await captureError.waitFor();
  assert.equal(await page.getByText('Capture is not enabled yet',{exact:true}).count(),0,'Network failure misreported as feature disabled');
  await geometry(captureError,width);
  captureScenario='normal';
  await captureError.getByRole('button',{name:'Try again',exact:true}).click();
  await page.getByPlaceholder('Spoke to Chris at Wellington. They need a striker...',{exact:true}).waitFor();
  assert.equal(await captureError.count(),0);
  assert.ok(await page.getByText('Say or type what happened. ReDream proposes the right updates, then waits for your approval before anything changes.',{exact:true}).evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=14),'Capture instruction too small');
  assert.equal(await page.getByRole('textbox',{name:'Your update',exact:true}).count(),1);
  if(width===390)await page.screenshot({path:'/private/tmp/redream-deep-qa/capture-mobile.png'});
  assert.equal(await page.getByPlaceholder('Spoke to Chris at Wellington. They need a striker...',{exact:true}).inputValue(),'Call the sporting director','Retry lost the shared update');
 }
 await page.setViewportSize({width:390,height:844});
 await visit('?scenario=hung');const timeout=page.getByRole('alert').filter({hasText:'took too long'});await timeout.waitFor({timeout:16000});await page.evaluate(()=>{window.qaReadHealthy=true;});await timeout.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('button',{name:'Create private pitch',exact:true}).first().waitFor();
 captureScenario='hung';accessReads=0;await visit('?view=capture');const captureTimeout=page.getByRole('alert').filter({hasText:'took too long'});await captureTimeout.waitFor({timeout:16000});captureScenario='normal';await captureTimeout.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('button',{name:'Start recording',exact:true}).waitFor();
 captureScenario='normal';recentScenario='failed';await visit('?view=capture');
 const recent=page.getByRole('region',{name:'Recent captures',exact:true});
 const recentError=recent.getByRole('alert');await recentError.waitFor({timeout:5000});
 assert.equal(await recent.getByText('Your recent ReDream updates will appear here after you send the first one.',{exact:true}).count(),0,'Read failure was shown as an empty history');
 recentScenario='populated';await recentError.getByRole('button',{name:'Try again',exact:true}).click();
 await recent.getByRole('button',{name:/Call with the sporting director/}).waitFor();
 assert.equal(await recentError.count(),0);
 recentScenario='failed';await recent.getByRole('button',{name:'Refresh',exact:true}).click();await recentError.waitFor();
 assert.equal(await recent.getByRole('button',{name:/Call with the sporting director/}).count(),1,'A failed refresh removed the visible updates');
 recentScenario='populated';await recentError.getByRole('button',{name:'Try again',exact:true}).click();await recentError.waitFor({state:'detached'});
 captureScenario='disabled';accessReads=0;await visit('?view=capture');await page.getByText('Capture is not enabled yet',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Try again',exact:true}).count(),0,'Confirmed disabled state offered a misleading retry');
 }
 await visit('?view=session&scenario=failed');const sessionError=page.getByRole('alert').filter({hasText:'Could not check your sign-in'});await sessionError.waitFor({timeout:5000});
 assert.equal(await page.getByText('Authenticated capture contents',{exact:true}).count(),0);
 await page.evaluate(()=>{window.qaReadHealthy=true;});await sessionError.getByRole('button',{name:'Try again',exact:true}).click();await page.getByText('Authenticated capture contents',{exact:true}).waitFor();
 await visit('?view=session&scenario=hung');await sessionError.waitFor({timeout:16000});
 await page.evaluate(()=>window.qaAuthChanged(null));const signIn=page.getByRole('link',{name:'Sign in to open your update',exact:true});await signIn.waitFor();
 assert.equal(await sessionError.count(),0,'A confirmed auth event did not clear the stale error');
 assert.equal(await signIn.getAttribute('href'),'/sign-in?next='+encodeURIComponent('/workspace/qa-deep-journey?view=session&scenario=hung'));
 assert.deepEqual(errors,[]);console.log('Deep journey recovery passed: failed and timed-out reads, retry, truthful disabled state, controlled actions and 320/390/1440px.');
}finally{await browser.close();}
