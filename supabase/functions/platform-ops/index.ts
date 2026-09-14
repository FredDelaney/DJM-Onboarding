import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseContext } from "npm:@supabase/server@1.6.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clamp=(v:unknown,min:number,max:number,fallback:number)=>Math.max(min,Math.min(max,Number(v??fallback)||fallback));
const text=(v:unknown)=>typeof v==="string"?v.trim():"";
const obj=(v:unknown)=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};

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
    const action=text(body?.action).toLowerCase()||"portfolio";
    const rpc=async(name:string,args:Record<string,unknown>={})=>{const {data,error}=await ctx.supabaseAdmin.rpc(name,args);if(error) throw error;return data;};

    if(action==="portfolio"){
      return json({ok:true,platform_role:adminRecord.role,portfolio:await rpc("platform_server_operator_portfolio")});
    }

    if(action==="plans"){
      const {data,error}=await ctx.supabaseAdmin.schema("platform").from("plan_catalog")
        .select("plan_key,display_name,rank,status,customer_segment,limits,metadata,monthly_price_cents,price_currency,price_is_from")
        .eq("status","active").order("rank",{ascending:true});
      if(error) throw error;
      return json({ok:true,platform_role:adminRecord.role,plans:data||[]});
    }

    if(action==="create_customer"){
      const slug=text(body?.slug).toLowerCase();
      const displayName=text(body?.display_name);
      const planKey=text(body?.plan_key).toLowerCase();
      const ownerEmail=text(body?.owner_email).toLowerCase();
      if(!slug||!displayName||!planKey) return json({error:"slug, display_name and plan_key are required"},400);

      let ownerUserId:string|null=null;
      if(ownerEmail){
        const existing=await rpc("platform_server_find_auth_user_by_email",{p_email:ownerEmail});
        ownerUserId=existing?String(existing):null;
      }

      const stage=text(body?.stage).toLowerCase()||"onboarding";
      const hostname=text(body?.hostname).toLowerCase()||null;
      const domainType=text(body?.domain_type).toLowerCase()||(hostname?"custom":"platform_subdomain");
      const billingMode=text(body?.billing_mode).toLowerCase()||"manual";
      const branding=obj(body?.branding);
      const settings=obj(body?.settings);
      const metadata={...obj(body?.metadata),created_from:"platform_ops",operator_user_id:userId};

      const customer=await rpc("platform_server_provision_customer",{
        p_slug:slug,
        p_display_name:displayName,
        p_plan_key:planKey,
        p_hostname:hostname,
        p_domain_type:domainType,
        p_tenant_type:text(body?.tenant_type).toLowerCase()||"agency",
        p_legal_name:text(body?.legal_name)||null,
        p_billing_mode:billingMode,
        p_owner_user_id:ownerUserId,
        p_branding:branding,
        p_settings:settings,
        p_metadata:metadata,
        p_actor_user_id:userId,
        p_customer_stage:stage,
        p_trial_days:clamp(body?.trial_days,1,90,14),
        p_owner_contact_email:ownerEmail||null
      });

      const tenantId=String(customer?.tenant_id||"");
      if(tenantId){
        const lifecycleUpdates:Record<string,unknown>={p_tenant_id:tenantId,p_actor_user_id:userId};
        if(body?.contracted_monthly_cents!==undefined) lifecycleUpdates.p_contracted_monthly_cents=Number(body.contracted_monthly_cents);
        if(text(body?.contract_currency)) lifecycleUpdates.p_contract_currency=text(body.contract_currency).toUpperCase();
        if(typeof body?.annual_commitment==="boolean") lifecycleUpdates.p_annual_commitment=body.annual_commitment;
        if(text(body?.account_owner_name)) lifecycleUpdates.p_account_owner_name=text(body.account_owner_name);
        if(Object.keys(lifecycleUpdates).length>2) await rpc("platform_server_operator_update_customer",lifecycleUpdates);
      }

      return json({
        ok:true,
        platform_role:adminRecord.role,
        customer,
        owner:{email:ownerEmail||null,user_id:ownerUserId,attached:Boolean(ownerUserId),invite_required:Boolean(ownerEmail&&!ownerUserId)},
        next_action:ownerEmail&&!ownerUserId?"Verify the customer hostname, then invite the owner from the operator console.":"Continue onboarding."
      },201);
    }

    if(action==="customer_detail"){
      const tenantId=text(body?.tenant_id);
      if(!tenantId) return json({error:"tenant_id is required"},400);
      const [tenantQ,brandingQ,lifecycleQ,planQ,domainsQ,tasksQ,membersQ,entitlementsQ,auditQ]=await Promise.all([
        ctx.supabaseAdmin.schema("platform").from("tenants").select("id,slug,tenant_type,status,legal_name,metadata,created_at,updated_at").eq("id",tenantId).maybeSingle(),
        ctx.supabaseAdmin.schema("platform").from("tenant_branding").select("*").eq("tenant_id",tenantId).maybeSingle(),
        ctx.supabaseAdmin.schema("platform").from("tenant_customer_lifecycle").select("*").eq("tenant_id",tenantId).maybeSingle(),
        ctx.supabaseAdmin.schema("platform").from("tenant_plan_assignments").select("plan_key,status,billing_mode,effective_from,effective_until,configuration").eq("tenant_id",tenantId).in("status",["trialing","active"]).order("effective_from",{ascending:false}).limit(1).maybeSingle(),
        ctx.supabaseAdmin.schema("platform").from("tenant_domains").select("id,hostname,domain_type,status,is_primary,verified_at,created_at").eq("tenant_id",tenantId).order("created_at",{ascending:true}),
        ctx.supabaseAdmin.schema("platform").from("tenant_onboarding_tasks").select("task_key,category,title,description,status,required,sort_order,blocked_reason,completed_at").eq("tenant_id",tenantId).order("sort_order",{ascending:true}),
        ctx.supabaseAdmin.schema("platform").from("tenant_memberships").select("user_id,role,status,is_primary,joined_at").eq("tenant_id",tenantId).order("joined_at",{ascending:true}),
        ctx.supabaseAdmin.schema("platform").from("tenant_entitlements").select("feature_key,enabled,source,configuration,valid_from,valid_until,updated_at").eq("tenant_id",tenantId).order("feature_key",{ascending:true}),
        ctx.supabaseAdmin.schema("platform").from("audit_events").select("id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state,metadata,occurred_at").eq("tenant_id",tenantId).order("occurred_at",{ascending:false}).limit(50)
      ]);
      const firstError=[tenantQ,brandingQ,lifecycleQ,planQ,domainsQ,tasksQ,membersQ,entitlementsQ,auditQ].find((q:any)=>q.error)?.error;
      if(firstError) throw firstError;
      if(!tenantQ.data) return json({error:"Customer not found"},404);
      return json({ok:true,platform_role:adminRecord.role,customer:{tenant:tenantQ.data,branding:brandingQ.data,lifecycle:lifecycleQ.data,plan:planQ.data,domains:domainsQ.data||[],onboarding_tasks:tasksQ.data||[],memberships:membersQ.data||[],feature_overrides:entitlementsQ.data||[],audit:auditQ.data||[]}});
    }

    if(action==="update_customer"){
      const tenantId=text(body?.tenant_id);
      if(!tenantId) return json({error:"tenant_id is required"},400);
      const updated=await rpc("platform_server_operator_update_customer",{
        p_tenant_id:tenantId,
        p_actor_user_id:userId,
        p_plan_key:text(body?.plan_key).toLowerCase()||null,
        p_stage:text(body?.stage).toLowerCase()||null,
        p_tenant_status:text(body?.tenant_status).toLowerCase()||null,
        p_onboarding_status:text(body?.onboarding_status).toLowerCase()||null,
        p_contracted_monthly_cents:body?.contracted_monthly_cents===undefined?null:Number(body.contracted_monthly_cents),
        p_contract_currency:text(body?.contract_currency).toUpperCase()||null,
        p_annual_commitment:typeof body?.annual_commitment==="boolean"?body.annual_commitment:null,
        p_owner_contact_email:text(body?.owner_contact_email).toLowerCase()||null,
        p_account_owner_name:text(body?.account_owner_name)||null,
        p_notes:body?.notes===undefined?null:String(body.notes)
      });
      return json({ok:true,platform_role:adminRecord.role,customer:updated});
    }

    if(action==="set_feature"){
      const tenantId=text(body?.tenant_id);const featureKey=text(body?.feature_key);
      if(!tenantId||!featureKey||typeof body?.enabled!=="boolean") return json({error:"tenant_id, feature_key and boolean enabled are required"},400);
      return json({ok:true,platform_role:adminRecord.role,feature:await rpc("platform_server_operator_set_feature",{p_tenant_id:tenantId,p_feature_key:featureKey,p_enabled:body.enabled,p_actor_user_id:userId,p_reason:text(body?.reason)||null})});
    }

    if(action==="update_branding"){
      const tenantId=text(body?.tenant_id);if(!tenantId) return json({error:"tenant_id is required"},400);
      return json({ok:true,platform_role:adminRecord.role,branding:await rpc("platform_server_operator_update_branding",{p_tenant_id:tenantId,p_actor_user_id:userId,p_branding:obj(body?.branding)})});
    }

    if(action==="attach_owner_by_email"){
      const tenantId=text(body?.tenant_id);const email=text(body?.email).toLowerCase();
      if(!tenantId||!email) return json({error:"tenant_id and email are required"},400);
      const existing=await rpc("platform_server_find_auth_user_by_email",{p_email:email});
      if(!existing) return json({error:"No account exists for this email yet","owner_invite_required":true,email},409);
      return json({ok:true,platform_role:adminRecord.role,owner:await rpc("platform_server_operator_attach_owner",{p_tenant_id:tenantId,p_user_id:String(existing),p_actor_user_id:userId})});
    }

    if(action==="set_onboarding_task"){
      const tenantId=text(body?.tenant_id);const taskKey=text(body?.task_key);const status=text(body?.status).toLowerCase();
      if(!tenantId||!taskKey||!status) return json({error:"tenant_id, task_key and status are required"},400);
      return json({ok:true,platform_role:adminRecord.role,onboarding:await rpc("platform_server_operator_set_onboarding_task",{p_tenant_id:tenantId,p_task_key:taskKey,p_status:status,p_actor_user_id:userId,p_blocked_reason:text(body?.blocked_reason)||null})});
    }

    return json({error:"Unknown action"},400);
  }catch(error){
    console.error("platform-ops",error);
    return json({error:error instanceof Error?error.message:"Platform operations request failed"},500);
  }
}};
