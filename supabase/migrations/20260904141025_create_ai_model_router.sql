create table platform.ai_model_catalog (
  model_key text primary key,
  provider text not null,
  external_model_id text not null,
  capability_tier text not null check (capability_tier in ('routine','balanced','advanced','frontier')),
  status text not null default 'available' check (status in ('available','preview','disabled','deprecated')),
  input_micros_per_million bigint not null check (input_micros_per_million >= 0),
  cached_input_micros_per_million bigint not null check (cached_input_micros_per_million >= 0),
  output_micros_per_million bigint not null check (output_micros_per_million >= 0),
  context_window_tokens integer,
  max_output_tokens integer,
  pricing_verified_at timestamptz not null,
  pricing_source text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table platform.ai_model_catalog enable row level security;
revoke all on platform.ai_model_catalog from public, anon, authenticated;
create trigger ai_model_catalog_touch_updated_at before update on platform.ai_model_catalog for each row execute function platform.touch_updated_at();

create table platform.ai_feature_routes (
  feature_key text primary key references platform.feature_catalog(feature_key) on delete cascade,
  primary_model_key text not null references platform.ai_model_catalog(model_key) on delete restrict,
  fallback_model_key text references platform.ai_model_catalog(model_key) on delete restrict,
  reasoning_effort text not null default 'none' check (reasoning_effort in ('none','low','medium','high','xhigh','max')),
  max_input_tokens integer check (max_input_tokens is null or max_input_tokens > 0),
  max_output_tokens integer check (max_output_tokens is null or max_output_tokens > 0),
  default_credit_cost numeric(12,4) not null default 1 check (default_credit_cost >= 0),
  cache_ttl_seconds integer not null default 0 check (cache_ttl_seconds >= 0),
  prompt_version text,
  status text not null default 'active' check (status in ('active','disabled','testing')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table platform.ai_feature_routes enable row level security;
revoke all on platform.ai_feature_routes from public, anon, authenticated;
create trigger ai_feature_routes_touch_updated_at before update on platform.ai_feature_routes for each row execute function platform.touch_updated_at();

create table platform.tenant_ai_route_overrides (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  feature_key text not null references platform.ai_feature_routes(feature_key) on delete cascade,
  primary_model_key text references platform.ai_model_catalog(model_key) on delete restrict,
  fallback_model_key text references platform.ai_model_catalog(model_key) on delete restrict,
  reasoning_effort text check (reasoning_effort is null or reasoning_effort in ('none','low','medium','high','xhigh','max')),
  max_input_tokens integer check (max_input_tokens is null or max_input_tokens > 0),
  max_output_tokens integer check (max_output_tokens is null or max_output_tokens > 0),
  credit_cost numeric(12,4) check (credit_cost is null or credit_cost >= 0),
  status text not null default 'active' check (status in ('active','disabled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, feature_key)
);
alter table platform.tenant_ai_route_overrides enable row level security;
revoke all on platform.tenant_ai_route_overrides from public, anon, authenticated;
create trigger tenant_ai_route_overrides_touch_updated_at before update on platform.tenant_ai_route_overrides for each row execute function platform.touch_updated_at();
create trigger tenant_ai_route_overrides_bump_runtime after insert or update or delete on platform.tenant_ai_route_overrides for each row execute function platform.bump_tenant_runtime_version();

insert into platform.ai_model_catalog(model_key,provider,external_model_id,capability_tier,status,input_micros_per_million,cached_input_micros_per_million,output_micros_per_million,context_window_tokens,max_output_tokens,pricing_verified_at,pricing_source,metadata) values
('openai_gpt_5_6_luna','openai','gpt-5.6-luna','routine','available',200000,20000,1200000,1050000,128000,now(),'https://developers.openai.com/api/docs/models/gpt-5.6-luna','{"pricing_date":"2026-09-04","long_context_threshold":272000,"long_context_input_multiplier":2,"long_context_output_multiplier":1.5}'::jsonb),
('openai_gpt_5_6_terra','openai','gpt-5.6-terra','balanced','available',2000000,200000,12000000,1050000,128000,now(),'https://developers.openai.com/api/docs/models/gpt-5.6-terra','{"pricing_date":"2026-09-04","long_context_threshold":272000,"long_context_input_multiplier":2,"long_context_output_multiplier":1.5}'::jsonb),
('openai_gpt_5_6_sol','openai','gpt-5.6-sol','advanced','available',4000000,400000,20000000,1050000,128000,now(),'https://developers.openai.com/api/docs/models/gpt-5.6-sol','{"pricing_date":"2026-09-04","pricing_promo_min_end":"2026-11-21","long_context_threshold":272000,"long_context_input_multiplier":2,"long_context_output_multiplier":1.5}'::jsonb),
('openai_gpt_6_astra','openai','gpt-6-astra','frontier','available',10000000,1000000,50000000,1050000,128000,now(),'https://developers.openai.com/api/docs/models/compare','{"pricing_date":"2026-09-04","default_route":false}'::jsonb)
on conflict (model_key) do update set
  external_model_id=excluded.external_model_id,status=excluded.status,input_micros_per_million=excluded.input_micros_per_million,
  cached_input_micros_per_million=excluded.cached_input_micros_per_million,output_micros_per_million=excluded.output_micros_per_million,
  pricing_verified_at=excluded.pricing_verified_at,pricing_source=excluded.pricing_source,metadata=excluded.metadata;

insert into platform.ai_feature_routes(feature_key,primary_model_key,fallback_model_key,reasoning_effort,max_input_tokens,max_output_tokens,default_credit_cost,cache_ttl_seconds,prompt_version,metadata) values
('ai_assistant','openai_gpt_5_6_luna','openai_gpt_5_6_terra','low',80000,1800,1,900,'assistant-v1','{"intent":"high_volume_agent_assistance","escalation":"application_may_request_analysis_route"}'::jsonb),
('ai_player_analysis','openai_gpt_5_6_terra','openai_gpt_5_6_sol','medium',140000,3500,2,21600,'player-analysis-v1','{"intent":"serious_football_analysis","deterministic_scores_required":true}'::jsonb)
on conflict (feature_key) do update set
  primary_model_key=excluded.primary_model_key,fallback_model_key=excluded.fallback_model_key,reasoning_effort=excluded.reasoning_effort,
  max_input_tokens=excluded.max_input_tokens,max_output_tokens=excluded.max_output_tokens,default_credit_cost=excluded.default_credit_cost,
  cache_ttl_seconds=excluded.cache_ttl_seconds,prompt_version=excluded.prompt_version,metadata=excluded.metadata;

create or replace function public.platform_server_ai_route(p_tenant_id uuid, p_feature_key text, p_estimated_cost_micros bigint default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_route platform.ai_feature_routes%rowtype;
  v_override platform.tenant_ai_route_overrides%rowtype;
  v_primary platform.ai_model_catalog%rowtype;
  v_fallback platform.ai_model_catalog%rowtype;
  v_credit numeric;
  v_authorization jsonb;
  v_model_key text;
  v_fallback_key text;
  v_effort text;
  v_max_in integer;
  v_max_out integer;
begin
  select * into v_route from platform.ai_feature_routes where feature_key=p_feature_key and status='active';
  if not found then return jsonb_build_object('allowed',false,'reason','ai_route_not_configured'); end if;
  select * into v_override from platform.tenant_ai_route_overrides where tenant_id=p_tenant_id and feature_key=p_feature_key and status='active';
  v_credit := coalesce(v_override.credit_cost,v_route.default_credit_cost);
  v_authorization := public.platform_server_authorize_usage(p_tenant_id,p_feature_key,p_estimated_cost_micros,v_credit,'platform_credits');
  if coalesce((v_authorization->>'allowed')::boolean,false) is false then return v_authorization; end if;

  v_model_key := coalesce(v_override.primary_model_key,v_route.primary_model_key);
  v_fallback_key := coalesce(v_override.fallback_model_key,v_route.fallback_model_key);
  v_effort := coalesce(v_override.reasoning_effort,v_route.reasoning_effort);
  v_max_in := coalesce(v_override.max_input_tokens,v_route.max_input_tokens);
  v_max_out := coalesce(v_override.max_output_tokens,v_route.max_output_tokens);

  select * into v_primary from platform.ai_model_catalog where model_key=v_model_key and status='available';
  if not found then return jsonb_build_object('allowed',false,'reason','primary_model_unavailable'); end if;
  if v_fallback_key is not null then select * into v_fallback from platform.ai_model_catalog where model_key=v_fallback_key and status='available'; end if;

  return v_authorization || jsonb_build_object(
    'route',jsonb_build_object(
      'provider',v_primary.provider,
      'model_key',v_primary.model_key,
      'model',v_primary.external_model_id,
      'fallback_model',case when v_fallback.model_key is null then null else v_fallback.external_model_id end,
      'reasoning_effort',v_effort,
      'max_input_tokens',v_max_in,
      'max_output_tokens',v_max_out,
      'prompt_version',v_route.prompt_version,
      'cache_ttl_seconds',v_route.cache_ttl_seconds,
      'credit_cost',v_credit,
      'pricing_verified_at',v_primary.pricing_verified_at
    )
  );
end;
$$;

revoke all on function public.platform_server_ai_route(uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.platform_server_ai_route(uuid,text,bigint) to service_role;
