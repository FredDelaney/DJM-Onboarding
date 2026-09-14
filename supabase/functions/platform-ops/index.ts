import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseContext } from "npm:@supabase/server@1.6.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clamp=(v:unknown,min:number,max:number,fallback:number)=>Math.max(min,Math.min(max,Number(v??fallback)||fallback));

export default {fetch:async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const {data:ctx,error:contextError}=await createSupabaseContext(req,{auth:"user"});
  if(contextError||!ctx) return json({error:contextError?.message||"Unauthorized"},contextError?.status||401);
  try{
    const claims=(ctx.userClaims||{}) as Record<string,unknown>;
    const userId=String(claims.id||claims.sub||"");
    if(!userId) return json({error:"Authenticated user identity missing"},401);
    const {data:adminRecord,error:adminError}=await ctx.supabaseAdmin.schema("platform").from("platform_admins").select("role,status").eq("user_id",userId).eq("status","active").maybeSingle();
    if(adminError) throw adminError;
    if(!adminRecord) return json({error:"Platform operator access required"},403);
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||"customer_success").toLowerCase();
    const rpc=async(name:string,args:Record<string,unknown>={})=>{const {data,error}=await ctx.supabaseAdmin.rpc(name,args);if(error) throw error;return data;};
    if(action==="customer_success") return json({ok:true,platform_role:adminRecord.role,customer_success:await rpc("platform_server_customer_success_command",{p_limit:clamp(body?.limit,1,500,100)})});
    if(action==="customer_portfolio") return json({ok:true,platform_role:adminRecord.role,portfolio:await rpc("platform_server_customer_portfolio")});
    return json({error:"Unknown action"},400);
  }catch(error){console.error("platform-ops",error);return json({error:error instanceof Error?error.message:"Platform operations request failed"},500);}
}};
