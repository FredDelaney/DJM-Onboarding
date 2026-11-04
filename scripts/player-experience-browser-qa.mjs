import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=process.env.WORKSPACE_FLOW_QA_URL||'http://127.0.0.1:3113/workspace/qa-find-flow';
await mkdir('/tmp/redream-athlivo-qa',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 for(const width of [1440,768,390,320]){
  const page=await browser.newPage({viewport:{width,height:900}});
  for(let attempt=0;attempt<60;attempt++){try{await page.goto(root+'?view=players');break;}catch(error){if(attempt===59)throw error;await page.waitForTimeout(250);}}
  // Wait for client hydration before clicking; CI Chromium can paint the
  // server-rendered roster before React has attached the view-switch handler.
  await page.locator('[data-qa-ready="true"]').waitFor();
  const directory=page.getByRole('region',{name:'Players directory'});
  if(width<=680){
   const cardView=directory.getByRole('button',{name:'Card view'});
   await cardView.waitFor();
   await page.waitForFunction(()=>document.querySelector('button[aria-label="Card view"]')?.getAttribute('aria-pressed')==='true');
   await directory.getByRole('button',{name:'Table view'}).click();
   await page.waitForFunction(()=>document.querySelector('button[aria-label="Table view"]')?.getAttribute('aria-pressed')==='true');
  }
  await directory.getByRole('table').waitFor();
  console.log('Players hydrated, table visible at '+width+'px');
  await page.screenshot({path:'/tmp/redream-athlivo-qa/players-'+width+'.png',fullPage:false});
  assert.ok(await directory.getByRole('row').count()>5);
  await directory.locator('summary').filter({hasText:'Filter'}).click();
  await directory.getByRole('button',{name:'Position',exact:true}).click();
  await directory.getByRole('combobox',{name:'Filter position'}).selectOption('Centre back');
  assert.ok(await directory.getByRole('row').count()>5);
  await directory.getByRole('button',{name:'Clear all'}).click();
  await directory.locator('summary').filter({hasText:'Filter'}).click();
  await directory.getByRole('button',{name:'Open José Silva'}).click();
  const player=page.getByRole('region',{name:'José Silva player workspace'});
  await player.waitFor();
  await player.getByRole('heading',{name:'Club Information',exact:true}).waitFor();
  assert.equal(await player.getByRole('link',{name:'Player Profile',exact:true}).count(),1);
  const club=player.getByRole('link',{name:'Verified Club',exact:true});
  assert.match(await club.getAttribute('href'),/\?view=network&network=clubs&clubsv2=1&club=30000000-0000-4000-8000-000000000011$/);
  await page.screenshot({path:'/tmp/redream-athlivo-qa/player-profile-'+width+'.png',fullPage:false});
  for(const tab of ['Tasks','Updates','Deals','Profile']){
   await player.getByRole('navigation',{name:'Player sections'}).getByRole('button',{name:tab}).click();
   if(tab==='Tasks'){
    await player.getByRole('heading',{name:'Tasks',exact:true}).waitFor();
    const task=player.getByRole('link',{name:'Open task: Review full-match footage',exact:true});
    assert.match(await task.getAttribute('href'),/\?view=calendar&work=task&task=50000000-0000-4000-8000-000000000011$/);
    assert.ok((await task.boundingBox()).height>=44);
   }
   if(tab==='Updates')await player.getByRole('heading',{name:'Updates',exact:true}).waitFor();
   if(tab==='Deals'){
    await player.getByRole('heading',{name:'Deals',exact:true}).waitFor();
    const deal=player.getByRole('link',{name:'Open deal: Summer transfer discussion',exact:true});
    assert.match(await deal.getAttribute('href'),/\?view=opportunities&tab=deals&record=60000000-0000-4000-8000-000000000011$/);
    assert.ok((await deal.boundingBox()).height>=44);
   }
   if(tab==='Profile')await player.getByRole('heading',{name:'Club Information',exact:true}).waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No '+tab+' overflow '+width);
   if(tab!=='Profile')await page.screenshot({path:'/tmp/redream-athlivo-qa/player-'+tab.toLowerCase()+'-'+width+'.png',fullPage:false});
  }
  await player.getByRole('button',{name:'Edit player',exact:true}).click();
  await player.getByRole('heading',{name:'Edit player',exact:true}).waitFor();
  await page.screenshot({path:'/tmp/redream-athlivo-qa/player-edit-'+width+'.png',fullPage:false});
  await player.getByRole('button',{name:'Close editing'}).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No page overflow '+width);
  await page.close();
 }
 const page=await browser.newPage({viewport:{width:390,height:900}});
 const selected=root+'?view=players&player=qa-player-0';
 await page.goto(selected+'&scenario=player-record-recovery');
 await page.getByRole('alert').filter({hasText:'The player record could not be confirmed.'}).waitFor();
 assert.equal(await page.getByText('Wrong player',{exact:true}).count(),0);
 assert.equal(await page.getByRole('heading',{name:'Club Information',exact:true}).count(),0);
 await page.evaluate(()=>{window.qaPlayerReadRecovered=true;});
 await page.getByRole('button',{name:'Retry',exact:true}).click();
 await page.getByRole('link',{name:'Verified Club',exact:true}).waitFor();

 await page.goto(selected+'&scenario=player-connections-legacy');
 await page.getByRole('button',{name:'Tasks',exact:true}).click();
 await page.getByText('Linked tasks are unavailable here.',{exact:false}).waitFor();
 assert.equal(await page.getByText('No open linked tasks',{exact:true}).count(),0);

 await page.goto(selected+'&role=agent');
 await page.getByRole('heading',{name:'Assigned player',exact:true}).waitFor();
 assert.equal(await page.getByText('Administrator access required',{exact:true}).count(),0);
 assert.equal(await page.getByRole('navigation',{name:'Player sections'}).count(),0);
 await page.close();
 console.log('Player directory and detail: four widths, exact club/task/deal links, recoverable record mismatch, missing task data and assigned-player privacy passed.');
} finally{await browser.close();}
