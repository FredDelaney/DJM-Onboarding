import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { visiblePublicPlayerProfile, publicProfileSectionHidden } from "../_shared/public-profile-visibility.ts";
import { selectCurrentSeasonEvidence, safeSourceUrl } from "../_shared/football-data/player-data-workflow.ts";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json",
  "Cache-Control":"no-store",
};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const norm=(value:unknown)=>String(value||"").trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const trustedProviders=new Set(["thesportsdb","api_football","wyscout","sportmonks","public_web_evidence","public_web_verified"]);
function currentStats(career:any[],player:any,latestCheck:any){
  const trusted=(career||[]).filter(row=>Boolean(row?.source_reviewed_at)||(Boolean(row?.source_synced_at)&&trustedProviders.has(norm(row?.source_provider).replaceAll(" ","_"))));
  const row=selectCurrentSeasonEvidence(trusted,player);
  if(!row)return{stats:[],meta:null};
  const stats=[{label:"Apps",value:row.appearances},{label:"Starts",value:row.starts},{label:"Minutes",value:row.minutes},{label:"Goals",value:row.goals},{label:"Assists",value:row.assists}]
    .filter(item=>item.value!==null&&item.value!==undefined&&item.value!=="").map(item=>({label:item.label,value:String(item.value)}));
  const rowChecked=row.source_reviewed_at||row.source_synced_at||null;
  const latest=latestCheck?.source_url&&latestCheck.source_url===row.source_url?latestCheck.fresh_at:null;
  const checkedAt=[rowChecked,latest].filter(Boolean).sort((a,b)=>Date.parse(String(b))-Date.parse(String(a)))[0]||null;
  return{stats,meta:{season_label:row.season_label||null,club_name:row.club_name||null,league:row.league||null,
    source_name:row.source_name||null,source_url:safeSourceUrl(row.source_url),checked_at:checkedAt}};
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return reply({error:"Method not allowed"},405);
  try{
    const contentLength=Number(req.headers.get("content-length")||0);
    if(contentLength>4096)return reply({error:"Invalid request"},400);
    const body=await req.json().catch(()=>null);
    const slug=String(body?.slug||"").trim().toLowerCase();
    if(!/^[a-z0-9-]{1,120}$/.test(slug))return reply({data:null},200);

    const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{autoRefreshToken:false,persistSession:false}});
    const profileResult=await admin.from("player_public_profiles").select("*").eq("public_slug",slug).eq("published",true).maybeSingle();
    if(profileResult.error)throw profileResult.error;
    if(!profileResult.data)return reply({data:null},200);

    const playerResult=await admin.from("players").select("id,tenant_id,verification_status,verified_at,current_club,current_league,current_season_label").eq("id",profileResult.data.player_id).maybeSingle();
    if(playerResult.error)throw playerResult.error;
    const player=playerResult.data;
    if(!player||player.verification_status!=="verified"||!player.verified_at)return reply({data:null},200);

    const[contextResult,settingsResult,careerResult,refreshResult]=await Promise.all([
      admin.rpc("platform_server_player_profile_context",{p_tenant_id:player.tenant_id,p_player_id:player.id}),
      admin.from("player_cv_settings").select("key_stats").eq("player_id",player.id).maybeSingle(),
      admin.from("career_entries").select("season_label,club_name,league,appearances,starts,minutes,goals,assists,source_name,source_url,source_reviewed_at,source_provider,source_synced_at").eq("player_id",player.id),
      admin.from("player_source_refreshes").select("provider,status,fresh_at,source_url").eq("player_id",player.id).eq("provider","openai_web_stats").eq("status","applied").order("fresh_at",{ascending:false}).limit(1).maybeSingle(),
    ]);
    if(contextResult.error||settingsResult.error||careerResult.error)throw contextResult.error||settingsResult.error||careerResult.error;if(refreshResult.error)console.warn("public player-profile stat freshness unavailable",refreshResult.error);

    const customStats=Array.isArray(settingsResult.data?.key_stats)&&settingsResult.data.key_stats.length>0;
    const auto=currentStats(careerResult.data||[],player,refreshResult.data||null);
    const profile={...profileResult.data,key_stats:customStats?profileResult.data.key_stats:auto.stats};
    const context=contextResult.data&&typeof contextResult.data==="object"?contextResult.data:{};

    return reply({data:{profile:visiblePublicPlayerProfile(profile),agency:context.branding||null,
      stats_meta:customStats||publicProfileSectionHidden(profile,"stats")?null:auto.meta}});
  }catch(error){
    console.error("player-profile-public",error);
    return reply({error:"Unable to load Player Profile"},500);
  }
});
