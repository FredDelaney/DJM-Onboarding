import assert from 'node:assert/strict';
import test from 'node:test';
import {contactLinks,contactPatch,normaliseContact} from '../lib/record-contact-details.ts';

test('contact links reject injected mail headers and incomplete WhatsApp numbers',()=>{
 assert.equal(contactLinks({email:'a@example.test?bcc=other@example.test',whatsapp:'3456'}).email,null);
 assert.equal(contactLinks({email:'a@example.test\r\nBcc:other@example.test',whatsapp:'+39 333 123 4567'}).email,null);
 assert.equal(contactLinks({email:'agent+clubs@example.test',whatsapp:'0039 (333) 123-4567'}).whatsapp,'https://wa.me/393331234567');
 assert.equal(contactLinks({email:'agent+clubs@example.test',whatsapp:null}).email,'mailto:agent%2Bclubs@example.test');
});
test('contact patches distinguish clearing from unchanged fields',()=>{
 assert.deepEqual(contactPatch({email:'a@example.test',whatsapp:'+393331234567'},{email:'',whatsapp:'0039 333 123 4567'}),{patch:{email:null},expected:{email:'a@example.test'}});
 assert.deepEqual(contactPatch({email:null,whatsapp:null},{email:' ',whatsapp:''}),{patch:{},expected:{}});
 assert.deepEqual(contactPatch({email:'',whatsapp:null},{email:'agent@example.test',whatsapp:''}),{patch:{email:'agent@example.test'},expected:{email:''}},'Legacy empty values retain their exact concurrency baseline');
 assert.throws(()=>normaliseContact({email:'a@example.test',whatsapp:'3331234567'}),/country code/);
});
