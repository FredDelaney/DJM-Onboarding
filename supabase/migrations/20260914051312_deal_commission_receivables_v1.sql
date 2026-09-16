create table if not exists djm_os.deal_receivables (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  deal_room_id uuid not null references djm_os.deal_rooms(id) on delete cascade,
  payer_organisation_id uuid null references djm_os.organisations(id) on delete set null,
  payer_label text null,
  amount numeric(14,2) not null check (amount>0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid>=0 and amount_paid<=amount),
  currency text not null check (char_length(currency)=3),
  due_date date not null,
  status text not null default 'scheduled' check (status in ('draft','scheduled','invoiced','partially_paid','paid','disputed','waived','cancelled')),
  invoice_reference text null,
  invoiced_at timestamptz null,
  paid_at timestamptz null,
  notes text null,
  created_by uuid null,
  updated_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists djm_os.deal_receivable_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  receivable_id uuid not null references djm_os.deal_receivables(id) on delete cascade,
  actor_user_id uuid null,
  event_type text not null,
  amount numeric(14,2) null,
  reference text null,
  before_state jsonb null,
  after_state jsonb null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

alter table djm_os.deal_receivables enable row level security;
alter table djm_os.deal_receivable_events enable row level security;
create index if not exists deal_receivables_tenant_due_idx on djm_os.deal_receivables(tenant_id,due_date,status);
create index if not exists deal_receivables_tenant_deal_idx on djm_os.deal_receivables(tenant_id,deal_room_id);
create index if not exists deal_receivable_events_tenant_receivable_idx on djm_os.deal_receivable_events(tenant_id,receivable_id,occurred_at desc);

create or replace function public.platform_server_save_deal_receivable(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_id uuid;
  v_deal_id uuid;
  v_payer_org uuid;
  v_amount numeric;
  v_currency text;
  v_due date;
  v_status text;
  v_before jsonb;
  v_after jsonb;
  v_deal djm_os.deal_rooms%rowtype;
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','operations') limit 1;
  if v_role is null then raise exception 'owner_admin_or_operations_access_required'; end if;
  begin v_id:=nullif(p_input->>'receivable_id','')::uuid; exception when others then raise exception 'invalid_receivable_id'; end;
  begin v_deal_id:=nullif(p_input->>'deal_room_id','')::uuid; exception when others then raise exception 'invalid_deal_room_id'; end;
  if v_id is not null and v_deal_id is null then select r.deal_room_id into v_deal_id from djm_os.deal_receivables r where r.id=v_id and r.tenant_id=p_tenant_id; end if;
  if v_deal_id is null then raise exception 'deal_room_id_required'; end if;
  select * into v_deal from djm_os.deal_rooms d where d.id=v_deal_id and d.tenant_id=p_tenant_id;
  if not found then raise exception 'deal_not_found_for_tenant'; end if;
  begin v_payer_org:=nullif(p_input->>'payer_organisation_id','')::uuid; exception when others then raise exception 'invalid_payer_organisation_id'; end;
  if v_payer_org is not null and not exists(select 1 from djm_os.organisations o where o.id=v_payer_org and o.tenant_id=p_tenant_id) then raise exception 'payer_organisation_not_found_for_tenant'; end if;
  begin v_amount:=nullif(p_input->>'amount','')::numeric; exception when others then raise exception 'invalid_amount'; end;
  if v_id is null and (v_amount is null or v_amount<=0) then raise exception 'positive_amount_required'; end if;
  v_currency:=upper(coalesce(nullif(trim(p_input->>'currency'),''),v_deal.currency));
  if char_length(v_currency)<>3 then raise exception 'three_letter_currency_required'; end if;
  begin v_due:=nullif(p_input->>'due_date','')::date; exception when others then raise exception 'invalid_due_date'; end;
  if v_id is null and v_due is null then raise exception 'due_date_required'; end if;
  v_status:=coalesce(nullif(trim(p_input->>'status'),''),'scheduled');
  if v_status not in ('draft','scheduled','invoiced','disputed','waived','cancelled') then raise exception 'status_requires_dedicated_payment_flow'; end if;

  if v_id is null then
    insert into djm_os.deal_receivables(tenant_id,deal_room_id,payer_organisation_id,payer_label,amount,currency,due_date,status,invoice_reference,invoiced_at,notes,created_by,updated_by)
    values(p_tenant_id,v_deal_id,v_payer_org,nullif(trim(p_input->>'payer_label'),''),v_amount,v_currency,v_due,v_status,nullif(trim(p_input->>'invoice_reference'),''),case when v_status='invoiced' then now() else null end,nullif(trim(p_input->>'notes'),''),p_actor_user_id,p_actor_user_id)
    returning id into v_id;
    v_before:=null;
  else
    select to_jsonb(r) into v_before from djm_os.deal_receivables r where r.id=v_id and r.tenant_id=p_tenant_id for update;
    if v_before is null then raise exception 'receivable_not_found_for_tenant'; end if;
    if (v_before->>'status') in ('paid','partially_paid') and v_status in ('waived','cancelled') then raise exception 'paid_receivable_cannot_be_waived_or_cancelled'; end if;
    update djm_os.deal_receivables r set
      deal_room_id=v_deal_id,
      payer_organisation_id=coalesce(v_payer_org,r.payer_organisation_id),
      payer_label=case when p_input ? 'payer_label' then nullif(trim(p_input->>'payer_label'),'') else r.payer_label end,
      amount=coalesce(v_amount,r.amount),
      currency=coalesce(v_currency,r.currency),
      due_date=coalesce(v_due,r.due_date),
      status=v_status,
      invoice_reference=case when p_input ? 'invoice_reference' then nullif(trim(p_input->>'invoice_reference'),'') else r.invoice_reference end,
      invoiced_at=case when v_status='invoiced' then coalesce(r.invoiced_at,now()) when r.status='invoiced' and v_status<>'invoiced' then r.invoiced_at else r.invoiced_at end,
      notes=case when p_input ? 'notes' then nullif(trim(p_input->>'notes'),'') else r.notes end,
      updated_by=p_actor_user_id,updated_at=now()
    where r.id=v_id and r.tenant_id=p_tenant_id;
  end if;
  select to_jsonb(r) into v_after from djm_os.deal_receivables r where r.id=v_id and r.tenant_id=p_tenant_id;
  insert into djm_os.deal_receivable_events(tenant_id,receivable_id,actor_user_id,event_type,before_state,after_state,metadata)
  values(p_tenant_id,v_id,p_actor_user_id,case when v_before is null then 'created' else 'updated' end,v_before,v_after,jsonb_build_object('source','agency_os'));
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','deal_receivable.saved','deal_receivable',v_id::text,v_before,v_after,jsonb_build_object('deal_room_id',v_deal_id));
  return jsonb_build_object('saved',true,'receivable',v_after,'truth_contract',jsonb_build_object('amount','Receivable amount and due date are human-recorded. DJM does not infer them from expected commission.','accounting','This record is operating collections control, not an accounting, VAT or tax document.'));
end;
$$;

create or replace function public.platform_server_record_receivable_payment(
  p_tenant_id uuid,
  p_receivable_id uuid,
  p_actor_user_id uuid,
  p_amount numeric,
  p_paid_at timestamptz default null,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_role text;
  v_row djm_os.deal_receivables%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_new_paid numeric;
  v_when timestamptz:=coalesce(p_paid_at,now());
begin
  select m.role into v_role from platform.tenant_memberships m join platform.tenants t on t.id=m.tenant_id and t.status='active'
   where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' and m.role in ('owner','admin','operations') limit 1;
  if v_role is null then raise exception 'owner_admin_or_operations_access_required'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'positive_payment_amount_required'; end if;
  select * into v_row from djm_os.deal_receivables r where r.id=p_receivable_id and r.tenant_id=p_tenant_id for update;
  if not found then raise exception 'receivable_not_found_for_tenant'; end if;
  if v_row.status in ('waived','cancelled') then raise exception 'payment_not_allowed_for_closed_receivable'; end if;
  if v_row.status='paid' then raise exception 'receivable_already_paid'; end if;
  v_new_paid:=v_row.amount_paid+p_amount;
  if v_new_paid>v_row.amount then raise exception 'payment_exceeds_receivable_balance'; end if;
  v_before:=to_jsonb(v_row);
  update djm_os.deal_receivables set amount_paid=v_new_paid,status=case when v_new_paid=amount then 'paid' else 'partially_paid' end,paid_at=case when v_new_paid=amount then v_when else paid_at end,updated_by=p_actor_user_id,updated_at=now() where id=p_receivable_id and tenant_id=p_tenant_id;
  select to_jsonb(r) into v_after from djm_os.deal_receivables r where r.id=p_receivable_id and r.tenant_id=p_tenant_id;
  insert into djm_os.deal_receivable_events(tenant_id,receivable_id,actor_user_id,event_type,amount,reference,before_state,after_state,metadata)
  values(p_tenant_id,p_receivable_id,p_actor_user_id,'payment_recorded',p_amount,nullif(trim(p_reference),''),v_before,v_after,jsonb_build_object('paid_at',v_when));
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,before_state,after_state,metadata)
  values(p_tenant_id,p_actor_user_id,'user','deal_receivable.payment_recorded','deal_receivable',p_receivable_id::text,v_before,v_after,jsonb_build_object('payment_amount',p_amount,'payment_reference',nullif(trim(p_reference),'')));
  return jsonb_build_object('recorded',true,'receivable',v_after,'payment',jsonb_build_object('amount',p_amount,'paid_at',v_when,'reference',nullif(trim(p_reference),'')));
end;
$$;

create or replace function public.platform_server_deal_receivables(p_tenant_id uuid,p_deal_room_id uuid default null,p_limit integer default 200)
returns jsonb
language sql
stable security definer
set search_path=''
as $$
with rows as (
  select r.*,d.title deal_title,d.status deal_status,d.stage,d.player_id,o.name club_name,po.name payer_organisation_name
  from djm_os.deal_receivables r join djm_os.deal_rooms d on d.id=r.deal_room_id and d.tenant_id=r.tenant_id
  left join djm_os.organisations o on o.id=d.organisation_id and o.tenant_id=d.tenant_id
  left join djm_os.organisations po on po.id=r.payer_organisation_id and po.tenant_id=r.tenant_id
  where r.tenant_id=p_tenant_id and (p_deal_room_id is null or r.deal_room_id=p_deal_room_id)
  order by case r.status when 'disputed' then 1 when 'invoiced' then 2 when 'partially_paid' then 3 when 'scheduled' then 4 when 'draft' then 5 else 6 end,r.due_date,r.created_at
  limit greatest(1,least(coalesce(p_limit,200),500))
)
select jsonb_build_object('available',true,'tenant_id',p_tenant_id,'deal_room_id',p_deal_room_id,
  'items',coalesce(jsonb_agg(jsonb_build_object('receivable_id',id,'deal_room_id',deal_room_id,'deal_title',deal_title,'deal_status',deal_status,'deal_stage',stage,'player_id',player_id,'club_name',club_name,'payer',coalesce(payer_organisation_name,payer_label),'amount',amount,'amount_paid',amount_paid,'balance',amount-amount_paid,'currency',currency,'due_date',due_date,'status',status,'invoice_reference',invoice_reference,'invoiced_at',invoiced_at,'paid_at',paid_at,'notes',notes) order by due_date,created_at),'[]'::jsonb),
  'truth_contract',jsonb_build_object('records','Only human-recorded receivables are included. Expected commission on a deal is not automatically treated as money owed.','accounting','These are agency operating records, not tax invoices or accounting ledger entries.')) from rows;
$$;

create or replace function public.platform_server_receivables_command(p_tenant_id uuid,p_horizon_days integer default 90,p_limit integer default 100)
returns jsonb
language sql
stable security definer
set search_path=''
as $$
with params as (select greatest(1,least(coalesce(p_horizon_days,90),366)) horizon_days,greatest(1,least(coalesce(p_limit,100),500)) lim),
base as (
  select r.*,d.title deal_title,d.player_id,d.organisation_id,o.name club_name,(r.amount-r.amount_paid) balance,
    case when r.status='disputed' then 'disputed'
         when r.status in ('paid','waived','cancelled') then r.status
         when r.due_date<current_date then 'overdue'
         when r.due_date=current_date then 'due_today'
         when r.due_date<=current_date+7 then 'due_next_7_days'
         when r.due_date<=current_date+30 then 'due_next_30_days'
         else 'future' end collection_state
  from djm_os.deal_receivables r join djm_os.deal_rooms d on d.id=r.deal_room_id and d.tenant_id=r.tenant_id left join djm_os.organisations o on o.id=d.organisation_id and o.tenant_id=d.tenant_id
  where r.tenant_id=p_tenant_id
), currency_summary as (
  select currency,
    count(*) filter(where status not in ('paid','waived','cancelled'))::int open_receivables,
    coalesce(sum(balance) filter(where status not in ('paid','waived','cancelled')),0) outstanding,
    coalesce(sum(balance) filter(where collection_state='overdue'),0) overdue,
    coalesce(sum(balance) filter(where collection_state in ('due_today','due_next_7_days')),0) due_next_7_days,
    coalesce(sum(amount_paid),0) recorded_paid
  from base group by currency
), ranked as (
  select b.*,row_number() over(order by case collection_state when 'overdue' then 1 when 'disputed' then 2 when 'due_today' then 3 when 'due_next_7_days' then 4 when 'due_next_30_days' then 5 when 'future' then 6 else 7 end,due_date,deal_title) rn
  from base b where status not in ('paid','waived','cancelled') and due_date<=current_date+(select horizon_days from params)
), missing as (
  select d.id deal_room_id,d.title,d.player_id,d.organisation_id,o.name club_name,d.expected_commission,d.currency,d.closed_at
  from djm_os.deal_rooms d left join djm_os.organisations o on o.id=d.organisation_id and o.tenant_id=d.tenant_id
  where d.tenant_id=p_tenant_id and d.status='won' and coalesce(d.expected_commission,0)>0 and not exists(select 1 from djm_os.deal_receivables r where r.tenant_id=d.tenant_id and r.deal_room_id=d.id and r.status<>'cancelled')
)
select jsonb_build_object(
  'available',true,'tenant_id',p_tenant_id,'generated_at',now(),'horizon_days',(select horizon_days from params),
  'summary',jsonb_build_object('open_receivables',(select count(*) from base where status not in ('paid','waived','cancelled')),'overdue_receivables',(select count(*) from base where collection_state='overdue'),'disputed_receivables',(select count(*) from base where collection_state='disputed'),'won_deals_with_expected_commission_but_no_receivable_record',(select count(*) from missing)),
  'by_currency',coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'open_receivables',open_receivables,'outstanding',outstanding,'overdue',overdue,'due_next_7_days',due_next_7_days,'recorded_paid',recorded_paid) order by currency) from currency_summary),'[]'::jsonb),
  'collection_queue',coalesce((select jsonb_agg(jsonb_build_object('rank',rn,'receivable_id',id,'deal_room_id',deal_room_id,'deal_title',deal_title,'club_name',club_name,'player_id',player_id,'collection_state',collection_state,'amount',amount,'amount_paid',amount_paid,'balance',balance,'currency',currency,'due_date',due_date,'status',status,'invoice_reference',invoice_reference,'next_action',case when collection_state='overdue' then jsonb_build_object('api_action','deal_receivables','instruction','Review the overdue human-recorded receivable and take the appropriate collection action outside automation.') when collection_state='disputed' then jsonb_build_object('api_action','deal_receivables','instruction','Resolve the recorded dispute with the relevant parties before treating this amount as collectible.') else jsonb_build_object('api_action','deal_receivables','instruction','Review invoicing and collection status before the recorded due date.') end) order by rn) from ranked where rn<=(select lim from params)),'[]'::jsonb),
  'missing_receivable_records',coalesce((select jsonb_agg(jsonb_build_object('deal_room_id',deal_room_id,'deal_title',title,'player_id',player_id,'organisation_id',organisation_id,'club_name',club_name,'expected_commission',expected_commission,'currency',currency,'closed_at',closed_at,'next_action',jsonb_build_object('api_action','deal_receivable_save','instruction','Confirm the real commission entitlement and schedule manually before creating a receivable. Do not copy expected commission automatically.'))) from missing),'[]'::jsonb),
  'truth_contract',jsonb_build_object('human_recorded','Receivables are created from human-confirmed commission schedules. Expected commission is shown only to flag a missing collections record and is never copied automatically.','currency','Currencies remain separate. No FX conversion or cross-currency total is calculated.','accounting','This is collections operations, not accounting, tax, VAT, invoice-generation or legal advice.','overdue','Overdue means the human-recorded due date has passed and an unpaid balance remains. It does not prove the amount is legally enforceable or undisputed.')
);
$$;

revoke all on function public.platform_server_save_deal_receivable(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.platform_server_record_receivable_payment(uuid,uuid,uuid,numeric,timestamptz,text) from public,anon,authenticated;
revoke all on function public.platform_server_deal_receivables(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.platform_server_receivables_command(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.platform_server_save_deal_receivable(uuid,uuid,jsonb) to service_role;
grant execute on function public.platform_server_record_receivable_payment(uuid,uuid,uuid,numeric,timestamptz,text) to service_role;
grant execute on function public.platform_server_deal_receivables(uuid,uuid,integer) to service_role;
grant execute on function public.platform_server_receivables_command(uuid,integer,integer) to service_role;
;
