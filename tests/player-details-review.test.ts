import assert from 'node:assert/strict';
import test from 'node:test';
import {detailText,detailValue,detailsDecisions,parseDetailsReview,reconcileDetailChoices,type DetailsReview} from '../lib/player-details-review.ts';
const review:DetailsReview={id:'review',status:'needs_review',fields:[{id:'nationalities',field:'nationalities',before:null,suggested:['New Zealand'],decision:'pending',sources:[]},{id:'height',field:'height_cm',before:180,suggested:184,decision:'pending',sources:[]}]};
test('detail corrections keep typed nationality, height and complete date values without guessing missing dates',()=>{
 assert.deepEqual(detailValue('nationalities','New Zealand, Australia,'),['New Zealand','Australia']);assert.equal(detailValue('height_cm','184'),184);assert.equal(detailValue('contract_expiry','2028-06-30'),'2028-06-30');
 for(const date of ['2028','2028-06','2028-02-30'])assert.throws(()=>detailValue('contract_expiry',date),/complete recorded/);
 assert.throws(()=>detailValue('height_cm','135'),/140 and 230/);assert.throws(()=>detailValue('stats_url','https://user:password@example.com'),/valid/);assert.equal(detailText(0),'0');assert.equal(detailText(null),'');
});
test('polling preserves manual drafts and removes only confirmed resolved choices',()=>{
 const choices={nationalities:{decision:'edit' as const,value:'New Zealand, Australia,'},height:{decision:'accept' as const,value:'184'}};
 assert.deepEqual(reconcileDetailChoices(review,choices),choices);
 const next={...review,fields:review.fields.map(f=>f.id==='height'?{...f,decision:'accepted' as const}:f)};
 assert.deepEqual(reconcileDetailChoices(next,choices),{nationalities:choices.nationalities});
});
test('only chosen pending fields become decisions; a kept blank value is not fabricated',()=>{
 const choices=reconcileDetailChoices(review,{});assert.deepEqual(detailsDecisions(review,choices),[]);
 choices.nationalities={decision:'edit',value:'New Zealand, Australia,'};choices.height={decision:'reject',value:''};
 assert.deepEqual(detailsDecisions(review,choices),[{id:'nationalities',decision:'edit',value:['New Zealand','Australia']},{id:'height',decision:'reject'}]);
});
test('unexpected review schemas fail with recovery language instead of rendering broken controls',()=>{
 assert.equal(parseDetailsReview(null),null);assert.deepEqual(parseDetailsReview(review),review);
 assert.throws(()=>parseDetailsReview({...review,fields:[{...review.fields[0],field:'commission'}]}),/could not load/);
 assert.throws(()=>parseDetailsReview({...review,fields:[{...review.fields[0],sources:{}}]}),/could not load/);
});
