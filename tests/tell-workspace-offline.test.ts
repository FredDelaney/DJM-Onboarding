import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { pendingTellWorkspace, tellWorkspaceSlug } from '../lib/tell-workspace.ts';
import { rememberActiveTellDjmCapture, listActiveTellDjmCaptures } from '../lib/tell-djm-offline.ts';

test('offline workspace is immutable after navigation to another agency', () => {
  const pending = { workspaceSlug: 'northstar', context: { route: '/workspace/northstar' } };
  assert.equal(tellWorkspaceSlug(null, '/workspace/djm-sports-management'),'djm-sports-management');
  assert.equal(pendingTellWorkspace(pending),'northstar');
});
test('old pending records infer explicit workspace routes or retain legacy null', () => {
  assert.equal(pendingTellWorkspace({context:{route:'/workspace/northstar/players'}}),'northstar');
  assert.equal(pendingTellWorkspace({context:{route:'/djm'}}),null);
  assert.equal(pendingTellWorkspace({}),null);
  assert.equal(pendingTellWorkspace({context:{route:'/agency'}}),'unresolved');
});
test('runtime supports agency routes and custom domains without a workspace path', () => {
  for (const route of ['/agency','/tell','/']) assert.equal(tellWorkspaceSlug({resolved:true,slug:'northstar'},route),'northstar');
  assert.equal(tellWorkspaceSlug({resolved:true,slug:'djm'},'/workspace/northstar'),'northstar');
  assert.equal(tellWorkspaceSlug({resolved:false,slug:'unresolved'},'/agency'),'unresolved');
  assert.equal(tellWorkspaceSlug(null,'/workspace/%xx'),'unresolved');
});
test('active capture resume preserves workspace and reads old local records', () => {
  const values = new Map<string,string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{ configurable:true,value:{
    getItem:(key:string)=>values.get(key)||null,
    setItem:(key:string,value:string)=>{values.set(key,value);},
  }});
  try {
    values.set('djm-tell-djm-active-captures',JSON.stringify([{captureId:'old',createdAt:new Date().toISOString()}]));
    rememberActiveTellDjmCapture('north-capture','northstar');
    rememberActiveTellDjmCapture('north-capture','djm-sports-management');
    const captures=listActiveTellDjmCaptures();
    assert.equal(captures[0].captureId,'old');
    assert.equal(captures[0].workspaceSlug,undefined);
    assert.equal(captures[1].workspaceSlug,'northstar');
  } finally {
    if (previous) Object.defineProperty(globalThis,'localStorage',previous);
    else Reflect.deleteProperty(globalThis,'localStorage');
  }
});
test('upload uses persisted workspace and tenant-first storage with no shared header mutation', () => {
  const capture=readFileSync('supabase/functions/djm-tell-capture/index.ts','utf8');
  const ui=readFileSync('components/TellDjmCapture.tsx','utf8');
  const rpc=readFileSync('lib/djm-os.ts','utf8');
  assert.match(capture,/\$\{tenantId\}\/\$\{authData.user.id\}\/tell\/\$\{day\}/);
  assert.match(ui,/pendingTellWorkspace\(pending\)/);
  assert.match(ui,/form.append\('workspace_slug', pendingWorkspace\)/);
  assert.match(rpc,/request.setHeader\('x-redream-workspace', workspaceSlug\)/);
});
