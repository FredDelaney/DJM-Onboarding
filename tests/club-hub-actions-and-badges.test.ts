import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=(path:string)=>readFileSync(path,'utf8');
const workspace=read('components/AgencyOperatingWorkspace.tsx');
const club=read('components/AgencyClubReferenceDetail.tsx');
const drawer=read('components/AgencyClubAccountDrawer.tsx');
const create=read('components/AgencyCreateDrawer.tsx');
const directory=read('components/AgencyClubsReference.tsx');
const logo=read('app/api/club-crest/route.ts');
test('Opening an agency club retains a stable record context for creation',()=>{
 assert.match(directory,/onOpenClubAccount\(\{key:'club-account:'/);
 assert.match(directory,/country:club.country/);
 assert.match(drawer,/onCreateNeed=\{onCreateNeed/);
 assert.match(drawer,/onCreateDeal=\{onCreateDeal/);
 assert.match(drawer,/onCreatePlayer=\{onCreatePlayer/);
 assert.match(workspace,/onCreateContact=\{\(\)\s*=>\s*setCreateKind\('contact'\)\}/);
 assert.match(workspace,/onCreateNeed=\{\(\)\s*=>\s*setCreateKind\('club_need'\)\}/);
 assert.match(workspace,/onCreateDeal=\{\(\)\s*=>\s*setCreateKind\('deal'\)\}/);
 assert.match(workspace,/onCreatePlayer=\{\(\)\s*=>\s*setCreateKind\('player'\)\}/);
 assert.match(workspace,/prefillClub=\{clubAccountRequest/);
 assert.match(create,/organisation_id:kind==='club_need'/);
 assert.match(create,/current_club:kind==='player'/);
});
test('Club account offers real create actions, not decorative controls',()=>{
 for(const label of ['Add contact','Add request','Add deal','Add player'])assert.ok(club.includes(label),label);
 for(const action of ['onCreateNeed','onCreateDeal','onCreatePlayer','onCreateContact'])assert.match(club,new RegExp(action));
 assert.match(club,/aria-label="Add to club"/);
 assert.match(club,/onOpenMarket\(need.club_need_id\)/);
 assert.match(club,/onOpenDeal\(deal.deal_room_id/);
});
test('Club creation and requests preserve existing record flow',()=>{
 assert.match(workspace,/onOpenCreated=\{createKind==='club'\?result/);
 assert.match(workspace,/setClubAccountRequest\(\{key:'club-account:'/);
 assert.match(workspace,/result\?\.formClubName/);
 assert.match(create,/formClubName:values\.club_name\.trim\(\)/);
 assert.match(workspace,/if\(clubAccountRequest\)\{setRecordRefreshRevision/);
 assert.match(create,/action = 'create_club_need_brief'/);
 assert.match(create,/action = 'create_contact'/);
});
test('Logo retrieval allows only validated Commons public-domain and CC0 images',()=>{
 assert.match(logo,/CC0/);
 assert.match(logo,/Public domain/);
 assert.match(logo,/safeImage/);
 assert.match(logo,/https:\/\/commons.wikimedia.org\/wiki\/File:/);
 assert.doesNotMatch(logo,/thesportsdb|API_KEY|service_role/);
 assert.match(read('components/ClubIdentityMark.tsx'),/crestCache/);
});
