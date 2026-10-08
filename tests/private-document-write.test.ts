import {test} from 'node:test';
import assert from 'node:assert/strict';
import {savePrivateDocument,type DocumentUploadDraft,type DocumentWriteResult} from '../lib/private-document-write.ts';
const saved={data:{id:'owned-document'},error:null};
const selected=():DocumentUploadDraft=>({uploaded:false});
const current=()=>true;

test('a replaced document owner cannot start an upload or record write',async()=>{
 let uploads=0,records=0;
 const result=await savePrivateDocument(selected(),async()=>{uploads++;return saved;},async()=>{records++;return saved;},()=>false,5,5);
 assert.deepEqual(result,{status:'stale'});assert.equal(uploads,0);assert.equal(records,0);
});
test('a denied private upload never creates its record',async()=>{
 const draft=selected();let uploads=0,records=0;
 const result=await savePrivateDocument(draft,async()=>{uploads++;return {data:null,error:{status:403}};},async()=>{records++;return saved;},current,5,5);
 assert.deepEqual(result,{status:'failed',stage:'upload'});assert.equal(uploads,1);assert.equal(records,0);assert.equal(draft.uploaded,false);
});
test('manual recovery consumes a confirmed original upload rather than resending it',async()=>{
 const draft=selected();let uploads=0,records=0,resolve!:(value:DocumentWriteResult<unknown>)=>void;
 const upload=()=>{uploads++;return new Promise<DocumentWriteResult<unknown>>(done=>{resolve=done;});};
 const record=async()=>{records++;return saved;};
 assert.deepEqual(await savePrivateDocument(draft,upload,record,current,5,5),{status:'unknown',stage:'upload'});
 assert.equal(uploads,1);assert.equal(records,0);resolve(saved);
 assert.deepEqual(await savePrivateDocument(draft,upload,record,current,5,5),{status:'saved',record:{id:'owned-document'}});
 assert.equal(uploads,1);assert.equal(records,1);
});
test('retry while a private upload is pending never overlaps file writes',async()=>{
 const draft=selected();let uploads=0,records=0;
 const upload=()=>{uploads++;return new Promise<DocumentWriteResult<unknown>>(()=>{});};
 const record=async()=>{records++;return saved;};
 await savePrivateDocument(draft,upload,record,current,5,5);
 assert.deepEqual(await savePrivateDocument(draft,upload,record,current,5,5),{status:'unknown',stage:'upload'});
 assert.equal(uploads,1);assert.equal(records,0);
});
test('leaving Documents during upload cannot start the follow-on record write',async()=>{
 const draft=selected();let active=true,records=0,resolve!:(value:DocumentWriteResult<unknown>)=>void;
 const pending=savePrivateDocument(draft,()=>new Promise<DocumentWriteResult<unknown>>(done=>{resolve=done;}),async()=>{records++;return saved;},()=>active,100,5);
 await Promise.resolve();await Promise.resolve();assert.equal(typeof resolve,'function','The selected private file was not uploaded');active=false;resolve(saved);
 assert.deepEqual(await pending,{status:'stale'});assert.equal(records,0);
});
test('record transport failure retains the confirmed private upload for manual retry',async()=>{
 const draft=selected();let uploads=0,records=0;
 const upload=async()=>{uploads++;return saved;};
 const record=async()=>{records++;if(records===1)throw new Error('Response lost');return saved;};
 assert.deepEqual(await savePrivateDocument(draft,upload,record,current,5,5),{status:'unknown',stage:'record'});
 assert.equal(draft.uploaded,true);
 assert.deepEqual(await savePrivateDocument(draft,upload,record,current,5,5),{status:'saved',record:{id:'owned-document'}});
 assert.equal(uploads,1);assert.equal(records,2);
});
test('an absent document row is not a confirmed save',async()=>{
 const draft=selected();let records=0;
 assert.deepEqual(await savePrivateDocument(draft,async()=>saved,async()=>{records++;return {data:null,error:null};},current,5,5),{status:'unknown',stage:'record'});
 assert.equal(records,1);assert.equal(draft.uploaded,true);
});
test('record deadline aborts the read/write request without retrying the document',async()=>{
 const draft=selected();let records=0,signal!:AbortSignal,resolve!:(value:typeof saved)=>void;
 const result=await savePrivateDocument(draft,async()=>saved,requestSignal=>{records++;signal=requestSignal;return new Promise<typeof saved>(done=>{resolve=done;});},current,5,5);
 assert.deepEqual(result,{status:'unknown',stage:'record'});assert.equal(signal.aborted,true);assert.equal(records,1);assert.equal(draft.uploaded,true);
 resolve(saved);await Promise.resolve();assert.deepEqual(result,{status:'unknown',stage:'record'});assert.equal(records,1);
});
test('a thrown upload may be retried without claiming the record was saved',async()=>{
 const draft=selected();let uploads=0,records=0;
 const upload=async()=>{uploads++;if(uploads===1)throw new Error('Upload response lost');return saved;};
 const record=async()=>{records++;return saved;};
 assert.deepEqual(await savePrivateDocument(draft,upload,record,current,5,5),{status:'unknown',stage:'upload'});
 assert.equal(records,0);
 assert.deepEqual(await savePrivateDocument(draft,upload,record,current,5,5),{status:'saved',record:{id:'owned-document'}});
 assert.equal(uploads,2);assert.equal(records,1);
});
test('a denied record write retains a confirmed private file',async()=>{
 const draft=selected();let uploads=0,records=0;
 const result=await savePrivateDocument(draft,async()=>{uploads++;return saved;},async()=>{records++;return {data:null,error:{code:'42501'}};},current,5,5);
 assert.deepEqual(result,{status:'failed',stage:'record'});assert.equal(uploads,1);assert.equal(records,1);assert.equal(draft.uploaded,true);
});
