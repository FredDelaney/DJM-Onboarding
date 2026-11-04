import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=process.env.WORKSPACE_FLOW_QA_URL||'http://127.0.0.1:3113/workspace/qa-find-flow';
await mkdir('/tmp/redream-athlivo-qa',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 for(const width of [1440,390]){
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
  // Recruitment is included in Players but remains a separate, unpromoted record.
  const prospectRow=directory.getByRole('row').filter({hasText:'Recruitment Prospect'});
  await prospectRow.waitFor();
  assert.equal(await prospectRow.getByText('Prospected',{exact:true}).count(),1);
  assert.equal(await prospectRow.getByRole('button',{name:'Manage agents for Recruitment Prospect'}).count(),0);
  console.log('Players and recruitment prospect hydrated at '+width+'px');
  await page.screenshot({path:'/tmp/redream-athlivo-qa/players-'+width+'.png',fullPage:false});
  assert.ok(await directory.getByRole('row').count()>5);
  await directory.locator('summary').filter({hasText:'Filter'}).click();
  await directory.getByRole('button',{name:'Position',exact:true}).click();
  await directory.getByRole('combobox',{name:'Filter position'}).selectOption('Centre back');
  assert.ok(await directory.getByRole('row').count()>5);
  await directory.getByRole('button',{name:'Clear all'}).click();
  await directory.locator('summary').filter({hasText:'Filter'}).click();
  await directory.locator('summary').filter({hasText:'Filter'}).click();
  await directory.getByRole('button',{name:'Status',exact:true}).click();
  await directory.getByRole('combobox',{name:'Agency status filter'}).selectOption('prospected');
  assert.equal(await directory.getByRole('row').count(),2,'Prospected filters to the single recruitment record');
  await directory.getByRole('button',{name:'Clear all'}).click();
  await directory.locator('summary').filter({hasText:'Filter'}).click();
  await directory.getByRole('button',{name:'Open Recruitment Prospect'}).click();
  await page.waitForURL(url=>url.searchParams.get('target')==='qa-target'&&url.searchParams.get('fromRoster')==='1');
  await page.getByRole('region',{name:'Recruitment target workspace'}).getByRole('heading',{name:'Recruitment Prospect'}).waitFor();
  await page.getByRole('button',{name:'Back to Players'}).click();
  await page.waitForURL(url=>!url.searchParams.has('target')&&!url.searchParams.has('tab'));
  await directory.getByRole('button',{name:'Open José Silva'}).click();
  const player=page.getByRole('region',{name:'José Silva player workspace'});
  await player.waitFor();
  await player.getByRole('heading',{name:'Club Information',exact:true}).waitFor();
  await page.screenshot({path:'/tmp/redream-athlivo-qa/player-profile-'+width+'.png',fullPage:false});
  for(const tab of ['Tasks','Updates','Deals','Profile']){
   await player.getByRole('navigation',{name:'Player sections'}).getByRole('button',{name:tab}).click();
   if(tab==='Tasks')await player.getByRole('heading',{name:'Tasks',exact:true}).waitFor();
   if(tab==='Updates')await player.getByRole('heading',{name:'Updates',exact:true}).waitFor();
   if(tab==='Deals')await player.getByRole('heading',{name:'Shortlisted & Pitched'}).waitFor();
   if(tab==='Profile')await player.getByRole('heading',{name:'Club Information',exact:true}).waitFor();
   if(tab!=='Profile')await page.screenshot({path:'/tmp/redream-athlivo-qa/player-'+tab.toLowerCase()+'-'+width+'.png',fullPage:false});
  }
  await player.getByRole('button',{name:'Edit player',exact:true}).click();
  await player.getByRole('heading',{name:'Edit player',exact:true}).waitFor();
  await page.screenshot({path:'/tmp/redream-athlivo-qa/player-edit-'+width+'.png',fullPage:false});
  await player.getByRole('button',{name:'Close editing'}).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No page overflow '+width);
  await page.close();
 }
 console.log('Athlivo-inspired roster and player workspace: table, filters, tabs, edit UI and responsive screenshot checks passed.');
} finally{await browser.close();}
