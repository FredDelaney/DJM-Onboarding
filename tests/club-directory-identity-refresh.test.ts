import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const directory=readFileSync('components/AgencyClubsReference.tsx','utf8');
const account=readFileSync('components/AgencyClubAccountDrawer.tsx','utf8');
const workspace=readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');

test('club directory reloads after creating or editing a record elsewhere',()=>{
  assert.match(directory,/refreshKey\s*=\s*0/);
  assert.match(directory,/\[load,revision,refreshKey\]/);
  assert.match(workspace,/<AgencyClubsReference[\s\S]*?refreshKey=\{recordRefreshRevision\}/);
});

test('deep-linked club identity is resolved before prefilling linked record creation',()=>{
  assert.match(account,/resolvedClubCallback\.current\?\.\(\{/);
  assert.match(account,/name: resolvedName/);
  assert.match(account,/organisationId: request\.organisationId/);
  assert.match(workspace,/onResolvedClub=\{\(\{ organisationId, name, country \}\) =>/);
  assert.match(workspace,/current\?\.organisationId !== organisationId/);
  assert.match(workspace,/return \{ \.\.\.current, title: name, country \}/);
  assert.match(workspace,/prefillClub=\{clubAccountRequest/);
  assert.match(workspace,/organisationId:clubAccountRequest\.organisationId/);
});

test('a club profile contact opens the existing people detail page',()=>{
  const detail=readFileSync('components/AgencyClubReferenceDetail.tsx','utf8');
  assert.match(detail,/detail\.contacts\.map\(person=><button/);
  assert.match(detail,/onClick=\{\(\)=>onOpenContact\(person\.id\)\}/);
  assert.match(account,/onOpenContact=\{onOpenContact \|\|/);
  assert.match(workspace,/onOpenContact=\{\(personId\) =>/);
  assert.match(workspace,/view=network&network=people&person=/);
  assert.match(workspace,/onOpenContact=\{\(personId\) => navigateWorkspaceView\('network'/);
});
