export async function readWithDeadline<T>(request:Promise<T>,milliseconds=12000):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  return await Promise.race([request,new Promise<never>((_,reject)=>{
   timer=setTimeout(()=>reject(new Error('The request took too long. Please try again.')),milliseconds);
  })]);
 }finally{clearTimeout(timer);}
}
