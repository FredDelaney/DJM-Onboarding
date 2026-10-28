import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let mode='success',refreshFails=false,release,writes=0,lastPatch,releasePreview;
 await page.route('https://example.supabase.co/rest/v1/rpc/**',async route=>{
  const method=new URL(route.request().url()).pathname.split('/').at(-1);
  if(method==='fixture_refresh'){await route.fulfill({status:refreshFails?503:200,contentType:'application/json',body:JSON.stringify(refreshFails?{message:'Refresh failed'}:{})});return;}
  if(method==='redream_entity_action_preview'){await new Promise(resolve=>{releasePreview=resolve;});await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({entity_type:'club',entity_id:'fixture-club',can_delete:true,impact:{}})});return;}
  assert.equal(method,'redream_entity_patch');lastPatch=route.request().postDataJSON().p_patch;writes++;
  if(mode==='pending')await new Promise(resolve=>{release=resolve;});
  await route.fulfill({status:mode==='failed'?400:200,contentType:'application/json',body:JSON.stringify(mode==='failed'?{message:'Check the club details.',code:'22023'}:{ok:true,id:'fixture-club',entity_type:'club'})});
 });
 const url=new URL('/qa-usability',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
 for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}}
 const search=page.getByRole('searchbox',{name:'Search players',exact:true});await search.waitFor();
 await search.fill('Dylan');await page.getByText('1 matching players',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Clear search',exact:true}).click();assert.equal(await search.inputValue(),'');assert.ok(await search.evaluate(node=>node===document.activeElement));
 await search.fill('James');await page.keyboard.press('Escape');assert.equal(await search.inputValue(),'');
 await page.getByRole('button',{name:'Edit Example Club',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Manage Example Club',exact:true});
 const save=dialog.getByRole('button',{name:'Save changes',exact:true});
 assert.ok(await save.isDisabled(),'No-change saves should not be clickable');
 await dialog.getByLabel('Club name',{exact:true}).fill('Updated Club');
 await page.keyboard.press('Escape');
 const discard=page.getByRole('alertdialog',{name:'Discard these changes?',exact:true});await discard.waitFor();
 await page.keyboard.press('Escape');await discard.waitFor({state:'hidden'});assert.equal(await dialog.getByLabel('Club name',{exact:true}).inputValue(),'Updated Club','Escape closes only the discard confirmation and keeps the draft');
 await dialog.getByRole('button',{name:'Close',exact:true}).click();await discard.waitFor();
 await discard.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await dialog.getByLabel('Club name',{exact:true}).inputValue(),'Updated Club');
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:width===390?460:844});
  // visualViewport resize is applied through React state after the browser resize.
  // Wait for the actual layout, keeping the reachability assertion unchanged.
  await page.waitForFunction(button=>{
   const box=button.getBoundingClientRect();
   return box.height>=44&&box.y>=0&&box.bottom<=innerHeight+1;
  },await save.elementHandle(),{timeout:5000});
  const box=await save.boundingBox();assert.ok(box&&box.height>=44&&box.y>=0&&box.y+box.height<=(width===390?460:844)+1,'Save remains reachable at '+width);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal scroll at '+width);
 }
 await page.setViewportSize({width:390,height:844});mode='failed';await save.click();await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByLabel('Club name',{exact:true}).inputValue(),'Updated Club');
 mode='pending';await save.click();assert.ok(await dialog.getByRole('button',{name:'Close',exact:true}).isDisabled());
 for(let i=0;i<50&&!release;i++)await page.waitForTimeout(25);mode='success';release();
 await dialog.waitFor({state:'hidden'});assert.deepEqual(lastPatch,{name:'Updated Club'});assert.equal(writes,2);
 await page.getByText('Current name: Updated Club',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Edit Example Club',exact:true}).click();
 assert.ok(await save.isDisabled(),'A confirmed save establishes a clean new baseline');
 await dialog.getByLabel('Country',{exact:true}).fill('UK');refreshFails=true;await save.click();
 await dialog.getByRole('heading',{name:'Changes saved',exact:true}).waitFor();assert.equal(writes,3);
 assert.equal(await dialog.getByRole('button',{name:'Save changes',exact:true}).count(),0,'Refresh failure cannot invite a duplicate write');
 refreshFails=false;await dialog.getByRole('button',{name:'Refresh list',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(writes,3,'Refresh retries only the read');
 await page.getByRole('button',{name:'Manage Example Club',exact:true}).click();
 await dialog.getByRole('button',{name:/^Delete/}).click();await dialog.getByText('Checking linked records…',{exact:true}).waitFor();
 await dialog.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Edit Example Club',exact:true}).click();
 for(let i=0;i<50&&!releasePreview;i++)await page.waitForTimeout(25);releasePreview();
 assert.equal(await dialog.getByText('Deletion impact',{exact:true}).count(),0,'Late deletion previews never replace a newly opened editor');
 await dialog.getByLabel('Club name',{exact:true}).fill('Discard this');await dialog.getByRole('button',{name:'Close',exact:true}).click();await discard.waitFor();
 await page.keyboard.press('Shift+Tab');assert.ok(await discard.getByRole('button',{name:'Discard changes',exact:true}).evaluate(node=>node===document.activeElement),'Discard dialog traps keyboard focus');
 await page.keyboard.press('Tab');assert.ok(await discard.getByRole('button',{name:'Cancel',exact:true}).evaluate(node=>node===document.activeElement),'Forward tab stays in the discard dialog');
 await discard.getByRole('button',{name:'Discard changes',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(writes,3);
 assert.deepEqual(errors,[]);
 console.log('Usability controls: searchable lists, reset/focus, dirty drafts, reachable actions, failure recovery and narrow patches passed.');
}finally{await browser.close();}
