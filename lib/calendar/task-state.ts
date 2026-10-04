import {calendarDateKey} from './dates.ts';
import type {CalendarTask} from './tasks.ts';
export type TaskCollection={mode:'range'|'undated'|'overdue';start:string;end:string;today:string;now:Date;done:boolean;archived:boolean};
export function reconcileTaskRows(rows:CalendarTask[],task:CalendarTask,collection:TaskCollection):CalendarTask[]{
 const next=rows.filter(row=>row.id!==task.id);
 if(task.archived_at&&!collection.archived||task.status==='done'&&!collection.done)return next;
 const date=task.due_at?calendarDateKey(task.due_at):task.due_on;
 const matches=collection.mode==='undated'?!task.due_on:collection.mode==='overdue'?task.status==='open'&&!task.archived_at&&!!date&&(task.due_at?new Date(task.due_at)<collection.now:date<collection.today):!!date&&date>=collection.start&&date<collection.end;
 return matches?[...next,task]:next;
}
