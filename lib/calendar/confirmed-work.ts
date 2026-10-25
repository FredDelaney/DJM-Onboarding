import type {ConfirmedHomeWork} from '../work-responsibility.ts';
import type {CalendarEvent} from './events.ts';
import type {CalendarTask} from './tasks.ts';
import {calendarDateKey} from './dates.ts';

// A confirmed write takes precedence while any Calendar source is stale or
// unavailable. This is a view of the existing canonical task, not another task.
export function projectConfirmedCalendarWork(events:CalendarEvent[],confirmed:Record<string,ConfirmedHomeWork>,includeDone=false):CalendarEvent[]{
 const result:CalendarEvent[]=[],seen=new Set<string>();
 const apply=(item:CalendarEvent,work:ConfirmedHomeWork):CalendarEvent|null=>{
  if(work.status==='done'&&(!includeDone||work.work_kind!=='calendar_task'))return null;
  const rawDate=work.due_at||work.due_on,dateOnly=work.work_kind==='player_next_action'||!work.due_at;
  if(!rawDate)return null;
  const dateAt=dateOnly?calendarDateKey(rawDate,true):rawDate;
  const task=item.task?{...item.task,title:work.title,notes:work.note,status:work.status,due_at:work.due_at,due_on:work.due_on,
   due_time:work.state.due_time as string|null,time_zone:work.state.time_zone as string|null,revision:Number(work.state.revision)}as CalendarTask:undefined;
  return {...item,title:work.display_title,dateAt,dateOnly,state:work.status,task};
 };
 for(const item of events){
  const key=item.task?'calendar_task:'+item.task.id:item.workKind+':'+item.workId;
  seen.add(key);
  const next=confirmed[key]?apply(item,confirmed[key]):item;
  if(next)result.push(next);
 }
 for(const [key,work]of Object.entries(confirmed)){
  // Calendar task privacy/layer metadata comes from its existing source DTO.
  if(seen.has(key)||work.status!=='open'||work.work_kind==='calendar_task')continue;
  const context=work.context||{};
  const item:CalendarEvent={key:'confirmed:'+key,kind:'follow_up',layer:'followUps',title:work.display_title,detail:'Your follow-up',category:'Your follow-up',dateAt:'',workKind:work.work_kind,workId:work.work_id,
   playerId:typeof context.player_id==='string'?context.player_id:undefined,personId:typeof context.person_id==='string'?context.person_id:undefined,organisationId:typeof context.organisation_id==='string'?context.organisation_id:undefined,clubNeedId:typeof context.club_need_id==='string'?context.club_need_id:undefined};
  const next=apply(item,work);if(next)result.push(next);
 }
 return result.sort((a,b)=>new Date(a.dateOnly?a.dateAt+'T12:00:00':a.dateAt).getTime()-new Date(b.dateOnly?b.dateAt+'T12:00:00':b.dateAt).getTime()||a.key.localeCompare(b.key));
}

export function projectConfirmedAssignedWork(items:any[],confirmed:Record<string,ConfirmedHomeWork>):any[]{
 const result=items.map(item=>{
  const work=confirmed[item.work_kind+':'+item.work_id];
  return work?{...item,title:work.display_title,due_at:work.due_at||work.due_on,date_only:work.work_kind==='player_next_action'||!work.due_at,status:work.status}:item;
 });
 for(const [key,work]of Object.entries(confirmed))if(work.status==='open'&&work.work_kind!=='calendar_task'&&!result.some(item=>item.work_kind+':'+item.work_id===key))result.push({work_kind:work.work_kind,work_id:work.work_id,title:work.display_title,due_at:work.due_at||work.due_on,date_only:work.work_kind==='player_next_action'||!work.due_at,status:work.status,context:work.context||{}});
 return result.filter(item=>item.status!=='done');
}
