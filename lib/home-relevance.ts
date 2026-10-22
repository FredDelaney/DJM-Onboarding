import type { CalendarRpc } from './calendar/tasks.ts';
import {homeWorkRefFor,workRefFor} from './work-responsibility.ts';

// Send record references only. Names, private notes and presentation copy are unnecessary.
export function homeRelevanceReference(value:any):Record<string,unknown> {
 const fields=['work_kind','work_id','task_id','source_type','source_id','deadline_type','entity_type','entity_id','player_id','owner_user_id'];
 const result:Record<string,unknown>={};
 for(const field of fields)if(typeof value?.[field]==='string'&&value[field])result[field]=value[field];
 if(value?.context?.player_id)result.context={player_id:value.context.player_id};
 if(Array.isArray(value?.evidence?.tasks))result.evidence={tasks:value.evidence.tasks.map((task:any)=>({task_id:task.task_id||task.id}))};
 const ref=homeWorkRefFor(value)||workRefFor(value);
 if(ref){result.work_kind=ref.kind;result.work_id=ref.id;}
 return result;
}
export async function readHomeRelevance(rpc:CalendarRpc,references:Record<string,unknown>[],tenantId:string,overview:boolean):Promise<{visible:number[];editable:number[]}> {
 const indices:number[]=[],editable:number[]=[];
 for(let offset=0;offset<references.length;offset+=200){
  const batch=references.slice(offset,offset+200);
  const result=await rpc<any>('redream_home_relevance_v1',{p_items:batch,p_tenant_id:tenantId,p_agency_overview:overview});
  for(const key of ['visible_indices','editable_indices'])if(!Array.isArray(result?.[key])||result[key].some((index:unknown)=>!Number.isInteger(index)||Number(index)<0||Number(index)>=batch.length))throw new Error('home_relevance_unconfirmed');
  indices.push(...new Set<number>(result.visible_indices.map((index:number)=>offset+index)));
  editable.push(...new Set<number>(result.editable_indices.filter((index:number)=>result.visible_indices.includes(index)).map((index:number)=>offset+index)));
 }
 return {visible:indices,editable};
}
