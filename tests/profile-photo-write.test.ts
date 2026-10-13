import {test} from 'node:test';
import assert from 'node:assert/strict';
import {saveProfilePhoto,type PhotoDraft} from '../lib/profile-photo-write.ts';
const saved={data:{id:'confirmed'},error:null};
const draft=():PhotoDraft=>({path:'owner/selected-photo.png',uploaded:false});

test('a rejected upload never attaches a photo',async()=>{
 const selected=draft();let attaches=0;
 const result=await saveProfilePhoto(selected,async()=>({data:null,error:{statusCode:'400'}}),async()=>{attaches++;return saved;},5,5);
 assert.deepEqual(result,{status:'failed',stage:'upload'});assert.equal(attaches,0);assert.equal(selected.uploaded,false);
});

test('manual recovery reuses a slow original upload after its confirmation arrives',async()=>{
 const selected=draft();let uploads=0,attaches=0;let resolve!:(value:typeof saved)=>void;
 const upload=()=>{uploads++;return new Promise<typeof saved>(done=>{resolve=done;});};
 const attach=async()=>{attaches++;return saved;};
 assert.deepEqual(await saveProfilePhoto(selected,upload,attach,5,5),{status:'unknown',stage:'upload'});
 assert.equal(uploads,1);assert.equal(attaches,0);
 resolve(saved);
 assert.deepEqual(await saveProfilePhoto(selected,upload,attach,5,5),{status:'saved'});
 assert.equal(uploads,1);assert.equal(attaches,1);assert.equal(selected.path,'owner/selected-photo.png');
});

test('retrying while an upload is still pending does not resend the file',async()=>{
 const selected=draft();let uploads=0,attaches=0;
 const upload=()=>{uploads++;return new Promise<typeof saved>(()=>{});};
 const attach=async()=>{attaches++;return saved;};
 await saveProfilePhoto(selected,upload,attach,5,5);
 assert.deepEqual(await saveProfilePhoto(selected,upload,attach,5,5),{status:'unknown',stage:'upload'});
 assert.equal(uploads,1);assert.equal(attaches,0);
});

test('a rejected attachment retains the confirmed upload for a later attachment retry',async()=>{
 const selected=draft();let uploads=0,attaches=0;
 const upload=async()=>{uploads++;return saved;};
 assert.deepEqual(await saveProfilePhoto(selected,upload,async()=>{attaches++;return {data:null,error:{code:'42501'}};},5,5),{status:'failed',stage:'attach'});
 assert.equal(selected.uploaded,true);
 assert.deepEqual(await saveProfilePhoto(selected,upload,async()=>{attaches++;return saved;},5,5),{status:'saved'});
 assert.equal(uploads,1);assert.equal(attaches,2);
});

test('attachment without a returned row is not reported as saved',async()=>{
 const selected=draft();
 assert.deepEqual(await saveProfilePhoto(selected,async()=>saved,async()=>({data:null,error:null}),5,5),{status:'unknown',stage:'attach'});
 assert.equal(selected.uploaded,true);
});

test('a thrown upload can be manually retried at the same selected path',async()=>{
 const selected=draft();let uploads=0;
 const upload=async()=>{uploads++;if(uploads===1)throw new Error('Connection lost');return saved;};
 assert.deepEqual(await saveProfilePhoto(selected,upload,async()=>saved,5,5),{status:'unknown',stage:'upload'});
 assert.deepEqual(await saveProfilePhoto(selected,upload,async()=>saved,5,5),{status:'saved'});
 assert.equal(uploads,2);assert.equal(selected.path,'owner/selected-photo.png');
});

test('confirmed upload and attachment report one completed photo update',async()=>{
 const selected=draft();let uploads=0,attaches=0;
 assert.deepEqual(await saveProfilePhoto(selected,async()=>{uploads++;return saved;},async()=>{attaches++;return saved;},5,5),{status:'saved'});
 assert.equal(uploads,1);assert.equal(attaches,1);
});

test('a storage server error leaves the upload outcome unconfirmed',async()=>{
 assert.deepEqual(await saveProfilePhoto(draft(),async()=>({data:null,error:{statusCode:'500'}}),async()=>saved,5,5),{status:'unknown',stage:'upload'});
});

test('a named storage access code still respects the confirmed HTTP 403 denial',async()=>{
 assert.deepEqual(await saveProfilePhoto(draft(),async()=>({data:null,error:{status:403,statusCode:'AccessDenied'}}),async()=>saved,5,5),{status:'failed',stage:'upload'});
});
