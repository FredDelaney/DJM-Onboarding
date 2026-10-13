import assert from 'node:assert/strict';import test from 'node:test';import {readTaskPages} from '../lib/calendar/tasks.ts';
test('task pages concatenate without silently dropping later records',async()=>{
 const result=await readTaskPages(async(_name,args)=>args?.p_cursor?{items:[{id:'second'}],next_cursor:null}:{items:[{id:'first'}],next_cursor:{id:'first'}}as any,{p_tenant_id:'tenant'});
 assert.deepEqual(result.map(t=>t.id),['first','second']);
});
test('a repeating pagination cursor fails rather than looping forever',async()=>{
 let count=0;await assert.rejects(()=>readTaskPages(async()=>{if(++count>4)throw new Error('test guard: reader looped');return {items:[],next_cursor:{id:'same'}}as any;},{}),/pagination_cursor_repeated/);
});
