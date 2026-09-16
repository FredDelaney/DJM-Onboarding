create table platform.billing_accounts (
  tenant_id uuid primary key references platform.tenants(id) on delete cascade,
  status text not null default 'active' check (status in ('active','past_due','on_hold','cancelled','internal')),
  billing_email text,
  invoice_currency text not null default 'EUR' check (invoice_currency ~ '^[A-Z]{3}$'),
  tax_country text check (tax_country is null or tax_country ~ '^[A-Z]{2}$'),
  external_customer_reference text,
  payment_provider text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table platform.billing_accounts enable row level security;
revoke all on platform.billing_accounts from public, anon, authenticated;

create table platform.credit_wallets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  wallet_key text not null,
  balance numeric(20,6) not null default 0 check (balance >= 0),
  is_unlimited boolean not null default false,
  status text not null default 'active' check (status in ('active','frozen','closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, wallet_key)
);
create index credit_wallets_tenant_idx on platform.credit_wallets(tenant_id);
alter table platform.credit_wallets enable row level security;
revoke all on platform.credit_wallets from public, anon, authenticated;

create table platform.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references platform.credit_wallets(id) on delete restrict,
  tenant_id uuid not null references platform.tenants(id) on delete restrict,
  delta numeric(20,6) not null check (delta <> 0),
  balance_after numeric(20,6) not null check (balance_after >= 0),
  transaction_type text not null check (transaction_type in ('purchase','grant','consume','refund','expire','adjust')),
  feature_key text references platform.feature_catalog(feature_key) on delete restrict,
  idempotency_key text,
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index credit_ledger_tenant_time_idx on platform.credit_ledger(tenant_id, occurred_at desc);
create unique index credit_ledger_idempotency_idx on platform.credit_ledger(wallet_id, idempotency_key) where idempotency_key is not null;
alter table platform.credit_ledger enable row level security;
revoke all on platform.credit_ledger from public, anon, authenticated;

create trigger billing_accounts_touch_updated_at before update on platform.billing_accounts for each row execute function platform.touch_updated_at();
create trigger credit_wallets_touch_updated_at before update on platform.credit_wallets for each row execute function platform.touch_updated_at();

insert into platform.billing_accounts(tenant_id,status,invoice_currency,metadata)
select id,'internal','EUR','{"billing_exempt":true}'::jsonb from platform.tenants where slug='djm-sports-management'
on conflict (tenant_id) do nothing;
insert into platform.billing_accounts(tenant_id,status,invoice_currency)
select id,'active','EUR' from platform.tenants where slug='northstar-football-management'
on conflict (tenant_id) do nothing;
insert into platform.credit_wallets(tenant_id,wallet_key,balance,is_unlimited,metadata)
select id,'platform_credits',0,true,'{"billing_exempt":true}'::jsonb from platform.tenants where slug='djm-sports-management'
on conflict (tenant_id,wallet_key) do nothing;
insert into platform.credit_wallets(tenant_id,wallet_key,balance,is_unlimited)
select id,'platform_credits',0,false from platform.tenants where slug='northstar-football-management'
on conflict (tenant_id,wallet_key) do nothing;

create or replace function public.platform_server_credit_balance(p_tenant_id uuid, p_wallet_key text default 'platform_credits')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
 select jsonb_build_object('balance',w.balance,'unlimited',w.is_unlimited,'status',w.status)
 from platform.credit_wallets w where w.tenant_id=p_tenant_id and w.wallet_key=p_wallet_key;
$$;

create or replace function public.platform_server_adjust_credits(
  p_tenant_id uuid,
  p_delta numeric,
  p_transaction_type text,
  p_feature_key text default null,
  p_idempotency_key text default null,
  p_external_reference text default null,
  p_wallet_key text default 'platform_credits',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wallet platform.credit_wallets%rowtype;
  v_existing platform.credit_ledger%rowtype;
  v_new_balance numeric(20,6);
  v_ledger_id uuid;
begin
  if p_delta = 0 then raise exception 'zero_credit_delta'; end if;
  if p_transaction_type not in ('purchase','grant','consume','refund','expire','adjust') then raise exception 'invalid_credit_transaction_type'; end if;
  if not exists (select 1 from platform.tenants where id=p_tenant_id and status='active') then raise exception 'tenant_not_active'; end if;

  insert into platform.credit_wallets(tenant_id,wallet_key) values(p_tenant_id,p_wallet_key)
  on conflict (tenant_id,wallet_key) do nothing;

  select * into v_wallet from platform.credit_wallets
  where tenant_id=p_tenant_id and wallet_key=p_wallet_key for update;

  if v_wallet.status <> 'active' then raise exception 'credit_wallet_not_active'; end if;

  if p_idempotency_key is not null then
    select * into v_existing from platform.credit_ledger
    where wallet_id=v_wallet.id and idempotency_key=p_idempotency_key;
    if found then
      return jsonb_build_object('ledger_id',v_existing.id,'balance',v_existing.balance_after,'unlimited',v_wallet.is_unlimited,'duplicate',true);
    end if;
  end if;

  if v_wallet.is_unlimited then
    v_new_balance := v_wallet.balance;
  else
    v_new_balance := v_wallet.balance + p_delta;
    if v_new_balance < 0 then
      return jsonb_build_object('applied',false,'reason','insufficient_credits','balance',v_wallet.balance,'unlimited',false);
    end if;
    update platform.credit_wallets set balance=v_new_balance where id=v_wallet.id;
  end if;

  insert into platform.credit_ledger(wallet_id,tenant_id,delta,balance_after,transaction_type,feature_key,idempotency_key,external_reference,metadata)
  values(v_wallet.id,p_tenant_id,p_delta,v_new_balance,p_transaction_type,p_feature_key,p_idempotency_key,p_external_reference,coalesce(p_metadata,'{}'::jsonb))
  returning id into v_ledger_id;

  return jsonb_build_object('applied',true,'ledger_id',v_ledger_id,'balance',v_new_balance,'unlimited',v_wallet.is_unlimited,'duplicate',false);
end;
$$;

revoke all on function public.platform_server_credit_balance(uuid,text) from public, anon, authenticated;
revoke all on function public.platform_server_adjust_credits(uuid,numeric,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.platform_server_credit_balance(uuid,text) to service_role;
grant execute on function public.platform_server_adjust_credits(uuid,numeric,text,text,text,text,text,jsonb) to service_role;
