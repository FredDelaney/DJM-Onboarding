import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workspace=readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');

test('background preloading never fetches private opportunities or business data',()=>{
  const start=workspace.indexOf('function preloadWorkspaceView(');
  const end=workspace.indexOf('type ViewCacheEntry',start);
  assert.ok(start>0&&end>start);
  const preload=workspace.slice(start,end);
  assert.match(preload,/import\(/);
  assert.doesNotMatch(preload,/\b(?:invoke|rpc|fetch)\(/i);
});

test('explicit opportunities navigation remains limited to owner/admin roles',()=>{
  assert.match(workspace,/!\['owner','admin'\]\.includes\(String\(workspace.role\)\) && \['opportunities','business'\]\.includes\(view\)/);
});
