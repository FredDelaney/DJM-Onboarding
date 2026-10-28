const timeoutMessage='The request took too long. Please try again.';

export async function readWithDeadline<T>(request:Promise<T>,milliseconds=12000,cancel?:AbortSignal):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 let stop:()=>void=()=>{};
 try{
  if(cancel?.aborted){void request.catch(()=>{});throw new DOMException('Request cancelled','AbortError');}
  return await Promise.race([request,new Promise<never>((_,reject)=>{
   timer=setTimeout(()=>reject(new Error(timeoutMessage)),milliseconds);
  }),new Promise<never>((_,reject)=>{
   stop=()=>reject(new DOMException('Request cancelled','AbortError'));
   cancel?.addEventListener('abort',stop,{once:true});
  })]);
 }catch(error){
  if(error && typeof error==='object' && 'message' in error && typeof error.message==='string' &&
   /^canceling statement due to statement timeout$/i.test(error.message.trim())){
   const failure=new Error(timeoutMessage,{cause:error});
   if('code' in error)Object.assign(failure,{code:error.code});
   throw failure;
  }
  throw error;
 }finally{clearTimeout(timer);cancel?.removeEventListener('abort',stop);}
}
