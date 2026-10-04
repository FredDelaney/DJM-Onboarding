import assert from 'node:assert/strict';
import test from 'node:test';
import {reconcileTaskRows,type TaskCollection} from '../lib/calendar/task-state.ts';
import type {CalendarTask} from '../lib/calendar/tasks.ts';
const task:CalendarTask={id:'task',tenant_id:'tenant',creator_user_id:'user',owner_user_id:'user',owner_name:'User',visibility:'personal',title:'Confirmed work',notes:'',due_on:'2026-10-04',due_time:null,time_zone:null,due_at:null,status:'open',archived_at:null,revision:1,can_edit:true,needs_reassignment:false};
const collection:TaskCollection={mode:'range',start:'2026-10-01',end:'2026-11-01',today:'2026-10-04',now:new Date('2026-10-04T12:00:00Z'),done:false,archived:false};
test('confirmed completion/archive replace stale copies even when a refresh fails',()=>{
 const done={...task,status:'done' as const,revision:2};
 assert.deepEqual(reconcileTaskRows([task],done,collection),[]);
 assert.deepEqual(reconcileTaskRows([task],done,{...collection,done:true}),[done]);
 const archived={...task,archived_at:'2026-10-04T12:00:00Z',revision:2};
 assert.deepEqual(reconcileTaskRows([task],archived,collection),[]);
 assert.deepEqual(reconcileTaskRows([task],archived,{...collection,archived:true}),[archived]);
 assert.deepEqual(reconcileTaskRows([task],done,{...collection,mode:'overdue'}),[]);
});
test('confirmed rescheduling moves rows between date, Today and undated collections',()=>{
 const moved={...task,due_on:'2026-12-01',revision:2};
 assert.deepEqual(reconcileTaskRows([task],moved,collection),[]);
 const undated={...task,due_on:null,revision:2};
 assert.deepEqual(reconcileTaskRows([task],undated,collection),[]);
 assert.deepEqual(reconcileTaskRows([],undated,{...collection,mode:'undated'}),[undated]);
 assert.deepEqual(reconcileTaskRows([],task,{...collection,start:'2026-10-04',end:'2026-10-05'}),[task]);
 assert.deepEqual(reconcileTaskRows([task],{...task,due_on:'2026-10-03'},{...collection,mode:'overdue'}).map(t=>t.id),['task']);
});
