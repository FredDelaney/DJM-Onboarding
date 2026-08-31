// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
function parseCsvLine(line){const out=[];let cur="",q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===','&&!q){out.push(cur);cur="";}else cur+=ch;}out.push(cur);return out;}
function parseCsv(text){const lines=text.replace(/\r/g,"").split("\n").filter(Boolean);if(lines.length<2)return[];const head=parseCsvLine(lines[0]).map(x=>x.trim());return lines.slice(1).map(line=>{const vals=parseCsvLine(line);const obj={};head.forEach((h,i)=>obj[h]=vals[i]??"");return obj;});}
const val=(row,...keys)=>{for(const k of keys){if(row[k]!=null&&String(row[k]).trim()!=='')return String(row[k]).trim();}return null;};
const num=(v)=>{if(v==null)return null;const n=Number(String(v).trim());return Number.isFinite(n)?n:null;};
const date=(v)=>{const s=String(v||"").trim();return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:null;};
const errText=(e)=>e instanceof Error?e.message:(e&&typeof e==='object'?JSON.stringify(e):String(e));
async function fetchSnapshot(d){const source=`http://api.clubelo.com/${d}`;const res=await fetch(source,{signal:AbortSignal.timeout(30000),headers:{"User-Agent":"DJM-Sports-Management/1.0"}});if(!res.ok)throw new Error(`ClubElo HTTP ${res.status}`);const text=await res.text();const rows=parseCsv(text);if(!rows.length)throw new Error("ClubElo returned no rows");return{source,rows,headers:Object.keys(rows[0]||{})};}
Deno.serve(async(req)=>{
 if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
 const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!url||!serviceKey)return json({ok:false,error:"Server configuration incomplete"},500);
 const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});const supplied=req.headers.get("x-djm-cron")||"";const {data:expected,error:secretError}=await admin.rpc("get_push_scheduler_secret");if(secretError||!expected||supplied!==expected)return json({ok:false,error:"Unauthorized"},401);
 try{
  let d=new Date();d.setUTCDate(d.getUTCDate()-1);let iso=d.toISOString().slice(0,10),fetched;
  try{fetched=await fetchSnapshot(iso);}catch{d.setUTCDate(d.getUTCDate()-1);iso=d.toISOString().slice(0,10);fetched=await fetchSnapshot(iso);}
  const normalized=fetched.rows.map(r=>({team_name:val(r,"Club","club"),country_code:val(r,"Country","country"),level_tier:num(val(r,"Level","level")),elo:num(val(r,"Elo","elo")),rank:num(val(r,"Rank","rank")),provider_from:date(val(r,"From","from")),provider_to:date(val(r,"To","to"))})).filter(r=>r.team_name&&r.elo!=null);
  if(!normalized.length)return json({ok:false,error:"ClubElo rows parsed to empty set",headers:fetched.headers,sample:fetched.rows.slice(0,2)},500);
  const {data,error}=await admin.rpc("djm_upsert_clubelo_snapshot",{p_snapshot_date:iso,p_rows:normalized,p_source_url:fetched.source});if(error)throw new Error(`DB write failed: ${JSON.stringify(error)}`);
  return json({ok:true,snapshot_date:iso,rows:normalized.length,headers:fetched.headers,sample:normalized.slice(0,2),result:data,completed_at:new Date().toISOString()});
 }catch(e){return json({ok:false,error:errText(e)},500);}
});
