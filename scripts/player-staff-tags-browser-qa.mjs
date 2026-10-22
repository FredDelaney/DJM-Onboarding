import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({args:['--no-sandbox']});
const root=process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113/qa-calendar';
const output='/tmp/redream-staff-tags-proof';await mkdir(output,{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 for(let attempt=0;attempt<60;attempt++)try{await page.goto(new URL('/qa-player-team',root).href);break;}catch(error){if(attempt===59)throw error;await page.waitForTimeout(250);}
 await page.getByRole('button',{name:'Tag staff',exact:true}).click();
 await page.getByLabel('Choose responsible people',{exact:true}).click();
 await page.getByRole('button',{name:'All staff',exact:true}).click();
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.getByRole('button',{name:'Save team',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Player team saved.'}).waitFor();
 await page.reload();
 await page.getByRole('region',{name:'Player team'}).getByText('Sam Taylor',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Tag staff',exact:true}).click();
 await page.getByRole('button',{name:'Remove Sam Taylor',exact:true}).click();
 await page.evaluate(()=>{window.teamConflict=true;});
 await page.getByRole('button',{name:'Save team',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'The player team changed.'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Remove Alex Walker',exact:true}).count(),1,'Draft survives a conflict');
 await page.getByRole('button',{name:'Reload team',exact:true}).click();
 await page.getByRole('region',{name:'Player team'}).getByText('Sam Taylor',{exact:true}).waitFor();
 await page.evaluate(()=>{window.teamConflict=false;});
 await page.getByRole('button',{name:'Tag staff',exact:true}).click();
 await page.getByRole('checkbox',{name:'All staff Includes staff who join the agency later.'}).check();
 await page.getByRole('button',{name:'Save team',exact:true}).click();
 await page.reload();await page.getByRole('region',{name:'Player team'}).getByText('All staff',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Tag staff',exact:true}).click();
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No player-team overflow at '+width);
  assert.ok(await page.getByRole('button',{name:'Save team',exact:true}).evaluate(node=>node.getBoundingClientRect().height>=44));
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/player-team-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.evaluate(()=>{window.slowTeamRead=true;});
 await page.reload();
 await page.getByRole('button',{name:'Switch player',exact:true}).click();
 await page.getByRole('heading',{name:'Chris Evans'}).waitFor();
 await page.getByRole('region',{name:'Player team'}).getByText('Alex Walker',{exact:true}).waitFor();
 await page.waitForTimeout(900);
 assert.equal(await page.getByRole('region',{name:'Player team'}).getByText('All staff',{exact:true}).count(),0,'An old player read cannot replace the new player team');
 await page.close();
 // Exercise the real Home coordinator with irrelevant high-priority records ahead of relevant work.
 const home=await browser.newPage({viewport:{width:390,height:844}});
 const player='30000000-0000-4000-8000-000000000001',other='30000000-0000-4000-8000-000000000002';
 let fail=false,delay=false;
 await home.route('https://example.supabase.co/**',async route=>{
  const body=route.request().postDataJSON()||{},path=new URL(route.request().url()).pathname;
  let result={};
  if(body.action==='tenants')result={tenants:[{tenant_id:'qa-tenant',slug:'qa',role:'owner',display_name:'Northstar Football Management'}]};
  else if(body.action==='home_focus')result={home:{attention:{judgement:[
   {command_id:'player:other',source_type:'player',source_id:other,title:'Unrelated player update',priority_score:99},
   {command_id:'player:mine',source_type:'player',source_id:player,title:'Australian player update',priority_score:80},
   {command_id:'player:follow-up',source_type:'player',source_id:player,command_type:'Player follow-up due',title:'Player follow-up',evidence:{next_action:'Confirm availability'},priority_score:75},
  ]}}};
  else if(path.endsWith('/redream_home_relevance_v1')){
   if(fail){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Temporary failure'})});return;}
   result={editable_indices:[],visible_indices:body.p_items.map((item,index)=>body.p_agency_overview||item.source_id===player?index:-1).filter(index=>index>=0)};
   if(delay&&body.p_agency_overview)await new Promise(resolve=>setTimeout(resolve,700));
  }
  else if(path.endsWith('/redream_assigned_work_page_v1'))result={items:[],next_cursor:null};
  else if(path.endsWith('/redream_autopilot_operations'))result={deadlines:{items:[]}};
  else if(path.endsWith('/redream_connected_work'))result={upcoming_meetings:[]};
  else if(path.endsWith('/redream_meeting_aftercare'))result={items:[]};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
 });
 await home.goto(new URL('/qa-command',root).href);
 await home.getByText('Australian player update',{exact:true}).waitFor();
 assert.equal(await home.getByText('Unrelated player update',{exact:true}).count(),0);
 const readonly=home.locator('article').filter({hasText:'Player follow-up: Confirm availability'});
 await readonly.getByRole('link',{name:'Review',exact:true}).waitFor();
 assert.equal(await readonly.getByRole('button',{name:'Update',exact:true}).count(),0,'Tagging must not offer unauthorised completion or editing');
 await home.getByRole('button',{name:'Agency overview',exact:true}).click();
 await home.getByText('Unrelated player update',{exact:true}).waitFor();
 delay=true;await home.getByRole('button',{name:'My work',exact:true}).click();
 await home.getByText('Australian player update',{exact:true}).waitFor();
 await home.getByRole('button',{name:'Agency overview',exact:true}).click();
 await home.getByRole('button',{name:'My work',exact:true}).click();
 await home.getByText('Australian player update',{exact:true}).waitFor();await home.waitForTimeout(800);
 assert.equal(await home.getByText('Unrelated player update',{exact:true}).count(),0,'Late overview must not replace My work');
 fail=true;await home.evaluate(()=>window.dispatchEvent(new Event('redream:responsibilities-updated')));
 await home.getByRole('button',{name:'Retry updates',exact:true}).waitFor();
 assert.equal(await home.getByText('Unrelated player update',{exact:true}).count(),0);
 fail=false;await home.getByRole('button',{name:'Retry updates',exact:true}).click();
 await home.getByText('Australian player update',{exact:true}).waitFor();
 await home.screenshot({path:output+'/personal-home-mobile.png',fullPage:true});
 assert.ok(await home.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);
 console.log('Player teams: multi-select, All staff, persistence, conflicts, stale selection and mobile passed. Home: personal filtering, manager overview, retry and stale-response protection passed.');
}finally{await browser.close();}
