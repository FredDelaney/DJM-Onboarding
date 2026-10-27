const timeoutMessage='The request took too long. Please try again.';

export async function readWithDeadline<T>(request:Promise<T>,milliseconds=12000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  return await Promise.race([request,new Promise<never>((_,reject)=>{
   timer=setTimeout(()=>reject(new Error(timeoutMessage)),milliseconds);
  })]);
 }catch(error){
  if(error && typeof error==='object' && 'message' in error && typeof error.message==='string' &&
   /^canceling statement due to statement timeout$/i.test(error.message.trim())){
   const failure=new Error(timeoutMessage,{cause:error});
   if('code' in error)Object.assign(failure,{code:error.code});
   throw failure;
  }
  throw error;
 }finally{clearTimeout(timer);}
}
