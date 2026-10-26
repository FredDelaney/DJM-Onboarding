import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const output='/tmp/redream-platform-programme/document-save-recovery';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const results=[],errors=[];
 const open=async(width,scenario,create=false)=>{
  const page=await browser.newPage({viewport:{width,height:844}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   window.qaDocumentRecords=[];window.addEventListener('qa-document-record',event=>window.qaDocumentRecords.push(event.detail));
   window.addEventListener('qa-document-late',event=>window.qaDocumentLate=event.detail);
   const timeout=window.setTimeout;window.setTimeout=(fn,ms,...args)=>timeout(fn,ms===12000?600:ms,...args);
  });
  const url=new URL('/qa-documents?scenario='+scenario,process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
  for(let n=0;n<60;n++){try{await page.goto(url.href);break;}catch(error){if(n===59)throw error;await page.waitForTimeout(250);}}
  if(create){await page.getByRole('button',{name:/Player contract.*Create document/}).click();await page.locator('#document-field-player_name').fill('QA new prospect');}
  else{await page.getByRole('button',{name:/Harbour FC.*Agency services/}).click();await page.locator('#document-field-recipient_address').fill('QA revised club address');}
  return page;
 };
 const button=(page,name)=>page.getByRole('button',{name,exact:true});
 const records=page=>page.evaluate(()=>window.qaDocumentRecords);
 for(const width of [320,390,768,1440]){
  for(const scenario of ['save-lost-error','save-lost']){
   const page=await open(width,scenario,scenario==='save-lost');
   await button(page,'Save draft').click();
   await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
   assert.equal(await button(page,'Save draft').isDisabled(),true);
   const trace=await records(page);assert.deepEqual(trace.map(item=>item.action),['save','read']);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   results.push({width,scenario,trace});await page.close();
  }
  const page=await open(width,'save-check-failed');
  await button(page,'Save draft').click();await page.getByText("We haven't confirmed this save. Your draft is still here.",{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Recovery fits '+width);
  await page.waitForFunction(()=>document.activeElement?.id==='document-save-recovery');
  await page.waitForFunction(()=>{const r=document.getElementById('document-save-recovery')?.getBoundingClientRect();return r&&r.top>=-1&&r.bottom<=innerHeight+1;});
  const recoveryBounds=await page.locator('#document-save-recovery').evaluate(node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight};});
  await page.screenshot({path:output+'/recovery-'+width+'.png'});
  assert.ok(recoveryBounds.top>=-1&&recoveryBounds.bottom<=recoveryBounds.height+1,'Recovery explanation is visible: '+JSON.stringify(recoveryBounds));
  assert.equal(await button(page,'Retry save').count(),0,'An unsuccessful confirmation read never enables a blind retry');
  await page.locator('#document-field-recipient_address').fill('QA newer local edits');
  await button(page,'Check saved version').click();
  await page.getByRole('status').filter({hasText:'Your newer changes are still unsaved'}).waitFor();
  assert.equal(await page.locator('#document-field-recipient_address').inputValue(),'QA newer local edits');
  assert.equal(await button(page,'Save draft').isEnabled(),true);
  assert.equal((await records(page)).filter(item=>item.action==='save').length,1);
  await button(page,'Save draft').click();await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
  const trace=await records(page);assert.deepEqual(trace.filter(item=>item.action==='save').map(item=>item.revision),[1,2]);
  results.push({width,scenario:'save-check-failed',trace});await page.close();
 }
 {
  const page=await open(390,'save-absent',true);
  await button(page,'Save draft').click();await button(page,'Retry save').waitFor();
  await button(page,'Review').click();
  assert.equal(await button(page,'Share').isDisabled(),true);
  await button(page,'Retry save').click();await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
  const writes=(await records(page)).filter(item=>item.action==='save');
  assert.equal(writes.length,2);assert.equal(writes[0].id,writes[1].id);assert.deepEqual(writes.map(item=>item.revision),[0,0]);
  results.push({scenario:'explicit-retry',trace:await records(page)});await page.close();
 }
 {
  const page=await open(390,'save-retry-rejected',true);
  await button(page,'Save draft').click();await button(page,'Retry save').click();
  await page.getByRole('alert').filter({hasText:'Check the draft title'}).waitFor();
  assert.equal(await button(page,'Check saved version').isEnabled(),true,'A rejected retry cannot resolve the earlier unconfirmed write');
  assert.equal(await page.locator('#document-field-player_name').inputValue(),'QA new prospect');
  results.push({scenario:'rejected-retry-retains-earlier-uncertainty',trace:await records(page)});await page.close();
 }
 {
  const page=await open(390,'save-late',true);
  await button(page,'Save draft').click();await button(page,'Retry save').waitFor();
  await page.locator('#document-field-player_name').fill('QA newer retry wins');
  await button(page,'Retry save').click();await page.getByRole('status').filter({hasText:'Draft saved'}).waitFor();
  await page.waitForFunction(()=>window.qaDocumentLate==='rejected');
  assert.equal(await page.locator('#document-field-player_name').inputValue(),'QA newer retry wins');
  assert.equal(await button(page,'Save draft').isDisabled(),true);
  const writes=(await records(page)).filter(item=>item.action==='save');assert.equal(writes.length,2);assert.equal(writes[0].id,writes[1].id);
  results.push({scenario:'late-write-cannot-overwrite-retry',trace:await records(page)});await page.close();
 }
 {
  const page=await open(390,'save-conflict');
  await button(page,'Save draft').click();await page.getByText('A different version is saved. Your draft is still here.',{exact:true}).waitFor();
  await page.screenshot({path:output+'/conflict-390.png'});
  assert.equal(await page.locator('#document-field-recipient_address').inputValue(),'QA revised club address');
  assert.equal(await button(page,'Retry save').count(),0);
  await button(page,'Load saved version').click();await button(page,'Keep editing').click();
  assert.equal(await page.locator('#document-field-recipient_address').inputValue(),'QA revised club address');
  await button(page,'Load saved version').click();await button(page,'Discard changes').click();
  await page.locator('strong').filter({hasText:/^Another editor's saved version$/}).waitFor();
  assert.equal(await button(page,'Save draft').isDisabled(),true);
  assert.equal((await records(page)).filter(item=>item.action==='save').length,1);
  await page.screenshot({path:output+'/conflict-recovered-390.png'});
  results.push({scenario:'explicit-conflict-load',trace:await records(page)});await page.close();
 }
 for(const scenario of ['save-read-foreign','save-check-slow']){
  const page=await open(390,scenario);await button(page,'Save draft').click();
  await page.getByText("We haven't confirmed this save. Your draft is still here.",{exact:true}).waitFor();
  assert.equal(await button(page,'Retry save').count(),0);assert.equal(await button(page,'Check saved version').isEnabled(),true);
  assert.equal((await records(page)).filter(item=>item.action==='save').length,1);
  assert.equal(await page.locator('#document-field-recipient_address').inputValue(),'QA revised club address');
  if(scenario==='save-check-slow')await page.screenshot({path:output+'/unconfirmed-390.png'});
  results.push({scenario,trace:await records(page)});await page.close();
 }
 assert.deepEqual(errors,[]);
 await writeFile(output+'/journey.json',JSON.stringify({synthetic:true,timersAccelerated:true,results},null,2));
 console.log('Document save recovery: exact lost-response confirmation, stalled deadlines, four widths, newer drafts, stable-ID explicit retry, conflicts, denied-scope/malformed reads and no repeated writes pass.');
}finally{await browser.close();}
