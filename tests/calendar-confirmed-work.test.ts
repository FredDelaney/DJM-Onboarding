import assert from 'node:assert/strict';
import test from 'node:test';
import {normaliseCalendarEvents,todayProjection} from '../lib/calendar/events.ts';
import {projectConfirmedCalendarWork,projectConfirmedAssignedWork} from '../lib/calendar/confirmed-work.ts';
import type {ConfirmedHomeWork} from '../lib/work-responsibility.ts';
const id='60000000-0000-4000-8000-000000000001';
const work:ConfirmedHomeWork={work_kind:'task',work_id:id,title:'Call the club',display_title:'Call the club',due_on:'2026-11-28',due_at:'2026-11-28T11:00:00Z',note:'Reviewed outcome',status:'open',state:{revision:2},context:{player_id:'player'}};
const assigned={work_kind:'task',work_id:id,title:work.title,due_at:work.due_at,context:work.context};
const events=()=>normaliseCalendarEvents({follow_ups:{items:[{...assigned,task_id:id}]}},null,[]);
const confirmed=(value:ConfirmedHomeWork)=>({[value.work_kind+':'+value.work_id]:value});
test('a confirmed completion hides stale work and removes its Today warning',()=>{
 const done={...work,status:'done' as const};
 assert.deepEqual(projectConfirmedCalendarWork(events(),confirmed(done)),[]);
 assert.deepEqual(projectConfirmedAssignedWork([assigned],confirmed(done)),[]);
 assert.equal(todayProjection(projectConfirmedCalendarWork(events(),confirmed(done)),new Date('2026-12-01')).overdue.length,0);
});
test('rescheduling or clearing a date reflects the confirmed canonical record while refresh fails',()=>{
 const moved={...work,title:'Send the dossier',display_title:'Send the dossier',due_at:'2026-12-02T11:00:00Z',due_on:'2026-12-02'};
 const next=projectConfirmedCalendarWork(events(),confirmed(moved));
 assert.equal(next[0].dateAt,moved.due_at);assert.equal(next[0].title,moved.title);
 const undated={...moved,due_at:null,due_on:null};
 assert.deepEqual(projectConfirmedCalendarWork(events(),confirmed(undated)),[]);
 assert.equal(projectConfirmedAssignedWork([assigned],confirmed(undated))[0].due_at,null);
});
test('Undo restores open follow-ups with their canonical context even when the old feed is empty',()=>{
 const restored=projectConfirmedCalendarWork([],confirmed(work));
 assert.equal(restored.length,1);assert.equal(restored[0].playerId,'player');assert.equal(restored[0].workId,id);
 assert.equal(projectConfirmedAssignedWork([],confirmed({...work,due_at:null,due_on:null}))[0].context.player_id,'player');
});
test('player follow-up dates keep their all-day precision in confirmed views',()=>{
 const player={...work,work_kind:'player_next_action',due_at:'2026-11-28T00:00:00+00:00'};
 const result=projectConfirmedCalendarWork([],confirmed(player));
 assert.equal(result[0].dateAt,'2026-11-28');assert.equal(result[0].dateOnly,true);
});
test('calendar task confirmation retains its source privacy metadata and current revision',()=>{
 const calendar={...work,work_kind:'calendar_task',due_at:null,status:'done' as const,state:{revision:4,due_time:null,time_zone:null}};
 const original=normaliseCalendarEvents({},null,[{id,tenant_id:'tenant',creator_user_id:'creator',owner_user_id:'owner',title:'Previous',notes:'',due_on:'2026-11-28',due_at:null,visibility:'company',status:'open',revision:3,archived_at:null} as any]);
 assert.deepEqual(projectConfirmedCalendarWork(original,confirmed(calendar)),[]);
 const shown=projectConfirmedCalendarWork(original,confirmed(calendar),true)[0];
 assert.equal(shown.task?.visibility,'company');assert.equal(shown.task?.revision,4);assert.equal(shown.task?.status,'done');
 assert.deepEqual(projectConfirmedCalendarWork([],confirmed({...calendar,status:'open'})),[],'Do not invent missing Calendar task privacy/layer metadata');
});
test('unrelated records and all original input DTOs stay unchanged',()=>{
 const original=events(),before=JSON.stringify(original);
 const result=projectConfirmedCalendarWork(original,{'task:other':{...work,work_id:'other',status:'done'}});
 assert.equal(result[0],original[0]);assert.equal(JSON.stringify(original),before);
 const rows=[assigned],copy=JSON.stringify(rows);projectConfirmedAssignedWork(rows,confirmed({...work,status:'done'}));assert.equal(JSON.stringify(rows),copy);
});
