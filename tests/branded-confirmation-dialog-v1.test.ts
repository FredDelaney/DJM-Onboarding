import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(file:string)=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('customer product has no native browser confirmation prompts',()=>{
  const files=['components/AiCapture.tsx','components/AgencyCalendarTaskForm.tsx','app/platform/AgencyDomainCard.tsx','app/(djm-os)/settings/team/page.tsx'];
  for(const file of files) assert.doesNotMatch(read(file),/window\.confirm\(/,file);
});

test('shared confirmation is accessible and restores keyboard control',()=>{
  const dialog=read('components/ConfirmActionDialog.tsx');
  assert.match(dialog,/role="alertdialog"/);
  assert.match(dialog,/aria-modal="true"/);
  assert.match(dialog,/event\.key==='Escape'/);
  assert.match(dialog,/event\.key!=='Tab'/);
  assert.match(dialog,/previous\?\.isConnected/);
});

test('high risk actions use the shared ReDream confirmation',()=>{
  assert.match(read('components/AiCapture.tsx'),/Delete this ReDream update\?/);
  assert.match(read('components/AgencyCalendarTaskForm.tsx'),/Discard these task changes\?/);
  assert.match(read('app\/platform\/AgencyDomainCard.tsx'),/Disconnect domain/);
  assert.match(read('app\/(djm-os)\/settings\/team\/page.tsx'),/Remove team member/);
});
