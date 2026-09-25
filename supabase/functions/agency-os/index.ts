import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseContext } from "npm:@supabase/server@1.6.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const id=(v:unknown)=>String(v??"").trim();
const obj=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const clamp=(v:unknown,min:number,max:number,fallback:number)=>Math.max(min,Math.min(max,Number(v??fallback)||fallback));
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
