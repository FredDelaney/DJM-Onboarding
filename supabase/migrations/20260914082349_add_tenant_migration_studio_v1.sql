create or replace function platform.try_date(p_text text) returns date language plpgsql immutable set search_path='' as $$ begin if p_text is null or trim(p_text)='' then return null; end if; return p_text::date; exception when others then return null; end $$;
create or replace function platform.try_int(p_text text) returns integer language plpgsql immutable set search_path='' as $$ begin if p_text is null or trim(p_text)='' then return null; end if; return p_text::integer; exception when others then return null; end $$;
create or replace function platform.try_numeric(p_text text) returns numeric language plpgsql immutable set search_path='' as $$ begin if p_text is null or trim(p_text)='' then return null; end if; return p_text::numeric; exception when others then return null; end $$;
create or replace function platform.try_timestamptz(p_text text) returns timestamptz language plpgsql immutable set search_path='' as $$ begin if p_text is null or trim(p_text)='' then return null; end if; return p_text::timestamptz; exception when others then return null; end $$;
revoke all on function platform.try_date(text),platform.try_int(text),platform.try_numeric(text),platform.try_timestamptz(text) from public,anon,authenticated;
grant execute on function platform.try_date(text),platform.try_int(text),platform.try_numeric(text),platform.try_timestamptz(text) to service_role;

create table if not exists platform.tenant_migration_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  entity_type text not null check (entity_type in ('players','people','organisations','club_needs')),
  source_label text not null,
  status text not null default 'draft' check (status in ('draft','preflight_ready','approved','applying','applied','cancelled')),
  field_mapping jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  valid_rows integer not null default 0,
  warning_rows integer not null default 0,
  blocked_rows integer not null default 0,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  applied_by uuid references auth.users(id) on delete set null,
  applied_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tenant_migration_batches_tenant_status_idx on platform.tenant_migration_batches(tenant_id,status,created_at desc);
alter table platform.tenant_migration_batches enable row level security;
revoke all on platform.tenant_migration_batches from public,anon,authenticated;
grant all on platform.tenant_migration_batches to service_role;

create table if not exists platform.tenant_migration_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  batch_id uuid not null references platform.tenant_migration_batches(id) on delete cascade,
  row_number integer not null,
  raw_data jsonb not null default '{}'::jsonb,
  normalized_data jsonb not null default '{}'::jsonb,
  validation_state text not null check (validation_state in ('valid','warning','blocked','applied','skipped')),
  proposed_action text not null check (proposed_action in ('create','review','blocked','skip')),
  human_decision text check (human_decision is null or human_decision in ('create','skip')),
  issues jsonb not null default '[]'::jsonb,
  matched_entity_id uuid,
  applied_entity_id uuid,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id,row_number)
);
create index if not exists tenant_migration_rows_batch_state_idx on platform.tenant_migration_rows(batch_id,validation_state,row_number);
create index if not exists tenant_migration_rows_tenant_batch_idx on platform.tenant_migration_rows(tenant_id,batch_id);
alter table platform.tenant_migration_rows enable row level security;
revoke all on platform.tenant_migration_rows from public,anon,authenticated;
grant all on platform.tenant_migration_rows to service_role;

create or replace function public.platform_server_create_migration_batch(p_tenant_id uuid,p_actor_user_id uuid,p_entity_type text,p_source_label text,p_field_mapping jsonb default '{}'::jsonb,p_metadata jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text; v_id uuid; v_type text:=lower(trim(p_entity_type)); v_label text:=nullif(trim(p_source_label),'');
begin
  select m.role into v_role from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' limit 1;
  if v_role not in ('owner','admin','operations') then raise exception 'owner_admin_or_operations_required'; end if;
  if v_type not in ('players','people','organisations','club_needs') then raise exception 'unsupported_migration_entity_type'; end if;
  if v_label is null then raise exception 'source_label_required'; end if;
  insert into platform.tenant_migration_batches(tenant_id,entity_type,source_label,field_mapping,metadata,created_by,updated_by)
  values(p_tenant_id,v_type,v_label,coalesce(p_field_mapping,'{}'::jsonb),coalesce(p_metadata,'{}'::jsonb),p_actor_user_id,p_actor_user_id) returning id into v_id;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state)
  values(p_tenant_id,p_actor_user_id,'user','migration_batch.created','migration_batch',v_id::text,jsonb_build_object('entity_type',v_type,'source_label',v_label));
  return jsonb_build_object('created',true,'batch_id',v_id,'entity_type',v_type,'status','draft','truth_contract',jsonb_build_object('scope','This batch is tenant-scoped and cannot write application data until preflight and human approval are complete.'));
