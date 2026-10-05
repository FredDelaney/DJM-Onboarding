// Non-deployed fixture: routes are installed only for this browser check, then removed.
import {cp,mkdir,rm,access} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const routes=new URL('../pages/',import.meta.url);
try{await access(routes);throw new Error('Refusing to replace existing pages routes.');}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(routes);
await cp(new URL('../tests/fixtures/calendar/',import.meta.url),routes,{recursive:true});
const port=process.env.CALENDAR_QA_PORT||'3113';
const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'example',CALENDAR_QA_URL:`http://127.0.0.1:${port}/qa-calendar`};
const server=spawn('npm',['run','dev','--','--webpack','--hostname','127.0.0.1','--port',port],{env,stdio:'inherit',detached:true});
const run=script=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script],{env,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${script} failed (${code})`)));});
try{await run('scripts/agency-command-recovery-qa.mjs');await run('scripts/calendar-mobile-recovery-qa.mjs');await run('scripts/calendar-workspace-browser-qa.mjs');}finally{try{process.kill(-server.pid,'SIGTERM');}catch{}await rm(routes,{recursive:true,force:true});}
