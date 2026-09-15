import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type, apikey, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const allowed=new Set(["request_conversation","request_information","not_now","decline"]);
const clean=(v:unknown,max:number)=>{const s=String(v??"").trim();return s?s.slice(0,max):null;};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  try{
    const body=await req.json().catch(()=>({}));
    const token=String(body?.token||"").trim();
    const responseType=String(body?.response_type||"").trim().toLowerCase();
    if(!token||!allowed.has(responseType)) return json({error:"Valid token and response_type are required"},400);
    const responderEmail=clean(body?.responder_email,320)?.toLowerCase()||null;
    if(responderEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(responderEmail)) return json({error:"Invalid responder_email"},400);
    const responderName=clean(body?.responder_name,160);
    const message=clean(body?.message,2000);

    const url=Deno.env.get("SUPABASE_URL")!,serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:publicShare,error:shareValidationError}=await admin.rpc("get_club_share",{share_token:token});
    if(shareValidationError||!publicShare) return json({error:"This pitch link is unavailable or expired"},404);

    const {data:share,error:shareError}=await admin.from("club_share_links").select("id,player_id,opportunity_id,organisation_id,pitch_status,active,expires_at").eq("token",token).maybeSingle();
    if(shareError||!share||!share.active) return json({error:"This pitch link is unavailable or expired"},404);
    const {data:player,error:playerError}=await admin.from("players").select("tenant_id").eq("id",share.player_id).maybeSingle();
    if(playerError||!player?.tenant_id) return json({error:"Pitch context unavailable"},404);
    const tenantId=String(player.tenant_id);

    const {data:before}=await admin.schema("platform").from("club_pitch_responses").select("*").eq("share_id",share.id).maybeSingle();
    const now=new Date().toISOString();
    const payload={
      share_id:share.id,tenant_id:tenantId,response_type:responseType,message,
      responder_name:responderName,responder_email:responderEmail,identity_status:"self_asserted_unverified",
      first_submitted_at:before?.first_submitted_at||now,updated_at:now,submission_count:Number(before?.submission_count||0)+1
    };
    const {data:after,error:responseError}=await admin.schema("platform").from("club_pitch_responses").upsert(payload,{onConflict:"share_id"}).select("*").single();
    if(responseError) throw responseError;

    await admin.from("club_share_links").update({pitch_status:"responded"}).eq("id",share.id);
    if(share.opportunity_id) await admin.schema("djm_os").from("deal_rooms").update({pitch_status:"response_received",updated_at:now}).eq("id",share.opportunity_id).eq("tenant_id",tenantId);

    const {error:auditError}=await admin.schema("platform").from("audit_events").insert({
      tenant_id:tenantId,actor_user_id:null,actor_kind:"service",action:"club_pitch.response_submitted",entity_type:"club_pitch",entity_id:String(share.id),
      before_state:before||null,after_state:after,metadata:{source:"public_share_link",identity_status:"self_asserted_unverified"}
    });
    if(auditError) console.error("pitch response audit failed",auditError.message);

    return json({ok:true,response:{response_type:after.response_type,updated_at:after.updated_at},truth_contract:{identity:"Responder identity is self-asserted and not verified by the agency.",stage:"This response does not automatically advance, win, lose or close a deal."}});
  }catch(error){console.error("club-pitch-response",error);return json({error:error instanceof Error?error.message:"Unable to save response"},500);}
});