end;$$;

create or replace function public.platform_server_migration_preflight(p_tenant_id uuid,p_batch_id uuid,p_actor_user_id uuid,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_role text; v_batch platform.tenant_migration_batches%rowtype; v_item jsonb; v_raw jsonb; v_data jsonb; v_issues jsonb; v_state text; v_action text; v_match uuid; v_org uuid;
  v_rownum integer:=0; v_total integer:=0; v_valid integer:=0; v_warning integer:=0; v_blocked integer:=0; v_dob date; v_height integer; v_priority integer; v_min_age integer; v_max_age integer; v_min_height integer;
begin
  select m.role into v_role from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' limit 1;
  if v_role not in ('owner','admin','operations') then raise exception 'owner_admin_or_operations_required'; end if;
  select * into v_batch from platform.tenant_migration_batches b where b.id=p_batch_id and b.tenant_id=p_tenant_id for update;
  if not found then raise exception 'migration_batch_not_found_for_tenant'; end if;
  if v_batch.status not in ('draft','preflight_ready') then raise exception 'migration_batch_not_editable'; end if;
  if jsonb_typeof(p_rows)<>'array' then raise exception 'rows_must_be_json_array'; end if;
  if jsonb_array_length(p_rows)>2000 then raise exception 'migration_preflight_row_limit_exceeded'; end if;
  delete from platform.tenant_migration_rows where tenant_id=p_tenant_id and batch_id=p_batch_id;

  for v_item in select value from jsonb_array_elements(p_rows) loop
    v_rownum:=v_rownum+1; v_total:=v_total+1; v_raw:=coalesce(v_item->'raw',v_item); v_data:=coalesce(v_item->'normalized',v_item); v_issues:='[]'::jsonb; v_state:='valid'; v_action:='create'; v_match:=null; v_org:=null;

    if v_batch.entity_type='players' then
      if nullif(trim(coalesce(v_data->>'first_name','')),'') is null and nullif(trim(coalesce(v_data->>'last_name','')),'') is null and nullif(trim(coalesce(v_data->>'preferred_name','')),'') is null then
        v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','player_name_missing','severity','blocked','message','At least one player name field is required.')); v_state:='blocked'; v_action:='blocked';
      end if;
      if nullif(v_data->>'date_of_birth','') is not null then v_dob:=platform.try_date(v_data->>'date_of_birth'); if v_dob is null then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','invalid_date_of_birth','severity','blocked','message','date_of_birth must be a valid date.')); v_state:='blocked'; v_action:='blocked'; end if; else v_dob:=null; end if;
      if nullif(v_data->>'height_cm','') is not null then v_height:=platform.try_int(v_data->>'height_cm'); if v_height is null or v_height<140 or v_height>230 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','invalid_height_cm','severity','blocked','message','height_cm must be between 140 and 230.')); v_state:='blocked'; v_action:='blocked'; end if; else v_height:=null; end if;
      if nullif(v_data->>'football_status','') is not null and lower(v_data->>'football_status') not in ('active','free_agent','loan','injured','retired','other') then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','invalid_football_status','severity','blocked','message','Unsupported football_status.')); v_state:='blocked'; v_action:='blocked'; end if;
      if nullif(v_data->>'preferred_foot','') is not null and lower(v_data->>'preferred_foot') not in ('left','right','both') then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','invalid_preferred_foot','severity','blocked','message','preferred_foot must be Left, Right or Both.')); v_state:='blocked'; v_action:='blocked'; end if;
      if v_state<>'blocked' then
        select p.id into v_match from public.players p where p.tenant_id=p_tenant_id and lower(trim(concat_ws(' ',p.first_name,p.last_name)))=lower(trim(concat_ws(' ',v_data->>'first_name',v_data->>'last_name'))) and (v_dob is null or p.date_of_birth is null or p.date_of_birth=v_dob) limit 1;
        if v_match is not null then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','possible_existing_player','severity','warning','message','A player with the same recorded name and compatible date of birth already exists in this tenant.')); v_state:='warning'; v_action:='review'; end if;
      end if;
    elsif v_batch.entity_type='people' then
      if nullif(trim(coalesce(v_data->>'full_name','')),'') is null then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','contact_name_missing','severity','blocked','message','full_name is required.')); v_state:='blocked'; v_action:='blocked';
      else select p.id into v_match from djm_os.people p where p.tenant_id=p_tenant_id and lower(trim(p.full_name))=lower(trim(v_data->>'full_name')) limit 1; if v_match is not null then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','possible_existing_contact','severity','warning','message','A contact with the same full name already exists in this tenant.')); v_state:='warning'; v_action:='review'; end if; end if;
    elsif v_batch.entity_type='organisations' then
      if nullif(trim(coalesce(v_data->>'name','')),'') is null then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','organisation_name_missing','severity','blocked','message','name is required.')); v_state:='blocked'; v_action:='blocked';
      else select o.id into v_match from djm_os.organisations o where o.tenant_id=p_tenant_id and lower(trim(o.name))=lower(trim(v_data->>'name')) limit 1; if v_match is not null then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','possible_existing_organisation','severity','warning','message','An organisation with the same name already exists in this tenant.')); v_state:='warning'; v_action:='review'; end if; end if;
    elsif v_batch.entity_type='club_needs' then
      if nullif(trim(coalesce(v_data->>'title','')),'') is null then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','club_need_title_missing','severity','blocked','message','title is required.')); v_state:='blocked'; v_action:='blocked'; end if;
      if nullif(v_data->>'organisation_id','') is not null then select o.id into v_org from djm_os.organisations o where o.id=(v_data->>'organisation_id')::uuid and o.tenant_id=p_tenant_id;
      elsif nullif(trim(coalesce(v_data->>'organisation_name','')),'') is not null then select o.id into v_org from djm_os.organisations o where o.tenant_id=p_tenant_id and lower(trim(o.name))=lower(trim(v_data->>'organisation_name')) limit 1; end if;
      if v_org is null then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','club_need_organisation_unresolved','severity','blocked','message','The club need must resolve to an organisation inside this tenant.')); v_state:='blocked'; v_action:='blocked'; else v_data:=jsonb_set(v_data,'{organisation_id}',to_jsonb(v_org::text),true); end if;
      if nullif(v_data->>'priority','') is not null then v_priority:=platform.try_int(v_data->>'priority'); if v_priority is null or v_priority<1 or v_priority>5 then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','invalid_priority','severity','blocked','message','priority must be between 1 and 5.')); v_state:='blocked'; v_action:='blocked'; end if; end if;
      if nullif(v_data->>'need_type','') is not null and lower(v_data->>'need_type') not in ('confirmed','predicted') then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','invalid_need_type','severity','blocked','message','need_type must be confirmed or predicted.')); v_state:='blocked'; v_action:='blocked'; end if;
      v_min_age:=platform.try_int(v_data->>'min_age'); v_max_age:=platform.try_int(v_data->>'max_age'); if v_min_age is not null and v_max_age is not null and v_max_age<v_min_age then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','invalid_age_range','severity','blocked','message','max_age cannot be below min_age.')); v_state:='blocked'; v_action:='blocked'; end if;
      v_min_height:=platform.try_int(v_data->>'min_height_cm'); if nullif(v_data->>'min_height_cm','') is not null and (v_min_height is null or v_min_height<140 or v_min_height>230) then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','invalid_min_height','severity','blocked','message','min_height_cm must be between 140 and 230.')); v_state:='blocked'; v_action:='blocked'; end if;
      if v_state<>'blocked' then select n.id into v_match from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.organisation_id=v_org and lower(trim(n.title))=lower(trim(v_data->>'title')) and n.status='active' limit 1; if v_match is not null then v_issues:=v_issues||jsonb_build_array(jsonb_build_object('code','possible_existing_club_need','severity','warning','message','An active club need with this title already exists for the resolved organisation.')); v_state:='warning'; v_action:='review'; end if; end if;
    end if;

    insert into platform.tenant_migration_rows(tenant_id,batch_id,row_number,raw_data,normalized_data,validation_state,proposed_action,issues,matched_entity_id)
    values(p_tenant_id,p_batch_id,v_rownum,v_raw,v_data,v_state,v_action,v_issues,v_match);
    if v_state='valid' then v_valid:=v_valid+1; elsif v_state='warning' then v_warning:=v_warning+1; else v_blocked:=v_blocked+1; end if;
  end loop;

  update platform.tenant_migration_batches set status='preflight_ready',row_count=v_total,valid_rows=v_valid,warning_rows=v_warning,blocked_rows=v_blocked,updated_by=p_actor_user_id,updated_at=now() where id=p_batch_id and tenant_id=p_tenant_id;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state)
  values(p_tenant_id,p_actor_user_id,'user','migration_batch.preflight','migration_batch',p_batch_id::text,jsonb_build_object('rows',v_total,'valid',v_valid,'warning',v_warning,'blocked',v_blocked));
  return public.platform_server_migration_batch(p_tenant_id,p_batch_id,200);
