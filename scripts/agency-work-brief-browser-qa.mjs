import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(15000);
 await page.addInitScript(()=>{
 if(location.hostname!=='127.0.0.1')return;
 const user={id:'10000000-0000-4000-8000-000000000001',email:'synthetic@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
 const token='eyJhbGciOiJIUzI1NiJ9.'+btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600}))+'.fixture';
 localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user}));
 });
 const actor='10000000-0000-4000-8000-000000000001',id='11111111-1111-4111-8111-111111111111';
 const record={kind:'player',id,title:'Dylan Example'};
 const brief={mode:'brief',record,as_of:'2026-10-21T09:00:00Z',time_zone:'Europe/Rome',user_id:actor,notes_visible:true,
 tasks:Array.from({length:6},(_,i)=>({kind:i===1?'calendar_task':'task',id:`11111111-1111-4111-8111-11111111111${i}`,title:i?'Review the recorded club response with the recruitment team':'Call the club about Dylan’s next move',status:'open',due_at:i===2?null:'2026-10-20T10:30:00Z',due_on:i===2?'2026-10-21':null,date_only:i===2,overdue:i!==2,owner_user_id:actor,owner_name:'You',shared:true,people:[{user_id:actor,display_name:'You'},{user_id:id,display_name:'Alexandra Example-With-A-Long-Surname'}],context:{player_id:id}})),
 notes:[{id,summary:'Reported conversation: request club feedback before agreeing terms.',occurred_at:'2026-10-20T10:00:00Z',source_type:'reported',confidence:0.4}],
 blockers:[{id,title:'Recorded club conversation',blocker:'Waiting for the sporting director to confirm a meeting.',next_decision:'Review whether a meeting is useful.'}]};
 const calls=[],unexpected=[],errors=[];let fail=false,hold=false,limited=false,release;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://example.supabase.co/**',async route=>{
 const req=route.request(),path=new URL(req.url()).pathname;
 if(path.endsWith('/rpc/redream_agency_work_brief_v1')){
 const args=req.postDataJSON();calls.push({args,workspace:req.headers()['x-redream-workspace']});
 if(hold)await new Promise(resolve=>release=resolve);
 if(fail)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'record_access_denied'})});
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(args.p_id?brief:args.p_search==null?{...brief,record:null,...(limited?{tasks:[],limited:true}:{})}:{mode:'choose',search:args.p_search,candidates:[record,{...record,id:'22222222-2222-4222-8222-222222222222',title:'Dylan Second'}],as_of:brief.as_of})});
 }
 if(path.includes('/functions/v1/'))unexpected.push(path);
 return route.fulfill({status:200,contentType:'application/json',body:'[]'});
 });
 const url=new URL('/qa-redream-agent',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
 for(let attempt=0;attempt<60;attempt++){try{await page.goto(url.href);break;}catch(error){if(attempt===59)throw error;await page.waitForTimeout(250);}}
 await page.getByRole('button',{name:'Ask a question',exact:true}).click();
 const question=page.getByRole('textbox',{name:'Your question',exact:true});
 await question.fill('What do I still need to do for Dylan?');await page.getByRole('button',{name:'Ask ReDream',exact:true}).click();
 await page.getByRole('heading',{name:'Which record did you mean?'}).waitFor();
 assert.equal(calls[0].args.p_search,'Dylan');assert.equal(calls[0].workspace,'djm');
 await page.getByRole('button',{name:'Dylan Example player',exact:true}).click();
 const panel=page.getByRole('region',{name:'Your work brief'});
 await panel.waitFor();assert.equal(calls[1].args.p_id,id);
 assert.match(await panel.innerText(),/6 open/);assert.match(await panel.innerText(),/Shared/);
 assert.match(await panel.getByRole('link',{name:'Open record',exact:true}).first().getAttribute('href'),/^\/workspace\/djm\?view=players&profile=1&player=/);
 assert.match(await panel.getByRole('link',{name:'Open task',exact:true}).getAttribute('href'),/^\/workspace\/djm\?view=calendar&task=/);
 await panel.getByText('Recent recorded notes',{exact:false}).click();
 await panel.getByText('Reported conversation: request club feedback before agreeing terms.',{exact:true}).waitFor();
 await panel.getByRole('button',{name:'Show all 6 items'}).click();assert.equal(await panel.getByRole('button',{name:'Update with Tell',exact:true}).count(),6);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`No overflow at ${width}`);}
 await page.setViewportSize({width:390,height:844});
 await panel.screenshot({path:'/tmp/redream-agency-work-brief-mobile.png'});
 await panel.getByRole('button',{name:'Plan a follow-up',exact:true}).last().click();
 const update=page.getByRole('textbox',{name:'Your update',exact:true});
 assert.match(await update.inputValue(),/about Dylan Example\. Recorded context: Reported conversation/);assert.match(await update.inputValue(),/Next action and due date: $/);
 assert.deepEqual(unexpected,[],'A work question and reviewed handoff never call a model, capture or mutation');
 await page.getByRole('button',{name:'Ask a question',exact:true}).click();
 assert.equal(await page.getByText('Review your update, then send it to ReDream.',{exact:true}).count(),0,'Tell review instructions do not linger in Ask');
 fail=true;await panel.getByRole('button',{name:'Refresh work brief'}).click();
 await page.getByRole('alert').getByText('This record is unavailable in this workspace. Check access or choose another record.').waitFor();
 assert.equal(await panel.count(),0,'An old brief does not remain presented as current after a failed refresh');
 fail=false;await page.getByRole('button',{name:'Retry',exact:true}).click();await panel.waitFor();assert.equal(calls.at(-1).args.p_id,id,'Retry retains the explicit selected record');
 await page.clock.install();hold=true;release=undefined;
 await panel.getByRole('button',{name:'Refresh work brief'}).click();
 while(!release)await page.waitForTimeout(10);
 await page.clock.fastForward(12500);
 await page.getByRole('alert').getByText('The request took too long. Please try again.').waitFor();
 assert.equal(await panel.count(),0);const late=release;hold=false;
 await page.getByRole('button',{name:'Retry',exact:true}).click();await panel.waitFor();late();
 await page.clock.resume();
 hold=true;release=undefined;await panel.getByRole('button',{name:'Refresh work brief'}).click();
 await page.getByRole('status').getByText('Thinking...',{exact:true}).waitFor();
 // The request is bounded; allow its late response only after another workspace is selected.
 while(!release)await page.waitForTimeout(10);
 await page.getByRole('button',{name:'Switch test workspace',exact:true}).click();release();
 await page.getByRole('button',{name:'Ask a question',exact:true}).click();assert.equal(await panel.count(),0);
 hold=false;
 await page.getByRole('button',{name:'Clear test record context',exact:true}).click();
 await page.getByRole('button',{name:'My work',exact:true}).click();
 assert.equal(await page.getByRole('textbox',{name:'Your question',exact:true}).inputValue(),'Show my work');
 await page.getByRole('button',{name:'Ask ReDream',exact:true}).click();
 await page.getByRole('heading',{name:'My priorities',exact:true}).waitFor();
 limited=true;await panel.getByRole('button',{name:'Refresh work brief'}).click();
 await panel.getByText('No items in this limited selection. Open Calendar or the record to review the rest.',{exact:true}).waitFor();
 assert.equal(await panel.getByText('No open work is recorded for you.',{exact:true}).count(),0,'A truncated result cannot assert that no work exists');
 assert.equal(calls.at(-1).args.p_search,null);assert.equal(calls.at(-1).workspace,'northstar');
 assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
 console.log('Agency work brief: ambiguity, exact scope, shared ownership, source links, notes, mobile widths, editable handoff, retry, bounded deadlines and stale-workspace protection passed.');
}finally{await browser.close();}
