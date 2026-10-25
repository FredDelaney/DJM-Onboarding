import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=(process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113/qa-calendar').replace(/\/qa-calendar$/,'/qa-pursuit-continuity');
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox']});
const page=await browser.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 for(const presentation of ['page','drawer'])for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:844});
  for(let i=0;i<50;i++){try{await page.goto(root+'?presentation='+presentation);break;}catch(error){if(i===49)throw error;await page.waitForTimeout(500);}}
  await page.locator('[data-qa-ready="true"]').waitFor();
  await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
  const pursuit=page.getByRole(presentation==='page'?'region':'dialog',{name:'Example Player to Example FC Pursuit Room',exact:true});
  const followUp=pursuit.getByRole('button',{name:'Set follow-up',exact:true}).first();
  await followUp.waitFor();await followUp.click();
  const action=page.getByRole('dialog',{name:'Example Player → Example FC',exact:true});
  await page.waitForFunction(()=>window.qaReleaseActionPreparation&&document.querySelector('button[aria-label="Close action workspace"]')?.disabled);
  await page.keyboard.press('Escape');
  assert.equal(await action.isVisible(),true,'Pending preparation keeps its dialog open');
  assert.equal(await pursuit.count(),1,'Pending preparation cannot dismiss its parent');
  await page.evaluate(()=>window.qaReleaseActionPreparation());
  const input=action.getByRole('textbox',{name:'Next action',exact:true});
  await input.waitFor();
  const closeBounds=await action.getByRole('button',{name:'Close action workspace',exact:true}).boundingBox();
  assert.ok(closeBounds.width>=44&&closeBounds.height>=44,'Close is tappable at '+width);
  assert.equal(await action.getByRole('button',{name:'Close action workspace',exact:true}).evaluate(node=>node===document.activeElement),true,'The nested action owns focus when ready');
  assert.equal(await followUp.evaluate(node=>Boolean(node.closest('[inert]'))),true,'The underlying pursuit is inert');
  for(let index=0;index<8;index++){await page.keyboard.press('Tab');assert.equal(await action.evaluate(node=>node.contains(document.activeElement)),true,'Tab stays in the action');}
  await input.fill('Call the sporting director');
  await page.keyboard.press('Escape');
  assert.equal(await pursuit.count(),1,'Escape closed the pursuit underneath the follow-up at '+width+' ('+presentation+')');
  await action.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','Pursuit lost its scroll lock');
  assert.ok(await followUp.evaluate(node=>node===document.activeElement),'Focus did not return to follow-up '+presentation+' '+width+' '+JSON.stringify(await followUp.evaluate(node=>({connected:node.isConnected,inert:!!node.closest('[inert]'),active:document.activeElement?.outerHTML?.slice(0,400)}))));
  await followUp.click();await input.waitFor();
  await action.getByRole('button',{name:/Close/}).click();
  assert.equal(await pursuit.count(),1,'Close button closed the pursuit');
  assert.ok(await followUp.evaluate(node=>node===document.activeElement),'Close button did not restore focus');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow at '+width);
  await followUp.focus();await page.keyboard.press('Escape');
  await pursuit.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'','Leaving the pursuit did not restore scrolling');
 }
 assert.deepEqual(errors,[]);console.log('Pursuit continuity passed: nested follow-up dismissal, focus return, scroll restoration, 320/390/768/1440px, page and drawer.');
}finally{await browser.close();}
