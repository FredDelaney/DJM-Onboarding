import { Temporal } from 'temporal-polyfill';
export type CalendarTask = {
 id:string;tenant_id:string;creator_user_id:string;owner_user_id:string;owner_name:string;
 visibility:'personal'|'company';title:string;notes:string;due_on:string|null;due_time:string|null;time_zone:string|null;due_at:string|null;
 status:'open'|'done';archived_at:string|null;revision:number;can_edit:boolean;needs_reassignment:boolean;
};
export type Assignee={user_id:string;display_name:string};
export type TaskInput={id?:string;title:string;notes?:string;visibility?:'personal'|'company';owner_user_id?:string;due_on:string|null;due_time:string|null;time_zone:string|null};
export type TaskAction='edit'|'complete'|'reopen'|'archive'|'restore';
export type CalendarRpc=<T=any>(name:string,args?:Record<string,unknown>)=>Promise<T>;
export function taskLocalInstant(dueOn:string,dueTime:string,zone:string):string {
 return Temporal.ZonedDateTime.from(`${dueOn}T${dueTime}[${zone}]`,{disambiguation:'reject',overflow:'reject'}).toInstant().toString();
}
export function taskErrorMessage(error:unknown):string {
 const code=typeof error==='string'?error:error instanceof Error?error.message:String((error as any)?.message||'');
 if(code.includes('task_revision_conflict'))return 'This task changed while you were editing. Close and reopen it to see the latest version. Your draft is still here.';
 if(code.includes('task_owner_inactive'))return 'Choose an active member of your company to own this task.';
 if(code.includes('task_time_ambiguous'))return 'This time occurs twice when the clocks change. Choose a time outside that repeated hour.';
 if(code.includes('task_time_invalid'))return 'Choose a valid date, time and time zone. This local time may not exist when the clocks change.';
 if(code.includes('task_create_conflict'))return 'This task was already saved with different details. Refresh the calendar before trying again.';
 if(/denied|task_archived/.test(code))return 'This task is no longer available to edit. Refresh the calendar.';
 return 'Could not save the task. Your changes are still here. Please try again.';
}
export async function readTaskPages(rpc:CalendarRpc,args:Record<string,unknown>):Promise<CalendarTask[]> {
 const items:CalendarTask[]=[];let cursor:unknown=null;const seen=new Set<string>();
 do {const page=await rpc<any>('redream_calendar_tasks_v1',{...args,p_cursor:cursor});items.push(...(page.items||[]));cursor=page.next_cursor||null;if(cursor){const key=JSON.stringify(cursor);if(seen.has(key))throw new Error('pagination_cursor_repeated');seen.add(key);}}while(cursor);
 return items;
}
