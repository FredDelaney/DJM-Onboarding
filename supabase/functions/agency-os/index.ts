import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseContext } from "npm:@supabase/server@1.6.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const id=(v:unknown)=>String(v??"").trim();
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const clamp=(v:unknown,min:number,max:number,fallback:number)=>Math.max(min,Math.min(max,Number(v??fallback)||fallback));
const profileSlug=(v:unknown)=>String(v||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60);
const profileAge=(v:unknown)=>{const raw=id(v);if(!raw)return null;const born=new Date(raw);if(Number.isNaN(born.getTime()))return null;return String(Math.floor((Date.now()-born.getTime())/(365.2425*86400000)))};
const profileAutoStats=(career:any[],currentSeason:unknown)=>{const reviewed=(Array.isArray(career)?career:[]).filter((row:any)=>row?.source_reviewed_at);if(!reviewed.length)return[];const seasons=[...new Set(reviewed.map((row:any)=>id(row?.season_label)).filter(Boolean))].sort((a,b)=>String(b).localeCompare(String(a),undefined,{numeric:true}));const target=id(currentSeason)&&seasons.includes(id(currentSeason))?id(currentSeason):seasons[0];const rows=reviewed.filter((row:any)=>id(row?.season_label)===target);const sum=(key:string)=>{const known=rows.filter((row:any)=>row?.[key]!==null&&row?.[key]!==undefined&&row?.[key]!=="");return known.length?known.reduce((total:number,row:any)=>total+Number(row[key]||0),0):null};return[{label:"Apps",value:sum("appearances")},{label:"Starts",value:sum("starts")},{label:"Minutes",value:sum("minutes")},{label:"Goals",value:sum("goals")},{label:"Assists",value:sum("assists")}].filter((item:any)=>item.value!==null).map((item:any)=>({label:item.label,value:String(item.value)})).slice(0,6)};

const feedbackTypes=new Set(["shown","accepted","dismissed","snoozed","completed","not_relevant"]);
type Workspace={tenant_id:string;role:string;is_primary?:boolean;synthetic_demo?:boolean;[k:string]:unknown};

