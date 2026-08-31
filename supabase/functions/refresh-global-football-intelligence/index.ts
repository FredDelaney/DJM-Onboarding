// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const API_BASE = "https://v3.football.api-sports.io";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-djm-cron",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const clean=(v:any)=>{const s=String(v??"").trim();return s||null};
const norm=(v:any)=>String(v||"").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const num=(v:any)=>{if(v==null||v==="")return null;const n=Number(String(v).replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:null};
const int=(v:any)=>{const n=num(v);return n==null?null:Math.max(0,Math.round(n))};
const per90=(v:any,m:any)=>num(v)!=null&&num(m)>0?num(v)*90/num(m):null;
const broad=(p:any)=>{const n=norm(p);if(/goalkeeper|\bgk\b/.test(n))return"goalkeeper";if(/defender|centre back|center back|left back|right back|wing back|\b(cb|lb|rb|lwb|rwb|df)\b/.test(n))return"defender";if(/midfield|\b(cm|dm|cdm|am|cam|lm|rm|mf)\b/.test(n))return"midfielder";if(/forward|striker|winger|attacker|\b(cf|st|lw|rw|fw)\b/.test(n))return"attacker";return"unknown"};
const errText=(e:any)=>e instanceof Error?e.message:String(e);

async function api(path:string,params:Record<string,any>,key:string){
  const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v!=null&&v!=="")q.set(k,String(v))});
  const r=await fetch(`${API_BASE}${path}?${q}`,{headers:{"x-apisports-key":key},signal:AbortSignal.timeout(18000)});
  const p=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(`API-Football HTTP ${r.status}`);
  if(p?.errors&&Object.keys(p.errors).length)throw new Error(Object.values(p.errors).map(String).join("; "));
  return p;
}
function seasonRestricted(e:any){return /free plans do not have access|season.*not.*available|try from 20/i.test(errText(e));}
function currentSeasons(subject:any){
  const now=new Date().getUTCFullYear();const explicit=String(subject.current_season_label||"").match(/20\d{2}/)?.[0];
  return [...new Set([explicit?Number(explicit):null,now,now-1,2024].filter(Number.isFinite))];
}
function fullName(subject:any){return clean(subject.full_name)||"";}
function lastToken(name:string){const p=name.trim().split(/\s+/);return p[p.length-1]||name;}
function candidateScore(item:any,subject:any){
  const p=item?.player||{};let score=0;const wanted=norm(fullName(subject));const got=norm(p.name);
  if(wanted&&got===wanted)score+=16;else if(wanted&&(got.includes(wanted)||wanted.includes(got)))score+=8;
  const dob=String(subject.date_of_birth||"").slice(0,10),rd=String(p.birth?.date||"").slice(0,10);if(dob&&rd&&dob===rd)score+=24;
  if(subject.nationality&&p.nationality&&norm(subject.nationality)===norm(p.nationality))score+=4;
  const stats=Array.isArray(item.statistics)?item.statistics:[];
  if(subject.current_club&&stats.some((s:any)=>norm(s?.team?.name)===norm(subject.current_club)))score+=10;
  if(subject.current_league&&stats.some((s:any)=>norm(s?.league?.name)===norm(subject.current_league)))score+=8;
  return score;
}
function chooseCandidate(items:any[],subject:any){
  const ranked=(items||[]).map(x=>({x,s:candidateScore(x,subject)})).sort((a,b)=>b.s-a.s);
  if(!ranked.length)return null;if(ranked[0].s<12)return null;if(ranked[1]&&ranked[1].s===ranked[0].s)return null;return ranked[0].x;
}
function statScore(st:any,subject:any){
  let s=0;if(subject.current_club&&norm(st?.team?.name)===norm(subject.current_club))s+=12;if(subject.current_league&&norm(st?.league?.name)===norm(subject.current_league))s+=10;
  s+=(num(st?.games?.minutes)||0)/10000;return s;
}
function chooseStat(item:any,subject:any){return (Array.isArray(item?.statistics)?item.statistics:[]).filter((s:any)=>(num(s?.games?.appearences)||0)>0||(num(s?.games?.minutes)||0)>0).sort((a:any,b:any)=>statScore(b,subject)-statScore(a,subject))[0]||null;}
function rowFromStat(item:any,st:any){
  const mins=int(st?.games?.minutes)||0,apps=int(st?.games?.appearences)||0,starts=int(st?.games?.lineups),goals=int(st?.goals?.total)||0,assists=int(st?.goals?.assists)||0;
  return {
    provider_player_id:String(item?.player?.id||""),provider_team_id:String(st?.team?.id||""),player_name:clean(item?.player?.name),team_name:clean(st?.team?.name),provider_position:broad(st?.games?.position),minutes:mins,
    metrics:{apps,starts,goals,assists,goals90:per90(goals,mins),assists90:per90(assists,mins),rating:num(st?.games?.rating),position:clean(st?.games?.position),shots:num(st?.shots?.total),shotsOn:num(st?.shots?.on),passes:num(st?.passes?.total),keyPasses:num(st?.passes?.key),passAccuracy:num(st?.passes?.accuracy),tackles:num(st?.tackles?.total),blocks:num(st?.tackles?.blocks),interceptions:num(st?.tackles?.interceptions),duels:num(st?.duels?.total),duelsWon:num(st?.duels?.won),dribbles:num(st?.dribbles?.attempts),dribblesWon:num(st?.dribbles?.success),foulsDrawn:num(st?.fouls?.drawn),foulsCommitted:num(st?.fouls?.committed),yellow:num(st?.cards?.yellow),red:num(st?.cards?.red)},
    metric_schema_version:"djm_api_football_basic_v1",data_depth:"global_basic_plus",confidence:.94,request_metadata:{source:"api-football",endpoint:"players"},observed_at:new Date().toISOString()
  };
}
async function authorise(req:Request,admin:any){
  const supplied=req.headers.get("x-djm-cron")||"";if(supplied){const {data:expected}=await admin.rpc("get_push_scheduler_secret");if(expected&&supplied===expected)return true;}
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return false;const {data,error}=await admin.auth.getUser(token);if(error||!data?.user)return false;
  const {data:profile}=await admin.from("profiles").select("role").eq("id",data.user.id).maybeSingle();return profile?.role==="admin";
}
async function resolveSubject(subject:any,key:string){
  const known=clean(subject.football_provider_ids?.api_football);let lastError="";
  for(const season of currentSeasons(subject)){
    try{
      let payload:any,item:any;
      if(known){payload=await api("/players",{id:known,season},key);item=Array.isArray(payload.response)?payload.response[0]:null;}
      else{const search=lastToken(fullName(subject));if(search.length<3)continue;payload=await api("/players",{search,season},key);item=chooseCandidate(payload.response||[],subject);}
      if(!item)continue;const st=chooseStat(item,subject);if(!st)continue;
      return {item,st,season,restricted:false};
    }catch(e){lastError=errText(e);if(seasonRestricted(e))continue;}
  }
  throw new Error(lastError||"No confident API-Football identity with usable season statistics.");
}
async function fetchCohort(leagueId:any,season:any,key:string,maxPages=10){
  const rows:any[]=[];let page=1,total=1;
  while(page<=total&&page<=maxPages){const p=await api("/players",{league:leagueId,season,page},key);total=Math.max(1,Number(p?.paging?.total||1));for(const item of p.response||[]){for(const st of item.statistics||[]){if(String(st?.league?.id)===String(leagueId)&&String(st?.league?.season)===String(season)){const row=rowFromStat(item,st);if(row.provider_player_id&&row.minutes>=1)rows.push(row);break;}}}page++;}
  const dedup=new Map();for(const r of rows){const k=`${r.provider_player_id}:${r.provider_team_id}`;const prev=dedup.get(k);if(!prev||r.minutes>prev.minutes)dedup.set(k,r);}return [...dedup.values()];
}
async function syncOne(admin:any,subject:any,key:string){
  await admin.rpc("djm_service_mark_global_subject_enrichment",{p_subject_id:subject.subject_id,p_status:"enriching",p_error:null});
  const resolved=await resolveSubject(subject,key);const {item,st,season}=resolved;const leagueId=st?.league?.id,teamId=st?.team?.id;const providerPlayerId=String(item?.player?.id||"");
  if(!leagueId||!providerPlayerId)throw new Error("Resolved player has no competition identity.");
  const current=rowFromStat(item,st);
  const {data:cache,error:ce}=await admin.rpc("djm_service_global_peer_cache_status",{p_provider:"api_football",p_provider_competition_id:String(leagueId),p_provider_season_id:String(season)});if(ce)throw ce;
  let peers:any[]=null;if(!cache?.fresh)peers=await fetchCohort(leagueId,season,key,10);
  const seasonAge=new Date().getUTCFullYear()-Number(season);const freshnessConfidence=seasonAge<=0?.94:seasonAge===1?.82:.65;
  const snapshot={provider_player_id:providerPlayerId,provider_team_id:String(teamId||""),provider_competition_id:String(leagueId),provider_season_id:String(season),season_label:String(season),club_name:clean(st?.team?.name),competition_name:clean(st?.league?.name),country:clean(st?.league?.country),confidence:freshnessConfidence,data_depth:seasonAge<=1?"global_current_basic":"historical_basic",metric_schema_version:"djm_api_football_basic_v1",observed_at:new Date().toISOString(),metrics:{current_season:current.metrics,role:current.provider_position,profile:{date_of_birth:item?.player?.birth?.date||null,nationality:item?.player?.nationality||null,height:item?.player?.height||null,weight:item?.player?.weight||null}},provenance:{provider:"api_football",source_url:"https://www.api-football.com/",season,league_id:String(leagueId),team_id:String(teamId||"")}};
  const {data:written,error:we}=await admin.rpc("djm_service_upsert_global_subject_evidence",{p_subject_id:subject.subject_id,p_provider:"api_football",p_snapshot:snapshot,p_peers:peers});if(we)throw we;
  return {ok:true,subject_id:subject.subject_id,name:subject.full_name,provider_player_id:providerPlayerId,season,league:st?.league?.name,country:st?.league?.country,club:st?.team?.name,minutes:current.minutes,apps:current.metrics.apps,peer_rows:peers?peers.length:cache?.count||0,cohort_refreshed:Boolean(peers),writer:written};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),key=clean(Deno.env.get("API_FOOTBALL_KEY"));
  if(!url||!service)return json({ok:false,error:"Supabase server configuration missing"},500);const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  if(!(await authorise(req,admin)))return json({ok:false,error:"Unauthorized"},401);
  if(!key)return json({ok:false,error:"API_FOOTBALL_KEY is not configured"},503);
  try{
    const body=await req.json().catch(()=>({}));const mode=String(body?.mode||"refresh_subject").toLowerCase();
    if(mode==="status"){const probe=await api("/countries",{},key);return json({ok:true,provider:"api_football",configured:true,quota:probe?.results??null,model_target:"djm_global_score_v6_basic_influence"});}
    const subjectId=clean(body?.subject_id);const limit=Math.max(1,Math.min(Number(body?.limit||5),8));
    const {data:subjects,error:qe}=await admin.rpc("djm_service_global_subject_queue",{p_subject_id:subjectId||null,p_limit:subjectId?1:limit});if(qe)throw qe;
    const results=[];for(const subject of subjects||[]){try{results.push(await syncOne(admin,subject,key));}catch(e){const msg=errText(e);await admin.rpc("djm_service_mark_global_subject_enrichment",{p_subject_id:subject.subject_id,p_status:"failed",p_error:msg});results.push({ok:false,subject_id:subject.subject_id,name:subject.full_name,error:msg});}}
    return json({ok:true,provider:"api_football",attempted:results.length,refreshed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results,completed_at:new Date().toISOString()});
  }catch(e){console.error(errText(e));return json({ok:false,error:errText(e)},500);}
});
