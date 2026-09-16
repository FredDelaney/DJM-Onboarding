import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseContext } from "npm:@supabase/server@1.6.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const id=(v:unknown)=>String(v??"").trim();
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const clamp=(v:unknown,min:number,max:number,fallback:number)=>Math.max(min,Math.min(max,Number(v??fallback)||fallback));
type Workspace={tenant_id:string;role:string;is_primary?:boolean;[k:string]:unknown};

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
    const action=String(body?.action||"market_execution").toLowerCase();
    const rpc=async(name:string,args:Record<string,unknown>={})=>{const {data,error}=await ctx.supabaseAdmin.rpc(name,args);if(error) throw error;return data;};
    const workspaces=((await rpc("platform_server_user_workspaces",{p_user_id:userId}))||[]) as Workspace[];
    if(!workspaces.length) return json({error:"Agency staff access required"},403);
    const requested=id(body?.tenant_id);
    let workspace=requested?workspaces.find(w=>String(w.tenant_id)===requested):workspaces.find(w=>Boolean(w.is_primary));
    if(!workspace&&workspaces.length===1) workspace=workspaces[0];
    if(!workspace) return json({error:"tenant_id is required when more than one agency workspace is available",code:"tenant_required"},409);
    const tenantId=String(workspace.tenant_id),role=String(workspace.role||"");
    if(!["owner","admin","agent","operations"].includes(role)) return json({error:"Agency operator access required"},403);

    if(action==="market_execution") return json({ok:true,tenant:workspace,market:await rpc("platform_server_market_execution_command",{p_tenant_id:tenantId})});
    if(action==="external_dossiers") return json({ok:true,tenant:workspace,dossiers:await rpc("platform_server_external_dossier_command",{p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,250,100)})});
    if(action==="pitch_readiness") return json({ok:true,tenant:workspace,readiness:await rpc("platform_server_pitch_readiness_command",{p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,100,50)})});
    if(action==="pitch_execution") return json({ok:true,tenant:workspace,execution:await rpc("platform_server_pitch_execution_command",{p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,500,100)})});
    if(action==="pitch_responses") return json({ok:true,tenant:workspace,responses:await rpc("platform_server_pitch_response_command",{p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,500,100)})});
    if(action==="pitch_learning") return json({ok:true,tenant:workspace,learning:await rpc("platform_server_pitch_learning",{p_tenant_id:tenantId,p_window_days:clamp(body?.window_days,30,1460,365)})});
    if(action==="dossier_draft_create"){
      const playerId=id(body?.player_id);if(!playerId)return json({error:"player_id is required"},400);
      return json({ok:true,tenant:workspace,result:await rpc("platform_server_create_external_dossier_draft",{p_tenant_id:tenantId,p_player_id:playerId,p_actor_user_id:userId})});
    }
    if(action==="dossier_update"){
      const playerId=id(body?.player_id);if(!playerId)return json({error:"player_id is required"},400);
      return json({ok:true,tenant:workspace,result:await rpc("platform_server_update_external_dossier",{p_tenant_id:tenantId,p_player_id:playerId,p_actor_user_id:userId,p_patch:obj(body?.patch)})});
    }
    if(action==="dossier_publish"||action==="dossier_unpublish"){
      if(!["owner","admin"].includes(role)) return json({error:"Owner or admin access required for external dossier publication"},403);
      const playerId=id(body?.player_id);if(!playerId)return json({error:"player_id is required"},400);
      const fn=action==="dossier_publish"?"platform_server_publish_external_dossier":"platform_server_unpublish_external_dossier";
      return json({ok:true,tenant:workspace,result:await rpc(fn,{p_tenant_id:tenantId,p_player_id:playerId,p_actor_user_id:userId})});
    }
    if(action==="pursuit_deal_create"){
      const matchId=id(body?.player_match_id);if(!matchId)return json({error:"player_match_id is required"},400);
      return json({ok:true,tenant:workspace,result:await rpc("platform_server_convert_pursuit_to_deal",{p_tenant_id:tenantId,p_player_match_id:matchId,p_actor_user_id:userId,p_input:obj(body?.input)})});
    }
    if(action==="pitch_draft_create"){
      const matchId=id(body?.player_match_id);if(!matchId)return json({error:"player_match_id is required"},400);
      return json({ok:true,tenant:workspace,result:await rpc("platform_server_create_pitch_draft",{p_tenant_id:tenantId,p_player_match_id:matchId,p_actor_user_id:userId,p_input:obj(body?.input)})});
    }
    if(action==="pitch_publish"){
      const shareId=id(body?.share_id);if(!shareId)return json({error:"share_id is required"},400);
      return json({ok:true,tenant:workspace,result:await rpc("platform_server_publish_pitch_link",{p_tenant_id:tenantId,p_share_id:shareId,p_actor_user_id:userId,p_expires_at:id(body?.expires_at)||null})});
    }
    if(action==="pitch_confirm_sent"){
      const shareId=id(body?.share_id);if(!shareId)return json({error:"share_id is required"},400);
      return json({ok:true,tenant:workspace,result:await rpc("platform_server_confirm_pitch_sent",{p_tenant_id:tenantId,p_share_id:shareId,p_actor_user_id:userId,p_sent_at:id(body?.sent_at)||null})});
    }
    if(action==="pitch_revoke"){
      const shareId=id(body?.share_id);if(!shareId)return json({error:"share_id is required"},400);
      return json({ok:true,tenant:workspace,result:await rpc("platform_server_revoke_pitch_link",{p_tenant_id:tenantId,p_share_id:shareId,p_actor_user_id:userId,p_reason:id(body?.reason)||null})});
    }
    if(action==="pitch_response_action_prepare"){
      const shareId=id(body?.share_id);if(!shareId)return json({error:"share_id is required"},400);
      return json({ok:true,tenant:workspace,result:await rpc("platform_server_prepare_pitch_response_action",{p_tenant_id:tenantId,p_share_id:shareId,p_actor_user_id:userId,p_input:obj(body?.input)})});
    }
    if(action==="pitch_response_action_execute"||action==="pitch_response_action_undo"){
      const proposalId=id(body?.proposal_id);if(!proposalId)return json({error:"proposal_id is required"},400);
      const fn=action==="pitch_response_action_execute"?"platform_server_execute_pitch_response_action":"platform_server_undo_pitch_response_action";
      return json({ok:true,tenant:workspace,result:await rpc(fn,{p_tenant_id:tenantId,p_proposal_id:proposalId,p_actor_user_id:userId})});
    }
    if(action==="pitch_response_action_evaluate"){
      const proposalId=id(body?.proposal_id);if(!proposalId)return json({error:"proposal_id is required"},400);
      return json({ok:true,tenant:workspace,result:await rpc("platform_server_evaluate_pitch_response_action",{p_tenant_id:tenantId,p_proposal_id:proposalId})});
    }
    return json({error:"Unknown action"},400);
  }catch(error){console.error("agency-market",error);return json({error:error instanceof Error?error.message:"Agency market request failed"},500);}
}};
