import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseContext } from "npm:@supabase/server@1.6.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const text=(value:unknown)=>typeof value==="string"?value.trim():"";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default {fetch:async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return reply({error:"Method not allowed"},405);
  const contentLength=Number(req.headers.get("content-length")||0);
  if(contentLength>32768) return reply({error:"Invalid request"},400);

  const {data:ctx,error:contextError}=await createSupabaseContext(req,{auth:"user"});
  if(contextError||!ctx) return reply({error:contextError?.message||"Unauthorized"},contextError?.status||401);

  try{
    const claims=(ctx.userClaims||{}) as Record<string,unknown>;
    const userId=String(claims.id||claims.sub||"");
    if(!userId) return reply({error:"Authenticated user identity missing"},401);

    const body=await req.json().catch(()=>({}));
    const action=text(body?.action).toLowerCase()||"get";
    const tenantSlug=text(body?.tenant_slug).toLowerCase();
    if(!tenantSlug||tenantSlug.length>120||!/^[-a-z0-9]+$/.test(tenantSlug)) return reply({error:"Valid tenant_slug is required"},400);

    const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await ctx.supabaseAdmin.rpc(name,args);if(error) throw error;return data;};
    const launch=await rpc("platform_server_owner_launch_workspace",{p_tenant_slug:tenantSlug,p_user_id:userId});
    const tenantId=String(launch?.tenant_id||"");
    if(!uuid.test(tenantId)) throw new Error("Owner workspace could not be resolved");

    if(action==="get") return reply({ok:true,launch});

    if(action==="update_branding"){
      await rpc("platform_server_owner_update_branding",{
        p_tenant_id:tenantId,p_user_id:userId,
        p_display_name:text(body?.display_name),p_portal_name:text(body?.portal_name),
        p_primary_color:text(body?.primary_color),p_accent_color:text(body?.accent_color),
        p_support_email:text(body?.support_email).toLowerCase(),
        p_website_url:text(body?.website_url)||null,p_phone:text(body?.phone)||null
      });
    }else if(action==="create_first_player"){
      await rpc("platform_server_owner_create_first_player",{
        p_tenant_id:tenantId,p_user_id:userId,p_first_name:text(body?.first_name),p_last_name:text(body?.last_name),
        p_primary_position:text(body?.primary_position),p_current_club:text(body?.current_club)||null,
        p_current_country:text(body?.current_country)||null,p_transfermarkt_url:text(body?.transfermarkt_url)||null
      });
    }else if(action==="create_first_relationship"){
      await rpc("platform_server_owner_create_first_relationship",{
        p_tenant_id:tenantId,p_user_id:userId,p_contact_name:text(body?.contact_name),p_club_name:text(body?.club_name),
        p_contact_role:text(body?.contact_role)||null,p_country:text(body?.country)||null,p_notes:text(body?.notes)||null
      });
    }else if(action==="create_first_opportunity"){
      const playerId=text(body?.player_id);
      if(!uuid.test(playerId)) return reply({error:"Valid player_id is required"},400);
      await rpc("platform_server_owner_create_first_opportunity",{
        p_tenant_id:tenantId,p_user_id:userId,p_player_id:playerId,p_club_name:text(body?.club_name),
        p_country:text(body?.country)||null,p_summary:text(body?.summary)||null,p_next_action:text(body?.next_action)||null
      });
    }else{
      return reply({error:"Unknown action"},400);
    }

    const refreshed=await rpc("platform_server_owner_launch_workspace",{p_tenant_slug:tenantSlug,p_user_id:userId});
    return reply({ok:true,launch:refreshed});
  }catch(error){
    const record=error&&typeof error==="object"?error as Record<string,unknown>:{};
    const message=error instanceof Error?error.message:text(record.message)||text(record.details)||text(record.hint)||"Owner workspace request failed";
    console.error("agency-launch",error);
    const denied=/owner_access|required|not_available/i.test(message);
    return reply({error:denied?"Owner workspace access is not available for this account.":message},denied?403:500);
  }
}};
