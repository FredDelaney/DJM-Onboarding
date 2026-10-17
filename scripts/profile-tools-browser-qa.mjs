import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:700}});
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
  await page.close();
 }
 console.log('Profile tools menu viewport and keyboard recovery passed at four widths');
}finally{await browser.close();}
