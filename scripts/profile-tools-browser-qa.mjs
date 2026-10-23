import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:700}});
  await page.emulateMedia({reducedMotion:'no-preference'});
  const url=new URL(process.env.WORKSPACE_FLOW_QA_URL||'http://127.0.0.1:3113/workspace/qa-find-flow');
  url.search='?view=players&player=qa-player-0&profile=1&scenario=populated';
  for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}}
  await page.getByRole('heading',{name:'José Silva',exact:true}).waitFor();
  const trigger=page.locator('summary').filter({hasText:/^More/});await trigger.click();
  const tools=page.getByRole('group',{name:'Player profile tools'});await tools.waitFor({state:'visible'});
  const rect=await tools.boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width+1,'Menu fits '+width);
  assert.ok(rect.y>=0&&rect.y+rect.height<=700+1,'Menu remains on screen '+width);
  await page.keyboard.press('Escape');await tools.waitFor({state:'hidden'});
  assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
  // Open from a scrolled, animated workspace: a fixed child of viewStage was
  // previously clipped by that ancestor's retained transform.
  const opener=page.getByRole('button',{name:'Preview Player Profile',exact:true});
  await opener.scrollIntoViewIfNeeded(); await opener.focus();
  const scroll=await page.evaluate(()=>window.scrollY);
  await opener.click();
  const preview=page.locator('[class*="previewBackdrop"]');await preview.waitFor({state:'visible'});
  const box=await preview.boundingBox();
  assert.ok(box&&Math.abs(box.x)<1&&Math.abs(box.y)<1&&Math.abs(box.width-width)<1&&Math.abs(box.height-700)<1,'Preview fills the viewport instead of its animated ancestor at '+width);
  assert.equal(await preview.getAttribute('role'),'dialog');
  const close=preview.getByRole('button',{name:'Close',exact:true});
  await close.waitFor({state:'visible'});
  assert.ok(await close.evaluate(node=>{const r=node.getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight&&r.height>=44&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===node;}),'Close remains visible and tappable at '+width);
  assert.equal(await close.evaluate(node=>node===document.activeElement),true);
  assert.equal(await opener.evaluate(node=>Boolean(node.closest('[inert]'))),true,'Background workspace is isolated');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).overflowY),'hidden');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await preview.evaluate(node=>node.contains(document.activeElement)),true);
  await page.keyboard.press('Tab');
  assert.equal(await close.evaluate(node=>node===document.activeElement),true,'Tab wraps to the toolbar');
  const content=preview.locator('[class*="previewScroll"]');
  await content.evaluate(node=>{node.scrollTop=node.scrollHeight;});
  assert.ok(await content.evaluate(node=>node.scrollTop>0),'Long preview has its own reachable scroll area');
  assert.equal(await page.evaluate(()=>window.scrollY),scroll,'Background scroll stays put');
  assert.ok((await close.boundingBox()).y>=0,'Toolbar stays on screen while the dossier scrolls');
  await page.keyboard.press('Escape');await preview.waitFor({state:'hidden'});
  assert.equal(await opener.evaluate(node=>node===document.activeElement),true);
  assert.equal(await page.evaluate(()=>window.scrollY),scroll,'Closing restores the profile position');
  assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).overflowY),'hidden');
  await opener.click(); await preview.waitFor({state:'visible'});
  assert.equal(await content.evaluate(node=>node.scrollTop),0,'Each preview opens at the player identity');
  if(width===390||width===1440){await mkdir('/tmp/redream-platform-programme/club-stats',{recursive:true});await page.screenshot({path:'/tmp/redream-platform-programme/club-stats/preview-overlay-'+width+'.png'});}
  await close.click();await preview.waitFor({state:'hidden'});
  await trigger.click();await tools.getByRole('button',{name:'Preview',exact:true}).click();
  await preview.waitFor({state:'visible'});
  await page.keyboard.press('Escape');await preview.waitFor({state:'hidden'});
  assert.equal(await trigger.evaluate(node=>node===document.activeElement),true,'Menu previews return focus to More');
  await page.close();
 }
 console.log('Profile tools and club preview: viewport bounds, independent scroll, toolbar, focus isolation/wrap/Escape/return, reopening and four widths passed');
}finally{await browser.close();}
