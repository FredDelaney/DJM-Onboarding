export const listMemoryKey=(scope:string,list:string)=>'redream:list:v1:'+scope+':'+list;
export function readListMemory<T extends Record<string,string>>(raw:string|null,initial:T):T{
 try{
  const saved=JSON.parse(raw||'null');if(!saved||typeof saved!=='object'||Array.isArray(saved))return initial;
  return Object.fromEntries(Object.entries(initial).map(([key,value])=>[key,typeof saved[key]==='string'?saved[key].slice(0,200):value])) as T;
 }catch{return initial;}
}
