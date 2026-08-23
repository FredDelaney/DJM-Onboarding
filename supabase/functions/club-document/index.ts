import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Content-Type":"application/json"};
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers:cors});
  try{
    const {token,document_id}=await req.json();
    if(!token||!document_id) return new Response(JSON.stringify({error:"Missing share token or document"}),{status:400,headers:cors});
    const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!service) return new Response(JSON.stringify({error:"Service unavailable"}),{status:500,headers:cors});
    const db=createClient(url,service,{auth:{persistSession:false}});const now=new Date().toISOString();
    const {data:share}=await db.from("club_share_links").select("id,player_id,active,expires_at").eq("token",token).eq("active",true).maybeSingle();
    if(!share||(share.expires_at&&share.expires_at<=now)) return new Response(JSON.stringify({error:"Share link unavailable"}),{status:404,headers:cors});
    const {data:doc}=await db.from("player_documents").select("id,title,bucket_id,object_path,club_shareable,player_id").eq("id",document_id).eq("player_id",share.player_id).eq("club_shareable",true).maybeSingle();
    if(!doc) return new Response(JSON.stringify({error:"Document unavailable"}),{status:404,headers:cors});
    const {data:signed,error}=await db.storage.from(doc.bucket_id||"player-private").createSignedUrl(doc.object_path,120);
    if(error||!signed?.signedUrl) return new Response(JSON.stringify({error:"Could not open document"}),{status:500,headers:cors});
    return new Response(JSON.stringify({url:signed.signedUrl,title:doc.title}),{status:200,headers:cors});
  }catch{return new Response(JSON.stringify({error:"Invalid request"}),{status:400,headers:cors})}
});
