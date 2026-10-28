import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({executablePath:process.env.CALENDAR_CHROMIUM,args:['--no-sandbox','--disable-dev-shm-usage']});
const captureId='30000000-0000-4000-8000-000000000001', taskId='40000000-0000-4000-8000-000000000001';
const completed={id:'complete',status:'applied',action_type:'update_task',target_type:'task',target_id:taskId,undo_supported:true,evidence:'I spoke to James about Dylan availability',resolved_payload:{task_title:'Call James about Dylan',operation:'complete',owner_display_name:'You'}};
const followup={id:'followup',status:'pending',action_type:'create_task',evidence:'Alex and Moses will send the profile tomorrow',resolved_payload:{title:'Send updated profile',owner_display_name:'Alex Agent',responsible_display_names:['Alex Agent','Moses Agent'],due_at:'2026-10-21T09:00:00+02:00'}};
const receipt=(actions,status='needs_review',questions=[])=>({capture:{id:captureId,status,summary:'AI summary is not a saved receipt',transcript_text:'I spoke to James about Dylan availability. Alex and Moses will send the profile tomorrow.'},actions,questions});
let current=receipt([completed,followup]),approvals=0,undo=0,dismiss=0,holdEdit=false,releaseEdit;
try{
 const page=await browser.newPage({viewport:{width:390,height:600}}),errors=[];
 await page.addInitScript(()=>{
  if(location.hostname!=='127.0.0.1'||sessionStorage.getItem('qa-tell-auth'))return;
  sessionStorage.setItem('qa-tell-auth','1');
  const user={id:'10000000-0000-4000-8000-000000000001',email:'synthetic@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}};
  const token='eyJhbGciOiJIUzI1NiJ9.'+btoa(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600}))+'.fixture';
  localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user}));
 });
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://example.supabase.co/**',async route=>{
  const path=new URL(route.request().url()).pathname; let data=[];
  if(path.endsWith('/redream_ai_receipt'))data=current;
  else if(path.endsWith('/redream_ai_approve_capture')){
   approvals++;
   current=approvals===1?receipt([completed,{...followup,status:'failed',error_message:'The task could not save. Try again.'}],'partial'):receipt([completed,{...followup,status:'applied',target_type:'task',target_id:taskId,undo_supported:true}],'done');
   data={receipt:current};
  }else if(path.endsWith('/redream_ai_undo_action')){undo++;current=receipt([{...completed,status:'undone'}, {...followup,status:'applied'}],'done');data={undone:true,duplicate:true};}
  else if(path.endsWith('/redream_ai_dismiss_action')){dismiss++;current=receipt([{...followup,status:'superseded'}],'done');data=current;}
  else if(path.endsWith('/redream_ai_answer_question')){current=receipt([{...completed,status:'pending'}]);data={capture_id:captureId};}
  else if(path.endsWith('/redream_ai_delete_capture')){if(holdEdit)await new Promise(resolve=>{releaseEdit=resolve;});data={ok:true};}
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const url=new URL('/qa-tell-work',process.env.CALENDAR_QA_URL||'http://127.0.0.1:3113');
 for(let i=0;i<60;i++){try{await page.goto(url.href);break;}catch(error){if(i===59)throw error;await page.waitForTimeout(250);}}
 await page.getByText('Completed: Call James about Dylan',{exact:true}).waitFor();
 await page.getByText('Proposed: Send updated profile',{exact:true}).waitFor();
 await page.getByText('Responsible people',{exact:true}).waitFor();await page.getByText('Alex Agent + Moses Agent',{exact:true}).waitFor();assert.equal(approvals,0,'Shared responsibility remains a proposal until approval');
 await page.getByText('Saved changes are listed below. Approve the remaining proposals.',{exact:true}).waitFor();
 assert.equal(await page.getByText('AI summary is not a saved receipt',{exact:true}).count(),0);
 for(const viewport of [{width:320,height:360},{width:390,height:460},{width:768,height:600},{width:1440,height:900}]){
  await page.setViewportSize(viewport);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.getByRole('button',{name:'Approve & save',exact:true}).scrollIntoViewIfNeeded();
  assert.ok(await page.getByRole('button',{name:'Approve & save',exact:true}).isVisible());
 }
 await page.getByRole('button',{name:'Approve & save',exact:true}).click();
 await page.getByRole('button',{name:'Retry approved changes',exact:true}).waitFor();
 await page.getByRole('link',{name:'Open follow-up: Call James about Dylan',exact:true}).waitFor();
 await page.getByText('Failed: Send updated profile',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Retry approved changes',exact:true}).click();
 await page.getByText('Follow-up created',{exact:true}).waitFor();
 assert.equal(approvals,2);
 await page.getByRole('button',{name:'Undo',exact:true}).first().click();
 await page.getByText('Undone: Complete: Call James about Dylan',{exact:true}).waitFor();
 assert.equal(undo,1);
 current=receipt([{...followup,status:'needs_review',resolved_payload:{},proposed_payload:{title:'Send updated profile',owner_names:['Alex','Moses'],_review_reason:'Choose the responsible people.'}}]);
 await page.reload();
 await page.getByRole('button',{name:'Edit original note',exact:true}).waitFor();
 await page.getByText('Choose the responsible people.',{exact:true}).waitFor();
 assert.equal(await page.getByText('You',{exact:true}).count(),0,'Unresolved responsibility cannot be presented as assigned to the speaker');
 await page.getByRole('button',{name:'Leave unchanged',exact:true}).click();
 await page.getByText('Review complete. No changes were saved.',{exact:true}).waitFor(); assert.equal(dismiss,1);
 current=receipt([], 'needs_input',[{id:'choose-task',status:'open',prompt:'Which task did you mean?',candidates:[{kind:'task',task_id:taskId,label:'Call James about Dylan'},{kind:'task',task_id:'other-task',label:'Call James about another player'}]}]);
 await page.reload(); await page.getByRole('button',{name:'Call James about Dylan',exact:true}).click();
 await page.getByText('Complete: Call James about Dylan',{exact:true}).waitFor();
 assert.equal(approvals,2,'Choosing a task does not approve it');
 const longTitle='Send the reviewed player dossier and the confirmed trial availability to the recruitment team before the next transfer meeting';
 const secondTask='40000000-0000-4000-8000-000000000002';
 current=receipt([completed,{...followup,status:'applied',target_type:'task',target_id:secondTask,resolved_payload:{title:longTitle}}],'done');await page.reload();
 const exactFollowup=page.getByRole('link',{name:'Open follow-up: '+longTitle,exact:true});await exactFollowup.waitFor();
 assert.equal(await exactFollowup.getAttribute('href'),'/workspace/qa-tell-work?view=calendar&work=task&task='+secondTask);
 assert.equal(await page.getByRole('link',{name:/^Open follow-up/}).count(),2,'Each confirmed task has its own identifiable destination');
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:844});await exactFollowup.scrollIntoViewIfNeeded();const box=await exactFollowup.boundingBox();assert.ok(box.height>=44&&box.width<=width);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Long task links wrap at '+width);}
 current=receipt([{...followup,status:'applied',resolved_payload:{},proposed_payload:{title:'Unconfirmed title',responsible_display_names:['Unconfirmed colleague']}}],'done');await page.reload();
 await page.getByText('Follow-up created',{exact:true}).waitFor();
 assert.equal(await page.getByText('Unconfirmed colleague',{exact:true}).count(),0,'An empty confirmed payload cannot promote proposed ownership into a saved fact');
 assert.equal(await page.getByText('Unconfirmed title',{exact:true}).count(),0);
 current=receipt([{...followup,status:'needs_review'}]);await page.reload();
 holdEdit=true;await page.getByRole('button',{name:'Edit original note',exact:true}).click();
 await page.getByRole('button',{name:'Sign out test account',exact:true}).click();
 await page.getByRole('button',{name:'Type instead',exact:true}).waitFor();releaseEdit();
 await page.getByRole('button',{name:'Type instead',exact:true}).click();
 await page.waitForTimeout(100);
 assert.equal(await page.getByRole('textbox',{name:'Your update',exact:true}).inputValue(),'','A late edit cannot restore another signed-in user’s transcript');
 assert.deepEqual(errors,[]);
 console.log('Tell work: partial success, failed-action retry, truthful receipts, clarification, dismissal, Undo and four mobile/desktop widths passed.');
}finally{await browser.close();}
