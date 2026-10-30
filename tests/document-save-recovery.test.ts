import test from 'node:test';
import assert from 'node:assert/strict';
import {newAgencyDocument,documentBrand} from '../lib/agency-documents.ts';
import {documentSaveCheck,sameDocumentDraft} from '../lib/document-save-recovery.ts';
const draft=newAgencyDocument('player_contract',documentBrand());
const saved={...structuredClone(draft),revision:1};
const found=(document:unknown=saved,tenant_id='tenant-a')=>({tenant_id,state:'found',document});
test('only the exact expected saved payload and revision confirms a write',()=>{
 assert.equal(documentSaveCheck(found(),'tenant-a',draft).state,'matching');
 const reordered=structuredClone(saved);reordered.content.fields=Object.fromEntries(Object.entries(reordered.content.fields).reverse());
 assert.equal(sameDocumentDraft(reordered,draft),true);
 assert.equal(documentSaveCheck(found(reordered),'tenant-a',draft).state,'matching');
 for(const change of [{title:'Other editor'},{revision:2},{paid_at:'2026-10-26T12:00:00Z'},{kind:'invoice'}])
  assert.equal(documentSaveCheck(found({...saved,...change}),'tenant-a',draft).state,'different');
 assert.equal(documentSaveCheck(found({...saved,revision:3}),'tenant-a',{...draft,revision:3}).state,'unchanged');
});
test('missing, archived, wrong-scope and malformed reads never confirm a save',()=>{
 for(const state of ['missing','archived'])assert.equal(documentSaveCheck({tenant_id:'tenant-a',state,document:null},'tenant-a',draft).state,state);
 for(const value of [null,{},found(saved,'foreign'),found({...saved,id:'foreign'}),found({...saved,revision:0}),found({...saved,content:{}}),found({...saved,content:{...saved.content,fields:[]}}),found({...saved,updated_at:'bad-date'})])
  assert.equal(documentSaveCheck(value,'tenant-a',draft).state,'unknown');
});
