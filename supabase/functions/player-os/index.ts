import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseContext } from "npm:@supabase/server@1.6.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const id=(v:unknown)=>String(v??"").trim();
const clamp=(v:unknown,min:number,max:number,fallback:number)=>Math.max(min,Math.min(max,Number(v??fallback)||fallback));
type PlayerWorkspace={tenant_id:string;player_id:string;player_name?:string;agency?:Record<string,unknown>;[k:string]:unknown};

export default {fetch:async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const {data:ctx,error:contextError}=await createSupabaseContext(req,{auth:"user"});
  if(contextError||!ctx) return json({error:contextError?.message||"Unauthorized"},contextError?.status||401);
  try{
    const claims=(ctx.userClaims||{}) as Record<string,unknown>;
    const userId=String(claims.id||claims.sub||"");
    if(!userId) return json({error:"Authenticated user identity missing"},401);
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||"home").toLowerCase();
    const rpc=async(name:string,args:Record<string,unknown>={})=>{const {data,error}=await ctx.supabaseAdmin.rpc(name,args);if(error) throw error;return data;};
    const workspacePayload=(await rpc("platform_server_player_workspaces",{p_user_id:userId})) as {workspaces?:PlayerWorkspace[]}|null;
    const workspaces=Array.isArray(workspacePayload?.workspaces)?workspacePayload!.workspaces!:[];
    if(action==="workspaces") return json({ok:true,workspaces});
    if(!workspaces.length) return json({error:"Player workspace required"},403);
    const requested=id(body?.tenant_id);
    let workspace=requested?workspaces.find(w=>String(w.tenant_id)===requested):undefined;
    if(!workspace&&workspaces.length===1) workspace=workspaces[0];
    if(!workspace) return json({error:"tenant_id is required when more than one player workspace is available",code:"tenant_required"},409);
    const tenantId=String(workspace.tenant_id);

    if(action==="home"||action==="review"){
      const review=await rpc("platform_server_player_portal_review",{p_user_id:userId,p_tenant_id:tenantId,p_window_days:clamp(body?.window_days,7,180,30)});
      const {error:eventError}=await ctx.supabaseAdmin.rpc("platform_server_record_player_portal_event",{p_user_id:userId,p_tenant_id:tenantId,p_event_type:"review_viewed",p_metadata:{surface:action,window_days:clamp(body?.window_days,7,180,30)}});
      if(eventError) console.error("player portal telemetry failed",eventError.message);
      return json({ok:true,workspace,review});
    }
    if(action==="request_create"){
      const title=id(body?.title);if(!title)return json({error:"title is required"},400);
      const result=await rpc("platform_server_player_create_request",{p_user_id:userId,p_tenant_id:tenantId,p_title:title,p_message:body?.message?String(body.message):null,p_request_type:id(body?.request_type)||"action"});
      return json({ok:true,workspace,result});
    }
    return json({error:"Unknown action"},400);
  }catch(error){console.error("player-os",error);return json({error:error instanceof Error?error.message:"Player OS request failed"},500);}
}};
