import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workspace=readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');

test('background preloading never fetches private opportunities or business data',()=>{
  const start=workspace.indexOf('const targets: View[] = [');
  const end=workspace.indexOf('].filter(',start);
  assert.ok(start>0&&end>start,'Find the passive prefetch target list');
  const targets=workspace.slice(start,end);
  assert.match(targets,/'home'/);
  assert.match(targets,/'players'/);
  assert.match(targets,/'network'/);
  assert.doesNotMatch(targets,/^\s*'opportunities',/m);
  assert.doesNotMatch(targets,/^\s*'business',/m);
});

test('explicit opportunities navigation remains limited to owner/admin roles',()=>{
  assert.match(workspace,/targetView === 'opportunities' && !\['owner','admin'\]/);
  assert.match(workspace,/!\['owner','admin'\]\.includes\(String\(workspace.role\)\) && \['opportunities','business'\]\.includes\(view\)/);
});
