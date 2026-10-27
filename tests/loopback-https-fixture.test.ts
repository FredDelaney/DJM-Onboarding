import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {get} from 'node:https';
import test from 'node:test';
import type {AddressInfo} from 'node:net';
import {startLoopbackHttpsFixture} from '../scripts/loopback-https-fixture.mjs';

test('HTTPS fixture retains production CSP and forwards loopback requests',async()=>{
 const upstream=createServer((request,response)=>{
  response.setHeader('Content-Security-Policy',"default-src 'self'; upgrade-insecure-requests");
  response.setHeader('Content-Type','application/json');
  response.end(JSON.stringify({path:request.url,protocol:request.headers['x-forwarded-proto']}));
 });
 let fixture:Awaited<ReturnType<typeof startLoopbackHttpsFixture>>|undefined;
 try{
  await new Promise<void>(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  fixture=await startLoopbackHttpsFixture((upstream.address() as AddressInfo).port);
  const result=await new Promise<{status:number|undefined,csp:string|undefined,encrypted:boolean,body:string}>((resolve,reject)=>{
   // The test's generated certificate is trusted only for this loopback request.
   get(fixture.origin+'/assets/theme.css?state=error',{rejectUnauthorized:false},response=>{
    let body='';const encrypted=Boolean((response.socket as any).encrypted);
    response.setEncoding('utf8');response.on('data',chunk=>body+=chunk);
    response.on('end',()=>resolve({status:response.statusCode,csp:response.headers['content-security-policy'],encrypted,body}));
   }).on('error',reject);
  });
  assert.equal(result.status,200);
  assert.equal(result.encrypted,true);
  assert.equal(result.csp,"default-src 'self'; upgrade-insecure-requests");
  assert.deepEqual(JSON.parse(result.body),{path:'/assets/theme.css?state=error',protocol:'https'});
 }finally{
  try{await fixture?.close();}
  finally{await new Promise<void>(resolve=>{upstream.close(()=>resolve());upstream.closeAllConnections();});}
 }
});
