import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseContext } from "npm:@supabase/server@1.6.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const id=(v:unknown)=>String(v??"").trim();
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
    const action=String(body?.action||"activation").toLowerCase();
    const rpc=async(name:string,args:Record<string,unknown>={})=>{const {data,error}=await ctx.supabaseAdmin.rpc(name,args);if(error) throw error;return data;};
    const workspaces=((await rpc("platform_server_user_workspaces",{p_user_id:userId}))||[]) as Workspace[];
    if(!workspaces.length) return json({error:"Agency staff access required"},403);
    const requested=id(body?.tenant_id);
    let workspace=requested?workspaces.find(w=>String(w.tenant_id)===requested):workspaces.find(w=>Boolean(w.is_primary));
    if(!workspace&&workspaces.length===1) workspace=workspaces[0];
    if(!workspace) return json({error:"tenant_id is required when more than one agency workspace is available",code:"tenant_required"},409);
    const tenantId=String(workspace.tenant_id),role=String(workspace.role||"");
    const operator=["owner","admin","agent","operations"].includes(role);
    if(!operator) return json({error:"Agency operator access required"},403);

    if(action==="activation"){
      const data=await rpc("platform_server_player_activation_command",{p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,500,100)});
      return json({ok:true,tenant:workspace,activation:data});
    }
    if(action==="adoption"){
      const data=await rpc("platform_server_customer_adoption_path",{p_tenant_id:tenantId});
      return json({ok:true,tenant:workspace,adoption:data});
    }
    if(action==="invite_create"){
      const playerId=id(body?.player_id),email=id(body?.email).toLowerCase();
      if(!playerId||!email||!email.includes("@")) return json({error:"player_id and valid email are required"},400);
      const data=await rpc("platform_server_create_player_portal_invite",{p_tenant_id:tenantId,p_player_id:playerId,p_actor_user_id:userId,p_email:email});
      return json({ok:true,tenant:workspace,invite:data});
    }
    return json({error:"Unknown action"},400);
  }catch(error){console.error("agency-adoption",error);return json({error:error instanceof Error?error.message:"Agency adoption request failed"},500);}
}};