type SimpleRoute={key:string;fn:string;args:()=>Record<string,unknown>;guard?:()=>boolean;deny?:string};

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
    const workspaces=((await rpc("platform_server_user_workspaces",{p_user_id:userId}))||[]) as Workspace[];
    if(!workspaces.length) return json({error:"Agency staff access required"},403);
    if(action==="tenants") return json({ok:true,tenants:workspaces});
    const requested=id(body?.tenant_id);
    let workspace=requested?workspaces.find(w=>String(w.tenant_id)===requested):workspaces.find(w=>Boolean(w.is_primary));
    if(!workspace&&workspaces.length===1) workspace=workspaces[0];
    if(!workspace) return json({error:"tenant_id is required when more than one agency workspace is available",code:"tenant_required"},409);
    const tenantId=String(workspace.tenant_id),role=String(workspace.role||"");
    const ownerAdmin=()=>["owner","admin"].includes(role);
    const ownerAdminOps=()=>["owner","admin","operations"].includes(role);
    const operator=()=>["owner","admin","agent","operations"].includes(role);
    const deny=(message:string)=>json({error:message},403);
    const result=async(key:string,fn:string,args:Record<string,unknown>)=>json({ok:true,tenant:workspace,[key]:await rpc(fn,args)});
    const dealId=()=>id(body?.deal_room_id),playerId=()=>id(body?.player_id),matchId=()=>id(body?.player_match_id);
    const profilePlayer=async(pid:string)=>{
      if(!pid)return null;
      const {data,error}=await ctx.supabaseAdmin.from("players").select("id,tenant_id,user_id,first_name,last_name,preferred_name,date_of_birth,nationalities,height_cm,preferred_foot,primary_position,secondary_positions,current_club,current_league,current_country,contract_status,contract_expiry,football_status,transfermarkt_url,wyscout_url,stats_url,profile_photo_path,verification_status,verified_at,current_season_label,agency_priority,next_action,next_action_due").eq("id",pid).eq("tenant_id",tenantId).maybeSingle();
      if(error)throw error;
      return data;
    };
    const profileBranding=async()=>{
      const branding=await rpc("platform_server_tenant_branding",{p_tenant_id:tenantId});
      return branding||{display_name:workspace.display_name||"Agency",short_name:workspace.short_name||null,logo_asset:workspace.logo_asset||null,primary_color:workspace.primary_color||"#111827",accent_color:workspace.accent_color||"#64748B",support_email:null};
    };
    const profileAudit=async(actionName:string,entityId:string,beforeState:unknown,afterState:unknown,metadata:Record<string,unknown>={})=>{
      try{
        await rpc("platform_server_record_audit",{p_tenant_id:tenantId,p_actor_user_id:userId,p_actor_kind:"user",p_action:actionName,p_entity_type:"player_profile",p_entity_id:entityId,p_request_id:null,p_correlation_id:null,p_before_state:beforeState??{},p_after_state:afterState??{},p_metadata:metadata});
      }catch(auditError){console.error("player-profile audit",auditError)}
    };
    const profileBundle=async(pid:string)=>{
      const player=await profilePlayer(pid);
      if(!player)return null;
      const [settingsResult,publishedResult,careerResult,videosResult,documentsResult,sharesResult,dealsResult,clubsResult,branding]=await Promise.all([
        ctx.supabaseAdmin.from("player_cv_settings").select("*").eq("player_id",pid).maybeSingle(),
        ctx.supabaseAdmin.from("player_public_profiles").select("*").eq("player_id",pid).maybeSingle(),
        ctx.supabaseAdmin.from("career_entries").select("id,player_id,club_name,country,league,season_label,start_date,end_date,appearances,starts,minutes,goals,assists,notes,is_international,sort_order,source_name,source_url,source_reviewed_at,source_provider,source_synced_at").eq("player_id",pid).order("sort_order").order("start_date",{ascending:false}),
        ctx.supabaseAdmin.from("player_videos").select("id,player_id,title,url,video_type,featured,sort_order,created_at,updated_at").eq("player_id",pid).order("featured",{ascending:false}).order("sort_order"),
        ctx.supabaseAdmin.from("player_documents").select("id,title,document_type,club_shareable,created_at,country,expires_at").eq("player_id",pid).eq("club_shareable",true).order("created_at",{ascending:false}),
        ctx.supabaseAdmin.from("club_share_links").select("id,token,player_id,label,active,expires_at,view_count,last_viewed_at,created_at,opportunity_id,organisation_id,source_person_id,pitch_message,pitch_status,sent_at,revoked_at").eq("player_id",pid).order("created_at",{ascending:false}).limit(50),
        ctx.supabaseAdmin.schema("djm_os").from("deal_rooms").select("id,title,organisation_id,source_person_id,stage,status,pitch_status,updated_at").eq("tenant_id",tenantId).eq("player_id",pid).order("updated_at",{ascending:false}).limit(30),
        ctx.supabaseAdmin.schema("djm_os").from("organisations").select("id,name,country,organisation_type").eq("tenant_id",tenantId).order("name").limit(250),
        profileBranding()
      ]);
      for(const resultItem of [settingsResult,publishedResult,careerResult,videosResult,documentsResult,sharesResult,dealsResult,clubsResult]){if(resultItem.error)throw resultItem.error}
      const clubs=clubsResult.data||[];
      const clubMap=new Map(clubs.map((club:any)=>[String(club.id),club.name]));
      const deals=(dealsResult.data||[]).map((deal:any)=>({...deal,club_name:clubMap.get(String(deal.organisation_id||""))||null}));
      const dealMap=new Map(deals.map((deal:any)=>[String(deal.id),deal]));
      const shares=(sharesResult.data||[]).map((share:any)=>({...share,club_name:clubMap.get(String(share.organisation_id||""))||share.label||null,deal_title:dealMap.get(String(share.opportunity_id||""))?.title||null}));
      const career=careerResult.data||[];
      return{player,settings:settingsResult.data||{},published:publishedResult.data||null,career,videos:videosResult.data||[],documents:documentsResult.data||[],shares,deals,clubs,branding,auto_key_stats:profileAutoStats(career,player.current_season_label)};
    };


        if(action==="team"){
      if(!ownerAdmin()) return deny("Owner or admin access required");
      return result("team","platform_server_agency_team",{
        p_tenant_id:tenantId,
        p_actor_user_id:userId
      });
    }

    if(action==="staff_invite_create"){
      if(!ownerAdmin()) return deny("Owner or admin access required");

      const email=id(body?.email).toLowerCase();
      const staffRole=id(body?.role).toLowerCase();

      if(!email) return json({error:"email is required"},400);
      if(!["admin","agent","operations","scout"].includes(staffRole)){
        return json({error:"Invalid staff role"},400);
      }

      return result("invite","platform_server_create_staff_invite",{
        p_tenant_id:tenantId,
        p_email:email,
        p_role:staffRole,
        p_actor_user_id:userId,
        p_expires_hours:clamp(body?.expires_hours,1,720,168)
      });
    }

    if(action==="staff_invite_revoke"){
      if(!ownerAdmin()) return deny("Owner or admin access required");

      const inviteId=id(body?.invite_id);
      if(!inviteId) return json({error:"invite_id is required"},400);

      return result("invite","platform_server_revoke_staff_invite",{
        p_tenant_id:tenantId,
        p_invite_id:inviteId,
        p_actor_user_id:userId
      });
    }

    if(action==="staff_member_update"){
      if(!ownerAdmin()) return deny("Owner or admin access required");

      const targetUserId=id(body?.target_user_id);
      const staffRole=id(body?.role).toLowerCase();

      if(!targetUserId) return json({error:"target_user_id is required"},400);
      if(!["admin","agent","operations","scout"].includes(staffRole)){
        return json({error:"Invalid staff role"},400);
      }

      return result("member","platform_server_update_staff_member",{
        p_tenant_id:tenantId,
        p_target_user_id:targetUserId,
        p_role:staffRole,
        p_actor_user_id:userId
      });
    }

    if(action==="staff_member_remove"){
      if(!ownerAdmin()) return deny("Owner or admin access required");

      const targetUserId=id(body?.target_user_id);
      if(!targetUserId) return json({error:"target_user_id is required"},400);

      return result("member","platform_server_remove_staff_member",{
        p_tenant_id:tenantId,
        p_target_user_id:targetUserId,
        p_actor_user_id:userId
      });
    }

    if(action==="recruitment_create"){
      if(!operator()) return deny("Agency operator access required");
      return result("result","platform_server_recruitment_create_target",{
        p_tenant_id:tenantId,p_actor_user_id:userId,p_full_name:id(body?.full_name),
        p_current_club:id(body?.current_club)||null,p_current_country:id(body?.current_country)||null,
        p_primary_position:id(body?.primary_position)||null,p_contract_expiry:id(body?.contract_expiry)||null,
        p_transfermarkt_url:id(body?.transfermarkt_url)||null,p_recruitment_priority:clamp(body?.recruitment_priority,1,5,3)
      });
    }
    if(action==="recruitment_set_stage"){
      if(!operator()) return deny("Agency operator access required");
      const prospectId=id(body?.prospect_id),stage=id(body?.stage).toLowerCase();
      if(!prospectId||!stage) return json({error:"prospect_id and stage are required"},400);
      return result("result","platform_server_recruitment_set_stage",{p_tenant_id:tenantId,p_actor_user_id:userId,p_prospect_id:prospectId,p_stage:stage});
    }
    if(action==="recruitment_set_next_action"){
      if(!operator()) return deny("Agency operator access required");
      const prospectId=id(body?.prospect_id),nextAction=id(body?.next_action_at);
      if(!prospectId||!nextAction) return json({error:"prospect_id and next_action_at are required"},400);
      return result("result","platform_server_recruitment_set_next_action",{p_tenant_id:tenantId,p_actor_user_id:userId,p_prospect_id:prospectId,p_next_action_at:nextAction});
    }
    if(action==="recruitment_log_interaction"){
      if(!operator()) return deny("Agency operator access required");
      const prospectId=id(body?.prospect_id),channel=id(body?.channel).toLowerCase(),direction=id(body?.direction).toLowerCase(),summary=id(body?.summary);
      if(!prospectId||!channel||!direction||!summary) return json({error:"prospect_id, channel, direction and summary are required"},400);
      return result("result","platform_server_recruitment_log_interaction",{p_tenant_id:tenantId,p_actor_user_id:userId,p_prospect_id:prospectId,p_channel:channel,p_direction:direction,p_summary:summary});
    }
    if(action==="recruitment_promote"){
      if(!["owner","admin","agent"].includes(role)) return deny("Owner, admin or agent access required");
      const prospectId=id(body?.prospect_id);if(!prospectId)return json({error:"prospect_id is required"},400);
      return result("result","platform_server_recruitment_promote_player",{p_tenant_id:tenantId,p_actor_user_id:userId,p_prospect_id:prospectId});
    }

    if(action==="create_options"){
      if(!operator()) return deny("Agency operator access required");
      return result("options","platform_server_agency_create_options",{p_tenant_id:tenantId,p_actor_user_id:userId});
    }
    if(action==="create_player"){
      if(!operator()) return deny("Agency operator access required");
      return result("created","platform_server_agency_create_player",{
        p_tenant_id:tenantId,
        p_actor_user_id:userId,
        p_first_name:id(body?.first_name),
        p_last_name:id(body?.last_name)||null,
        p_primary_position:id(body?.primary_position)||null,
        p_current_club:id(body?.current_club)||null,
        p_current_country:id(body?.current_country)||null,
        p_contract_expiry:id(body?.contract_expiry)||null,
        p_transfermarkt_url:id(body?.transfermarkt_url)||null
      });
    }
    if(action==="create_club_need"){
      if(!operator()) return deny("Agency operator access required");
      return result("created","platform_server_agency_create_club_need",{
        p_tenant_id:tenantId,
        p_actor_user_id:userId,
        p_club_name:id(body?.club_name),
        p_country:id(body?.country)||null,
        p_position:id(body?.position),
        p_title:id(body?.title)||null,
        p_notes:id(body?.notes)||null,
        p_expires_on:id(body?.expires_on)||null
      });
    }
    if(action==="create_contact"){
      if(!operator()) return deny("Agency operator access required");
      return result("created","platform_server_agency_create_contact",{
        p_tenant_id:tenantId,
        p_actor_user_id:userId,
        p_contact_name:id(body?.contact_name),
        p_club_name:id(body?.club_name),
        p_contact_role:id(body?.contact_role)||null,
        p_country:id(body?.country)||null,
        p_notes:id(body?.notes)||null
      });
    }
    if(action==="create_deal"){
      if(!operator()) return deny("Agency operator access required");
      return result("created","platform_server_agency_create_deal",{
        p_tenant_id:tenantId,
        p_actor_user_id:userId,
        p_player_id:id(body?.player_id)||null,
        p_club_name:id(body?.club_name),
        p_country:id(body?.country)||null,
        p_stage:id(body?.stage)||"qualifying",
        p_expected_commission:body?.expected_commission??null,
        p_currency:id(body?.currency)||"EUR",
        p_next_action:id(body?.next_action)||null,
        p_next_action_at:id(body?.next_action_at)||null
      });
    }


    if(action==="player_profile"){
      const pid=playerId();if(!pid)return json({error:"player_id is required"},400);
      const profile=await profileBundle(pid);if(!profile)return json({error:"Player not found in this agency"},404);
      return json({ok:true,tenant:workspace,profile});
    }

    if(action==="player_profile_save"){
      if(!operator())return deny("Agency operator access required");
      const pid=playerId();if(!pid)return json({error:"player_id is required"},400);
      const player=await profilePlayer(pid);if(!player)return json({error:"Player not found in this agency"},404);
      const source=obj(body?.settings);
      const before=(await ctx.supabaseAdmin.from("player_cv_settings").select("*").eq("player_id",pid).maybeSingle()).data||{};
      const clean=(value:unknown,max:number)=>id(value).slice(0,max)||null;
      const keyStats=Array.isArray(source.key_stats)?source.key_stats.slice(0,6).map((item:any)=>({label:id(item?.label).slice(0,50),value:id(item?.value).slice(0,50)})).filter((item:any)=>item.label&&item.value):[];
      const notable=Array.isArray(source.notable_experience)?source.notable_experience.slice(0,8).map((item:any)=>id(typeof item==="string"?item:item?.label||item?.title||item?.value).slice(0,180)).filter(Boolean):[];
      const allowedSections=new Set(["why_review","stats","career","videos","experience"]);
      const hidden=Array.isArray(source.hidden_sections)?source.hidden_sections.map((item:any)=>id(item)).filter((item:string)=>allowedSections.has(item)):[];
      const payload={player_id:pid,intro_line:clean(source.intro_line,220),why_review:clean(source.why_review,1200),career_summary:clean(source.career_summary,1200),key_stats:keyStats,notable_experience:notable,hide_market_value:source.hide_market_value!==false,market_value_display:clean(source.market_value_display,80),market_value_source_url:clean(source.market_value_source_url,1000),hidden_sections:hidden};
      if(!payload.hide_market_value&&payload.market_value_display&&!payload.market_value_source_url)return json({error:"A source URL is required when market value is shown"},400);
      const {data,error}=await ctx.supabaseAdmin.from("player_cv_settings").upsert(payload).select("*").single();if(error)throw error;
      await profileAudit("player_profile.settings_saved",pid,before,data,{});
      return json({ok:true,settings:data});
    }

    if(action==="player_profile_video_add"){
      if(!operator())return deny("Agency operator access required");
      const pid=playerId();if(!pid)return json({error:"player_id is required"},400);
      const player=await profilePlayer(pid);if(!player)return json({error:"Player not found in this agency"},404);
      const url=id(body?.url),title=id(body?.title).slice(0,120)||"Player video";
      if(!/^https?:\/\//i.test(url))return json({error:"A valid video URL is required"},400);
      const existing=await ctx.supabaseAdmin.from("player_videos").select("id").eq("player_id",pid).limit(1);if(existing.error)throw existing.error;
      const {data,error}=await ctx.supabaseAdmin.from("player_videos").insert({player_id:pid,title,url,video_type:"highlight",featured:!(existing.data||[]).length,sort_order:0}).select("*").single();if(error)throw error;
      await profileAudit("player_profile.video_added",pid,{},data,{});
      return json({ok:true,video:data});
    }

    if(action==="player_profile_video_remove"){
      if(!operator())return deny("Agency operator access required");
      const pid=playerId(),videoId=id(body?.video_id);if(!pid||!videoId)return json({error:"player_id and video_id are required"},400);
      const player=await profilePlayer(pid);if(!player)return json({error:"Player not found in this agency"},404);
      const current=await ctx.supabaseAdmin.from("player_videos").select("*").eq("id",videoId).eq("player_id",pid).maybeSingle();if(current.error)throw current.error;if(!current.data)return json({error:"Video not found"},404);
      const {error}=await ctx.supabaseAdmin.from("player_videos").delete().eq("id",videoId).eq("player_id",pid);if(error)throw error;
      await profileAudit("player_profile.video_removed",pid,current.data,{}, {});
      return json({ok:true});
    }

    if(action==="player_profile_publish"){
      if(!operator())return deny("Agency operator access required");
      const pid=playerId();if(!pid)return json({error:"player_id is required"},400);
      const bundle=await profileBundle(pid);if(!bundle)return json({error:"Player not found in this agency"},404);
      const player=bundle.player,settings=bundle.settings||{},branding=bundle.branding||{};
      if(player.verification_status!=="verified"||!player.verified_at)return json({error:"Verify current player data before publishing"},409);
      if(!player.primary_position)return json({error:"Record the player's primary position before publishing"},409);
      const contactEmail=id(branding.support_email)||id((claims as any)?.email);
      if(!contactEmail)return json({error:"Agency contact email is required before publishing"},409);
      if(settings.hide_market_value===false&&settings.market_value_display&&!settings.market_value_source_url)return json({error:"Add a source URL before showing market value"},409);
      const name=[player.first_name,player.last_name].filter(Boolean).join(" ")||player.preferred_name||"Player";
      const existing=bundle.published||{};
      const selected=(bundle.videos||[]).filter((video:any)=>video.featured).length?(bundle.videos||[]).filter((video:any)=>video.featured).slice(0,4):(bundle.videos||[]).slice(0,4);
      const timeline=(bundle.career||[]).map((row:any)=>({club_name:row.club_name,country:row.country,league:row.league,season_label:row.season_label,start_date:row.start_date,end_date:row.end_date,appearances:row.appearances,starts:row.starts,minutes:row.minutes,goals:row.goals,assists:row.assists,source_name:row.source_name,source_url:row.source_url,source_reviewed_at:row.source_reviewed_at,sort_order:row.sort_order}));
      const customStats=Array.isArray(settings.key_stats)&&settings.key_stats.length?settings.key_stats:bundle.auto_key_stats||[];
      const payload={player_id:pid,public_slug:existing.public_slug||`${profileSlug(name)||"player"}-${pid.slice(0,5)}`,published:true,published_at:existing.published_at||new Date().toISOString(),display_name:name,headline:id(settings.intro_line)||[player.primary_position,player.current_club].filter(Boolean).join(" · ")||"Professional footballer",primary_position:player.primary_position,secondary_positions:player.secondary_positions||[],preferred_foot:player.preferred_foot,age_display:profileAge(player.date_of_birth),height_display:player.height_cm?`${player.height_cm} cm`:null,nationalities:player.nationalities||[],current_status:player.contract_status,current_club:player.current_club,key_stats:customStats,why_review:id(settings.why_review)||null,career_summary:id(settings.career_summary)||null,profile_photo_path:player.profile_photo_path,primary_video_url:selected?.[0]?.url||null,transfermarkt_url:player.transfermarkt_url,wyscout_url:player.wyscout_url,stats_url:player.stats_url||null,contact_email:contactEmail,career_timeline:timeline,selected_videos:selected.map((video:any)=>({title:video.title,url:video.url,video_type:video.video_type})),notable_experience:Array.isArray(settings.notable_experience)?settings.notable_experience:[],market_value_display:settings.hide_market_value===false?id(settings.market_value_display)||null:null,market_value_source_url:settings.hide_market_value===false?id(settings.market_value_source_url)||null:null,hidden_sections:Array.isArray(settings.hidden_sections)?settings.hidden_sections:[],hide_market_value:settings.hide_market_value!==false,verified_at:player.verified_at};
      const {data,error}=await ctx.supabaseAdmin.from("player_public_profiles").upsert(payload).select("*").single();if(error)throw error;
      await profileAudit(existing.published?"player_profile.updated":"player_profile.published",pid,existing,data,{readiness:{career_rows:(bundle.career||[]).length,videos:(bundle.videos||[]).length}});
      return json({ok:true,published:data});
    }

    if(action==="player_profile_unpublish"){
      if(!operator())return deny("Agency operator access required");
      const pid=playerId();if(!pid)return json({error:"player_id is required"},400);
      const player=await profilePlayer(pid);if(!player)return json({error:"Player not found in this agency"},404);
      const current=await ctx.supabaseAdmin.from("player_public_profiles").select("*").eq("player_id",pid).maybeSingle();if(current.error)throw current.error;
      const {data,error}=await ctx.supabaseAdmin.from("player_public_profiles").update({published:false}).eq("player_id",pid).select("*").maybeSingle();if(error)throw error;
      await profileAudit("player_profile.unpublished",pid,current.data||{},data||{}, {});
      return json({ok:true,published:data});
    }

    if(action==="player_profile_share_create"){
      if(!operator())return deny("Agency operator access required");
      const pid=playerId();if(!pid)return json({error:"player_id is required"},400);
      const player=await profilePlayer(pid);if(!player)return json({error:"Player not found in this agency"},404);
      const published=await ctx.supabaseAdmin.from("player_public_profiles").select("player_id,published").eq("player_id",pid).maybeSingle();if(published.error)throw published.error;if(!published.data?.published)return json({error:"Publish the Player Profile before sharing it"},409);
      const dealRoomId=id(body?.deal_room_id)||null;
      let organisationId=id(body?.organisation_id)||null;
      let sourcePersonId:null|string=null;
      let deal:any=null;
      if(dealRoomId){
        const dealResult=await ctx.supabaseAdmin.schema("djm_os").from("deal_rooms").select("id,title,organisation_id,source_person_id,player_id,tenant_id").eq("id",dealRoomId).eq("tenant_id",tenantId).eq("player_id",pid).maybeSingle();if(dealResult.error)throw dealResult.error;if(!dealResult.data)return json({error:"Deal not found for this player"},404);deal=dealResult.data;organisationId=deal.organisation_id||organisationId;sourcePersonId=deal.source_person_id||null;
      }
      if(!organisationId)return json({error:"Choose the club this profile is being shared with"},400);
      const organisation=await ctx.supabaseAdmin.schema("djm_os").from("organisations").select("id,name,country").eq("id",organisationId).eq("tenant_id",tenantId).maybeSingle();if(organisation.error)throw organisation.error;if(!organisation.data)return json({error:"Club not found in this agency workspace"},404);
      const expiresDays=clamp(body?.expires_days,1,180,30);
      const now=new Date();
      const expiresAt=new Date(now.getTime()+expiresDays*86400000).toISOString();
      const {data,error}=await ctx.supabaseAdmin.from("club_share_links").insert({player_id:pid,label:organisation.data.name,active:true,expires_at:expiresAt,created_by:userId,opportunity_id:dealRoomId,organisation_id:organisationId,source_person_id:sourcePersonId,pitch_message:id(body?.pitch_message).slice(0,1500)||null,pitch_status:"ready",selected_sections:Array.isArray(body?.selected_sections)?body.selected_sections:[],sent_at:null}).select("*").single();if(error)throw error;
      if(dealRoomId){const update=await ctx.supabaseAdmin.schema("djm_os").from("deal_rooms").update({pitch_status:"ready",updated_at:now.toISOString()}).eq("id",dealRoomId).eq("tenant_id",tenantId).eq("player_id",pid);if(update.error)throw update.error}
      await profileAudit("player_profile.share_link_created",pid,{},data,{organisation_id:organisationId,club_name:organisation.data.name,deal_room_id:dealRoomId});
      return json({ok:true,share:{...data,club_name:organisation.data.name,deal_title:deal?.title||null}});
    }

    if(action==="player_profile_share_revoke"){
      if(!operator())return deny("Agency operator access required");
      const pid=playerId(),shareId=id(body?.share_id);if(!pid||!shareId)return json({error:"player_id and share_id are required"},400);
      const player=await profilePlayer(pid);if(!player)return json({error:"Player not found in this agency"},404);
      const current=await ctx.supabaseAdmin.from("club_share_links").select("*").eq("id",shareId).eq("player_id",pid).maybeSingle();if(current.error)throw current.error;if(!current.data)return json({error:"Profile link not found"},404);
      const {data,error}=await ctx.supabaseAdmin.from("club_share_links").update({active:false,revoked_at:new Date().toISOString()}).eq("id",shareId).eq("player_id",pid).select("*").single();if(error)throw error;
      await profileAudit("player_profile.share_revoked",pid,current.data,data,{share_id:shareId});
      return json({ok:true,share:data});
    }

    if(action==="home"){
      const limit=clamp(body?.command_limit,1,12,5);
      const [home,autonomy,pulse,judgement,commitments,autonomyReadiness,revenue,playerService,career,roster,capacity,assurance]=await Promise.all([
        rpc("platform_server_agency_home_executive",{p_tenant_id:tenantId,p_command_limit:limit}),rpc("platform_server_autonomy_policy",{p_tenant_id:tenantId}),rpc("platform_server_agency_pulse",{p_tenant_id:tenantId}),rpc("platform_server_judgement_boundary",{p_tenant_id:tenantId,p_limit:limit}),rpc("platform_server_commitment_summary",{p_tenant_id:tenantId,p_limit:10}),rpc("platform_server_autonomy_readiness",{p_tenant_id:tenantId,p_window_days:90}),rpc("platform_server_revenue_command",{p_tenant_id:tenantId,p_limit:8}),rpc("platform_server_player_service_command",{p_tenant_id:tenantId,p_limit:12}),rpc("platform_server_career_strategy_command",{p_tenant_id:tenantId,p_limit:12}),rpc("platform_server_roster_command",{p_tenant_id:tenantId,p_limit:8}),rpc("platform_server_team_capacity",{p_tenant_id:tenantId}),rpc("platform_server_service_assurance_v2",{p_tenant_id:tenantId,p_limit:20})
      ]);
      return json({ok:true,tenant:workspace,home,revenue,roster_command:roster,team_capacity:capacity,service_assurance:assurance,player_service:playerService,career_strategy:career,autonomy,autonomy_readiness:autonomyReadiness,pulse,judgement,commitments});
    }
    if(action==="brief"){
      const [brief,revenue,roster]=await Promise.all([rpc("platform_server_agency_brief_executive",{p_tenant_id:tenantId,p_window_hours:clamp(body?.window_hours,1,168,24),p_decision_limit:clamp(body?.decision_limit,1,12,5)}),rpc("platform_server_revenue_command",{p_tenant_id:tenantId,p_limit:8}),rpc("platform_server_roster_command",{p_tenant_id:tenantId,p_limit:6})]);
      return json({ok:true,tenant:workspace,brief,revenue,roster_command:roster});
    }

    const simpleRoutes:Record<string,SimpleRoute>={
      agency_control_centre:{key:"control_centre",fn:"platform_server_agency_control_centre",args:()=>({p_tenant_id:tenantId}),guard:ownerAdmin,deny:"Owner or admin access required"},
      owner_operating_review:{key:"review",fn:"platform_server_owner_operating_review",args:()=>({p_tenant_id:tenantId,p_deadline_horizon_days:clamp(body?.deadline_horizon_days,1,366,30),p_proof_cadence_days:clamp(body?.proof_cadence_days,1,180,30)}),guard:ownerAdmin,deny:"Owner or admin access required"},
      execution_deadlines:{key:"deadlines",fn:"platform_server_execution_deadline_command",args:()=>({p_tenant_id:tenantId,p_horizon_days:clamp(body?.horizon_days,1,366,90),p_limit:clamp(body?.limit,1,500,100)})},
      value_proof_review_queue:{key:"review_queue",fn:"platform_server_value_proof_review_queue",args:()=>({p_tenant_id:tenantId,p_cadence_days:clamp(body?.cadence_days,1,180,30),p_limit:clamp(body?.limit,1,500,100)}),guard:operator,deny:"Agency operator access required"},
      value_proof_review_pack:{key:"review_pack",fn:"platform_server_value_proof_review_pack",args:()=>({p_tenant_id:tenantId,p_cadence_days:clamp(body?.cadence_days,1,180,30),p_limit:clamp(body?.limit,1,500,100)}),guard:ownerAdminOps,deny:"Owner, admin or operations access required"},
      representation_renewal:{key:"renewals",fn:"platform_server_representation_renewal_command",args:()=>({p_tenant_id:tenantId,p_horizon_days:clamp(body?.horizon_days,30,365,120),p_limit:clamp(body?.limit,1,500,100)}),guard:ownerAdminOps,deny:"Owner, admin or operations access required"},
      receivables_command:{key:"receivables",fn:"platform_server_receivables_command",args:()=>({p_tenant_id:tenantId,p_horizon_days:clamp(body?.horizon_days,1,366,90),p_limit:clamp(body?.limit,1,500,100)}),guard:ownerAdminOps,deny:"Owner, admin or operations access required"},
      deal_closeout_command:{key:"closeout",fn:"platform_server_deal_closeout_command",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,500,100)}),guard:ownerAdminOps,deny:"Owner, admin or operations access required"},
      demand_coverage:{key:"coverage",fn:"platform_server_demand_coverage",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,250,100)})},
      demand_control_fast:{key:"coverage",fn:"platform_server_demand_control_fast",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,250,100)})},
      origination_command:{key:"origination",fn:"platform_server_origination_command",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,100,25)})},
      origination_command_fast:{key:"origination",fn:"platform_server_origination_command_fast",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,100,25)})},
      scouting_mandates:{key:"mandates",fn:"platform_server_scouting_mandates",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,100,50)})},
      player_relationship_control:{key:"relationships",fn:"platform_server_player_relationship_control",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,500,100)})},
      club_portfolio_control:{key:"clubs",fn:"platform_server_club_portfolio_control",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,250,100)})},
      player_value_proof_portfolio:{key:"value_proof",fn:"platform_server_player_value_proof_portfolio",args:()=>({p_tenant_id:tenantId,p_window_days:clamp(body?.window_days,1,366,30),p_limit:clamp(body?.limit,1,500,100)})},
      agency_roi_proof:{key:"roi",fn:"platform_server_agency_roi_proof",args:()=>({p_tenant_id:tenantId,p_window_days:clamp(body?.window_days,1,366,30)}),guard:ownerAdmin,deny:"Owner or admin access required"},
      revenue_command:{key:"revenue",fn:"platform_server_revenue_command",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,50,12)})},
      players_workspace:{key:"players",fn:"platform_server_players_workspace",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,200,100)})},
      player_workspace:{key:"player",fn:"platform_server_player_workspace",args:()=>({p_tenant_id:tenantId,p_player_id:playerId()})},
      recruitment_board:{key:"recruitment",fn:"platform_server_recruitment_board",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,500,250)})},
      recruitment_target:{key:"recruitment",fn:"platform_server_recruitment_target",args:()=>({p_tenant_id:tenantId,p_prospect_id:id(body?.prospect_id)})},
      player_service_command:{key:"player_service",fn:"platform_server_player_service_command",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,200,50)})},
      career_strategy_command:{key:"career_strategy",fn:"platform_server_career_strategy_command",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,200,50)})},
      roster_command:{key:"roster",fn:"platform_server_roster_command",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,200,50)})},
      team_capacity:{key:"capacity",fn:"platform_server_team_capacity",args:()=>({p_tenant_id:tenantId})},
      career_aligned_pursuits:{key:"pursuits",fn:"platform_server_career_aligned_pursuit_board",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,50,20)})},
      learning_center:{key:"learning",fn:"platform_server_learning_center",args:()=>({p_tenant_id:tenantId})},
      agency_learning:{key:"learning",fn:"platform_server_agency_learning_v2",args:()=>({p_tenant_id:tenantId,p_window_days:clamp(body?.window_days,30,730,365)})},
      market_learning:{key:"learning",fn:"platform_server_market_learning",args:()=>({p_tenant_id:tenantId,p_window_days:clamp(body?.window_days,90,1460,730)})},
      route_learning:{key:"learning",fn:"platform_server_route_learning",args:()=>({p_tenant_id:tenantId,p_window_days:clamp(body?.window_days,90,1460,730)})},
      service_standards:{key:"standards",fn:"platform_server_service_standards",args:()=>({p_tenant_id:tenantId})},
      service_assurance:{key:"assurance",fn:"platform_server_service_assurance_v2",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,500,100)})},
      go_live_readiness:{key:"readiness",fn:"platform_server_go_live_readiness",args:()=>({p_tenant_id:tenantId}),guard:ownerAdmin,deny:"Owner or admin access required"},
      governance_ledger:{key:"ledger",fn:"platform_server_governance_ledger",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,500,100),p_category:id(body?.category)||null}),guard:ownerAdmin,deny:"Owner or admin access required"},
      representation_control:{key:"representation",fn:"platform_server_representation_records_control",args:()=>({p_tenant_id:tenantId,p_warning_days:clamp(body?.warning_days,30,365,120)}),guard:ownerAdminOps,deny:"Owner, admin or operations access required"},
      club_accounts:{key:"clubs",fn:"platform_server_club_accounts",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,200,50)})},
      commercial_risk:{key:"risk",fn:"platform_server_commercial_exposure_risk",args:()=>({p_tenant_id:tenantId})},
      forecast_calibration:{key:"calibration",fn:"platform_server_forecast_calibration",args:()=>({p_tenant_id:tenantId,p_window_days:clamp(body?.window_days,30,1460,365)})},
      deal_policy:{key:"policy",fn:"platform_server_deal_operating_policy",args:()=>({p_tenant_id:tenantId})},
      evidence_risk:{key:"evidence",fn:"platform_server_evidence_risk_summary",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,25,10)})},
      verification_queue:{key:"verification",fn:"platform_server_verification_queue",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,25,10)})},
      outcome_learning:{key:"outcomes",fn:"platform_server_outcome_learning",args:()=>({p_tenant_id:tenantId,p_window_days:clamp(body?.window_days,14,365,90)})},
      network_coverage:{key:"network",fn:"platform_server_network_coverage",args:()=>({p_tenant_id:tenantId})},
      pursuit_board:{key:"pursuits",fn:"platform_server_pursuit_board",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,50,20)})},
      playbook:{key:"playbook",fn:"platform_server_agency_playbook",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,20,8)})},
      judgement:{key:"judgement",fn:"platform_server_judgement_boundary",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,12,12)})},
      commitments:{key:"commitments",fn:"platform_server_commitment_summary",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,50,20)})},
      autonomy_readiness:{key:"readiness",fn:"platform_server_autonomy_readiness",args:()=>({p_tenant_id:tenantId,p_window_days:clamp(body?.window_days,14,365,90)})},
      pulse:{key:"pulse",fn:"platform_server_agency_pulse",args:()=>({p_tenant_id:tenantId})},
      autonomy:{key:"autonomy",fn:"platform_server_autonomy_policy",args:()=>({p_tenant_id:tenantId})},
      operating_window:{key:"window",fn:"platform_server_operating_window_command",args:()=>({p_tenant_id:tenantId,p_operating_window_id:id(body?.operating_window_id)||null,p_limit:clamp(body?.limit,1,500,100)}),guard:operator,deny:"Agency operator access required"},
      operating_window_history:{key:"history",fn:"platform_server_operating_window_history",args:()=>({p_tenant_id:tenantId,p_operating_window_id:id(body?.operating_window_id)||null,p_limit:clamp(body?.limit,1,120,12)}),guard:operator,deny:"Agency operator access required"},
      operating_window_delta:{key:"delta",fn:"platform_server_operating_window_delta",args:()=>({p_tenant_id:tenantId,p_operating_window_id:id(body?.operating_window_id)||null,p_from_snapshot_id:id(body?.from_snapshot_id)||null,p_to_snapshot_id:id(body?.to_snapshot_id)||null}),guard:operator,deny:"Agency operator access required"},
      knowledge_candidates:{key:"candidates",fn:"platform_server_knowledge_candidates",args:()=>({p_tenant_id:tenantId,p_window_days:clamp(body?.window_days,90,1460,730)}),guard:ownerAdminOps,deny:"Owner, admin or operations access required"},
      knowledge_library:{key:"library",fn:"platform_server_knowledge_library",args:()=>({p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,500,100)}),guard:operator,deny:"Agency operator access required"},
      migration_batch:{key:"migration",fn:"platform_server_migration_batch",args:()=>({p_tenant_id:tenantId,p_batch_id:id(body?.batch_id)||null,p_limit:clamp(body?.limit,1,2000,200)}),guard:ownerAdminOps,deny:"Owner, admin or operations access required"}
    };
    const sr=simpleRoutes[action];
    if(sr){if(sr.guard&&!sr.guard()) return deny(sr.deny||"Access denied");return result(sr.key,sr.fn,sr.args());}

    if(action==="operating_window_save"){
      if(!ownerAdminOps()) return deny("Owner, admin or operations access required");
      return result("result","platform_server_save_operating_window",{p_tenant_id:tenantId,p_actor_user_id:userId,p_input:Object.keys(obj(body?.input)).length?obj(body?.input):obj(body)});
    }
    if(action==="operating_window_capture"){
      if(!ownerAdminOps()) return deny("Owner, admin or operations access required");
      const w=id(body?.operating_window_id);if(!w)return json({error:"operating_window_id is required"},400);
      return result("result","platform_server_capture_operating_window_snapshot",{p_tenant_id:tenantId,p_operating_window_id:w,p_actor_user_id:userId});
    }
    if(action==="knowledge_save"){
      if(!operator()) return deny("Agency operator access required");
      return result("result","platform_server_save_knowledge_card",{p_tenant_id:tenantId,p_actor_user_id:userId,p_input:Object.keys(obj(body?.input)).length?obj(body?.input):obj(body)});
    }
    if(action==="migration_create_batch"){
      if(!ownerAdminOps()) return deny("Owner, admin or operations access required");
      const entityType=id(body?.entity_type),sourceLabel=id(body?.source_label);if(!entityType||!sourceLabel)return json({error:"entity_type and source_label are required"},400);
      return result("result","platform_server_create_migration_batch",{p_tenant_id:tenantId,p_actor_user_id:userId,p_entity_type:entityType,p_source_label:sourceLabel,p_field_mapping:obj(body?.field_mapping),p_metadata:obj(body?.metadata)});
    }
    if(action==="migration_preflight"){
      if(!ownerAdminOps()) return deny("Owner, admin or operations access required");
      const batchId=id(body?.batch_id);if(!batchId||!Array.isArray(body?.rows))return json({error:"batch_id and rows array are required"},400);
      return result("migration","platform_server_migration_preflight",{p_tenant_id:tenantId,p_batch_id:batchId,p_actor_user_id:userId,p_rows:body.rows});
    }
    if(action==="migration_row_decision"){
      if(!ownerAdminOps()) return deny("Owner, admin or operations access required");
      const batchId=id(body?.batch_id),rowId=id(body?.row_id),decision=id(body?.decision);if(!batchId||!rowId||!decision)return json({error:"batch_id, row_id and decision are required"},400);
      return result("result","platform_server_migration_set_row_decision",{p_tenant_id:tenantId,p_batch_id:batchId,p_row_id:rowId,p_actor_user_id:userId,p_decision:decision});
    }
    if(action==="migration_approve"||action==="migration_apply"){
      if(!ownerAdminOps()) return deny("Owner, admin or operations access required");
      const batchId=id(body?.batch_id);if(!batchId)return json({error:"batch_id is required"},400);
      return result("result",action==="migration_approve"?"platform_server_approve_migration_batch":"platform_server_apply_migration_batch",{p_tenant_id:tenantId,p_batch_id:batchId,p_actor_user_id:userId});
    }

    if(action==="scouting_mandate_prepare"){
      const clubNeedId=id(body?.club_need_id);if(!clubNeedId)return json({error:"club_need_id is required"},400);
      return result("proposal","platform_server_prepare_scouting_mandate",{p_tenant_id:tenantId,p_club_need_id:clubNeedId,p_actor_user_id:userId});
    }
    if(action==="value_proof_portfolio_capture"){
      if(!ownerAdminOps()) return deny("Owner, admin or operations access required");
      return result("result","platform_server_capture_value_proof_portfolio",{p_tenant_id:tenantId,p_actor_user_id:userId,p_window_days:clamp(body?.window_days,1,366,30)});
    }
    if(action==="deal_receivables"){
      if(!ownerAdminOps()) return deny("Owner, admin or operations access required");
      return result("receivables","platform_server_deal_receivables",{p_tenant_id:tenantId,p_deal_room_id:dealId()||null,p_limit:clamp(body?.limit,1,500,200)});
    }
    if(action==="deal_receivable_save"){
      if(!ownerAdminOps()) return deny("Owner, admin or operations access required");
      return result("result","platform_server_save_deal_receivable",{p_tenant_id:tenantId,p_actor_user_id:userId,p_input:Object.keys(obj(body?.input)).length?obj(body?.input):obj(body)});
    }
    if(action==="receivable_payment_record"){
      if(!ownerAdminOps()) return deny("Owner, admin or operations access required");
      const receivableId=id(body?.receivable_id),amount=Number(body?.amount);if(!receivableId||!Number.isFinite(amount)||amount<=0)return json({error:"receivable_id and positive amount are required"},400);
      return result("result","platform_server_record_receivable_payment",{p_tenant_id:tenantId,p_receivable_id:receivableId,p_actor_user_id:userId,p_amount:amount,p_paid_at:id(body?.paid_at)||null,p_reference:id(body?.reference)||null});
    }
    if(action==="deal_closeout"){
      if(!operator()) return deny("Agency operator access required");const d=dealId();if(!d)return json({error:"deal_room_id is required"},400);
      return result("closeout","platform_server_deal_closeout_control",{p_tenant_id:tenantId,p_deal_room_id:d});
    }
    if(action==="deal_closeout_save"){
      if(!operator()) return deny("Agency operator access required");const d=dealId();if(!d)return json({error:"deal_room_id is required"},400);
      return result("result","platform_server_save_deal_closeout",{p_tenant_id:tenantId,p_deal_room_id:d,p_actor_user_id:userId,p_input:Object.keys(obj(body?.input)).length?obj(body?.input):obj(body)});
    }
    if(action==="service_standards_set"){
      if(!ownerAdmin()) return deny("Owner or admin access required");
      return result("standards","platform_server_set_service_standards",{p_tenant_id:tenantId,p_actor_user_id:userId,p_standards:obj(body?.standards),p_policy_name:id(body?.policy_name)||null});
    }
    if(action==="deal_policy_set") return result("policy","platform_server_set_deal_operating_policy",{p_tenant_id:tenantId,p_actor_user_id:userId,p_policy:obj(body?.policy)});

    if(action==="club_account"||action==="introduction_routes"||action==="access_routes"){
      const x=id(body?.organisation_id);if(!x)return json({error:"organisation_id is required"},400);
      if(action==="club_account") return result("club","platform_server_club_account",{p_tenant_id:tenantId,p_organisation_id:x});
      if(action==="introduction_routes") return result("introductions","platform_server_introduction_routes",{p_tenant_id:tenantId,p_organisation_id:x,p_limit:clamp(body?.limit,1,20,5)});
      return result("access","platform_server_access_routes",{p_tenant_id:tenantId,p_organisation_id:x,p_limit:clamp(body?.limit,1,10,5)});
    }

    if(action==="deal_portfolio") return result("deals","platform_server_deal_portfolio_v4",{p_tenant_id:tenantId,p_limit:clamp(body?.limit,1,50,20)});
    if(["deal_war_room","deal_war_room_deep","deal_decision_map","deal_momentum","deal_ageing","deal_decision_pressure","deal_owner_candidates","negotiation_readiness","negotiation_sequence","negotiation_brief","deal_advantage","deal_guardrails","deal_origin"].includes(action)){
      const d=dealId();if(!d)return json({error:"deal_room_id is required"},400);
      const data=action==="deal_war_room"?await rpc("platform_server_deal_war_room_instant_v3",{p_tenant_id:tenantId,p_deal_room_id:d}):action==="deal_war_room_deep"?await rpc("platform_server_deal_war_room_v2",{p_tenant_id:tenantId,p_deal_room_id:d}):action==="deal_decision_map"?await rpc("platform_server_deal_decision_map",{p_tenant_id:tenantId,p_deal_room_id:d}):action==="deal_momentum"?await rpc("platform_server_deal_momentum",{p_tenant_id:tenantId,p_deal_room_id:d,p_window_days:clamp(body?.window_days,7,180,30)}):action==="deal_ageing"?await rpc("platform_server_deal_ageing",{p_tenant_id:tenantId,p_deal_room_id:d}):action==="deal_decision_pressure"?await rpc("platform_server_deal_decision_pressure",{p_tenant_id:tenantId,p_deal_room_id:d}):action==="deal_owner_candidates"?await rpc("platform_server_deal_owner_candidates",{p_tenant_id:tenantId,p_deal_room_id:d,p_limit:clamp(body?.limit,1,25,10)}):action==="negotiation_readiness"?await rpc("platform_server_negotiation_readiness",{p_tenant_id:tenantId,p_deal_room_id:d}):action==="negotiation_sequence"?await rpc("platform_server_negotiation_sequence_v2",{p_tenant_id:tenantId,p_deal_room_id:d}):action==="negotiation_brief"?await rpc("platform_server_negotiation_brief_fast_v2",{p_tenant_id:tenantId,p_deal_room_id:d}):action==="deal_advantage"?await rpc("platform_server_deal_advantage_fast",{p_tenant_id:tenantId,p_deal_room_id:d}):action==="deal_origin"?await rpc("platform_server_deal_origin",{p_tenant_id:tenantId,p_deal_room_id:d}):await rpc("platform_server_deal_guardrails",{p_tenant_id:tenantId,p_deal_room_id:d});
      const key=action==="deal_owner_candidates"?"owners":action==="deal_war_room"||action==="deal_war_room_deep"?"war_room":action==="deal_decision_map"?"decision_map":action==="deal_momentum"?"momentum":action==="deal_ageing"?"ageing":action==="deal_decision_pressure"?"pressure":action==="negotiation_readiness"?"negotiation":action==="negotiation_sequence"?"sequence":action==="negotiation_brief"?"brief":action==="deal_advantage"?"advantage":action==="deal_origin"?"origin":"guardrails";
      return json({ok:true,tenant:workspace,[key]:data});
    }
    if(action==="deal_origin_save"){
      const d=dealId(),routeType=id(body?.route_type);if(!d||!routeType)return json({error:"deal_room_id and route_type are required"},400);
      return result("origin","platform_server_save_deal_origin",{p_tenant_id:tenantId,p_deal_room_id:d,p_actor_user_id:userId,p_route_type:routeType,p_source_person_id:id(body?.source_person_id)||null,p_intermediary_person_id:id(body?.intermediary_person_id)||null,p_origin_note:id(body?.origin_note)||null,p_originated_at:id(body?.originated_at)||null});
    }
    if(["deal_guardrails_save","deal_guardrails_approve","deal_guardrails_archive"].includes(action)){
      const d=dealId();if(!d)return json({error:"deal_room_id is required"},400);
      const data=action==="deal_guardrails_save"?await rpc("platform_server_save_deal_guardrails",{p_tenant_id:tenantId,p_deal_room_id:d,p_actor_user_id:userId,p_guardrails:obj(body?.guardrails)}):await rpc(action==="deal_guardrails_approve"?"platform_server_approve_deal_guardrails":"platform_server_archive_deal_guardrails",{p_tenant_id:tenantId,p_deal_room_id:d,p_actor_user_id:userId});
      return json({ok:true,tenant:workspace,guardrails:data});
    }
    if(action==="negotiation_next_step_prepare"){const d=dealId();if(!d)return json({error:"deal_room_id is required"},400);return result("proposal","platform_server_prepare_negotiation_next_step",{p_tenant_id:tenantId,p_deal_room_id:d,p_actor_user_id:userId});}
    if(action==="deal_step_prepare"){const d=dealId(),s=id(body?.step_type);if(!d||!s)return json({error:"deal_room_id and step_type are required"},400);return result("proposal","platform_server_prepare_deal_step",{p_tenant_id:tenantId,p_deal_room_id:d,p_step_type:s,p_actor_user_id:userId,p_input:obj(body?.input)});}
    if(action==="deal_next_move_prepare"){const d=dealId();if(!d)return json({error:"deal_room_id is required"},400);return result("proposal","platform_server_prepare_deal_next_move",{p_tenant_id:tenantId,p_deal_room_id:d,p_actor_user_id:userId,p_input:obj(body?.input)});}
    if(action==="deal_control_fix_prepare"){const d=dealId();if(!d)return json({error:"deal_room_id is required"},400);return result("proposal","platform_server_prepare_deal_control_fix",{p_tenant_id:tenantId,p_deal_room_id:d,p_actor_user_id:userId,p_input:obj(body?.input)});}

    if(["player_service_card","player_service_move_prepare","player_control_fix_prepare","player_owner_candidates","player_service_statement","player_value_proof","player_value_proof_history","player_value_proof_capture","player_value_proof_delta","player_review_pack","career_strategy","career_alignment","career_strategy_action_prepare","career_strategy_confirm","career_strategy_approve","career_strategy_archive"].includes(action)){
      const p=playerId();if(!p)return json({error:"player_id is required"},400);
      if(action==="player_review_pack"&&!operator()) return deny("Agency operator access required");
      if(action==="player_value_proof_delta") return result("delta","platform_server_player_value_proof_delta",{p_tenant_id:tenantId,p_player_id:p,p_from_snapshot_id:id(body?.from_snapshot_id)||null,p_to_snapshot_id:id(body?.to_snapshot_id)||null});
      if(action==="player_review_pack") return result("review_pack","platform_server_player_review_pack",{p_tenant_id:tenantId,p_player_id:p,p_proof_window_days:clamp(body?.proof_window_days,1,366,30),p_deadline_horizon_days:clamp(body?.deadline_horizon_days,1,366,90)});
      if(action==="player_service_card") return result("player_service","platform_server_player_service_card",{p_tenant_id:tenantId,p_player_id:p});
      if(action==="player_service_move_prepare") return result("proposal","platform_server_prepare_player_service_move",{p_tenant_id:tenantId,p_player_id:p,p_actor_user_id:userId});
      if(action==="player_control_fix_prepare") return result("proposal","platform_server_prepare_player_control_fix",{p_tenant_id:tenantId,p_player_id:p,p_actor_user_id:userId,p_input:obj(body?.input)});
      if(action==="player_owner_candidates") return result("owners","platform_server_player_owner_candidates",{p_tenant_id:tenantId,p_player_id:p,p_limit:clamp(body?.limit,1,25,10)});
      if(action==="player_service_statement") return result("statement","platform_server_player_service_statement",{p_tenant_id:tenantId,p_player_id:p});
      if(action==="player_value_proof") return result("value_proof","platform_server_player_value_proof",{p_tenant_id:tenantId,p_player_id:p,p_window_days:clamp(body?.window_days,1,366,30)});
      if(action==="player_value_proof_history") return result("history","platform_server_player_value_proof_history",{p_tenant_id:tenantId,p_player_id:p,p_limit:clamp(body?.limit,1,120,24)});
      if(action==="player_value_proof_capture") return result("result","platform_server_capture_player_value_proof",{p_tenant_id:tenantId,p_player_id:p,p_actor_user_id:userId,p_window_days:clamp(body?.window_days,1,366,30)});
      if(action==="career_strategy") return result("career_strategy","platform_server_player_career_strategy",{p_tenant_id:tenantId,p_player_id:p});
      if(action==="career_alignment") return result("career_alignment","platform_server_player_career_alignment",{p_tenant_id:tenantId,p_player_id:p});
      if(action==="career_strategy_action_prepare") return result("proposal","platform_server_prepare_career_strategy_action",{p_tenant_id:tenantId,p_player_id:p,p_actor_user_id:userId});
      if(action==="career_strategy_confirm"){const m=id(body?.confirmation_method);if(!m)return json({error:"confirmation_method is required"},400);return result("career_strategy","platform_server_confirm_player_career_strategy",{p_tenant_id:tenantId,p_player_id:p,p_actor_user_id:userId,p_method:m});}
      if(action==="career_strategy_approve") return result("career_strategy","platform_server_approve_player_career_strategy",{p_tenant_id:tenantId,p_player_id:p,p_actor_user_id:userId});
      return result("career_strategy","platform_server_archive_player_career_strategy",{p_tenant_id:tenantId,p_player_id:p,p_actor_user_id:userId});
    }
    if(action==="career_strategy_save"){
      const p=playerId(),review=id(body?.review_due_at);if(!p||!review)return json({error:"player_id and review_due_at are required"},400);
      return result("career_strategy","platform_server_save_player_career_strategy",{p_tenant_id:tenantId,p_player_id:p,p_actor_user_id:userId,p_strategy:obj(body?.strategy),p_review_due_at:review});
    }

    if(["career_pursuit_gate","career_exception","career_exception_save","career_exception_confirm","career_exception_approve","career_exception_withdraw"].includes(action)){
      const pm=matchId();if(!pm)return json({error:"player_match_id is required"},400);
      if(action==="career_pursuit_gate") return result("gate","platform_server_career_pursuit_gate",{p_tenant_id:tenantId,p_player_match_id:pm});
      if(action==="career_exception") return result("exception","platform_server_career_exception",{p_tenant_id:tenantId,p_player_match_id:pm});
      if(action==="career_exception_save"){const reason=id(body?.reason);if(!reason)return json({error:"reason is required"},400);return result("exception","platform_server_save_career_exception",{p_tenant_id:tenantId,p_player_match_id:pm,p_actor_user_id:userId,p_reason:reason,p_tradeoff_acknowledgement:id(body?.tradeoff_acknowledgement)||null,p_expires_at:id(body?.expires_at)||null});}
      if(action==="career_exception_confirm"){const method=id(body?.confirmation_method);if(!method)return json({error:"confirmation_method is required"},400);return result("exception","platform_server_confirm_career_exception",{p_tenant_id:tenantId,p_player_match_id:pm,p_actor_user_id:userId,p_confirmation_method:method});}
      if(action==="career_exception_approve"){if(!ownerAdmin())return deny("Owner or admin access required");return result("exception","platform_server_approve_career_exception",{p_tenant_id:tenantId,p_player_match_id:pm,p_actor_user_id:userId,p_decision_note:id(body?.decision_note)||null});}
      return result("exception","platform_server_withdraw_career_exception",{p_tenant_id:tenantId,p_player_match_id:pm,p_actor_user_id:userId,p_reason:id(body?.reason)||null});
    }

    if(action==="command_access"){const c=id(body?.command_id);if(!c)return json({error:"command_id is required"},400);return result("access","platform_server_command_access_context",{p_tenant_id:tenantId,p_command_id:c,p_limit:clamp(body?.limit,1,5,3)});}
    if(action==="pursuit_readiness"){const c=id(body?.club_need_id),p=playerId();if(!c||!p)return json({error:"club_need_id and player_id are required"},400);return result("pursuit","platform_server_pursuit_readiness",{p_tenant_id:tenantId,p_club_need_id:c,p_player_id:p});}
    if(action==="play_prepare"){const p=id(body?.play_id);if(!p)return json({error:"play_id is required"},400);return result("proposal","platform_server_prepare_play_action",{p_tenant_id:tenantId,p_play_id:p,p_actor_user_id:userId,p_input:obj(body?.input)});}

    if(action==="feedback"){
      const ft=String(body?.feedback_type||"").toLowerCase();if(!feedbackTypes.has(ft))return json({error:"Invalid feedback_type"},400);
      const c=id(body?.command_id),ct=id(body?.command_type),st=id(body?.source_type);if(!c||!ct||!st)return json({error:"command_id, command_type and source_type are required"},400);
      let su:string|null=null;if(ft==="snoozed"){const parsed=new Date(String(body?.snoozed_until||""));if(Number.isNaN(parsed.getTime())||parsed.getTime()<=Date.now())return json({error:"Future snoozed_until is required"},400);su=parsed.toISOString();}
      return json({ok:true,result:await rpc("platform_server_record_command_feedback",{p_tenant_id:tenantId,p_command_id:c,p_command_type:ct,p_source_type:st,p_source_id:body?.source_id?String(body.source_id):null,p_feedback_type:ft,p_actor_user_id:userId,p_snoozed_until:su,p_reason:body?.reason?String(body.reason).slice(0,1000):null,p_metadata:obj(body?.metadata)})});
    }
    if(action==="action_prepare"){const c=id(body?.command_id);if(!c)return json({error:"command_id is required"},400);return json({ok:true,proposal:await rpc("platform_server_prepare_command_action",{p_tenant_id:tenantId,p_command_id:c,p_actor_user_id:userId,p_input:obj(body?.input)})});}
    if(action==="action_execute"||action==="action_undo"){
      const p=id(body?.proposal_id);if(!p)return json({error:"proposal_id is required"},400);
      return json({ok:true,result:await rpc(action==="action_execute"?"platform_server_execute_agency_action_for_tenant":"platform_server_undo_agency_action_for_tenant",{p_tenant_id:tenantId,p_proposal_id:p,p_actor_user_id:userId})});
    }
    if(action==="action_history") return json({ok:true,actions:await rpc("platform_server_action_history",{p_tenant_id:tenantId,p_actor_user_id:userId,p_limit:clamp(body?.limit,1,100,20)})});
    if(action==="refresh_demo"){
      if(!ownerAdmin()) return deny("Owner or admin access required");
      if(!Boolean(workspace.synthetic_demo)) return json({error:"Demo refresh is only available for synthetic demo tenants"},403);
      const data=await rpc("platform_server_seed_demo_story",{p_tenant_id:tenantId});await rpc("platform_server_reconcile_commitments",{p_tenant_id:tenantId});await rpc("platform_server_refresh_agency_pulse",{p_tenant_id:tenantId});return json({ok:true,result:data});
    }
    return json({error:"Unknown action"},400);
  }catch(error){console.error("agency-os",error);return json({error:error instanceof Error?error.message:"Agency OS request failed"},500);}
}};
