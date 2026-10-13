import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';

export function edgeHandler(file:string,fetcher:typeof fetch){
 let handler:(req:Request)=>Promise<Response>;
 const Deno={serve:(fn:typeof handler)=>{handler=fn;},env:{get:(name:string)=>name==='SUPABASE_URL'?'https://synthetic.supabase.co':name==='SUPABASE_SERVICE_ROLE_KEY'?'synthetic-server-only-key':undefined}};
 const cache=new Map<string,any>();
 function load(path:string){
  if(cache.has(path))return cache.get(path);
  const exports:any={};cache.set(path,exports);
  const source=readFileSync(path,'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const require=(name:string)=>{
   if(name.includes('edge-runtime.d.ts'))return {};
   if(name==='jsr:@supabase/supabase-js@2')return {createClient:(url:string,key:string,options:any)=>createClient(url,key,{...options,global:{fetch:fetcher}})};
   if(name.startsWith('.'))return load(resolve(dirname(path),name));
   throw new Error('Unexpected dependency '+name);
  };
  new Function('exports','require','Deno','console',js)(exports,require,Deno,{error:()=>{},warn:()=>{}});
  return exports;
 }
 load(resolve(file));
 return (req:Request)=>handler(req);
}
export const jsonResponse=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
export const post=(handler:ReturnType<typeof edgeHandler>,body:unknown)=>handler(new Request('https://synthetic.invalid',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