end;$$;

create or replace function public.platform_server_migration_batch(p_tenant_id uuid,p_batch_id uuid,p_limit integer default 200)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'available',true,'tenant_id',p_tenant_id,
 'batch',to_jsonb(b),
 'rows',coalesce((select jsonb_agg(jsonb_build_object('row_id',r.id,'row_number',r.row_number,'validation_state',r.validation_state,'proposed_action',r.proposed_action,'human_decision',r.human_decision,'issues',r.issues,'matched_entity_id',r.matched_entity_id,'applied_entity_id',r.applied_entity_id,'normalized_data',r.normalized_data) order by r.row_number) from (select * from platform.tenant_migration_rows where tenant_id=p_tenant_id and batch_id=p_batch_id order by row_number limit greatest(1,least(coalesce(p_limit,200),2000))) r),'[]'::jsonb),
 'approval_gate',jsonb_build_object('blocked_rows',b.blocked_rows,'warnings_requiring_decision',(select count(*) from platform.tenant_migration_rows r where r.tenant_id=p_tenant_id and r.batch_id=p_batch_id and r.validation_state='warning' and r.human_decision is null),'can_approve',b.blocked_rows=0 and not exists(select 1 from platform.tenant_migration_rows r where r.tenant_id=p_tenant_id and r.batch_id=p_batch_id and r.validation_state='warning' and r.human_decision is null)),
 'truth_contract',jsonb_build_object('preflight','Validation checks structure and obvious tenant-local duplicates; it does not prove imported facts are correct.','duplicates','Potential matches require a human create/skip decision. DJM does not silently merge records.','writes','No application data is written until the batch is approved and applied.')
) from platform.tenant_migration_batches b where b.id=p_batch_id and b.tenant_id=p_tenant_id;$$;

