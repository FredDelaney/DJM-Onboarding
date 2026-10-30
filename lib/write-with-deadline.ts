export type WriteOutcome<T> = {status:'complete';result:T} | {status:'unknown'};

// A stopped client request does not prove that the server rolled back the write.
export async function writeWithDeadline<T>(
 write:(signal:AbortSignal)=>PromiseLike<T>,
 milliseconds=12000,
 cancel?:AbortSignal,
):Promise<WriteOutcome<T>>{
 const controller=new AbortController();
 let timer:ReturnType<typeof setTimeout>|undefined;
 let stop:()=>void=()=>{};
 try{
  if(cancel?.aborted){controller.abort();return {status:'unknown'};}
  const result=await Promise.race([
   Promise.resolve().then(()=>write(controller.signal)),
   new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>{
     reject(new Error('Write confirmation timed out'));
     controller.abort();
    },milliseconds);
   }),
   new Promise<never>((_,reject)=>{
    stop=()=>{controller.abort();reject(new Error('Write confirmation cancelled'));};
    cancel?.addEventListener('abort',stop,{once:true});
   }),
  ]);
  return {status:'complete',result};
 }catch{
  return {status:'unknown'};
 }finally{
  clearTimeout(timer);
  cancel?.removeEventListener('abort',stop);
 }
}
