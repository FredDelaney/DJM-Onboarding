import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import * as safety from '../supabase/functions/_shared/ai-safety.ts';
import * as work from '../supabase/functions/_shared/task-work.ts';
import * as preparation from '../supabase/functions/_shared/capture-preparation.ts';

const source=ts.transpileModule(readFileSync('supabase/functions/_shared/ai-process.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const task={id:'task-a',title:'Speak to James about Dylan availability',status:'open',owner_user_id:'user-a',updated_at:'2026-10-20T09:00:00Z',person_name:'James Smith',player_name:'Dylan Example'};
const action={key:'completed-call',type:'update_task',operation:'complete',task_ids:['task-a'],objective_satisfied:true,confidence:0.99,evidence:'I spoke to James about Dylan availability',due_at:null};
async function run(actions:any[],tasks:any[]=[task],resolutions:any[]=[],states:any[]=[],options:{transcript?:string;owners?:Record<string,any>}={}) {
  const calls:Array<{name:string;args:any}>=[];
  const capture={capture_id:'capture-a',tenant_id:'tenant-a',submitted_by:'user-a',channel:'typed_debrief',transcript_text:options.transcript||action.evidence,settings:{monthly_ai_budget_usd:5},context_json:{resolutions},extracted_json:{tell_djm_plan:{summary:'Test update',actions,task_context:{tasks,timezone:'Europe/Rome'}}}};
  const admin={auth:{getUser:async()=>({data:{user:{id:'user-a'}}})},rpc:async(name:string,args:any)=>{
    calls.push({name,args});
    const data=name==='redream_ai_resolve_team_member'?(options.owners?.[args.p_spoken_name]||{resolved:false,candidates:[]}):name==='redream_ai_capture_action_states'?states:name==='redream_ai_worker_claim'?capture:name==='redream_ai_user_can_process'?true:name==='redream_ai_worker_complete'?{status:'done'}:name==='redream_ai_worker_fail'?{status:'failed'}:name==='redream_ai_notify_attention'?{queued:false}:{status:'applied'};
    return {data,error:null};
  }};
  const exports:any={};
  vm.runInNewContext(source,{exports,require:(name:string)=>name.includes('supabase-js')?{createClient:()=>admin}:name.includes('capture-preparation')?preparation:name.includes('task-work')?work:name.includes('ai-safety')?safety:{},
    Deno:{env:{get:()=> 'fixture-only'}},Request,Response,AbortSignal,crypto,performance,TextEncoder,console:{info(){},warn(){},error(){}},fetch:()=>{throw new Error('A reused plan must not call the AI provider');}});
  const response=await exports.handleAiProcess(new Request('https://example.test/process',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({capture_id:'capture-a'})}));
  assert.equal(response.status,200); const result=await response.json();
  assert.notEqual(result.results[0].status,'failed',JSON.stringify(result));
  return calls;
}
test('clear completed work and a distinct follow-up form one capture with independent actions',async()=>{
  const calls=await run([action,{key:'followup',type:'create_task',title:'Send updated profile',confidence:0.99,evidence:action.evidence,due_at:null}]);
  assert.equal(calls.filter(c=>c.name==='redream_ai_update_task').length,1);
  assert.equal(calls.filter(c=>c.name==='redream_ai_stage_action'&&c.args.p_action_type==='create_task').length,1);
  assert.equal(calls.find(c=>c.name==='redream_ai_update_task')?.args.p_payload.expected_updated_at,task.updated_at);
});
test('ambiguous tasks offer the exact choices without completing either',async()=>{
  const calls=await run([{...action,task_ids:['task-a','task-b']}],[task,{...task,id:'task-b'}]);
  const question=calls.find(c=>c.name==='redream_ai_record_question');
  assert.ok(question); assert.equal(question.args.p_candidates.filter((x:any)=>x.kind==='task').length,2);
  assert.equal(calls.filter(c=>c.name==='redream_ai_update_task').length,0);
});
test('a clarified task is proposed for approval, without automatic mutation',async()=>{
  const calls=await run([{...action,task_ids:['task-a','task-b']}],[task,{...task,id:'task-b'}],[{field_key:'task:completed-call',value:{kind:'task',task_id:'task-b'}}]);
  assert.equal(calls.find(c=>c.name==='redream_ai_stage_action')?.args.p_payload.task_id,'task-b');
  assert.equal(calls.filter(c=>c.name==='redream_ai_update_task').length,0);
});
test('an unfounded completion becomes a review item and retains its original evidence',async()=>{
  const calls=await run([{...action,objective_satisfied:false}]);
  const review=calls.find(c=>c.name==='redream_ai_apply_action');
  assert.equal(review?.args.p_confidence,0); assert.ok(review?.args.p_payload._review_reason);
  assert.equal(calls.filter(c=>c.name==='redream_ai_update_task').length,0);
});
test('worker retries skip saved, undone and explicitly dismissed action hashes',async()=>{
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({capture_id:'capture-a',key:action.key,type:action.type})));
  const hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  for(const status of ['applied','undone','superseded']){
    const calls=await run([action],[task],[],[{hash,status}]);
    assert.equal(calls.filter(c=>['redream_ai_update_task','redream_ai_stage_action','redream_ai_apply_action'].includes(c.name)).length,0,status);
  }
});

