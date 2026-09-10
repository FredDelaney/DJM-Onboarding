create or replace function public.platform_server_authorize_usage(
  p_tenant_id uuid,
  p_feature_key text,
  p_estimated_cost_micros bigint default 0,
  p_required_credits numeric default 0,
  p_wallet_key text default 'platform_credits'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_meter jsonb;
  v_wallet platform.credit_wallets%rowtype;
begin
  if p_required_credits < 0 then raise exception 'invalid_required_credits'; end if;
  v_meter := public.platform_server_authorize_metered_feature(p_tenant_id,p_feature_key,p_estimated_cost_micros);
  if coalesce((v_meter->>'allowed')::boolean,false) is false then
    return v_meter || jsonb_build_object('credits_required',p_required_credits);
  end if;

  if p_required_credits = 0 then
    return v_meter || jsonb_build_object('credits_required',0);
  end if;

  select * into v_wallet from platform.credit_wallets
  where tenant_id=p_tenant_id and wallet_key=p_wallet_key and status='active';

  if not found then
    return v_meter || jsonb_build_object('allowed',false,'reason','credit_wallet_missing','credits_required',p_required_credits);
  end if;
  if v_wallet.is_unlimited then
    return v_meter || jsonb_build_object('allowed',true,'credits_required',p_required_credits,'credit_balance',null,'credits_unlimited',true);
  end if;
  if v_wallet.balance < p_required_credits then
    return v_meter || jsonb_build_object('allowed',false,'reason','insufficient_credits','credits_required',p_required_credits,'credit_balance',v_wallet.balance,'credits_unlimited',false);
  end if;
  return v_meter || jsonb_build_object('allowed',true,'credits_required',p_required_credits,'credit_balance',v_wallet.balance,'credits_unlimited',false);
end;
$$;

create or replace function public.platform_server_consume_credits(
  p_tenant_id uuid,
  p_feature_key text,
  p_credits numeric,
  p_idempotency_key text,
  p_external_reference text default null,
  p_wallet_key text default 'platform_credits',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_credits <= 0 then raise exception 'invalid_credit_amount'; end if;
  return public.platform_server_adjust_credits(
    p_tenant_id,
    -p_credits,
    'consume',
    p_feature_key,
    p_idempotency_key,
    p_external_reference,
    p_wallet_key,
    p_metadata
  );
end;
$$;

revoke all on function public.platform_server_authorize_usage(uuid,text,bigint,numeric,text) from public, anon, authenticated;
revoke all on function public.platform_server_consume_credits(uuid,text,numeric,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.platform_server_authorize_usage(uuid,text,bigint,numeric,text) to service_role;
grant execute on function public.platform_server_consume_credits(uuid,text,numeric,text,text,text,jsonb) to service_role;
