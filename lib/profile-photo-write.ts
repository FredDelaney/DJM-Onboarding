import {writeWithDeadline} from './write-with-deadline.ts';

export type MediaWriteResult = {data:unknown;error:{message?:string;code?:string;statusCode?:string|number;status?:number}|null};
export type PhotoDraft = {path:string;uploaded:boolean;uploadTask?:Promise<MediaWriteResult>};
export type PhotoOutcome = {status:'saved'} | {status:'failed'|'unknown';stage:'upload'|'attach'};
export async function saveProfilePhoto(
 draft:PhotoDraft,
 upload:()=>PromiseLike<MediaWriteResult>,
 attach:(signal:AbortSignal)=>PromiseLike<MediaWriteResult>,
 uploadDeadline=30000,
 attachDeadline=12000,
):Promise<PhotoOutcome>{
 if(!draft.uploaded){
  // Keep a slow upload available for manual recovery. The SDK cannot cancel it.
  draft.uploadTask ||= Promise.resolve().then(upload).catch(()=>({data:null,error:{}}));
  const outcome=await writeWithDeadline(()=>draft.uploadTask!,uploadDeadline);
  if(outcome.status==='unknown')return {status:'unknown',stage:'upload'};
  draft.uploadTask=undefined;
  if(outcome.result.error||!outcome.result.data){
   const status=Number(outcome.result.error?.status??outcome.result.error?.statusCode);
   return {status:status>=400&&status<500?'failed':'unknown',stage:'upload'};
  }
  draft.uploaded=true;
 }
 const outcome=await writeWithDeadline(attach,attachDeadline);
 if(outcome.status==='unknown')return {status:'unknown',stage:'attach'};
 if(outcome.result.error||!outcome.result.data){
  return {status:outcome.result.error?.code?'failed':'unknown',stage:'attach'};
 }
 return {status:'saved'};
}
