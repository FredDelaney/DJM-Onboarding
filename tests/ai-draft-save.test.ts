import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveAiDraft } from '../lib/ai-draft-save.ts';
const draft={id:'one-capture-id',workspaceSlug:'northstar',blob:new Blob(['voice'])};

test('storage failure still permits a successful online upload',async()=>{
  const result=await saveAiDraft(draft,{online:()=>true,saveLocal:async()=>{throw Error('quota');},upload:async received=>assert.equal(received,draft)});
  assert.equal(result.state,'uploaded');
});
test('failed upload is safe to queue only after local persistence succeeds',async()=>{
  const result=await saveAiDraft(draft,{online:()=>true,saveLocal:async()=>{},upload:async()=>{throw Error('network');}});
  assert.equal(result.state,'queued');
});
test('combined failure retains the exact voice draft for a same-ID retry',async()=>{
  const options={online:()=>true,saveLocal:async()=>{throw Error('quota');},upload:async()=>{throw Error('network');}};
  assert.equal((await saveAiDraft(draft,options)).state,'unsaved');
  const retry=await saveAiDraft(draft,{...options,upload:async received=>{
    assert.equal(received.id,'one-capture-id');assert.equal(received.workspaceSlug,'northstar');
    assert.equal(await received.blob.text(),'voice');
  }});
  assert.equal(retry.state,'uploaded');
});
test('offline drafts are never claimed saved when browser persistence fails',async()=>{
  for(const works of [true,false]) {
    const result=await saveAiDraft(draft,{online:()=>false,saveLocal:async()=>{if(!works)throw Error('quota');},upload:async()=>assert.fail('offline must not upload')});
    assert.equal(result.state,works?'queued':'unsaved');
  }
});
