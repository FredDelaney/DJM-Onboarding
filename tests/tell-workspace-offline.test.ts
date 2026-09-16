import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { pendingAiWorkspace, aiWorkspaceSlug } from '../lib/ai-workspace.ts';
import { rememberActiveAiCapture, listActiveAiCaptures, recoverLegacyAiCaptures, isPendingAiCapture, assertAiCaptureOwner } from '../lib/ai-offline.ts';

test('offline workspace is immutable after navigation to another agency', () => {
  const pending = { workspaceSlug: 'northstar', context: { route: '/workspace/northstar' } };
  assert.equal(aiWorkspaceSlug(null, '/workspace/djm-sports-management'),'djm-sports-management');
  assert.equal(pendingAiWorkspace(pending),'northstar');
});
test('old pending records infer explicit workspace routes or retain legacy null', () => {
  assert.equal(pendingAiWorkspace({context:{route:'/workspace/northstar/players'}}),'northstar');
  assert.equal(pendingAiWorkspace({context:{route:'/djm'}}),null);
  assert.equal(pendingAiWorkspace({}),null);
  assert.equal(pendingAiWorkspace({context:{route:'/agency'}}),'unresolved');
});
test('runtime supports agency routes and custom domains without a workspace path', () => {
  for (const route of ['/agency','/tell','/']) assert.equal(aiWorkspaceSlug({resolved:true,slug:'northstar'},route),'northstar');
  assert.equal(aiWorkspaceSlug({resolved:true,slug:'djm'},'/workspace/northstar'),'northstar');
  assert.equal(aiWorkspaceSlug({resolved:false,slug:'unresolved'},'/agency'),'unresolved');
  assert.equal(aiWorkspaceSlug(null,'/workspace/%xx'),'unresolved');
});
test('active capture resume preserves workspace and reads old local records', async () => {
  const values = new Map<string,string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{ configurable:true,value:{
    getItem:(key:string)=>values.get(key)||null,
    setItem:(key:string,value:string)=>{values.set(key,value);},
  }});
  try {
    values.set('djm-tell-djm-active-captures',JSON.stringify([{captureId:'old',createdAt:new Date().toISOString()}]));
    rememberActiveAiCapture('north-capture','northstar');
    rememberActiveAiCapture('north-capture','djm-sports-management');
    const captures=listActiveAiCaptures();
    assert.equal(captures[0].captureId,'old');
    assert.equal(captures[0].workspaceSlug,undefined);
    assert.equal(captures[1].workspaceSlug,'northstar');
    const restored=await recoverLegacyAiCaptures(async()=> 'northstar');
    assert.equal(restored.find(item=>item.captureId==='old')?.workspaceSlug,'northstar');
    assert.equal(values.get('redream-ai-active-captures'),values.get('djm-tell-djm-active-captures'));
  } finally {
    if (previous) Object.defineProperty(globalThis,'localStorage',previous);
    else Reflect.deleteProperty(globalThis,'localStorage');
  }
});
test('upload uses persisted workspace and tenant-first storage with no shared header mutation', () => {
  const capture=readFileSync('supabase/functions/_shared/ai-capture.ts','utf8');
  const ui=readFileSync('components/AiCapture.tsx','utf8');
  const rpc=readFileSync('lib/platform-client.ts','utf8');
  assert.match(capture,/\$\{tenantId\}\/\$\{authData.user.id\}\/tell\/\$\{day\}/);
  assert.match(ui,/pendingAiWorkspace\(pending\)/);
  assert.match(ui,/form.append\('workspace_slug', pendingWorkspace\)/);
  assert.match(rpc,/request.setHeader\('x-redream-workspace', workspaceSlug\)/);
});

test('new origin object takes precedence over stale compatibility fields',()=>{
  assert.equal(pendingAiWorkspace({workspace:{workspaceSlug:'northstar',originRoute:'/agency',runtimeOrigin:'runtime'},workspaceSlug:'djm-sports-management'}),'northstar');
});


test('malformed saved origin cannot silently select the primary workspace',()=>{
  for(const workspace of [{}, {workspaceSlug:12}, {workspaceSlug:''}, {workspaceSlug:null,runtimeOrigin:'runtime'}]) {
    assert.equal(pendingAiWorkspace({workspace} as any),'unresolved');
  }
  assert.equal(pendingAiWorkspace({workspace:{workspaceSlug:null,runtimeOrigin:'legacy',originRoute:'/tell'}}),null);
});

test('malformed pending records cannot poison sorting or upload, old valid shapes stay recoverable',()=>{
  for(const item of [null,{}, {id:'x',createdAt:12}, {id:'x',createdAt:'today',channel:'text',text:12}]) assert.equal(isPendingAiCapture(item),false);
  const old={id:'old',createdAt:new Date().toISOString(),channel:'typed_debrief',text:'saved',blob:null};
  assert.equal(isPendingAiCapture(old),true);
  assert.throws(()=>assertAiCaptureOwner(old as any,'different-user'),/no recorded account/);
  assert.throws(()=>assertAiCaptureOwner({...old,userId:'original'} as any,'different-user'),/account that saved/);
  assert.doesNotThrow(()=>assertAiCaptureOwner({...old,userId:'original'} as any,'original'));
});