test('fresh interpretation receives owned objectives and checks completion alongside new follow-ups',async()=>{
  const exports:any={};let requests=0;
  vm.runInNewContext(source+'\nexports.interpret=interpret;',{
    exports,require:(name:string)=>name.includes('capture-preparation')?preparation:{},AbortSignal,Response,
    fetch:async(_url:string,options:any)=>{
      requests++;
      const body=JSON.parse(options.body);
      const input=JSON.parse(body.input[0].content[0].text);
      assert.deepEqual(input.authorised_tasks,[task]);
      assert.equal(input.transcript,action.evidence);
      assert.match(body.instructions,/Check every authorised open task/);
      assert.match(body.instructions,/Do not let log_interaction or create_task replace the completed-task action/);
      const create=body.text.format.schema.properties.actions.items.anyOf.find((branch:any)=>branch.properties.type.enum[0]==='create_task');
      assert.deepEqual(create.properties.owner_names.type,['array','null']);
      assert.equal(create.properties.owner_names.maxItems,50);
      assert.ok(create.required.includes('owner_names'));
      assert.match(body.instructions,/copy every explicitly named agency colleague/);
      return Response.json({output:[{content:[{type:'output_text',text:JSON.stringify({summary:'Review completed work and follow-up',actions:[action]})}]}],usage:{input_tokens:1,output_tokens:1}});
    },
  });
  const result=await exports.interpret('fixture','fixture-model','none',{task_work_context:{tasks:[task]},context_json:{},created_at:'2026-10-20T09:00:00Z'},action.evidence);
  assert.equal(requests,1);
  assert.equal(result.plan.actions[0].type,'update_task');
});

test('shared work is proposed with the real owner and never completed automatically',async()=>{
 const calls=await run([action],[{...task,owner_user_id:'colleague',shared_with_you:true,owner_display_name:'Example Colleague'}]);
 assert.equal(calls.filter(c=>c.name==='redream_ai_update_task').length,0);
 const staged=calls.find(c=>c.name==='redream_ai_stage_action');
 assert.equal(staged?.args.p_payload.owner_display_name,'Example Colleague');
 assert.equal(staged?.args.p_payload._automatic,false);
});

test('the same people with an unsupported objective subject are staged rather than completed',async()=>{
 const calls=await run([action],[{...task,title:'Speak to James about Dylan trial'}]);
 assert.equal(calls.filter(c=>c.name==='redream_ai_update_task').length,0);
 assert.equal(calls.filter(c=>c.name==='redream_ai_stage_action'&&c.args.p_action_type==='update_task').length,1);
});

