import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
const output='/tmp/redream-platform-programme/roster';
await mkdir(output,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const url=new URL('/qa-player-priorities',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
 for(let attempt=0;attempt<60;attempt++){
  try{await page.goto(url.href);break;}catch(error){if(attempt===59)throw error;await page.waitForTimeout(250);}
 }
 const directory=()=>page.getByRole('region',{name:'Players directory'});
 const open=async name=>{
  const target=directory().getByRole('button',{name:'Open '+name,exact:true});
  await target.waitFor({state:'visible'});
  // Complete route transitions before interacting with the next record, so
  // a late URL update from the previous player cannot replace this view.
  await target.click({timeout:10000});
  await page.waitForURL(url=>Boolean(url.searchParams.get('player')),{timeout:10000});
  await page.getByRole('region',{name:name+' player workspace',exact:true}).waitFor();
  return page.getByRole('region',{name:name+' player workspace',exact:true});
 };
 const back=async()=>{
  await page.getByRole('button',{name:'Back to Players',exact:true}).click();
  await page.waitForURL(url=>!url.searchParams.has('player'),{timeout:10000});
  await directory().waitFor();
 };
 const prepared=async()=>JSON.parse(await page.getByLabel('Prepared action').textContent());
 const tabs=(player)=>player.getByRole('navigation',{name:'Player sections'});
 await directory().waitFor();
 // The fixture is a responsive functional test, not an animation test. Avoid
 // smooth scrolling during repeated route and viewport transitions.
 await page.addStyleTag({content:'html,body{scroll-behavior:auto!important}'});
 await page.waitForFunction(()=>document.querySelector('button[aria-label="Card view"]')?.getAttribute('aria-pressed')==='true');
 // The roster is now a clean Athlivo-inspired directory; player work belongs
 // inside each player record rather than being cramped into every row.
 assert.equal(await directory().getByRole('button',{name:'Open Plan Player',exact:true}).count(),1);
 assert.equal(await page.getByText('Needs action',{exact:true}).count(),0);
 assert.equal(await page.getByText('Set one concrete player next action and due date.',{exact:true}).count(),0);

 let player=await open('Plan Player');
 await player.getByText('Keep the player plan current.',{exact:true}).waitFor();
 await player.getByRole('button',{name:'Review next action',exact:false}).click();
 let action=await prepared();
 assert.equal(action.action,'player_service_move_prepare');
 assert.equal(action.payload.player_id,'setup');
 await back();

 player=await open('Contract Player');
 await player.getByText('Agree the extension strategy.',{exact:true}).waitFor();
 await player.getByRole('button',{name:'Review next action',exact:false}).click();
 action=await prepared();
 assert.equal(action.action,'player_service_move_prepare');
 assert.equal(action.payload.player_id,'contract');
 assert.equal(action.instruction,'Agree the extension strategy.');
 await back();

 player=await open('Overdue Player');
 await tabs(player).getByRole('button',{name:'Tasks'}).click();
 await player.getByText('Call the club about the trial',{exact:true}).waitFor();
 assert.equal(await player.getByText('Agree the next career step with the player',{exact:true}).count(),0);
 await back();

 player=await open('Future Player');
 await tabs(player).getByRole('button',{name:'Tasks'}).click();
 await player.getByText('Confirm the summer schedule',{exact:true}).waitFor();
 await back();

 player=await open('Undated Player');
 await tabs(player).getByRole('button',{name:'Tasks'}).click();
 await player.getByText('Discuss the recorded offer',{exact:true}).waitFor();
 await player.getByText('No due date recorded',{exact:true}).waitFor();
 await player.getByRole('button',{name:'Set due date for Undated Player'}).click();
 action=await prepared();
 assert.equal(action.action,'player_control_fix_prepare');
 assert.equal(action.payload.player_id,'undated');
 await back();

 player=await open('Assigned Player');
 await player.getByRole('heading',{name:'Assigned player',exact:true}).waitFor();
 assert.equal(await player.getByText('Private objective',{exact:true}).count(),0);
 assert.equal(await player.getByRole('button',{name:'Edit player'}).count(),0);
 await back();

 player=await open('Quiet Player');
 await tabs(player).getByRole('button',{name:'Tasks'}).click();
 await player.getByText('No next action recorded',{exact:true}).first().waitFor();
 await back();

 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:844});
  await directory().waitFor();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+': no page overflow');
  if(width>=768){
   // Resizing from mobile fires matchMedia/change asynchronously. Wait for the
   // rendered table, not merely for a matching accessible label on a hidden row.
   await page.waitForFunction(()=>{
    const view=document.querySelector('button[aria-label="Table view"]');
    return view?.getAttribute('aria-pressed')==='true';
   },undefined,{timeout:5000});
   const row=directory().getByRole('button',{name:'Open Contract Player',exact:true});
   await row.waitFor({state:'visible'});
   const bounds=await row.boundingBox();
   assert.ok(bounds&&bounds.height>=44,width+': table row is a usable target ('+JSON.stringify(bounds)+')');
  }else{
   await page.waitForFunction(()=>{
    const view=document.querySelector('button[aria-label="Card view"]');
    return view?.getAttribute('aria-pressed')==='true';
   },undefined,{timeout:5000});
   await directory().getByRole('button',{name:'Open Contract Player',exact:true}).waitFor({state:'visible'});
  }
  await page.screenshot({path:output+'/'+width+'.png',fullPage:false});
  console.log('PASS player roster, next actions, privacy and layout '+width);
 }
 assert.deepEqual(errors,[],'No browser errors');
}finally{await browser.close();}
