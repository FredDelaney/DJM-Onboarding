import {execFile} from 'node:child_process';
import {request} from 'node:http';
import {createServer} from 'node:https';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';

// Exercise the production CSP over HTTPS. WebKit upgrades loopback HTTP assets
// under upgrade-insecure-requests, so an HTTP-only fixture cannot hydrate.
export async function startLoopbackHttpsFixture(upstreamPort){
 if(!Number.isInteger(upstreamPort)||upstreamPort<1||upstreamPort>65535)throw new Error('A valid loopback upstream port is required');
 const directory=await mkdtemp(join(tmpdir(),'redream-https-qa-'));
 let server;
 try{
  const keyPath=join(directory,'key.pem'),certPath=join(directory,'cert.pem');
  await promisify(execFile)('openssl',['req','-x509','-newkey','rsa:2048','-sha256','-nodes','-days','1','-subj','/CN=localhost','-keyout',keyPath,'-out',certPath]);
  const [key,cert]=await Promise.all([readFile(keyPath),readFile(certPath)]);
  server=createServer({key,cert},(incoming,outgoing)=>{
   const upstream=request({hostname:'127.0.0.1',port:upstreamPort,path:incoming.url,method:incoming.method,headers:{...incoming.headers,'x-forwarded-proto':'https'}},response=>{
    outgoing.writeHead(response.statusCode||502,response.headers);
    response.on('error',()=>outgoing.destroy());
    response.pipe(outgoing);
   });
   upstream.on('error',()=>{
    if(!outgoing.headersSent)outgoing.writeHead(502,{'content-type':'text/plain'});
    outgoing.end('Loopback QA server unavailable');
   });
   incoming.on('aborted',()=>upstream.destroy());
   outgoing.on('close',()=>{if(!outgoing.writableFinished)upstream.destroy();});
   incoming.pipe(upstream);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {
   origin:'https://127.0.0.1:'+server.address().port,
   close:async()=>{
    try{await new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});}
    finally{await rm(directory,{recursive:true,force:true});}
   },
  };
 }catch(error){
  server?.close();server?.closeAllConnections();
  await rm(directory,{recursive:true,force:true});
  throw error;
 }
}
