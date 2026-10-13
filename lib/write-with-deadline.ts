export type WriteOutcome<T> = {status:'complete';result:T} | {status:'unknown'};

// A stopped client request does not prove that the server rolled back the write.
export async function writeWithDeadline<T>(
 write:(signal:AbortSignal)=>PromiseLike<T>,
 milliseconds=12000,
):Promise<WriteOutcome<T>>{
 const controller=new AbortController();
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const result=await Promise.race([
   Promise.resolve().then(()=>write(controller.signal)),
   new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>{
     reject(new Error('Write confirmation timed out'));
     controller.abort();
    },milliseconds);
   }),
  ]);
  return {status:'complete',result};
 }catch{
  return {status:'unknown'};
 }finally{
  clearTimeout(timer);
 }
}
