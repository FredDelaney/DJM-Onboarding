import assert from 'node:assert/strict';
import test from 'node:test';
import {brandingForWorkspace} from '../lib/workspace-branding.ts';
import {UNRESOLVED_TENANT_RUNTIME} from '../lib/tenant-runtime.ts';
const runtime={...UNRESOLVED_TENANT_RUNTIME,resolved:true,tenant_id:'host-tenant',branding:{...UNRESOLVED_TENANT_RUNTIME.branding,display_name:'Host Agency',portal_name:'Host Player',logo_asset:'https://example.test/host-logo.png',compact_logo_asset:'https://example.test/host-small.png'}};
test('explicit workspace branding replaces an unresolved or different host without borrowing another agency logo',()=>{
 const b=brandingForWorkspace(runtime,{tenant_id:'other',slug:'selected',display_name:'Selected Agency',short_name:'Selected',primary_color:'#23483F'});
 assert.equal(b.display_name,'Selected Agency');assert.equal(b.short_name,'Selected');assert.equal(b.logo_asset,null);assert.equal(b.compact_logo_asset,null);assert.equal(b.portal_name,null);assert.equal(b.primary_color,'#23483F');
 assert.equal(brandingForWorkspace(runtime,{tenant_id:'other',slug:'selected',display_name:'Selected Agency'}).short_name,'Selected Agency');
 assert.equal(brandingForWorkspace(runtime,{tenant_id:'other',slug:'selected'}).display_name,'selected');
});
test('the same tenant retains its verified assets and a selected logo belongs only to the selected workspace',()=>{
 assert.equal(brandingForWorkspace(runtime,{tenant_id:'host-tenant',slug:'host',display_name:'Host Agency'}).logo_asset,'https://example.test/host-logo.png');
 assert.equal(brandingForWorkspace(runtime,{tenant_id:'other',slug:'selected',display_name:'Selected',logo_asset:'https://example.test/selected.png'}).logo_asset,'https://example.test/selected.png');
 assert.equal(brandingForWorkspace(runtime,null),runtime.branding);
});
