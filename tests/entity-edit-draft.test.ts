import assert from 'node:assert/strict';
import {test} from 'node:test';
import {changedEntityFields} from '../lib/entity-edit-draft.ts';

test('unchanged record fields do not produce a save',()=>{
 assert.deepEqual(changedEntityFields([{key:'name',value:'Example Club'},{key:'notes',value:null}],{name:'Example Club',notes:''}),{});
});
test('only the edited fields are patched, preserving other saved details',()=>{
 assert.deepEqual(changedEntityFields([{key:'name',value:'Example Club'},{key:'country',value:'NZ'}],{name:'Updated Club',country:'NZ'}),{name:'Updated Club'});
});
test('clearing a field is a real edit while unknown draft keys are ignored',()=>{
 assert.deepEqual(changedEntityFields([{key:'notes',value:'Old note'}],{notes:'',tenant_id:'another-tenant'}),{notes:''});
});
test('typed values compare as the text shown in the form without trimming user content',()=>{
 assert.deepEqual(changedEntityFields([{key:'number',value:0},{key:'flag',value:false},{key:'notes'}],{number:'0',flag:'false',notes:'  keep spaces  '}),{notes:'  keep spaces  '});
});
