import {mkdir,cp,rm,access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const route=new URL('../app/workspace/qa-deep-journey/',import.meta.url);
try{await access(route);throw new Error('Refusing to replace an existing route.');}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(route,{recursive:true});await cp(new URL('../tests/fixtures/deep-journey/page.tsx',import.meta.url),new URL('page.tsx',route));
const port=process.env.CALENDAR_QA_PORT||'3113';
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'example',DEEP_JOURNEY_QA_URL:`http://127.0.0.1:${port}/workspace/qa-deep-journey`};
const server=spawn('npm',['run','dev','--','--webpack','--hostname','127.0.0.1','--port',port],{env,stdio:'inherit',detached:true});
try{await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/deep-journey-browser-qa.mjs'],{env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('Deep journey browser check failed ('+code+')')));});}
finally{try{process.kill(-server.pid,'SIGTERM');}catch{}await rm(route,{recursive:true,force:true});await rm(new URL('../.next/dev/types/',import.meta.url),{recursive:true,force:true});}
