import {isHomePlayerDataReview} from './home-priority.ts';
import type { CalendarRpc } from './calendar/tasks.ts';
export type WorkRef = { kind: string; id: string };
const kinds = new Set(['player_next_action','career_strategy_review','target_window_end','deal_next_action','club_need_expiry','player_request_due','representation_record_end','document_expiry','contract_expiry']);
export function workRefFor(value: any): WorkRef | null {
  if(isHomePlayerDataReview(value))return null;
  const kind = value?.work_kind || (value?.source_type === 'task' ? 'task' : value?.deadline_type) || (value?.task_id ? 'task' : '');
  const id = String(value?.work_id || value?.task_id || (value?.source_type === 'task' ? value?.source_id : value?.entity_id) || '');
  return (kind === 'task' || kinds.has(kind)) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? {kind,id} : null;
}
export function homeWorkRefFor(value: any): WorkRef | null {
  if (isHomePlayerDataReview(value) || value?.command_type === 'Player review required' || /^review\b.*\b(data|statistics|player record)\b/i.test(String(value?.title || '')) || Number(value?.evidence?.task_count || 1) > 1) return null;
  const followUp = value?.source_type === 'player' && value?.command_type === 'Player follow-up due';
  const kind = followUp ? 'player_next_action' : value?.work_kind || value?.deadline_type || (value?.source_type === 'task' || value?.task_id ? 'task' : '');
  const id = String(value?.work_id || value?.task_id || value?.source_id || value?.entity_id || '');
  return ['task','player_next_action','calendar_task'].includes(kind) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? {kind,id} : null;
}
export function workHref(value:any,basePath:string):string {
  if(value?.work_kind==='calendar_task')return basePath+'?view=calendar&task='+encodeURIComponent(value.work_id)+(value.due_at?'&date='+encodeURIComponent(String(value.due_at).slice(0,10)):'');
  const context=value?.context||{};
  if(context.deal_room_id)return basePath+'?view=opportunities&tab=deals&record='+encodeURIComponent(context.deal_room_id);
  if(context.player_id)return basePath+'?view=players&player='+encodeURIComponent(context.player_id)+'&profile=1';
  if(context.club_need_id)return basePath+'?view=opportunities&tab=needs&record='+encodeURIComponent(context.club_need_id);
  if(context.person_id)return basePath+'?view=network&person='+encodeURIComponent(context.person_id);
  if(context.organisation_id)return basePath+'?view=network&club='+encodeURIComponent(context.organisation_id);
  return basePath+'?view=calendar'+(!value?.due_at?'&undated=1#work-'+encodeURIComponent(value?.work_id||''):'');
}

export async function readAssignedWorkPages(rpc:CalendarRpc,tenantId:string):Promise<any[]> {
 const items:any[]=[];const seen=new Set<number>();let cursor:number|null=null;
 do {
  const page:{items:any[];next_cursor?:number|null;limited?:boolean}=await rpc('redream_assigned_work_page_v1',{p_tenant_id:tenantId,p_cursor:cursor,p_limit:200});
  if(!Array.isArray(page?.items))throw new Error('assigned_work_unconfirmed');
  items.push(...page.items);
  cursor=page.next_cursor??null;
  if(cursor!==null){if(!Number.isInteger(cursor)||seen.has(cursor))throw new Error('assigned_work_cursor_invalid');seen.add(cursor);}
 }while(cursor!==null);
 return items;
}
