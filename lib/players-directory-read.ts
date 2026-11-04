import {readWithDeadline} from './read-with-deadline';
import {readRecruitmentRoster} from './recruitment-roster-read';

type Invoke=<T,>(action:string,body?:Record<string,unknown>)=>Promise<T>;

/** Lazy Players-only loading keeps the always-present Home bundle small. */
export async function loadPlayersDirectory(
  invoke:Invoke,
  canSeeRecruitment:boolean,
  cachedLength:number,
  isCurrent:()=>boolean,
  merge:(patch:Record<string,unknown>)=>void,
) {
  const firstPage=readWithDeadline(invoke<any>('players_workspace',{limit:100,offset:0}));
  const recruitment=canSeeRecruitment ? readRecruitmentRoster(invoke) : null;
  let response=await firstPage;
  let directory=response?.players || {};
  const items=[...(directory.items||[])];
  const wanted=Math.max(100,cachedLength||100);
  while(directory.has_more&&items.length<wanted){
    if(!isCurrent())return;
    response=await readWithDeadline(invoke<any>('players_workspace',{limit:100,offset:directory.next_offset}));
    const next=response?.players||{};
    if(!(next.next_offset>directory.next_offset))break;
    directory=next;
    items.push(...(next.items||[]));
  }
  merge({directory:{...directory,items}});
  if(recruitment)merge(await recruitment);
}