const sharedTask=(evidence:string,owner_names:any,owner_name:string|null=null)=>({key:'shared-followup',type:'create_task',title:'Send reviewed footage',evidence,confidence:0.99,due_at:null,owner_names,owner_name});
const members={Alex:{resolved:true,user_id:'alex-id',display_name:'Alex Agent'},Moses:{resolved:true,user_id:'moses-id',display_name:'Moses Agent'}};
const stagedTask=(calls:any[])=>calls.find(c=>c.name==='redream_ai_stage_action'&&c.args.p_action_type==='create_task')?.args.p_payload;
test('two explicitly named colleagues are staged together without adding the speaker or applying a task',async()=>{
 const evidence='Alex and Moses will send the reviewed footage.';
 const calls=await run([sharedTask(evidence,['Alex','Moses'])],[],[],[],{transcript:evidence,owners:members});
 assert.deepEqual(Array.from(stagedTask(calls)?.responsible_user_ids||[]),['alex-id','moses-id']);
 assert.equal(stagedTask(calls)?.owner_user_id,'alex-id');assert.equal(stagedTask(calls)?.owner_display_name,'Alex Agent');
 assert.deepEqual(Array.from(stagedTask(calls)?.responsible_display_names||[]),['Alex Agent','Moses Agent']);
 assert.equal(calls.filter(c=>c.name==='redream_ai_apply_action').length,0);
});
test('a beneficiary is not another responsible person; explicit shared first-person work includes the speaker',async()=>{
 for(const [evidence,ids] of [
  ['Alex will send the footage for me.',['alex-id']],
  ['Alex and I will send the footage.',['user-a','alex-id']],
  ['Alex and me will send the footage.',['user-a','alex-id']],
 ] as const){
  const calls=await run([sharedTask(evidence,['Alex'])],[],[],[],{transcript:evidence,owners:members});
  assert.deepEqual(Array.from(stagedTask(calls)?.responsible_user_ids||[]),Array.from(ids),evidence);
 }
});
test('each ambiguous colleague gets a separate question and no partial task can be approved',async()=>{
 const evidence='Alex and Moses will send the reviewed footage.';
 const calls=await run([sharedTask(evidence,['Alex','Moses'])],[],[],[],{transcript:evidence});
 const questions=calls.filter(c=>c.name==='redream_ai_record_question');
 assert.deepEqual(questions.map(c=>c.args.p_field_key),['team_member:shared-followup:alex','team_member:shared-followup:moses']);
 assert.equal(stagedTask(calls),undefined);
 const resolved=await run([sharedTask(evidence,['Alex','Moses'])],[],[{field_key:'team_member:shared-followup:alex',value:{kind:'team_member',user_id:'chosen-alex',label:'Alex Second'}}],[],{transcript:evidence,owners:members});
 assert.deepEqual(Array.from(stagedTask(resolved)?.responsible_user_ids||[]),['chosen-alex','moses-id']);
});
test('legacy resolver choices retain their staff identity when the user clarifies a colleague',async()=>{
 const evidence='Alex and Moses will send the reviewed footage.';
 const calls=await run([sharedTask(evidence,['Alex','Moses'])],[],[],[],{transcript:evidence,owners:{...members,Alex:{resolved:false,candidates:[{user_id:'alex-one',label:'Alex One'},{user_id:'alex-two',label:'Alex Two'}]}}});
 const question=calls.find(c=>c.name==='redream_ai_record_question');
 assert.deepEqual(Array.from(question?.args.p_candidates||[],(item:any)=>item.kind),['team_member','team_member','review']);
 assert.equal(stagedTask(calls),undefined);
});
test('unspoken names and malformed owner lists cannot silently become someone else or the speaker',async()=>{
 for(const names of [['Alex','Moses'],['Alex',null],'Alex',Array(51).fill('Alex')]){
  const evidence='Alex will send the footage.';
  const calls=await run([sharedTask(evidence,names)],[],[],[],{transcript:evidence,owners:members});
  assert.equal(stagedTask(calls),undefined,JSON.stringify(names));
  assert.ok(calls.some(c=>c.name==='redream_ai_apply_action'&&c.args.p_confidence===0));
 }
});
test('cached single-owner plans still resolve and repeated aliases create one responsibility',async()=>{
 for(const names of [null,['Alex','alex','Alex']]){
  const evidence='Alex will send the reviewed footage.';
  const calls=await run([sharedTask(evidence,names,'Alex')],[],[],[],{transcript:evidence,owners:members});
  assert.deepEqual(Array.from(stagedTask(calls)?.responsible_user_ids||[]),['alex-id']);
 }
});
test('colleagues with non-Latin names have distinct clarification keys',async()=>{
 const evidence='أحمد and باسم will send the reviewed footage.';
 const calls=await run([sharedTask(evidence,['أحمد','باسم'])],[],[],[],{transcript:evidence});
 const questions=calls.filter(c=>c.name==='redream_ai_record_question');
 assert.equal(questions.length,2);assert.equal(new Set(questions.map(c=>c.args.p_field_key)).size,2);
 assert.equal(stagedTask(calls),undefined);
});

test('negated and unsupported collective assignments cannot silently fall back to the speaker',async()=>{
 for(const [evidence,names] of [
  ['Do not assign Alex to send the footage.',['Alex']],
  ['Alex and Moses will not send the footage.',['Alex','Moses']],
  ['All staff should send the footage.',[]],
 ] as Array<[string,string[]]>){
  const calls=await run([sharedTask(evidence,names)],[],[],[],{transcript:evidence,owners:members});
  assert.equal(stagedTask(calls),undefined,evidence);assert.ok(calls.some(c=>c.name==='redream_ai_apply_action'&&c.args.p_confidence===0));
 }
 const evidence='Moses will send the footage, not Alex.';
 const calls=await run([sharedTask(evidence,['Moses'])],[],[],[],{transcript:evidence,owners:members});
 assert.deepEqual(Array.from(stagedTask(calls)?.responsible_user_ids||[]),['moses-id']);
});
