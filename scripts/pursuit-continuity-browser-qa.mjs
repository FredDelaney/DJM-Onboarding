import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=(process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113/qa-calendar').replace(/\/qa-calendar$/,'/qa-pursuit-continuity');
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox']});
const page=await browser.newPage(),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 for(const presentation of ['page','drawer'])for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:844});
  for(let i=0;i<50;i++){try{await page.goto(root+'?presentation='+presentation);break;}catch(error){if(i===49)throw error;await page.waitForTimeout(500);}}
  await page.locator('[data-qa-ready="true"]').waitFor();
  await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
  const pursuit=page.getByRole(presentation==='page'?'region':'dialog',{name:'Example Player to Example FC Pursuit Room',exact:true});
  const followUp=pursuit.getByRole('button',{name:'Set follow-up',exact:true}).first();
  await followUp.waitFor();await followUp.click();
  const action=page.getByRole('dialog',{name:'Example Player → Example FC',exact:true});
  const input=action.getByRole('textbox',{name:'Next action',exact:true});
  await input.fill('Call the sporting director');
  await page.keyboard.press('Escape');
  assert.equal(await pursuit.count(),1,'Escape closed the pursuit underneath the follow-up at '+width+' ('+presentation+')');
  await action.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','Pursuit lost its scroll lock');
  assert.ok(await followUp.evaluate(node=>node===document.activeElement),'Focus did not return to follow-up');
  await followUp.click();await input.waitFor();
  await action.getByRole('button',{name:/Close/}).click();
  assert.equal(await pursuit.count(),1,'Close button closed the pursuit');
  assert.ok(await followUp.evaluate(node=>node===document.activeElement),'Close button did not restore focus');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow at '+width);
  await followUp.focus();await page.keyboard.press('Escape');
  await pursuit.waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'','Leaving the pursuit did not restore scrolling');
 }
 assert.deepEqual(errors,[]);console.log('Pursuit continuity passed: nested follow-up dismissal, focus return, scroll restoration, 320/390/1440px, page and drawer.');
}finally{await browser.close();}
