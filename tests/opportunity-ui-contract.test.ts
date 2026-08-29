import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Opportunity routes preserve the current Market and opportunity editor implementations', () => {
  assert.match(read('app/(djm-os)/opportunities/page.tsx'), /from '\.\.\/market\/page'/);
  assert.match(read('app/(djm-os)/opportunities/[id]/page.tsx'), /from '\.\.\/\.\.\/market\/deals\/\[id\]\/page'/);
  assert.match(read('components/DjmWorkspaceHeader.tsx'), /href: '\/opportunities'/);
  assert.match(read('components/DjmGlobalSearch.tsx'), /`\/opportunities\/\$\{item\.entity_id\}`/);
});

test('Secure club shares render their approved club-specific pitch context', () => {
  const sharePage = read('app/s/[token]/page.tsx');
  const profile = read('components/PublicProfile.tsx');
  assert.match(sharePage, /pitchMessage=\{data\.pitch_message\}/);
  assert.match(sharePage, /targetClub=\{data\.target_club\}/);
  assert.match(profile, /CLUB-SPECIFIC INTRODUCTION/);
  assert.match(profile, /PREPARED FOR/);
});
