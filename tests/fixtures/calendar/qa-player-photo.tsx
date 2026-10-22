import {useCallback} from 'react';
import {useRouter} from 'next/router';
import AgencyPlayersWorkspace from '@/components/AgencyPlayersWorkspace';
import styles from '@/components/AgencyOperatingWorkspace.module.css';
const player={player_id:'fixture-profile',identity:{name:'Example Player',first_name:'Example',last_name:'Player',primary_position:'Centre back',current_club:'Example FC',current_country:'New Zealand'}};
export default function Page(){
 const router=useRouter();
 const invoke=useCallback(async(action:string,body?:Record<string,unknown>)=>{
  const response=await fetch('https://example.supabase.co/functions/v1/profile-fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,body})});
  const value=await response.json();if(!response.ok)throw new Error(value.error);return value;
 },[]);
 const rpc=useCallback(async<T,>(name:string,args:any={}):Promise<T>=>{
  if(name==='redream_player_staff_tags_v1')return {player_id:args.p_player_id,all_staff:false,user_ids:[],people:[],revision:0,can_edit:true} as T;
  if(name==='redream_record_contact_details_v1')return {record_id:args.p_record_id,kind:'player',email:null,whatsapp:null,can_edit:true} as T;
  return {items:[]} as T;
 },[]);
 return <main className={styles.root} data-interface="calm" style={{display:'block',padding:16}}>
  <button type="button" onClick={()=>void router.push("/qa-player-photo?view=players&player=fixture-other",undefined,{shallow:true})}>Switch player</button>
  <AgencyPlayersWorkspace stateScope="photo-fixture" data={{directory:{items:[player]},recruitment:{items:[]}}} basePath="/qa-player-photo"
   invoke={invoke as any} rpc={rpc} onRefresh={async()=>{}} onOpenAction={()=>{}}/>
 </main>;
}
