import {useState} from 'react';
import PlayerStaffControl from '@/components/PlayerStaffControl';
import type {CalendarRpc} from '@/lib/calendar/tasks';
const first='30000000-0000-4000-8000-000000000001',second='30000000-0000-4000-8000-000000000002';
const members=[{user_id:'10000000-0000-4000-8000-000000000001',display_name:'Alex Walker'},{user_id:'10000000-0000-4000-8000-000000000002',display_name:'Sam Taylor'}];
const rpc:CalendarRpc=async<T,>(name:string,args:any={}):Promise<T>=>{
 const key='qa-player-team:'+args.p_player_id;
 if(name==='redream_calendar_task_assignees_v1')return {items:members} as T;
 if(name!=='redream_player_staff_tags_v1')throw new Error('unexpected RPC');
 const saved=JSON.parse(sessionStorage.getItem(key)||JSON.stringify({player_id:args.p_player_id,all_staff:false,user_ids:[members[0].user_id],people:[members[0]],revision:0,can_edit:true}));
 if(args.p_input){
  if((window as any).teamConflict)throw new Error('player_tags_conflict');
  saved.all_staff=args.p_input.all_staff;saved.user_ids=args.p_input.user_ids;saved.people=members.filter(person=>saved.user_ids.includes(person.user_id));saved.revision++;
  sessionStorage.setItem(key,JSON.stringify(saved));
 }
 if((window as any).slowTeamRead&&!args.p_input&&args.p_player_id===first)await new Promise(resolve=>setTimeout(resolve,800));
 return saved as T;
};
export default function Page(){const [id,setId]=useState(first);return <main style={{margin:'20px auto',padding:16,maxWidth:620,fontFamily:'Arial','--tenant-primary':'#155e59','--tenant-on-primary':'white'} as any}>
 <h1>{id===first?'James Mitchell':'Chris Evans'}</h1><p>Player workspace</p>
 <PlayerStaffControl playerId={id} scope="qa-agency:qa-user" rpc={rpc}/>
 <button onClick={()=>setId(id===first?second:first)}>Switch player</button>
 </main>;}