create or replace function public.platform_server_migration_set_row_decision(p_tenant_id uuid,p_batch_id uuid,p_row_id uuid,p_actor_user_id uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text; v_state text; v_dec text:=lower(trim(p_decision));
begin
  select m.role into v_role from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' limit 1;
  if v_role not in ('owner','admin','operations') then raise exception 'owner_admin_or_operations_required'; end if;
  if v_dec not in ('create','skip') then raise exception 'invalid_migration_row_decision'; end if;
  select r.validation_state into v_state from platform.tenant_migration_rows r join platform.tenant_migration_batches b on b.id=r.batch_id and b.tenant_id=r.tenant_id where r.id=p_row_id and r.batch_id=p_batch_id and r.tenant_id=p_tenant_id and b.status='preflight_ready';
  if not found then raise exception 'migration_row_not_editable'; end if;
  if v_state='blocked' then raise exception 'blocked_migration_row_cannot_be_approved'; end if;
  update platform.tenant_migration_rows set human_decision=v_dec,updated_at=now() where id=p_row_id and tenant_id=p_tenant_id and batch_id=p_batch_id;
  return jsonb_build_object('saved',true,'row_id',p_row_id,'decision',v_dec);
end;$$;

create or replace function public.platform_server_approve_migration_batch(p_tenant_id uuid,p_batch_id uuid,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_role text; v_batch platform.tenant_migration_batches%rowtype; v_unresolved integer;
begin
  select m.role into v_role from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' limit 1;
  if v_role not in ('owner','admin','operations') then raise exception 'owner_admin_or_operations_required'; end if;
  select * into v_batch from platform.tenant_migration_batches b where b.id=p_batch_id and b.tenant_id=p_tenant_id for update;
  if not found or v_batch.status<>'preflight_ready' then raise exception 'migration_batch_not_ready_for_approval'; end if;
  if v_batch.row_count=0 then raise exception 'migration_batch_empty'; end if;
  if v_batch.blocked_rows>0 then raise exception 'migration_batch_has_blocked_rows'; end if;
  select count(*) into v_unresolved from platform.tenant_migration_rows r where r.tenant_id=p_tenant_id and r.batch_id=p_batch_id and r.validation_state='warning' and r.human_decision is null;
  if v_unresolved>0 then raise exception 'migration_batch_has_unresolved_warnings'; end if;
  update platform.tenant_migration_batches set status='approved',approved_by=p_actor_user_id,approved_at=now(),updated_by=p_actor_user_id,updated_at=now() where id=p_batch_id and tenant_id=p_tenant_id;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state) values(p_tenant_id,p_actor_user_id,'user','migration_batch.approved','migration_batch',p_batch_id::text,jsonb_build_object('row_count',v_batch.row_count,'entity_type',v_batch.entity_type));
  return jsonb_build_object('approved',true,'batch_id',p_batch_id,'truth_contract',jsonb_build_object('approval','Human approval permits creation only according to the reviewed row decisions; it is not verification that imported football or contact facts are objectively true.'));
end;$$;

create or replace function public.platform_server_apply_migration_batch(p_tenant_id uuid,p_batch_id uuid,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_role text; v_batch platform.tenant_migration_batches%rowtype; v_row platform.tenant_migration_rows%rowtype; v_data jsonb; v_entity uuid; v_count integer:=0; v_skipped integer:=0; v_arr text[]; v_org uuid; v_foot text; v_status text;
begin
  select m.role into v_role from platform.tenant_memberships m where m.tenant_id=p_tenant_id and m.user_id=p_actor_user_id and m.status='active' limit 1;
  if v_role not in ('owner','admin','operations') then raise exception 'owner_admin_or_operations_required'; end if;
  select * into v_batch from platform.tenant_migration_batches b where b.id=p_batch_id and b.tenant_id=p_tenant_id for update;
  if not found or v_batch.status<>'approved' then raise exception 'migration_batch_not_approved'; end if;
  update platform.tenant_migration_batches set status='applying',updated_by=p_actor_user_id,updated_at=now() where id=p_batch_id and tenant_id=p_tenant_id;
  for v_row in select * from platform.tenant_migration_rows r where r.tenant_id=p_tenant_id and r.batch_id=p_batch_id order by r.row_number loop
    if v_row.validation_state='blocked' then raise exception 'blocked_row_found_during_apply'; end if;
    if coalesce(v_row.human_decision,case when v_row.proposed_action='create' then 'create' else null end)='skip' then update platform.tenant_migration_rows set validation_state='skipped',updated_at=now() where id=v_row.id; v_skipped:=v_skipped+1; continue; end if;
    if coalesce(v_row.human_decision,case when v_row.proposed_action='create' then 'create' else null end)<>'create' then raise exception 'migration_row_missing_create_or_skip_decision'; end if;
    v_data:=v_row.normalized_data; v_entity:=null;
    if v_batch.entity_type='players' then
      select coalesce(array_agg(value),'{}'::text[]) into v_arr from jsonb_array_elements_text(coalesce(v_data->'nationalities','[]'::jsonb));
      v_foot:=case lower(coalesce(v_data->>'preferred_foot','')) when 'left' then 'Left' when 'right' then 'Right' when 'both' then 'Both' else null end;
      v_status:=case when lower(coalesce(v_data->>'football_status','')) in ('active','free_agent','loan','injured','retired','other') then lower(v_data->>'football_status') else 'active' end;
      insert into public.players(tenant_id,first_name,last_name,preferred_name,date_of_birth,nationalities,height_cm,preferred_foot,primary_position,secondary_positions,current_club,current_league,current_country,contract_status,contract_expiry,football_status,transfermarkt_url,wyscout_url,instagram_url,onboarding_status,verification_status,agency_priority)
      values(p_tenant_id,nullif(trim(v_data->>'first_name'),''),nullif(trim(v_data->>'last_name'),''),nullif(trim(v_data->>'preferred_name'),''),platform.try_date(v_data->>'date_of_birth'),v_arr,platform.try_int(v_data->>'height_cm'),v_foot,nullif(trim(v_data->>'primary_position'),''),coalesce((select array_agg(value) from jsonb_array_elements_text(coalesce(v_data->'secondary_positions','[]'::jsonb))),'{}'::text[]),nullif(trim(v_data->>'current_club'),''),nullif(trim(v_data->>'current_league'),''),nullif(trim(v_data->>'current_country'),''),nullif(trim(v_data->>'contract_status'),''),platform.try_date(v_data->>'contract_expiry'),v_status,nullif(trim(v_data->>'transfermarkt_url'),''),nullif(trim(v_data->>'wyscout_url'),''),nullif(trim(v_data->>'instagram_url'),''),'not_started','unverified','normal') returning id into v_entity;
    elsif v_batch.entity_type='people' then
      insert into djm_os.people(tenant_id,full_name,preferred_name,person_type,country,city,linkedin_url,instagram_url)
      values(p_tenant_id,trim(v_data->>'full_name'),nullif(trim(v_data->>'preferred_name'),''),coalesce(nullif(trim(v_data->>'person_type'),''),'contact'),nullif(trim(v_data->>'country'),''),nullif(trim(v_data->>'city'),''),nullif(trim(v_data->>'linkedin_url'),''),nullif(trim(v_data->>'instagram_url'),'')) returning id into v_entity;
      if nullif(trim(v_data->>'email'),'') is not null then insert into djm_os.contact_methods(tenant_id,person_id,channel,value,normalised_value,is_primary) values(p_tenant_id,v_entity,'email',trim(v_data->>'email'),lower(trim(v_data->>'email')),true); end if;
      if nullif(trim(v_data->>'phone'),'') is not null then insert into djm_os.contact_methods(tenant_id,person_id,channel,value,normalised_value,is_primary) values(p_tenant_id,v_entity,'phone',trim(v_data->>'phone'),regexp_replace(v_data->>'phone','[^0-9+]','','g'),nullif(trim(v_data->>'email'),'') is null); end if;
    elsif v_batch.entity_type='organisations' then
      insert into djm_os.organisations(tenant_id,name,organisation_type,country,city,website_url,linkedin_url,instagram_url,transfermarkt_url,league_name)
      values(p_tenant_id,trim(v_data->>'name'),coalesce(nullif(trim(v_data->>'organisation_type'),''),'club'),nullif(trim(v_data->>'country'),''),nullif(trim(v_data->>'city'),''),nullif(trim(v_data->>'website_url'),''),nullif(trim(v_data->>'linkedin_url'),''),nullif(trim(v_data->>'instagram_url'),''),nullif(trim(v_data->>'transfermarkt_url'),''),nullif(trim(v_data->>'league_name'),'')) returning id into v_entity;
    elsif v_batch.entity_type='club_needs' then
      v_org=(v_data->>'organisation_id')::uuid;
      insert into djm_os.club_needs(tenant_id,organisation_id,title,position,preferred_foot,min_age,max_age,transfer_type,transfer_budget,salary_budget,currency,salary_period,registration_notes,profile_notes,expires_at,secondary_position,min_height_cm,passport_requirements,foreign_player_notes,playing_style,raw_request,source_context,priority,need_type)
      values(p_tenant_id,v_org,trim(v_data->>'title'),nullif(trim(v_data->>'position'),''),nullif(trim(v_data->>'preferred_foot'),''),platform.try_int(v_data->>'min_age'),platform.try_int(v_data->>'max_age'),nullif(trim(v_data->>'transfer_type'),''),platform.try_numeric(v_data->>'transfer_budget'),platform.try_numeric(v_data->>'salary_budget'),nullif(trim(v_data->>'currency'),''),nullif(trim(v_data->>'salary_period'),''),nullif(trim(v_data->>'registration_notes'),''),nullif(trim(v_data->>'profile_notes'),''),platform.try_timestamptz(v_data->>'expires_at'),nullif(trim(v_data->>'secondary_position'),''),platform.try_int(v_data->>'min_height_cm'),nullif(trim(v_data->>'passport_requirements'),''),nullif(trim(v_data->>'foreign_player_notes'),''),nullif(trim(v_data->>'playing_style'),''),nullif(trim(v_data->>'raw_request'),''),coalesce(nullif(trim(v_data->>'source_context'),''),'migration'),coalesce(platform.try_int(v_data->>'priority'),3),coalesce(nullif(lower(trim(v_data->>'need_type')),''),'confirmed')) returning id into v_entity;
    end if;
    update platform.tenant_migration_rows set validation_state='applied',applied_entity_id=v_entity,applied_at=now(),updated_at=now() where id=v_row.id;
    v_count:=v_count+1;
  end loop;
  update platform.tenant_migration_batches set status='applied',applied_by=p_actor_user_id,applied_at=now(),updated_by=p_actor_user_id,updated_at=now() where id=p_batch_id and tenant_id=p_tenant_id;
  insert into platform.audit_events(tenant_id,actor_user_id,actor_kind,action,entity_type,entity_id,after_state) values(p_tenant_id,p_actor_user_id,'user','migration_batch.applied','migration_batch',p_batch_id::text,jsonb_build_object('created_entities',v_count,'skipped_rows',v_skipped,'entity_type',v_batch.entity_type));
  return jsonb_build_object('applied',true,'batch_id',p_batch_id,'created_entities',v_count,'skipped_rows',v_skipped,'truth_contract',jsonb_build_object('atomicity','The batch applies in one database transaction. If any unexpected write fails, the entire apply operation rolls back.','verification','Imported facts remain unverified unless the agency separately verifies them.','duplicates','Warning rows require an explicit create or skip decision; DJM never silently merges tenant records.'));
end;$$;

do $$ declare r record; begin for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('platform_server_create_migration_batch','platform_server_migration_preflight','platform_server_migration_batch','platform_server_migration_set_row_decision','platform_server_approve_migration_batch','platform_server_apply_migration_batch') loop execute format('revoke all on function %s from public,anon,authenticated',r.sig); execute format('grant execute on function %s to service_role',r.sig); end loop; end $$;;
