import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const read=(path:string)=>readFileSync(path,'utf8');
const directory=read('components/AgencyClubsReference.tsx');
const directoryCss=read('components/AgencyClubsReference.module.css');
const identity=read('components/ClubIdentityMark.tsx');
const profile=read('components/AgencyClubReferenceDetail.tsx');
const profileCss=read('components/AgencyClubReferenceDetail.module.css');
const contact=read('components/AgencyCreateDrawer.tsx');
const contactCss=read('components/AgencyCreateDrawer.module.css');

test('Clubs directory follows reference information hierarchy and preserves real actions',()=>{
  assert.match(directory,/const PAGE_SIZE = 8/);
  assert.match(directory,/searchField/);
  assert.match(directory,/countryCell/);
  assert.match(directory,/leagueCell/);
  assert.match(directory,/ClubIdentityMark/);
  assert.match(directory,/CountryFlag/);
  for(const label of ['Search Club','Manual Entry','Recent Searches','Add Another Club','View Club']){
    assert.ok(directory.includes(label),label);
  }
  assert.match(directory,/invoke\('clubs_directory'/);
  assert.match(directory,/invoke\('import_club'/);
  assert.match(directoryCss,/position:sticky;left:0/);
  assert.match(directoryCss,/focus-visible/);
});
test('Club identity is distinctive, licensed-data-safe and country-aware',()=>{
  assert.match(identity,/function ClubIdentityMark/);
  assert.match(identity,/function CountryFlag/);
  assert.match(identity,/New Zealand/);
  assert.match(identity,/England/);
  assert.doesNotMatch(identity,/fetch\(|<img|https:\/\//);
});
test('Club details preserve usable navigation, fields and accessible deal actions',()=>{
  assert.match(profile,/role="region" aria-label=\{\x60Club details for/);
  assert.match(profile,/ClubIdentityMark/);
  assert.match(profile,/CountryFlag/);
  for(const text of ['Players','Contacts','Requests','Deals','Open deal']){
    assert.ok(profile.includes(text),text);
  }
  assert.match(profile,/onOpenDeal/);
  assert.match(profile,/onOpenMarket/);
  assert.match(profileCss,/focus-visible/);
});
test('Contact creation is an honest central form, not fake permissions UI',()=>{
  for(const text of ['contactBackdrop','contactDrawer','contactFields','selectedClub','contactAccess']){
    assert.ok(contactCss.includes('.'+text),text);
  }
  assert.match(contact,/type="email"/);
  assert.match(contact,/type="tel"/);
  assert.match(contact,/aria-label="Club"/);
  assert.match(contact,/Managed by agency permissions/);
  assert.match(contact,/contact_email/);
  assert.match(contact,/contact_phone/);
  assert.doesNotMatch(contact,/Specific People|Everyone\s*<\/button>/);
});
