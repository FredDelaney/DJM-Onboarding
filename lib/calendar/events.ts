import { calendarDateKey } from './dates.ts';
import type { CalendarPreferences,CalendarLayer } from './preferences.ts';
import type { CalendarTask } from './tasks.ts';
export type CalendarEvent={key:string;kind:'meeting'|'follow_up'|'birthday'|'deadline'|'task';dateAt:string;dateOnly?:boolean;state?:string;title:string;detail:string;category:string;layer:CalendarLayer;task?:CalendarTask;playerId?:string;clubNeedId?:string;entityType?:string;entityId?:string;personId?:string;organisationId?:string;meetingId?:string;meetingUrl?:string;source?:string;deadlineType?:string;birthdayCategory?:'players'|'contacts'|'staff'};
export type CalendarGroup={key:string;label:string;items:CalendarEvent[]};
const list=(value:any):any[]=>Array.isArray(value)?value:[];
const deadlineLabels:Record<string,string>={contract_expiry:'Playing contract',representation_record_end:'Agency agreement',document_expiry:'Player document',player_next_action:'Player action',deal_next_action:'Deal',club_need_expiry:'Club need',player_request_due:'Player request',career_strategy_review:'Career review',target_window_end:'Move window'};
function dateOf(item:CalendarEvent):Date{return new Date(item.dateOnly?`${item.dateAt}T12:00:00`:item.dateAt);}
export function normaliseCalendarEvents(legacy:any,birthdays:any,tasks:CalendarTask[]):CalendarEvent[]{
 const dates=list(legacy?.operations?.deadlines?.items).map((i):CalendarEvent=>({key:`deadline:${i.deadline_type||'date'}:${i.entity_id||i.title}`,kind:'deadline',layer:'agencyDates',dateAt:i.deadline_at,dateOnly:!!i.date_only,state:i.deadline_state,title:i.title||'Agency date',detail:i.next_action?.instruction||deadlineLabels[i.deadline_type]||'Agency date',category:deadlineLabels[i.deadline_type]||'Agency date',playerId:i.context?.player_id,clubNeedId:i.context?.club_need_id,entityType:i.entity_type,entityId:i.entity_id,deadlineType:i.deadline_type}));
 const birthdayItems=list(birthdays?.items??legacy?.operations?.important_dates?.birthdays?.items).map((i):CalendarEvent=>({key:`birthday:${i.item_id||i.player_id}`,kind:'birthday',layer:'birthdays',dateAt:i.date_at,dateOnly:true,state:i.date_state,title:i.title||`${i.player_name||'Player'} birthday`,detail:i.turns_age?`Turns ${i.turns_age}`:i.birthday_category==='staff'?'Team birthday':i.birthday_category==='contacts'?'Club contact birthday':'Player birthday',category:'Birthday',birthdayCategory:i.birthday_category||'players',personId:i.person_id,playerId:i.player_id}));
 const meetings=list(legacy?.meetings?.items).map((i):CalendarEvent=>({key:`meeting:${i.meeting_id||i.id}`,kind:'meeting',layer:'meetings',dateAt:i.starts_at,title:i.title||'Meeting',detail:[i.person_name,i.organisation_name].filter(Boolean).join(' · ')||'Agency meeting',category:'Meeting',meetingId:i.meeting_id||i.id,personId:i.person_id,organisationId:i.organisation_id,meetingUrl:i.meeting_url}));
 const followUps=list(legacy?.follow_ups?.items).map((i):CalendarEvent=>({key:`follow-up:${i.task_id}`,kind:'follow_up',layer:'followUps',dateAt:i.due_at,title:i.title||'Follow-up',detail:[i.player_name,i.club_name,i.person_name,i.organisation_name].filter(Boolean).join(' · ')||'Your follow-up',category:'Your follow-up',playerId:i.player_id,clubNeedId:i.club_need_id,personId:i.person_id,organisationId:i.organisation_id,source:i.source}));
 const manual=tasks.filter(t=>t.due_on).map((t):CalendarEvent=>({key:`task:${t.id}`,kind:'task',layer:t.visibility,dateAt:t.due_at||t.due_on!,dateOnly:!t.due_at,title:t.title,detail:t.notes|| (t.visibility==='company'?`Assigned to ${t.owner_name||'Team member'}`:'Only you can see this task'),category:t.visibility==='company'?'Company task':'My task',state:t.archived_at?'archived':t.status,task:t}));
 const preferred=new Map<string,CalendarEvent>();
 for(const item of [...dates,...birthdayItems,...meetings,...followUps,...manual]){let key=item.key;if(item.deadlineType==='deal_next_action'&&item.entityId)key=`deal:${item.entityId}`;const deal=item.source?.match(/^redream:deal_followup:(.+)$/)?.[1];if(item.kind==='follow_up'&&deal)key=`deal:${deal}`;if(!preferred.has(key)||item.kind==='follow_up')preferred.set(key,item);}
 return [...preferred.values()].filter(i=>!Number.isNaN(dateOf(i).getTime())).sort((a,b)=>dateOf(a).getTime()-dateOf(b).getTime()||a.key.localeCompare(b.key));
}
export function filterCalendarEvents(events:CalendarEvent[],prefs:CalendarPreferences):CalendarEvent[]{return events.filter(i=>prefs.layers[i.layer]&&(i.kind!=='birthday'||prefs.birthdays[i.birthdayCategory||'players']));}
export function isOverdue(item:CalendarEvent,now:Date):boolean{
 if(item.kind==='birthday'||item.kind==='meeting'||item.task?.status==='done'||item.task?.archived_at)return false;
 if(item.state==='overdue')return true;
 return item.dateOnly?item.dateAt<calendarDateKey(now):dateOf(item)<now;
}
export function groupCalendarEvents(events:CalendarEvent[],selectedDate:string,view:'month'|'agenda',horizon:number,now:Date):CalendarGroup[]{
 const today=calendarDateKey(now),tomorrow=new Date(now);tomorrow.setDate(tomorrow.getDate()+1);const end=new Date(`${selectedDate}T12:00:00`);end.setDate(end.getDate()+horizon);
 const groups=new Map<string,CalendarGroup>();
 for(const item of events){const keyDate=calendarDateKey(item.dateAt,!!item.dateOnly),overdue=isOverdue(item,now);if(view==='month'&&keyDate!==selectedDate)continue;if(view==='agenda'&&!(overdue&&selectedDate===today)&&(keyDate<selectedDate||keyDate>calendarDateKey(end)))continue;
 const key=overdue&&view==='agenda'?'overdue':keyDate,label=key==='overdue'?'Overdue':keyDate===today?'Today':keyDate===calendarDateKey(tomorrow)?'Tomorrow':new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short'}).format(dateOf(item));
 const group=groups.get(key)||{key,label,items:[]};group.items.push(item);groups.set(key,group);}
 return [...groups.values()].sort((a,b)=>a.key==='overdue'?-1:b.key==='overdue'?1:a.key.localeCompare(b.key));
}
export function todayProjection(events:CalendarEvent[],now:Date){
 const active=events.filter(e=>!e.task?.archived_at&&e.task?.status!=='done');
 return {overdue:active.filter(e=>isOverdue(e,now)),dueToday:active.filter(e=>e.kind!=='birthday'&&e.kind!=='meeting'&&!isOverdue(e,now)&&calendarDateKey(e.dateAt,!!e.dateOnly)===calendarDateKey(now)),nextMeeting:active.find(e=>e.kind==='meeting'&&dateOf(e)>=now&&calendarDateKey(e.dateAt)===calendarDateKey(now))||null};
}
export function birthdayGreeting():string{return 'Happy birthday! Hope you have a great day.';}
