import assert from 'node:assert/strict';
import test from 'node:test';
import {aiTextDraftKey,readAiTextDraft,writeAiTextDraft} from '../lib/ai-text-draft.ts';
test('unsent capture notes are isolated by actor, workspace and record context and expire',()=>{
 const items=new Map<string,string>(),storage={getItem:(k:string)=>items.get(k)||null,setItem:(k:string,v:string)=>{items.set(k,v);},removeItem:(k:string)=>{items.delete(k);}};
 const key=aiTextDraftKey('user-a','northstar','player-a');
 assert.equal(writeAiTextDraft(storage,key,'Private unsent note',100),true);
 assert.equal(readAiTextDraft(storage,key,200),'Private unsent note');
 for(const parts of [['user-b','northstar','player-a'],['user-a','djm','player-a'],['user-a','northstar','player-b']])assert.equal(readAiTextDraft(storage,aiTextDraftKey(...parts as [string,string,string]),200),'');
 assert.equal(readAiTextDraft(storage,key,100+2*60*60*1000),'');assert.equal(items.has(key),false);
 writeAiTextDraft(storage,key,'Saved through the durable queue',100);writeAiTextDraft(storage,key,'');assert.equal(items.has(key),false);
});
test('blocked storage and malformed drafts do not break capture',()=>{
 const storage={getItem:()=>'{broken',setItem:()=>{throw new Error('Storage blocked');},removeItem:()=>{}};
 assert.equal(readAiTextDraft(storage,'key'),'');assert.equal(writeAiTextDraft(storage,'key','note'),false);
});
