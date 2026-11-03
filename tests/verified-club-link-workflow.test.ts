import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const edge=readFileSync('supabase/functions/agency-os/index.ts','utf8');
const ui=readFileSync('components/AgencyClubReferenceDetail.tsx','utf8');
const drawer=readFileSync('components/AgencyClubAccountDrawer.tsx','utf8');
const workspace=readFileSync('components/AgencyOperatingWorkspace.tsx','utf8');
const fixture=readFileSync('scripts/platform-polish-browser-qa.mjs','utf8');
test('club link routes are owner/admin only and delegated to tenant-filtered functions',()=>{
 for(const action of ['club_link_candidates','club_link_player']){
  assert.match(edge,new RegExp('action==="'+action+'"'));
  const section=edge.split('if(action==="'+action+'")')[1]?.split('if(action===')[0]||'';
  assert.match(section,/if\(!ownerAdmin\(\)\)/);
  assert.match(section,/p_tenant_id:tenantId,p_actor_user_id:userId/);
 }
});
test('club screen offers a deliberate two-step link confirmation and distinguishes provisional associations',()=>{
 for(const label of ['Link existing player','Review link','Confirm club link','Club link confirmed','Name match, not verified'])
  assert.ok(ui.includes(label),label);
 assert.match(ui,/onLinkSaved\?\.\(\)/);
 assert.match(drawer,/onLinkSaved=\{onRefresh\}/);
 assert.match(ui,/linkConfirmRef\.current\?\.scrollIntoView/);
 assert.match(fixture,/CLUB VERIFIED LINK BROWSER PASS/);
 assert.match(fixture,/waitFor\(\{state:'hidden'\}\)/);
 assert.match(fixture,/name:'Back to Clubs'/);
});

test('club profile replaces the directory inside the main workspace, not below the mobile navigation',()=>{
 const inWorkspace=workspace.indexOf('            {clubAccountRequest ? (');
 const directory=workspace.indexOf("view === 'network' && search.get('clubsv2')");
 const mobileNav=workspace.indexOf('      <AgencyMobileNavigation');
 assert.ok(inWorkspace>0&&directory>inWorkspace&&mobileNav>directory);
 assert.equal(workspace.match(/<AgencyClubAccountDrawer/g)?.length,1);
});
