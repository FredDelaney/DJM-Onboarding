import {useCallback,useEffect,useRef,useState} from 'react';
import PlayerSalaryTerms from '@/components/PlayerSalaryTerms';

export default function Page(){
 const [ready,setReady]=useState(false),[player,setPlayer]=useState('player-a');
 const state=useRef<any>({scenario:'',reads:0,writes:0,terms:{player_id:'player-a',salary_minimum:null,salary_target:null,salary_currency:null,salary_period:null,salary_tax_basis:null,salary_source_status:null,salary_source_context:null,salary_checked_on:null,updated_at:null,updated_by:null,legacy_salary_expectation:'5k plus benefits; currency and period unconfirmed'}});
 useEffect(()=>{state.current.scenario=new URLSearchParams(location.search).get('scenario')||'';(window as any).salaryQa=state.current;setReady(true);return()=>{delete (window as any).salaryQa;};},[]);
 const rpc=useCallback(async<T,>(name:string,args:Record<string,unknown>={}):Promise<T>=>{
  const qa=state.current;
  if(name==='redream_player_salary_terms'){
   qa.reads++;
   if(qa.scenario==='read-error'&&qa.reads===1)throw new Error('Salary details could not load.');
   if(qa.scenario==='read-hung'&&qa.reads===1){const previous=structuredClone(qa.terms);return await new Promise(resolve=>{qa.releaseRead=()=>resolve({salary_terms_version:1,terms:previous} as T);});}
   return {salary_terms_version:1,terms:structuredClone({...qa.terms,player_id:args.p_player_id})} as T;
  }
  if(name!=='redream_player_salary_terms_patch')throw new Error('Unexpected action '+name);
  qa.writes++;
  if(qa.scenario==='denied'&&qa.writes===1)throw Object.assign(new Error('Check the salary range.'),{code:'22023'});
  if(qa.scenario==='conflict'&&qa.writes===1){qa.terms.salary_minimum='5100';qa.terms.updated_at='v-colleague';throw Object.assign(new Error('Stale version'),{code:'40001'});}
  qa.terms={...qa.terms,...Object.fromEntries(Object.entries(args.p_patch as any).map(([key,value])=>[key,value||null])),updated_at:'v-'+qa.writes};
  if(qa.scenario==='unknown'&&qa.writes===1)return {} as T;
  if(qa.scenario==='refresh-error'&&qa.writes===1)qa.scenario='read-error';
  return {ok:true,id:args.p_player_id,entity_type:'player',salary_terms_version:1,terms:structuredClone(qa.terms)} as T;
 },[]);
 return <main data-interface="calm" data-qa-ready={ready} style={{maxWidth:640,padding:20,margin:'0 auto'}}>
  <h1>Player work</h1><button onClick={()=>setPlayer('player-b')}>Switch player</button>
  <PlayerSalaryTerms playerId={player} scope="agency-a:actor-a" rpc={rpc}/>
 </main>;
}
