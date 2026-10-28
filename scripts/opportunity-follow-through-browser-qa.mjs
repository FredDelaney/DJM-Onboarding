import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 if(process.env.OPPORTUNITY_QA_ONLY!=='deals')for(const width of [320,390,768,1440]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const url=new URL(process.env.WORKSPACE_FLOW_QA_URL||'http://127.0.0.1:3113/workspace/qa-find-flow');
  url.search='?view=opportunities&tab=needs&scenario=need-review';
  for(let attempt=0;attempt<50;attempt++){try{await page.goto(url.href);break;}catch(error){if(attempt===49)throw error;await page.waitForTimeout(250);}}
  const row=page.locator('#opportunity-qa-need');
  const review=row.getByRole('button',{name:'Review Example FC: Centre back needed',exact:true});await review.waitFor({timeout:5000});
  assert.equal(await review.getAttribute('aria-expanded'),'false');
  await review.press('Enter');await row.getByRole('heading',{name:'Recorded player opportunities',exact:true}).waitFor();
  assert.equal(await review.getAttribute('aria-expanded'),'true');
  assert.equal(await page.evaluate(()=>window.qaOpenedOpportunity||null),null,'Reviewing a need cannot silently choose its first candidate');
  assert.equal(await page.evaluate(()=>(window.qaOpportunityCalls||[]).length),0,'Reviewing a need cannot start search preparation');
  await row.getByText('Showing 3 of 5 recorded candidates.',{exact:true}).waitFor();
  await row.getByText('Opportunity link unavailable',{exact:true}).waitFor();assert.equal(await row.getByRole('button',{name:'Open opportunity for Unlinked Candidate',exact:true}).count(),0);
  await row.getByText('Left',{exact:true}).waitFor();await row.getByText('185 cm',{exact:true}).waitFor();
  assert.equal(await row.getByText('Asked for current full-match footage.',{exact:true}).isVisible(),false,'Source conversation stays secondary');
  await row.getByText('Source conversation',{exact:true}).click();await row.getByText('Asked for current full-match footage.',{exact:true}).waitFor();
  const chosen=row.getByRole('button',{name:'Open opportunity for Chosen Player',exact:true});
  await chosen.click();
  assert.deepEqual(await page.evaluate(()=>({match:window.qaOpenedOpportunity.playerMatchId,player:window.qaOpenedOpportunity.playerId,club:window.qaOpenedOpportunity.clubId,gate:window.qaOpenedOpportunity.careerGateState})),{match:'chosen-match',player:'chosen-player',club:'qa-club',gate:'hold_player_decision'},'The explicit player choice preserves its recorded need, club and career gate');
  await chosen.press('Escape');
  assert.equal(await review.getAttribute('aria-expanded'),'false');assert.ok(await review.evaluate(node=>node===document.activeElement),'Escape returns to the reviewed need');
  await review.press('Space');await row.getByRole('heading',{name:'Recorded player opportunities',exact:true}).waitFor();
  const search=row.getByRole('button',{name:'Start search',exact:true});await search.click();
  const action=page.getByRole('dialog',{name:'Example FC · Centre back needed',exact:true});
  await action.getByRole('button',{name:'Close action workspace',exact:true}).waitFor();
  await page.waitForFunction(()=>(window.qaOpportunityCalls||[]).includes('scouting_mandate_prepare'));
  assert.deepEqual(await page.evaluate(()=>window.qaOpportunityCalls),['scouting_mandate_prepare'],'Only explicit search preparation enters the existing action flow');
  await page.waitForFunction(()=>!document.querySelector('button[aria-label="Close action workspace"]').disabled);await page.keyboard.press('Escape');await action.waitFor({state:'detached'});
  assert.ok(await search.evaluate(node=>node===document.activeElement),'The existing action returns to the exact need');
  await search.evaluate(node=>node.scrollIntoView({block:'center'}));
  const searchBox=await search.boundingBox(),navBox=width<=680?await page.getByRole('navigation',{name:'Mobile workspace',exact:true}).boundingBox():null;
  assert.ok(searchBox.y>=0&&searchBox.y+searchBox.height<=(navBox?.height?navBox.y:844)+1,'Start search remains reachable above mobile navigation: '+JSON.stringify({searchBox,navBox}));
  await row.getByText('Source conversation',{exact:true}).click();
  await row.getByText('Asked for current full-match footage.',{exact:true}).waitFor();
  assert.ok(await row.locator('[aria-label="Contact owner: Jesse Edge"]').locator('small,strong').evaluateAll(nodes=>nodes.every(node=>parseFloat(getComputedStyle(node).fontSize)>=12)),'Source responsibility remains readable');
  assert.ok(await row.evaluate(node=>[...node.querySelectorAll('button')].filter(node=>node.getBoundingClientRect().height>0).every(node=>node.getBoundingClientRect().height>=43.5)),'Need actions remain tappable');
  assert.deepEqual(await row.evaluate(node=>[...node.querySelectorAll('p,dd,strong')].filter(node=>node.getBoundingClientRect().height>0&&node.scrollWidth>node.clientWidth+1).map(node=>({text:node.textContent,scroll:node.scrollWidth,width:node.clientWidth}))),[],'Complete requirements and names wrap at '+width);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'The club need fits at '+width);
  if(width===390||width===1440){const output=process.env.OPPORTUNITY_QA_OUTPUT||'/tmp/redream-platform-programme/club-need-review';await mkdir(output,{recursive:true});await row.screenshot({path:output+'/need-'+width+'.png'});}
  const unknown=page.locator('#opportunity-unknown-need');
  assert.equal(await unknown.getByText('Coverage not recorded',{exact:false}).count(),1,'Missing coverage cannot become zero candidates');
  await unknown.getByRole('button',{name:/Review Other FC/}).click();await unknown.getByText('No player opportunities are shown for this need.',{exact:true}).waitFor();
  const expired=page.locator('#opportunity-expired-need');await expired.getByRole('button',{name:/Review Previous FC/}).click();
  assert.equal(await expired.getByRole('button',{name:'Start search',exact:true}).count(),0,'An expired need without an explicit status cannot start new work');
  assert.equal(await expired.getByRole('button',{name:'Open opportunity for Previous Candidate',exact:true}).count(),0);
  await expired.getByText('Previous Candidate',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);await page.close();console.log('PASS club need review, deliberate player/search choice, missing coverage, expiry and layout',width);
 }
 if(process.env.OPPORTUNITY_QA_ONLY!=='needs'){
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
 }
}finally{await browser.close();}
