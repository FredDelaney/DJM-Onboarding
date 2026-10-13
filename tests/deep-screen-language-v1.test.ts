import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(file:string)=>fs.readFileSync(file,'utf8');

test('deep customer screens use agent language instead of database language',()=>{
  const player=read('components/AgencyPlayerProfile.tsx');
  const club=read('components/AgencyClubAccountDrawer.tsx');
  const contact=read('components/AgencyContactIntelligenceDrawer.tsx');
  const opportunities=read('components/AgencyOpportunitiesWorkspace.tsx');
  assert.match(player,/NEXT FOLLOW-UP/);
  assert.match(player,/SHARED PROFILE/);
  assert.match(club,/Club contacts/);
  assert.match(contact,/Relationship strength/);
  assert.match(opportunities,/Open opportunity/);
  assert.doesNotMatch(club,/No active club need recorded/);
  assert.doesNotMatch(opportunities,/Review the pursuit evidence/);
});

test('Tell ReDream makes the approval boundary obvious',()=>{
  const capture=read('components/AiCapture.tsx');
  const recent=read('components/AiRecentCaptures.tsx');
  assert.match(capture,/Send to ReDream/);
  assert.match(capture,/Review before saving/);
  assert.match(capture,/Approve & save/);
  assert.match(capture,/Nothing changes until you approve/);
  assert.match(recent,/<strong>Recent<\/strong>/);
});
