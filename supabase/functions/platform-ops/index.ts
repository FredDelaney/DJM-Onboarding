import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createSupabaseContext } from "npm:@supabase/server@1.6.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const clamp=(v:unknown,min:number,max:number,fallback:number)=>Math.max(min,Math.min(max,Number(v??fallback)||fallback));
const text=(v:unknown)=>typeof v==="string"?v.trim():"";
const obj=(v:unknown)=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeHtml=(value:unknown)=>String(value??"")
  .replace(/&/g,"&amp;")
  .replace(/</g,"&lt;")
  .replace(/>/g,"&gt;")
  .replace(/"/g,"&quot;")
  .replace(/'/g,"&#039;");
const safeColour=(value:unknown,fallback:string)=>{
  const candidate=text(value);
  return /^#[0-9a-f]{6}$/i.test(candidate)?candidate.toUpperCase():fallback;
};
const safeBaseUrl=(value:unknown)=>{
  try{
    const parsed=new URL(text(value));
    if(parsed.protocol!=="https:"&&!(parsed.protocol==="http:"&&["localhost","127.0.0.1"].includes(parsed.hostname))) return null;
    parsed.pathname="";
    parsed.search="";
    parsed.hash="";
    return parsed.toString().replace(/\/$/,"");
  }catch{
    return null;
  }
};

type Rpc=(name:string,args?:Record<string,unknown>)=>Promise<any>;

type DomainProviderConfig={
  token:string;
  teamId:string;
  projectId:string;
  baseDomain:string;
  platformDomainReady:boolean;
};

const env=(name:string)=>text(Deno.env.get(name));
const providerConfig=():DomainProviderConfig=>{
  const token=env("REDREAM_VERCEL_TOKEN")||env("VERCEL_TOKEN");
  const teamId=env("REDREAM_VERCEL_TEAM_ID");
  const projectId=env("REDREAM_VERCEL_PROJECT_ID");
  const baseDomain=env("REDREAM_TENANT_DOMAIN_BASE").toLowerCase();
  const platformDomainReady=Boolean(baseDomain)&&env("REDREAM_TENANT_DOMAIN_READY").toLowerCase()==="true";
  return {token,teamId,projectId,baseDomain,platformDomainReady};
};
const providerConfigured=(config:DomainProviderConfig)=>Boolean(config.token&&config.teamId&&config.projectId);

const verificationChallenges=(value:unknown)=>{
  if(!Array.isArray(value)) return [];
  return value.map((item)=>{
    const row=obj(item);
    return {
      type:text(row.type),
      domain:text(row.domain),
      value:text(row.value),
      reason:text(row.reason),
    };
  }).filter((item)=>item.type&&item.domain&&item.value);
};

const providerSnapshot=(value:unknown)=>{
  const row=obj(value);
  return {
    name:text(row.name)||null,
    apex_name:text(row.apexName)||null,
    verified:row.verified===true,
    verification:verificationChallenges(row.verification),
    redirect:text(row.redirect)||null,
    redirect_status_code:typeof row.redirectStatusCode==="number"?row.redirectStatusCode:null,
    updated_at:typeof row.updatedAt==="number"?row.updatedAt:null,
    created_at:typeof row.createdAt==="number"?row.createdAt:null,
  };
};

const providerDnsSnapshot=(value:unknown)=>{
  const row=obj(value);
  const cname=Array.isArray(row.recommendedCNAME)?row.recommendedCNAME.map((item)=>obj(item)).map((item)=>({
    rank:Number(item.rank||0),
    value:text(item.value),
  })).filter((item)=>item.rank>0&&item.value):[];
  const ipv4=Array.isArray(row.recommendedIPv4)?row.recommendedIPv4.map((item)=>obj(item)).map((item)=>({
    rank:Number(item.rank||0),
    value:Array.isArray(item.value)?item.value.map((entry)=>text(entry)).filter(Boolean):[],
  })).filter((item)=>item.rank>0&&item.value.length):[];
  return {
    configured_by:text(row.configuredBy)||null,
    misconfigured:row.misconfigured===true,
    accepted_challenges:Array.isArray(row.acceptedChallenges)?row.acceptedChallenges.map((entry)=>text(entry)).filter(Boolean):[],
    recommended_cname:cname,
    recommended_ipv4:ipv4,
  };
};

const providerError=(value:unknown,status:number)=>{
  const row=obj(value);
  const nested=obj(row.error);
  return {
    status_code:status,
    code:text(row.code)||text(nested.code)||null,
    message:text(row.message)||text(nested.message)||"Domain provider request failed",
  };
};

const vercelRequest=async(
  config:DomainProviderConfig,
  method:string,
  path:string,
  body?:Record<string,unknown>,
)=>{
  if(!providerConfigured(config)) return {ok:false,status:503,data:{message:"Domain provider is not configured"}};
  const separator=path.includes("?")?"&":"?";
  const url=`https://api.vercel.com${path}${separator}teamId=${encodeURIComponent(config.teamId)}`;
  const response=await fetch(url,{
    method,
    headers:{
      "Authorization":`Bearer ${config.token}`,
      "Content-Type":"application/json",
    },
    body:body?JSON.stringify(body):undefined,
  });
  const data=await response.json().catch(()=>({message:`Vercel returned HTTP ${response.status}`}));
  return {ok:response.ok,status:response.status,data};
};

const domainDnsState=async(config:DomainProviderConfig,hostname:string)=>{
  const result=await vercelRequest(
    config,
    "GET",
    `/v6/domains/${encodeURIComponent(hostname)}/config?projectIdOrName=${encodeURIComponent(config.projectId)}&strict=true`,
  );
  if(!result.ok){
    return {ok:false,dns:null,error:providerError(result.data,result.status)};
  }
  return {ok:true,dns:providerDnsSnapshot(result.data),error:null};
};

const dnsInstructions=(hostname:string,project:any,dns:any)=>{
  const records:Array<Record<string,unknown>>=[];
  for(const challenge of Array.isArray(project?.verification)?project.verification:[]){
    if(challenge?.type&&challenge?.domain&&challenge?.value){
      records.push({purpose:"ownership",type:String(challenge.type),name:String(challenge.domain),value:String(challenge.value)});
    }
  }
  if(dns?.misconfigured===true){
    const apex=String(project?.apex_name||"").toLowerCase();
    const normalized=hostname.toLowerCase();
    if(apex&&normalized===apex){
      const preferred=(Array.isArray(dns?.recommended_ipv4)?dns.recommended_ipv4:[]).sort((a:any,b:any)=>Number(a.rank||99)-Number(b.rank||99))[0];
      const ip=Array.isArray(preferred?.value)?String(preferred.value[0]||""):"";
      if(ip) records.push({purpose:"routing",type:"A",name:hostname,value:ip});
    }else{
      const preferred=(Array.isArray(dns?.recommended_cname)?dns.recommended_cname:[]).sort((a:any,b:any)=>Number(a.rank||99)-Number(b.rank||99))[0];
      const target=String(preferred?.value||"");
      if(target) records.push({purpose:"routing",type:"CNAME",name:hostname,value:target});
    }
  }
  return records;
};

const findDomain=(control:any,domainId:string)=>{
  const domains=Array.isArray(control?.domains)?control.domains:[];
  return domains.find((domain:any)=>String(domain?.id||"")===domainId)||null;
};

const providerManagedDomain=(domain:any)=>{
  const metadata=obj(domain?.metadata);
  return text(metadata.provider).toLowerCase()==="vercel"
    || text(metadata.created_from).toLowerCase()==="platform_ops";
};

const recordProviderState=async(
  rpc:Rpc,
  domainId:string,
  status:"pending"|"verifying"|"verified"|"disabled",
  providerState:Record<string,unknown>,
  actorUserId:string,
)=>rpc("platform_server_operator_record_domain_provider_state",{
  p_domain_id:domainId,
  p_status:status,
  p_provider_state:providerState,
  p_actor_user_id:actorUserId,
});

const addCustomDomainToProvider=async(
  rpc:Rpc,
  config:DomainProviderConfig,
  tenantId:string,
  hostname:string,
  actorUserId:string,
)=>{
  const domain=await rpc("platform_server_operator_add_custom_domain",{
    p_tenant_id:tenantId,
    p_hostname:hostname,
    p_actor_user_id:actorUserId,
    p_reserved_base_domain:config.baseDomain||"redreamsystems.com",
  });
  const domainId=String(domain?.id||"");
  const normalizedHostname=String(domain?.hostname||hostname).toLowerCase();
  if(!uuid.test(domainId)) throw new Error("Custom domain reservation failed");

  let provider=await vercelRequest(
    config,
    "POST",
    `/v10/projects/${encodeURIComponent(config.projectId)}/domains`,
    {name:normalizedHostname},
  );

  if(!provider.ok&&provider.status===400){
    const existing=await vercelRequest(
      config,
      "GET",
      `/v9/projects/${encodeURIComponent(config.projectId)}/domains/${encodeURIComponent(normalizedHostname)}`,
    );
    if(existing.ok) provider=existing;
  }

  if(!provider.ok){
    const failure=providerError(provider.data,provider.status);
    const recorded=await recordProviderState(rpc,domainId,"pending",{
      phase:"add_to_project",
      provider_error:failure,
    },actorUserId);
    return {ok:false,status:provider.status===409?409:422,domain:recorded,provider_error:failure};
  }

  const snapshot=providerSnapshot(provider.data);
  const dnsState=await domainDnsState(config,normalizedHostname);
  const dns=dnsState.dns;
  const verified=snapshot.verified===true&&dnsState.ok&&dns?.misconfigured===false;
  const nextStatus=verified?"verified":"verifying";
  const instructions=dnsInstructions(normalizedHostname,snapshot,dns);
  const recorded=await recordProviderState(rpc,domainId,nextStatus,{
    phase:"project_domain",
    project:snapshot,
    dns,
    dns_error:dnsState.error,
    dns_records:instructions,
  },actorUserId);

  return {ok:true,status:200,verified,domain:recorded,provider:{...snapshot,dns,dns_records:instructions}};
};

export default {fetch:async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  const {data:ctx,error:contextError}=await createSupabaseContext(req,{auth:"user"});
  if(contextError||!ctx) return json({error:contextError?.message||"Unauthorized"},contextError?.status||401);

  try{
    const claims=(ctx.userClaims||{}) as Record<string,unknown>;
    const userId=String(claims.id||claims.sub||"");
    if(!userId) return json({error:"Authenticated user identity missing"},401);

    const rpc:Rpc=async(name,args={})=>{const {data,error}=await ctx.supabaseAdmin.rpc(name,args);if(error) throw error;return data;};
    const adminRecord=await rpc("platform_server_operator_access",{p_user_id:userId});
    if(!adminRecord) return json({error:"Platform operator access required"},403);

    const body=await req.json().catch(()=>({}));
    const action=text(body?.action).toLowerCase()||"portfolio";
    const domainConfig=providerConfig();

    if(action==="portfolio"){
      return json({ok:true,platform_role:adminRecord.role,portfolio:await rpc("platform_server_operator_portfolio")});
    }

    if(action==="plans"){
      return json({ok:true,platform_role:adminRecord.role,plans:await rpc("platform_server_operator_plans")||[]});
    }

    if(action==="demo_requests"){
      const rows=await rpc(
        "platform_server_operator_demo_requests",
        {p_limit:clamp(body?.limit,1,100,50)},
      );
      return json({
        ok:true,
        platform_role:adminRecord.role,
        demo_requests:Array.isArray(rows)?rows:[],
      });
    }

    if(action==="funnel_summary"){
      return json({
        ok:true,
        platform_role:adminRecord.role,
        funnel_summary:await rpc(
          "platform_server_operator_funnel_summary",
          {p_days:clamp(body?.days,1,365,30)},
        ),
      });
    }

    if(action==="demo_request_update"){
      const requestId=text(body?.request_id);
      const status=text(body?.status).toLowerCase();
      const allowed=new Set(["contacted","qualified","converted","closed"]);
      if(!uuid.test(requestId)||!allowed.has(status)) return json({error:"Valid request_id and status are required"},400);

      const convertedTenantId=status==="converted"?text(body?.converted_tenant_id):null;
      if(status==="converted"&&!uuid.test(convertedTenantId)) return json({error:"converted_tenant_id is required when a demo request becomes a customer"},400);

      const updated=await rpc(
        "platform_server_operator_update_demo_request",
        {
          p_request_id:requestId,
          p_status:status,
          p_converted_tenant_id:convertedTenantId,
          p_actor_user_id:userId,
        },
      );

      return json({
        ok:true,
        platform_role:adminRecord.role,
        demo_request:updated,
      });
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
      const requestedCustomDomain=text(body?.hostname).toLowerCase()||null;
      const billingMode=text(body?.billing_mode).toLowerCase()||"manual";
      const branding=obj(body?.branding);
      const settings=obj(body?.settings);
      const metadata={...obj(body?.metadata),created_from:"platform_ops",operator_user_id:userId};

      const customer=await rpc("platform_server_provision_customer",{
        p_slug:slug,
        p_display_name:displayName,
        p_plan_key:planKey,
        p_hostname:null,
        p_domain_type:"platform_subdomain",
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

      let ownerInvite:unknown=null;
      if(tenantId&&ownerEmail&&!ownerUserId){
        ownerInvite=await rpc("platform_server_operator_create_owner_invite",{
          p_tenant_id:tenantId,
          p_email:ownerEmail,
          p_actor_user_id:userId,
          p_expires_hours:clamp(body?.owner_invite_hours,1,720,168)
        });
      }

      const domainSetup:Record<string,unknown>={
        default_address:{configured:false,status:"redream_domain_not_configured"},
        requested_custom_domain:null,
      };

      if(tenantId&&domainConfig.platformDomainReady){
        try{
          const platformDomain=await rpc("platform_server_operator_assign_platform_domain",{
            p_tenant_id:tenantId,
            p_base_domain:domainConfig.baseDomain,
            p_actor_user_id:userId,
          });
          domainSetup.default_address={configured:true,status:"verified",domain:platformDomain};
        }catch(domainError){
          const message=domainError instanceof Error?domainError.message:"Default workspace address could not be assigned";
          domainSetup.default_address={configured:false,status:"assignment_failed",message};
        }
      }

      if(tenantId&&requestedCustomDomain){
        if(!providerConfigured(domainConfig)){
          domainSetup.requested_custom_domain={
            hostname:requestedCustomDomain,
            configured:false,
            status:"provider_not_configured",
            message:"Custom domain setup is optional and can be completed later from Domain control.",
          };
        }else{
          try{
            domainSetup.requested_custom_domain=await addCustomDomainToProvider(
              rpc,domainConfig,tenantId,requestedCustomDomain,userId,
            );
          }catch(customError){
            domainSetup.requested_custom_domain={
              hostname:requestedCustomDomain,
              configured:false,
              status:"setup_failed",
              message:customError instanceof Error?customError.message:"Custom domain setup failed",
            };
          }
        }
      }

      const domainControl=tenantId?await rpc("platform_server_operator_domain_control",{p_tenant_id:tenantId}):null;

      return json({
        ok:true,
        platform_role:adminRecord.role,
        customer,
        owner:{email:ownerEmail||null,user_id:ownerUserId,attached:Boolean(ownerUserId),invite_required:Boolean(ownerEmail&&!ownerUserId),invite:ownerInvite},
        domain_setup:domainSetup,
        domain_control:domainControl,
        next_action:ownerInvite?"Send the owner invitation and continue onboarding.":"Continue onboarding."
      },201);
    }

    if(action==="customer_detail"){
      const tenantId=text(body?.tenant_id);
      if(!tenantId) return json({error:"tenant_id is required"},400);
      const customer=await rpc("platform_server_operator_customer_detail",{p_tenant_id:tenantId});
      if(!customer) return json({error:"Customer not found"},404);
      const renewalAttention=await rpc("platform_server_customer_attention_with_renewal",{p_tenant_id:tenantId});
      const domainControl=await rpc("platform_server_operator_domain_control",{p_tenant_id:tenantId});
      const customerRecord=obj(customer);
      const existingSurface=obj(customerRecord.action_surface);
      const renewalSurface=String(obj(renewalAttention).source||"")==="renewal"
        ? {
            ...existingSurface,
            attention_action:{
              key:"open_renewal",
              label:"Review renewal",
              mode:"focus",
              target:"commercial-control"
            }
          }
        : existingSurface;
      return json({
        ok:true,
        platform_role:adminRecord.role,
        customer:{
          ...customerRecord,
          attention:renewalAttention,
          action_surface:renewalSurface,
          domain_control:domainControl
        }
      });
    }

    if(action==="domain_control"){
      const tenantId=text(body?.tenant_id);
      if(!uuid.test(tenantId)) return json({error:"Valid tenant_id is required"},400);
      const control=await rpc("platform_server_operator_domain_control",{p_tenant_id:tenantId});
      return json({
        ok:true,
        platform_role:adminRecord.role,
        domain_control:control,
        infrastructure:{
          provider_configured:providerConfigured(domainConfig),
          redream_domain_configured:domainConfig.platformDomainReady,
          base_domain:domainConfig.baseDomain||null,
          provider_project_id:domainConfig.projectId||null,
        },
      });
    }

    if(action==="assign_platform_domain"){
      const tenantId=text(body?.tenant_id);
      if(!uuid.test(tenantId)) return json({error:"Valid tenant_id is required"},400);
      if(!domainConfig.platformDomainReady) return json({error:"ReDream managed domain infrastructure is not configured",code:"redream_domain_not_configured"},503);
      const domain=await rpc("platform_server_operator_assign_platform_domain",{
        p_tenant_id:tenantId,
        p_base_domain:domainConfig.baseDomain,
        p_actor_user_id:userId,
      });
      return json({ok:true,platform_role:adminRecord.role,domain,domain_control:await rpc("platform_server_operator_domain_control",{p_tenant_id:tenantId})});
    }

    if(action==="add_custom_domain"){
      const tenantId=text(body?.tenant_id);
      const hostname=text(body?.hostname).toLowerCase();
      if(!uuid.test(tenantId)||!hostname) return json({error:"Valid tenant_id and hostname are required"},400);
      if(!providerConfigured(domainConfig)) return json({error:"Custom domain provider is not configured",code:"domain_provider_not_configured"},503);

      const result=await addCustomDomainToProvider(rpc,domainConfig,tenantId,hostname,userId);
      const control=await rpc("platform_server_operator_domain_control",{p_tenant_id:tenantId});
      if(!result.ok) return json({error:"Custom domain could not be attached to the hosting project",...result,domain_control:control},result.status);
      return json({ok:true,platform_role:adminRecord.role,...result,domain_control:control});
    }

    if(action==="refresh_custom_domain"){
      const tenantId=text(body?.tenant_id);
      const domainId=text(body?.domain_id);
      if(!uuid.test(tenantId)||!uuid.test(domainId)) return json({error:"Valid tenant_id and domain_id are required"},400);
      if(!providerConfigured(domainConfig)) return json({error:"Custom domain provider is not configured",code:"domain_provider_not_configured"},503);

      const control=await rpc("platform_server_operator_domain_control",{p_tenant_id:tenantId});
      const domain=findDomain(control,domainId);
      if(!domain||String(domain.domain_type)!=="custom") return json({error:"Custom domain not found"},404);
      if(!providerManagedDomain(domain)) return json({
        error:"Existing workspace domains cannot be managed through ReDream provider controls",
        code:"custom_domain_not_provider_managed",
      },409);
      const hostname=String(domain.hostname||"").toLowerCase();
      if(!hostname) return json({error:"Custom domain hostname is missing"},409);

      let provider=await vercelRequest(
        domainConfig,
        "POST",
        `/v9/projects/${encodeURIComponent(domainConfig.projectId)}/domains/${encodeURIComponent(hostname)}/verify`,
      );
      if(!provider.ok){
        const current=await vercelRequest(
          domainConfig,
          "GET",
          `/v9/projects/${encodeURIComponent(domainConfig.projectId)}/domains/${encodeURIComponent(hostname)}`,
        );
        if(current.ok) provider=current;
      }

      if(!provider.ok){
        const failure=providerError(provider.data,provider.status);
        const recorded=await recordProviderState(rpc,domainId,"verifying",{
          phase:"verification_check",
          provider_error:failure,
        },userId);
        return json({
          error:"Custom domain is not verified yet",
          code:"domain_not_verified",
          domain:recorded,
          provider_error:failure,
          domain_control:await rpc("platform_server_operator_domain_control",{p_tenant_id:tenantId}),
        },409);
      }

      const snapshot=providerSnapshot(provider.data);
      const dnsState=await domainDnsState(domainConfig,hostname);
      const dns=dnsState.dns;
      const verified=snapshot.verified===true&&dnsState.ok&&dns?.misconfigured===false;
      const nextStatus=verified?"verified":"verifying";
      const instructions=dnsInstructions(hostname,snapshot,dns);
      const recorded=await recordProviderState(rpc,domainId,nextStatus,{
        phase:"verification_check",
        project:snapshot,
        dns,
        dns_error:dnsState.error,
        dns_records:instructions,
      },userId);

      return json({
        ok:true,
        platform_role:adminRecord.role,
        verified,
        domain:recorded,
        provider:{...snapshot,dns,dns_records:instructions},
        domain_control:await rpc("platform_server_operator_domain_control",{p_tenant_id:tenantId}),
      });
    }

    if(action==="set_primary_domain"){
      const tenantId=text(body?.tenant_id);
      const domainId=text(body?.domain_id);
      if(!uuid.test(tenantId)||!uuid.test(domainId)) return json({error:"Valid tenant_id and domain_id are required"},400);
      const domain=await rpc("platform_server_operator_set_primary_domain",{
        p_tenant_id:tenantId,
        p_domain_id:domainId,
        p_actor_user_id:userId,
      });
      return json({ok:true,platform_role:adminRecord.role,domain,domain_control:await rpc("platform_server_operator_domain_control",{p_tenant_id:tenantId})});
    }

    if(action==="disable_custom_domain"){
      const tenantId=text(body?.tenant_id);
      const domainId=text(body?.domain_id);
      if(!uuid.test(tenantId)||!uuid.test(domainId)) return json({error:"Valid tenant_id and domain_id are required"},400);

      const before=await rpc("platform_server_operator_domain_control",{p_tenant_id:tenantId});
      const target=findDomain(before,domainId);
      if(!target||String(target.domain_type)!=="custom") return json({error:"Custom domain not found"},404);
      if(!providerManagedDomain(target)) return json({
        error:"Existing workspace domains cannot be disconnected through ReDream domain control",
        code:"custom_domain_not_provider_managed",
      },409);
      const hostname=String(target.hostname||"").toLowerCase();

      const domain=await rpc("platform_server_operator_disable_custom_domain",{
        p_tenant_id:tenantId,
        p_domain_id:domainId,
        p_actor_user_id:userId,
      });

      let cleanupComplete=false;
      let cleanupError:Record<string,unknown>|null=null;
      if(providerConfigured(domainConfig)&&hostname){
        const projectRemoval=await vercelRequest(
          domainConfig,
          "DELETE",
          `/v9/projects/${encodeURIComponent(domainConfig.projectId)}/domains/${encodeURIComponent(hostname)}`,
        );
        const projectRemoved=projectRemoval.ok||projectRemoval.status===404;
        if(projectRemoved){
          const registryRemoval=await vercelRequest(
            domainConfig,
            "DELETE",
            `/v6/domains/${encodeURIComponent(hostname)}`,
          );
          cleanupComplete=registryRemoval.ok||registryRemoval.status===404;
          if(!cleanupComplete) cleanupError=providerError(registryRemoval.data,registryRemoval.status);
        }else{
          cleanupError=providerError(projectRemoval.data,projectRemoval.status);
        }

        await recordProviderState(rpc,domainId,"disabled",{
          phase:"provider_cleanup",
          project_removed:projectRemoved,
          cleanup_complete:cleanupComplete,
          provider_error:cleanupError,
        },userId);
      }

      return json({
        ok:true,
        platform_role:adminRecord.role,
        domain,
        provider_cleanup_complete:cleanupComplete,
        provider_cleanup_error:cleanupError,
        domain_control:await rpc("platform_server_operator_domain_control",{p_tenant_id:tenantId}),
      });
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

    if(action==="set_contract_term"){
      const tenantId=text(body?.tenant_id);
      if(!tenantId) return json({error:"tenant_id is required"},400);
      const rawTerm=body?.contract_term_ends_on;
      const term=rawTerm===null||rawTerm===""?null:text(rawTerm);
      const result=await rpc("platform_server_operator_set_contract_term",{
        p_tenant_id:tenantId,
        p_actor_user_id:userId,
        p_contract_term_ends_on:term
      });
      return json({ok:true,platform_role:adminRecord.role,result});
    }

    if(action==="set_customer_service_state"){
      const tenantId=text(body?.tenant_id);
      const state=text(body?.state).toLowerCase();
      const reason=text(body?.reason)||null;
      if(!tenantId||!state) return json({error:"tenant_id and state are required"},400);
      if(!["live","at_risk","paused","churned"].includes(state)) return json({error:"Invalid customer service state"},400);
      const result=await rpc("platform_server_operator_set_customer_service_state",{
        p_tenant_id:tenantId,
        p_actor_user_id:userId,
        p_state:state,
        p_reason:reason
      });
      return json({ok:true,platform_role:adminRecord.role,result});
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

    if(action==="update_privacy_profile"){
      const tenantId=text(body?.tenant_id);
      const controllerName=text(body?.controller_name);
      const noticeUrl=text(body?.privacy_notice_url);
      const noticeVersion=text(body?.notice_version);
      if(!tenantId||!controllerName||!noticeUrl||!noticeVersion) return json({error:"tenant_id, controller_name, privacy_notice_url and notice_version are required"},400);
      const privacy=await rpc("platform_server_operator_update_privacy_profile",{
        p_tenant_id:tenantId,
        p_actor_user_id:userId,
        p_controller_name:controllerName,
        p_privacy_contact_email:text(body?.privacy_contact_email).toLowerCase()||null,
        p_privacy_notice_url:noticeUrl,
        p_notice_version:noticeVersion,
        p_effective_at:text(body?.effective_at)||null
      });
      return json({ok:true,platform_role:adminRecord.role,privacy});
    }

    if(action==="attach_owner_by_email"){
      const tenantId=text(body?.tenant_id);const email=text(body?.email).toLowerCase();
      if(!tenantId||!email) return json({error:"tenant_id and email are required"},400);
      const existing=await rpc("platform_server_find_auth_user_by_email",{p_email:email});
      if(!existing) return json({error:"No account exists for this email yet",owner_invite_required:true,email},409);
      return json({ok:true,platform_role:adminRecord.role,owner:await rpc("platform_server_operator_attach_owner",{p_tenant_id:tenantId,p_user_id:String(existing),p_actor_user_id:userId})});
    }

    if(action==="owner_invite_email_status"){
      const config=obj(await rpc("platform_server_email_delivery_config"));
      const baseUrl=safeBaseUrl(config.app_base_url);
      const configured=Boolean(
        config.enabled===true&&
        text(config.provider).toLowerCase()==="resend"&&
        text(config.api_key)&&
        text(config.from_address)&&
        baseUrl
      );
      return json({
        ok:true,
        platform_role:adminRecord.role,
        email_delivery:{
          configured,
          enabled:config.enabled===true,
          provider:text(config.provider).toLowerCase()||null,
          from_address:text(config.from_address)||null,
          reply_to:text(config.reply_to)||null,
          app_base_url:baseUrl,
        },
      });
    }

    if(action==="send_owner_invite_email"){
      const tenantId=text(body?.tenant_id);
      const ownerEmail=text(body?.email).toLowerCase();
      if(!uuid.test(tenantId)||!emailPattern.test(ownerEmail)){
        return json({error:"Valid tenant_id and owner email are required"},400);
      }

      const config=obj(await rpc("platform_server_email_delivery_config"));
      const baseUrl=safeBaseUrl(config.app_base_url);
      const provider=text(config.provider).toLowerCase();
      const apiKey=text(config.api_key);
      const fromAddress=text(config.from_address);
      const replyTo=text(config.reply_to);

      if(
        config.enabled!==true||
        provider!=="resend"||
        !apiKey||
        !fromAddress||
        !baseUrl
      ){
        return json({
          error:"Owner invitation email delivery is not configured yet. Use the secure-link fallback.",
          code:"owner_invite_email_not_configured",
        },503);
      }

      const invite=await rpc("platform_server_operator_create_owner_invite",{
        p_tenant_id:tenantId,
        p_email:ownerEmail,
        p_actor_user_id:userId,
        p_expires_hours:clamp(body?.expires_hours,1,720,168),
      });

      const inviteId=String(invite?.invite_id||"");
      const token=text(invite?.token);
      const invitePath=text(invite?.invite_path);

      if(!uuid.test(inviteId)||!token||!invitePath){
        throw new Error("Secure owner invitation could not be created");
      }

      const preflight=obj(
        await rpc(
          "platform_server_public_owner_invite_preflight",
          {p_token:token},
        ),
      );
      const branding=obj(preflight.branding);
      const agencyName=
        text(branding.display_name)||
        text(invite?.agency_name)||
        "your agency";
      const portalName=
        text(branding.portal_name)||
        text(branding.short_name)||
        agencyName;
      const primary=safeColour(branding.primary_color,"#17131F");
      const secondary=safeColour(branding.secondary_color,"#FFFFFF");
      const accent=safeColour(branding.accent_color,"#7C6CF2");
      const inviteUrl=`${baseUrl}${invitePath}`;
      const expiresAt=text(invite?.expires_at);
      const expiresLabel=expiresAt
        ? new Intl.DateTimeFormat("en-GB",{
            day:"numeric",
            month:"short",
            year:"numeric",
            hour:"2-digit",
            minute:"2-digit",
            timeZone:"UTC",
          }).format(new Date(expiresAt))
        : "in seven days";
      const subject=`Activate your ${agencyName} owner workspace`;
      const intro=`${agencyName} has been set up on ReDream. Use this secure invitation to create or connect your owner account and continue the agency setup.`;
      const html=`<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#17131f"><div style="max-width:600px;margin:0 auto;padding:36px 18px"><div style="background:${escapeHtml(primary)};border-radius:20px;padding:30px;color:${escapeHtml(secondary)}"><div style="font-size:11px;letter-spacing:.12em;font-weight:700;color:${escapeHtml(accent)}">${escapeHtml(portalName.toUpperCase())}</div><h1 style="font-size:26px;line-height:1.2;margin:14px 0 10px">Your owner workspace is ready</h1><p style="font-size:15px;line-height:1.65;opacity:.86;margin:0 0 24px">${escapeHtml(intro)}</p><a href="${escapeHtml(inviteUrl)}" style="display:inline-block;background:${escapeHtml(accent)};color:${escapeHtml(primary)};text-decoration:none;font-weight:700;border-radius:10px;padding:13px 18px">Activate owner workspace</a><p style="font-size:12px;line-height:1.55;opacity:.62;margin:24px 0 0">This secure link expires ${escapeHtml(expiresLabel)} UTC. If you were not expecting this invitation, you can ignore this email.</p></div><p style="font-size:12px;line-height:1.6;color:#75707b;margin:18px 8px">ReDream Systems powers the agency operating workspace. This email does not create an account until the invitation is accepted.</p></div></body></html>`;

      const payload:Record<string,unknown>={
        from:fromAddress,
        to:[ownerEmail],
        subject,
        text:`${intro}\n\nActivate owner workspace: ${inviteUrl}\n\nThis secure link expires ${expiresLabel} UTC. If you were not expecting this invitation, ignore this email.`,
        html,
      };
      if(emailPattern.test(replyTo)) payload.reply_to=replyTo;

      const response=await fetch("https://api.resend.com/emails",{
        method:"POST",
        headers:{
          Authorization:`Bearer ${apiKey}`,
          "Content-Type":"application/json",
        },
        body:JSON.stringify(payload),
      });

      const responseBody=await response.json().catch(()=>({}));
      if(!response.ok){
        try{
          await rpc("platform_server_operator_revoke_owner_invite",{
            p_invite_id:inviteId,
            p_actor_user_id:userId,
          });
        }catch(revokeError){
          console.error("owner invite delivery cleanup failed",revokeError);
        }
        console.error("owner invite email provider",response.status,responseBody);
        return json({
          error:"Owner invitation email could not be sent. No invitation was left active.",
          code:"owner_invite_email_delivery_failed",
        },502);
      }

      const sent=await rpc("platform_server_operator_mark_owner_invite_sent",{
        p_invite_id:inviteId,
        p_actor_user_id:userId,
        p_channel:"email",
      });

      return json({
        ok:true,
        platform_role:adminRecord.role,
        invite:{
          invite_id:inviteId,
          tenant_id:tenantId,
          email:ownerEmail,
          expires_at:invite?.expires_at||null,
          invite_path:invitePath,
        },
        delivery:{
          provider:"resend",
          status:"accepted",
          provider_message_id:text(responseBody?.id)||null,
          sent,
        },
      });
    }

    if(action==="create_owner_invite"){
      const tenantId=text(body?.tenant_id);const email=text(body?.email).toLowerCase();
      if(!tenantId||!email) return json({error:"tenant_id and email are required"},400);
      const invite=await rpc("platform_server_operator_create_owner_invite",{
        p_tenant_id:tenantId,
        p_email:email,
        p_actor_user_id:userId,
        p_expires_hours:clamp(body?.expires_hours,1,720,168)
      });
      return json({ok:true,platform_role:adminRecord.role,invite});
    }

    if(action==="revoke_owner_invite"){
      const inviteId=text(body?.invite_id);
      if(!inviteId) return json({error:"invite_id is required"},400);
      const invite=await rpc("platform_server_operator_revoke_owner_invite",{p_invite_id:inviteId,p_actor_user_id:userId});
      return json({ok:true,platform_role:adminRecord.role,invite});
    }

    if(action==="mark_owner_invite_sent"){
      const inviteId=text(body?.invite_id);
      const channel=text(body?.channel).toLowerCase()||"link";
      if(!inviteId) return json({error:"invite_id is required"},400);
      const invite=await rpc("platform_server_operator_mark_owner_invite_sent",{
        p_invite_id:inviteId,
        p_actor_user_id:userId,
        p_channel:channel
      });
      return json({ok:true,platform_role:adminRecord.role,invite});
    }

    if(action==="go_live_customer"){
      const tenantId=text(body?.tenant_id);
      if(!tenantId) return json({error:"tenant_id is required"},400);
      const result=await rpc("platform_server_operator_go_live_customer",{
        p_tenant_id:tenantId,
        p_actor_user_id:userId
      });
      return json({ok:true,platform_role:adminRecord.role,result});
    }

    if(action==="record_intervention_event"){
      const tenantId=text(body?.tenant_id);
      const eventType=text(body?.event_type).toLowerCase();
      const channel=text(body?.channel).toLowerCase()||null;
      const note=text(body?.note)||null;
      const followUpAt=text(body?.follow_up_at)||null;
      if(!tenantId||!eventType) return json({error:"tenant_id and event_type are required"},400);
      const orchestration=await rpc("platform_server_operator_record_intervention_event",{
        p_tenant_id:tenantId,
        p_actor_user_id:userId,
        p_event_type:eventType,
        p_channel:channel,
        p_note:note,
        p_follow_up_at:followUpAt
      });
      return json({ok:true,platform_role:adminRecord.role,orchestration});
    }

    if(action==="set_onboarding_task"){
      const tenantId=text(body?.tenant_id);const taskKey=text(body?.task_key);const status=text(body?.status).toLowerCase();
      if(!tenantId||!taskKey||!status) return json({error:"tenant_id, task_key and status are required"},400);
      return json({ok:true,platform_role:adminRecord.role,onboarding:await rpc("platform_server_operator_set_onboarding_task",{p_tenant_id:tenantId,p_task_key:taskKey,p_status:status,p_actor_user_id:userId,p_blocked_reason:text(body?.blocked_reason)||null})});
    }

    return json({error:"Unknown action"},400);
  }catch(error){
    const record=error&&typeof error==="object"?error as Record<string,unknown>:{};
    const message=error instanceof Error?error.message:text(record.message)||text(record.details)||text(record.hint)||"Platform operations request failed";
    console.error("platform-ops",error);
    const lower=message.toLowerCase();
    const status=lower.includes("not_in_plan")?403:lower.includes("already_registered")?409:lower.includes("not_provider_managed")?409:lower.includes("managed_redream_domain_not_custom")?400:lower.includes("transition_not_allowed")?409:lower.includes("reason_required")?400:lower.includes("invalid_")?400:500;
    return json({error:message},status);
  }
}};
