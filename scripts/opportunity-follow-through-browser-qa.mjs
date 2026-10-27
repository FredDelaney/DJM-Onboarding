import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const url=new URL(process.env.WORKSPACE_FLOW_QA_URL||'http://127.0.0.1:3113/workspace/qa-find-flow');
  url.search='?view=opportunities&tab=deals&scenario=deal-follow-through';
  for(let attempt=0;attempt<50;attempt++){try{await page.goto(url.href);break;}catch(error){if(attempt===49)throw error;await page.waitForTimeout(250);}}
  const row=page.locator('#opportunity-qa-deal');await row.waitFor();
  await row.focus();await page.keyboard.press('Enter');
  const room=page.locator('[class*="pagePanel"]');await room.getByRole('heading',{name:'Example transfer',exact:true}).waitFor();
  assert.equal(await room.getByRole('heading',{name:'Example transfer',exact:true}).evaluate(node=>node===document.activeElement),true,'The deal page receives focus');
  assert.equal(await row.evaluate(node=>!!node.closest('[inert]')),true,'The covered list is isolated');
  assert.equal(await page.evaluate(()=>(window.qaOpportunityCalls||[]).filter(name=>name==='deal_control_fix_prepare').length),0,'Opening a deal does not start owner assignment');
  await room.getByRole('button',{name:'Fix deal control',exact:true}).waitFor();
  await room.getByRole('button',{name:'Back',exact:true}).click();await room.waitFor({state:'detached'});
  assert.equal(await row.evaluate(node=>node===document.activeElement),true,'Back returns to the deal row');
  const assign=row.getByRole('button',{name:'Assign owner',exact:true});await assign.click();
  const action=page.getByRole('dialog',{name:'Example transfer',exact:true});
  const owner=action.getByLabel('Responsible staff member',{exact:true});await owner.waitFor();
  const blocker=action.getByText('Club requests current footage and confirmation of availability before the recruitment meeting.',{exact:true});
  assert.ok(await blocker.evaluate(node=>node.scrollWidth<=node.clientWidth+1),'The primary blocker wraps instead of being truncated at '+width);
  assert.equal(await action.getByRole('button',{name:'Close action workspace',exact:true}).evaluate(node=>node===document.activeElement),true);
  await page.keyboard.press('Escape');await action.waitFor({state:'detached'});
  assert.equal(await assign.evaluate(node=>node===document.activeElement),true,'Explicit owner assignment returns to its opener');
  await row.focus();await page.keyboard.press('Space');await room.waitFor();
  await room.getByRole('button',{name:'Fix deal control',exact:true}).click();await owner.waitFor();
  await owner.selectOption('qa-owner');await page.keyboard.press('Escape');await action.waitFor({state:'detached'});
  assert.equal(await room.isVisible(),true,'The deal stays open beneath its dismissed action');
  assert.equal(await room.getByRole('button',{name:'Fix deal control',exact:true}).evaluate(node=>node===document.activeElement),true,'The nested action restores the deal control');
  await page.keyboard.press('Escape');await room.waitFor({state:'detached'});
  assert.equal(await row.evaluate(node=>node===document.activeElement),true,'Escape returns from the deal page');
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'','The last page releases scrolling');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow at '+width);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Opportunity follow-through: stable deal overview, explicit owner action, nested action focus/Escape/return and four widths passed');
}finally{await browser.close();}
