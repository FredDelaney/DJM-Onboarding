import {writeWithDeadline} from './write-with-deadline.ts';

export type DocumentWriteResult<T>={data:T|null;error:{code?:string;status?:number;statusCode?:string|number}|null};
export type DocumentUploadDraft={uploaded:boolean;uploadTask?:Promise<DocumentWriteResult<unknown>>};
export type DocumentOutcome<T>={status:'saved';record:T}|{status:'stale'}|{status:'failed'|'unknown';stage:'upload'|'record'};
export async function savePrivateDocument<T>(
 draft:DocumentUploadDraft,
 upload:()=>PromiseLike<DocumentWriteResult<unknown>>,
 record:(signal:AbortSignal)=>PromiseLike<DocumentWriteResult<T>>,
 isCurrent:()=>boolean,
 uploadDeadline=30000,
 recordDeadline=12000,
):Promise<DocumentOutcome<T>>{
 if(!isCurrent())return {status:'stale'};
 if(!draft.uploaded){
  // Storage uploads cannot be aborted by this SDK. Keep the original task
  // for manual recovery rather than starting an overlapping file write.
  draft.uploadTask ||= Promise.resolve().then(upload).catch(()=>({data:null,error:{}}));
  const outcome=await writeWithDeadline(()=>draft.uploadTask!,uploadDeadline);
  if(!isCurrent())return {status:'stale'};
  if(outcome.status==='unknown')return {status:'unknown',stage:'upload'};
  draft.uploadTask=undefined;
  if(outcome.result.error||!outcome.result.data){
   const status=Number(outcome.result.error?.status??outcome.result.error?.statusCode);
   return {status:status>=400&&status<500?'failed':'unknown',stage:'upload'};
  }
  draft.uploaded=true;
 }
 if(!isCurrent())return {status:'stale'};
 const outcome=await writeWithDeadline(record,recordDeadline);
 if(!isCurrent())return {status:'stale'};
 if(outcome.status==='unknown')return {status:'unknown',stage:'record'};
 if(outcome.result.error||!outcome.result.data){
  return {status:outcome.result.error?.code?'failed':'unknown',stage:'record'};
 }
 return {status:'saved',record:outcome.result.data};
}
