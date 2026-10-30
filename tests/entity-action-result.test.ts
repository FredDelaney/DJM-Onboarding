import assert from 'node:assert/strict';
import {test} from 'node:test';
import {confirmsEntityAction,isDefinitiveEntityDenial,entityActionErrorMessage} from '../lib/entity-action-result.ts';

test('only the exact record and actual action acknowledgement confirm a change',()=>{
 for(const kind of ['club','club_contact','player','recruitment_target','club_need','deal_room']){
  const base={id:'selected',entity_type:kind};
  assert.equal(confirmsEntityAction({...base,ok:true},'edit',kind,'selected'),true);
  assert.equal(confirmsEntityAction({...base,ok:true,archived:true},'archive',kind,'selected'),true);
  assert.equal(confirmsEntityAction({...base,deleted:true},'delete',kind,'selected'),true);
  for(const value of [null,{},[],true,{ok:true},{...base,id:'another',ok:true},{...base,entity_type:'other',ok:true},{...base,ok:'true'},{...base,ok:false}])assert.equal(confirmsEntityAction(value,'edit',kind,'selected'),false);
  assert.equal(confirmsEntityAction({...base,ok:true},'archive',kind,'selected'),false);
  assert.equal(confirmsEntityAction({...base,ok:true,archived:false},'archive',kind,'selected'),false);
  assert.equal(confirmsEntityAction({...base,ok:true},'delete',kind,'selected'),false);
 }
});
test('the club request version remains required in addition to identity and success',()=>{
 const value={id:'need',entity_type:'club_need',ok:true};
 assert.equal(confirmsEntityAction(value,'edit','club_need','need',true),false);
 assert.equal(confirmsEntityAction({...value,brief_version:1},'edit','club_need','need',true),true);
 assert.equal(confirmsEntityAction({...value,brief_version:2},'edit','club_need','need',true),false);
});
test('only known transactional rejections permit a corrected write without outcome recovery',()=>{
 for(const code of ['42501','22023','23505','P0001','40001','40P01','PGRST202'])assert.equal(isDefinitiveEntityDenial({code}),true,code);
 for(const error of [new Error('Failed to fetch'),{code:'08006'},{code:'57P01'},{code:'PGRST000'},{code:'504'},null,{}])assert.equal(isDefinitiveEntityDenial(error),false);
});
test('permission, unavailable action and duplicate errors do not expose internal names',()=>{
 for(const code of ['42501','PGRST202','42883','23505'])assert.doesNotMatch(entityActionErrorMessage(Object.assign(new Error('private.internal_function and database_constraint'),{code})),/internal_function|database_constraint/);
 assert.equal(entityActionErrorMessage(new Error('Choose a valid date.')),'Choose a valid date.');
});
