import assert from 'node:assert/strict';
import {test} from 'node:test';
import {normaliseCalendarEvents} from '../lib/calendar/events.ts';
import * as responsibility from '../lib/work-responsibility.ts';
import {workHref,workRefFor} from '../lib/work-responsibility.ts';
const id='70000000-0000-4000-8000-000000000001';
test('separate assigned reminders for the same player both remain in the calendar',()=>{
 const events=normaliseCalendarEvents({follow_ups:{items:[
  {task_id:id,work_kind:'player_next_action',work_id:id,title:'Call club',due_at:'2026-10-15',date_only:true},
  {task_id:id,work_kind:'contract_expiry',work_id:id,title:'Contract expiry',due_at:'2026-10-20',date_only:true}
 ]}},null,[]);
 assert.deepEqual(events.map(event=>event.title),['Call club','Contract expiry']);
 assert.deepEqual(events.map(event=>workRefFor({work_kind:event.workKind,work_id:event.workId})),[{kind:'player_next_action',id},{kind:'contract_expiry',id}]);
});
test('an assigned reminder already present as an agency date appears only once',()=>{
 const events=normaliseCalendarEvents({operations:{deadlines:{items:[{deadline_type:'player_next_action',entity_id:id,title:'Call club',deadline_at:'2026-10-15',date_only:true}]}},follow_ups:{items:[{task_id:id,work_kind:'player_next_action',work_id:id,title:'Call club',due_at:'2026-10-15',date_only:true}]}},null,[]);
 assert.equal(events.length,1);
 assert.equal(events[0].title,'Call club');
});

test('assigned calendar task links select its due month',()=>{
 assert.equal(workHref({work_kind:'calendar_task',work_id:id,due_at:'2026-11-02',date_only:true},'/workspace/example'),'/workspace/example?view=calendar&task='+id+'&date=2026-11-02');
});
test('shared deal work selects the linked deal in the current agency',()=>{
 assert.equal(workHref({context:{deal_room_id:id}},'/workspace/example'),'/workspace/example?view=opportunities&tab=deals&record='+id);
});
test('shared club need work selects the linked need',()=>{
 assert.equal(workHref({context:{club_need_id:id}},'/agency'),'/agency?view=opportunities&tab=needs&record='+id);
});
test('shared player work opens the player profile directly',()=>{
 assert.equal(workHref({context:{player_id:id}},'/workspace/example'),'/workspace/example?view=players&player='+id+'&profile=1');
});
test('assigned work reads all result pages without hiding later reminders',async()=>{
 assert.equal(typeof (responsibility as any).readAssignedWorkPages,'function');
 const calls:any[]=[];
 const rpc=async(name:string,args:any)=>{calls.push(args.p_cursor);return args.p_cursor===null?{items:[{work_id:'first'}],next_cursor:200,limited:true}:{items:[{work_id:'later'}],next_cursor:null,limited:false};};
 const items=await (responsibility as any).readAssignedWorkPages(rpc,'agency');
 assert.deepEqual(items.map((item:any)=>item.work_id),['first','later']);assert.deepEqual(calls,[null,200]);
});

test('Home completion recognises canonical follow-ups and keeps reviews and grouped tasks separate',()=>{
 const identify=(responsibility as any).homeWorkRefFor;
 assert.equal(typeof identify,'function');
 assert.deepEqual(identify({command_type:'Player follow-up due',source_type:'player',source_id:id}),{kind:'player_next_action',id});
 assert.deepEqual(identify({work_kind:'player_next_action',work_id:id}),{kind:'player_next_action',id});
 assert.deepEqual(identify({work_kind:'calendar_task',work_id:id}),{kind:'calendar_task',id});
 assert.deepEqual(identify({source_type:'task',source_id:id,title:'Call the club',evidence:{task_count:1}}),{kind:'task',id});
 for(const value of [
  {command_type:'Player review required',source_type:'player',source_id:id},
  {source_type:'task',source_id:id,title:'Review James Mitchell data'},
  {source_type:'task',source_id:id,title:'Call the club',evidence:{task_count:2}},
  {work_kind:'contract_expiry',work_id:id},
  {source_type:'task',source_id:'invalid'},
 ])assert.equal(identify(value),null);
});
