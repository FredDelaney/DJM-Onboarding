// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE = "https://www.thesportsdb.com/api/v1/json/123";
const json = (body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
const norm=(v)=>String(v||"").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const broad=(v)=>{const x=norm(v); if(!x)return ""; if(/goalkeeper|keeper/.test(x))return "goalkeeper"; if(/back|defender|centre back|center back/.test(x))return "defender"; if(/midfield|number 6|number 8|number 10/.test(x))return "midfielder"; if(/wing|forward|striker|attack/.test(x))return "attacker"; return "";};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
async function sportsDb(name){const res=await fetch(`${BASE}/searchplayers.php?p=${encodeURIComponent(name)}`,{signal:AbortSignal.timeout(15000)}); if(!res.ok)throw new Error(`TheSportsDB HTTP ${res.status}`); return await res.json().catch(()=>({}));}
function scoreCandidate(c,s){
  const rn=norm(c?.strPlayer||c?.strPlayerAlternate||""); const ln=norm(s.full_name); let score=0;
  if(rn&&ln&&rn===ln)score+=.55; else if(rn&&ln&&(rn.includes(ln)||ln.includes(rn)))score+=.42;
  const rd=String(c?.dateBorn||"").slice(0,10); const ld=String(s.date_of_birth||"").slice(0,10); if(rd&&ld&&rd===ld)score+=.30;
  const rnation=norm(c?.strNationality); const lnation=norm(s.nationality); if(rnation&&lnation&&(rnation===lnation||rnation.includes(lnation)||lnation.includes(rnation)))score+=.08;
  const rp=broad(c?.strPosition); const lp=broad(s.primary_position); if(rp&&lp&&rp===lp)score+=.07;
  const rt=norm(c?.strTeam); const lt=norm(s.current_club); if(rt&&lt&&(rt===lt||rt.includes(lt)||lt.includes(rt)))score+=.05;
  return Math.min(1,score);
}

Deno.serve(async(req)=>{
  if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"); const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); if(!url||!serviceKey)return json({ok:false,error:"Server configuration incomplete"},500);
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const supplied=req.headers.get("x-djm-cron")||""; const {data:expected,error:secretError}=await admin.rpc("get_push_scheduler_secret");
  if(secretError||!expected||!supplied||supplied!==expected)return json({ok:false,error:"Unauthorized"},401);
  const {data:batch,error:batchError}=await admin.rpc("djm_global_enrichment_batch",{p_limit:20}); if(batchError)return json({ok:false,error:batchError.message},500);
  const results=[]; const rows=Array.isArray(batch)?batch:[];
  for(let i=0;i<rows.length;i+=5){
    const slice=rows.slice(i,i+5);
    const out=await Promise.all(slice.map(async(s)=>{
      try{
        const payload=await sportsDb(s.full_name); const candidates=Array.isArray(payload?.player)?payload.player:Array.isArray(payload?.players)?payload.players:[];
        const ranked=candidates.map(c=>({c,score:scoreCandidate(c,s)})).sort((a,b)=>b.score-a.score);
        if(!ranked.length||ranked[0].score<.75)throw new Error("No sufficiently confident identity match");
        if(ranked[1]&&ranked[0].score-ranked[1].score<.10)throw new Error("Identity match is ambiguous");
        const c=ranked[0].c; const providerId=String(c?.idPlayer||"").trim(); if(!providerId)throw new Error("Matched identity has no provider ID");
        const observed={date_of_birth:String(c?.dateBorn||"").slice(0,10)||null,nationality:c?.strNationality||null,position:c?.strPosition||null,provider_team:c?.strTeam||null,provider_status:c?.strStatus||null};
        const {data,error}=await admin.rpc("djm_global_apply_identity",{p_subject_id:s.subject_id,p_provider:"thesportsdb",p_provider_player_id:providerId,p_confidence:ranked[0].score,p_observed_data:observed,p_observed_at:new Date().toISOString()});
        if(error)throw error; return {subject_id:s.subject_id,ok:true,identity_confidence:ranked[0].score,provider_player_id:providerId,result:data};
      }catch(e){const message=e instanceof Error?e.message:String(e); await admin.rpc("djm_global_enrichment_fail",{p_subject_id:s.subject_id,p_error:message,p_delay_hours:12}); return {subject_id:s.subject_id,ok:false,error:message};}
    }));
    results.push(...out); if(i+5<rows.length)await sleep(1200);
  }
  return json({ok:true,attempted:rows.length,resolved:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length,results,completed_at:new Date().toISOString()});
});
