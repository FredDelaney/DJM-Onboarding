begin;

alter table djm_os.messaging_threads
  add column if not exists bound_prospect_id uuid
    references djm_os.scouting_prospects(id)
    on delete set null;

drop index if exists djm_os.messaging_threads_bound_prospect_idx;

create index if not exists messaging_threads_bound_prospect_idx
  on djm_os.messaging_threads(bound_prospect_id,tenant_id)
  where bound_prospect_id is not null;

alter table djm_os.messaging_threads
  drop constraint if exists messaging_threads_single_bound_identity;

alter table djm_os.messaging_threads
  add constraint messaging_threads_single_bound_identity
  check (num_nonnulls(bound_person_id,bound_player_id,bound_prospect_id) <= 1);

alter table djm_os.captures
  add column if not exists prospect_id uuid
    references djm_os.scouting_prospects(id)
    on delete set null;

drop index if exists djm_os.captures_tenant_prospect_idx;

create index if not exists captures_tenant_prospect_idx
  on djm_os.captures(prospect_id,tenant_id,created_at desc)
  where prospect_id is not null;

alter table djm_os.interactions
  add column if not exists prospect_id uuid
    references djm_os.scouting_prospects(id)
    on delete set null;

drop index if exists djm_os.interactions_tenant_prospect_occurred_idx;

create index if not exists interactions_tenant_prospect_occurred_idx
  on djm_os.interactions(prospect_id,tenant_id,occurred_at desc)
  where prospect_id is not null;


alter table djm_os.connected_reply_drafts
  add column if not exists prospect_id uuid
    references djm_os.scouting_prospects(id)
    on delete cascade;

alter table djm_os.connected_reply_drafts
  drop constraint if exists connected_reply_drafts_single_identity;

alter table djm_os.connected_reply_drafts
  add constraint connected_reply_drafts_single_identity
  check (num_nonnulls(person_id,player_id,prospect_id)=1);

drop index if exists djm_os.connected_reply_drafts_prospect_idx;

create index if not exists connected_reply_drafts_prospect_idx
  on djm_os.connected_reply_drafts(prospect_id,tenant_id,updated_at desc)
  where prospect_id is not null;

create or replace function private.redream_keep_single_messaging_identity()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.bound_person_id is not null
     and new.bound_person_id is distinct from old.bound_person_id
  then
    new.bound_player_id:=null;
    new.bound_prospect_id:=null;
  elsif new.bound_player_id is not null
     and new.bound_player_id is distinct from old.bound_player_id
  then
    new.bound_person_id:=null;
    new.bound_organisation_id:=null;
    new.bound_prospect_id:=null;
  elsif new.bound_prospect_id is not null
     and new.bound_prospect_id is distinct from old.bound_prospect_id
  then
    new.bound_person_id:=null;
    new.bound_organisation_id:=null;
    new.bound_player_id:=null;
  end if;
  return new;
end;
$function$;

create or replace function public.redream_messaging_prospect_candidates()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
  v_items jsonb:='[]'::jsonb;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;
  if not private.user_has_staff_tenant_access(v_tenant,v_user) then
    raise exception 'workspace_access_denied' using errcode='42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'prospect_id',p.id,
        'prospect_name',p.full_name,
        'primary_position',p.primary_position,
        'current_club',p.current_club,
        'recruitment_stage',p.recruitment_stage,
        'instagram_url',p.instagram_url,
        'instagram_handle',case
          when nullif(trim(coalesce(p.instagram_url,'')),'') is null then null
          else nullif(lower(regexp_replace(regexp_replace(trim(p.instagram_url),'^.*instagram\.com/','','i'),'[/?#].*$','','g')),'')
        end
      )
      order by case when p.owner_user_id=v_user then 0 else 1 end,
        lower(coalesce(p.full_name,'Recruitment target')),p.id
    ),
    '[]'::jsonb
  ) into v_items
  from djm_os.scouting_prospects p
  where p.tenant_id=v_tenant
    and p.linked_player_id is null
    and p.signed_player_id is null
    and coalesce(p.recruitment_stage,'identified') not in ('signed','declined','lost');

  return jsonb_build_object(
    'prospects',v_items,
    'truth_contract',jsonb_build_object(
      'scope','Only active recruitment targets in the current agency workspace are returned.',
      'instagram','An exact recorded Instagram handle may be shown as a suggestion, but no recruitment target is linked automatically.'
    )
  );
end;
$function$;

create or replace function public.redream_messaging_thread_bind_prospect(
  p_provider text,
  p_external_thread_id text,
  p_prospect_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_external_thread_id text:=trim(coalesce(p_external_thread_id,''));
  v_thread_id uuid;
  v_participant_label text;
  v_prospect_name text;
  v_current_club text;
  v_stage text;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.user_has_staff_tenant_access(v_tenant,v_user) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  if v_provider not in ('whatsapp','instagram') then raise exception 'unsupported_provider'; end if;
  if v_external_thread_id='' then raise exception 'thread_required'; end if;

  select t.id,t.participant_label into v_thread_id,v_participant_label
  from djm_os.messaging_threads t
  where t.tenant_id=v_tenant and t.user_id=v_user and t.provider=v_provider
    and t.external_thread_id=v_external_thread_id and t.is_selected=true
  limit 1;
  if v_thread_id is null then raise exception 'selected_thread_not_found'; end if;

  if p_prospect_id is null then
    update djm_os.messaging_threads
    set bound_person_id=null,bound_organisation_id=null,bound_player_id=null,
        bound_prospect_id=null,bound_at=null,bound_by=null,updated_at=now()
    where id=v_thread_id;
    return jsonb_build_object('thread_id',v_thread_id,'bound',false,'identity_kind',null,'bound_prospect_id',null,'bound_prospect_name',null);
  end if;

  select p.full_name,p.current_club,p.recruitment_stage
  into v_prospect_name,v_current_club,v_stage
  from djm_os.scouting_prospects p
  where p.id=p_prospect_id and p.tenant_id=v_tenant
    and p.linked_player_id is null and p.signed_player_id is null
    and coalesce(p.recruitment_stage,'identified') not in ('signed','declined','lost')
  limit 1;
  if v_prospect_name is null then raise exception 'recruitment_target_not_found'; end if;

  update djm_os.messaging_threads
  set bound_person_id=null,bound_organisation_id=null,bound_player_id=null,
      bound_prospect_id=p_prospect_id,bound_at=now(),bound_by=v_user,updated_at=now()
  where id=v_thread_id;

  insert into djm_os.events(tenant_id,event_type,actor_user_id,payload,source,confidence,occurred_at)
  values(v_tenant,'MESSAGING_THREAD_PROSPECT_BOUND',v_user,
    jsonb_build_object('provider',v_provider,'external_thread_id',v_external_thread_id,'participant_label',v_participant_label,
      'prospect_id',p_prospect_id,'prospect_name',v_prospect_name,'prospect_current_club',v_current_club,
      'recruitment_stage',v_stage,'identity_kind','recruitment_target'),
    'redream_messaging',1,now());

  return jsonb_build_object(
    'thread_id',v_thread_id,'bound',true,'identity_kind','recruitment_target',
    'bound_person_id',null,'bound_organisation_id',null,'bound_player_id',null,
    'bound_prospect_id',p_prospect_id,'bound_prospect_name',v_prospect_name,
    'bound_prospect_current_club',v_current_club,'bound_prospect_stage',v_stage
  );
end;
$function$;

create or replace function public.redream_messaging_thread_create_prospect_and_bind(
  p_provider text,
  p_external_thread_id text,
  p_full_name text,
  p_current_club text default null,
  p_primary_position text default null,
  p_current_country text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_external_thread_id text:=trim(coalesce(p_external_thread_id,''));
  v_name text:=nullif(trim(coalesce(p_full_name,'')),'');
  v_thread djm_os.messaging_threads%rowtype;
  v_created jsonb;
  v_bound jsonb;
  v_prospect_id uuid;
  v_handle text;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.user_has_staff_tenant_access(v_tenant,v_user) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  if v_provider not in ('instagram','whatsapp') then raise exception 'unsupported_provider'; end if;
  if v_external_thread_id='' then raise exception 'thread_required'; end if;
  if v_name is null or length(v_name)<2 then raise exception 'player_name_required'; end if;

  select t.* into v_thread
  from djm_os.messaging_threads t
  where t.tenant_id=v_tenant and t.user_id=v_user and t.provider=v_provider
    and t.external_thread_id=v_external_thread_id and t.is_selected=true
    and num_nonnulls(t.bound_person_id,t.bound_player_id,t.bound_prospect_id)=0
  limit 1 for update;
  if v_thread.id is null then raise exception 'unresolved_selected_thread_not_found'; end if;

  v_created:=public.platform_server_recruitment_create_target(
    v_tenant,v_user,v_name,nullif(trim(coalesce(p_current_club,'')),''),
    nullif(trim(coalesce(p_current_country,'')),''),nullif(trim(coalesce(p_primary_position,'')),''),
    null::date,null::text,3::smallint
  );
  v_prospect_id:=nullif(v_created->>'prospect_id','')::uuid;
  if v_prospect_id is null then raise exception 'recruitment_target_create_failed'; end if;

  if v_provider='instagram' then
    v_handle:=lower(regexp_replace(trim(coalesce(v_thread.participant_label,'')),'^@+','','g'));
    if v_handle ~ '^[a-z0-9._]{1,30}$' then
      update djm_os.scouting_prospects
      set instagram_url='https://www.instagram.com/'||v_handle||'/',
          preferred_contact_channel=coalesce(preferred_contact_channel,'instagram'),updated_at=now()
      where id=v_prospect_id and tenant_id=v_tenant;
    end if;
  end if;

  v_bound:=public.redream_messaging_thread_bind_prospect(v_provider,v_external_thread_id,v_prospect_id);
  if not coalesce((v_bound->>'bound')::boolean,false) then raise exception 'recruitment_target_bind_failed'; end if;

  return jsonb_build_object('created',true,'bound',true,'prospect_id',v_prospect_id,
    'prospect_name',v_name,'identity_kind','recruitment_target',
    'instagram_handle',case when v_provider='instagram' then v_handle else null end);
end;
$function$;

create or replace function public.redream_messaging_threads(p_provider text)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_tenant uuid:=private.redream_request_tenant();
  v_user uuid:=auth.uid();
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_items jsonb;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not private.user_has_staff_tenant_access(v_tenant,v_user) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  if v_provider not in ('whatsapp','instagram') then raise exception 'unsupported_provider'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'provider',t.provider,'external_thread_id',t.external_thread_id,'participant_label',t.participant_label,
    'is_selected',t.is_selected,'last_activity_at',t.last_activity_at,
    'bound_person_id',t.bound_person_id,'bound_person_name',pe.full_name,
    'bound_organisation_id',ce.organisation_id,'bound_organisation_name',o.name,
    'bound_player_id',t.bound_player_id,
    'bound_player_name',case when pl.id is null then null else coalesce(nullif(trim(pl.preferred_name),''),nullif(trim(concat_ws(' ',pl.first_name,pl.last_name)),''),'Player') end,
    'bound_player_current_club',pl.current_club,
    'bound_prospect_id',t.bound_prospect_id,'bound_prospect_name',sp.full_name,
    'bound_prospect_current_club',sp.current_club,'bound_prospect_stage',sp.recruitment_stage,
    'identity_kind',case when t.bound_player_id is not null then 'player' when t.bound_prospect_id is not null then 'recruitment_target' when t.bound_person_id is not null then 'network_person' else null end
  ) order by t.is_selected desc,t.last_activity_at desc nulls last),'[]'::jsonb)
  into v_items
  from djm_os.messaging_threads t
  left join djm_os.people pe on pe.id=t.bound_person_id and pe.tenant_id=v_tenant
  left join lateral (
    select e.organisation_id from djm_os.employments e
    where e.tenant_id=v_tenant and e.person_id=t.bound_person_id and e.is_current=true
    order by e.started_on desc nulls last,e.updated_at desc,e.id limit 1
  ) ce on true
  left join djm_os.organisations o on o.id=ce.organisation_id and o.tenant_id=v_tenant
  left join public.players pl on pl.id=t.bound_player_id and pl.tenant_id=v_tenant
  left join djm_os.scouting_prospects sp on sp.id=t.bound_prospect_id and sp.tenant_id=v_tenant
  where t.tenant_id=v_tenant and t.user_id=v_user and t.provider=v_provider;

  return jsonb_build_object('threads',v_items);
end;
$function$;

create or replace function private.redream_enrich_messaging_capture_prospect()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_provider text;
  v_external_thread_id text;
  v_prospect_id uuid;
  v_prospect_name text;
  v_current_club text;
  v_stage text;
begin
  if new.prospect_id is not null then return new; end if;
  v_provider:=lower(trim(coalesce(new.context_json->>'capture_origin','')));
  if v_provider not in ('instagram','whatsapp') then return new; end if;
  v_external_thread_id:=trim(coalesce(new.context_json->>'external_thread_id',''));
  if v_external_thread_id='' then return new; end if;

  select t.bound_prospect_id,sp.full_name,sp.current_club,sp.recruitment_stage
  into v_prospect_id,v_prospect_name,v_current_club,v_stage
  from djm_os.messaging_threads t
  join djm_os.scouting_prospects sp on sp.id=t.bound_prospect_id and sp.tenant_id=t.tenant_id
  where t.tenant_id=new.tenant_id and t.user_id=new.submitted_by
    and t.provider=v_provider and t.external_thread_id=v_external_thread_id and t.is_selected=true
  limit 1;
  if v_prospect_id is null then return new; end if;

  new.prospect_id:=v_prospect_id;
  new.context_json:=coalesce(new.context_json,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
    'prospect_id',v_prospect_id,'prospect_name',v_prospect_name,'prospect_current_club',v_current_club,
    'recruitment_stage',v_stage,'messaging_identity_kind','recruitment_target','messaging_identity_bound',true
  ));
  return new;
end;
$function$;

create or replace function private.redream_enrich_connected_interaction_prospect()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_capture_id uuid;
  v_prospect_id uuid;
begin
  if new.prospect_id is not null
     or new.channel not in ('instagram_selected_chat','whatsapp_selected_chat')
     or coalesce(new.source_type,'')<>'tell_djm'
     or coalesce(new.source_external_id,'') !~ '^tell:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:'
  then return new; end if;

  begin v_capture_id:=split_part(new.source_external_id,':',2)::uuid;
  exception when others then return new; end;

  select c.prospect_id into v_prospect_id
  from djm_os.captures c
  where c.id=v_capture_id and c.tenant_id=new.tenant_id
    and c.submitted_by is not distinct from new.team_member_id
  limit 1;

  if v_prospect_id is not null then new.prospect_id:=v_prospect_id; end if;
  return new;
end;
$function$;

create or replace function public.platform_server_messaging_history_context(
  p_tenant_id uuid,p_user_id uuid,p_provider text,p_external_thread_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_external_thread_id text:=trim(coalesce(p_external_thread_id,''));
  v_thread djm_os.messaging_threads%rowtype;
  v_current_org_id uuid;
  v_current_org_name text;
  v_person_name text;
  v_player_name text;
  v_prospect_name text;
  v_prospect_current_club text;
  v_prospect_stage text;
begin
  if p_user_id is null or not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  if v_provider<>'instagram' then raise exception 'unsupported_provider'; end if;
  if v_external_thread_id='' then raise exception 'thread_required'; end if;

  select t.* into v_thread from djm_os.messaging_threads t
  where t.tenant_id=p_tenant_id and t.user_id=p_user_id and t.provider=v_provider
    and t.external_thread_id=v_external_thread_id and t.is_selected=true
    and num_nonnulls(t.bound_person_id,t.bound_player_id,t.bound_prospect_id)=1
  limit 1;
  if v_thread.id is null then raise exception 'selected_identity_bound_thread_not_found'; end if;
  if nullif(trim(coalesce(v_thread.metadata->>'catalog_conversation_id','')),'') is null then raise exception 'catalog_conversation_unavailable'; end if;

  if v_thread.bound_person_id is not null then
    select p.full_name into v_person_name from djm_os.people p where p.id=v_thread.bound_person_id and p.tenant_id=p_tenant_id;
    select e.organisation_id,o.name into v_current_org_id,v_current_org_name
    from djm_os.employments e join djm_os.organisations o on o.id=e.organisation_id and o.tenant_id=p_tenant_id
    where e.tenant_id=p_tenant_id and e.person_id=v_thread.bound_person_id and e.is_current=true
    order by coalesce(e.last_verified_at,e.updated_at) desc nulls last,e.updated_at desc,e.id limit 1;
  elsif v_thread.bound_player_id is not null then
    select coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player')
    into v_player_name from public.players p where p.id=v_thread.bound_player_id and p.tenant_id=p_tenant_id;
  else
    select sp.full_name,sp.current_club,sp.recruitment_stage
    into v_prospect_name,v_prospect_current_club,v_prospect_stage
    from djm_os.scouting_prospects sp where sp.id=v_thread.bound_prospect_id and sp.tenant_id=p_tenant_id;
  end if;

  return jsonb_build_object(
    'thread_id',v_thread.id,'connection_id',v_thread.connection_id,'provider',v_thread.provider,
    'external_thread_id',v_thread.external_thread_id,'catalog_conversation_id',v_thread.metadata->>'catalog_conversation_id',
    'participant_external_id',v_thread.participant_external_id,'participant_label',v_thread.participant_label,
    'bound_person_id',v_thread.bound_person_id,'bound_person_name',v_person_name,
    'bound_organisation_id',case when v_thread.bound_person_id is not null then v_current_org_id else null end,
    'bound_organisation_name',case when v_thread.bound_person_id is not null then v_current_org_name else null end,
    'bound_player_id',v_thread.bound_player_id,'bound_player_name',v_player_name,
    'bound_prospect_id',v_thread.bound_prospect_id,'bound_prospect_name',v_prospect_name,
    'bound_prospect_current_club',v_prospect_current_club,'bound_prospect_stage',v_prospect_stage,
    'identity_kind',case when v_thread.bound_player_id is not null then 'player' when v_thread.bound_prospect_id is not null then 'recruitment_target' else 'network_person' end,
    'last_history_bootstrap_at',v_thread.metadata->>'history_bootstrap_at',
    'truth_contract',jsonb_build_object(
      'selection','Only a chat explicitly selected by the signed-in agent is eligible.',
      'identity','Recent history is imported only after the selected chat has exactly one explicit canonical Network person, signed player or recruitment-target identity.',
      'club','Club context is evidence only. A player or recruitment target current club is never promoted to messaging organisation authority.',
      'external_action','Reading selected chat history never sends an external message.'
    )
  );
end;
$function$;

create or replace function public.platform_server_messaging_history_ingest(
  p_tenant_id uuid,p_user_id uuid,p_provider text,p_external_thread_id text,
  p_external_message_id text,p_direction text,p_message_text text,
  p_occurred_at timestamptz,p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_external_thread_id text:=trim(coalesce(p_external_thread_id,''));
  v_external_message_id text:=trim(coalesce(p_external_message_id,''));
  v_direction text:=lower(trim(coalesce(p_direction,'')));
  v_message text:=nullif(trim(coalesce(p_message_text,'')),'');
  v_thread djm_os.messaging_threads%rowtype;
  v_receipt_id uuid;
  v_interaction_id uuid;
  v_organisation_id uuid;
  v_source_uri text;
  v_occurred_at timestamptz:=coalesce(p_occurred_at,now());
begin
  if p_user_id is null or not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  if v_provider<>'instagram' then raise exception 'unsupported_provider'; end if;
  if v_external_thread_id='' or v_external_message_id='' then raise exception 'message_identity_required'; end if;
  if v_direction not in ('inbound','outbound') then raise exception 'message_direction_required'; end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then raise exception 'message_metadata_invalid'; end if;

  select t.* into v_thread from djm_os.messaging_threads t
  where t.tenant_id=p_tenant_id and t.user_id=p_user_id and t.provider=v_provider
    and t.external_thread_id=v_external_thread_id and t.is_selected=true
    and num_nonnulls(t.bound_person_id,t.bound_player_id,t.bound_prospect_id)=1
  limit 1;
  if v_thread.id is null then raise exception 'selected_identity_bound_thread_not_found'; end if;

  insert into djm_os.messaging_message_receipts(
    tenant_id,connection_id,thread_id,external_message_id,direction,occurred_at
  ) values(p_tenant_id,v_thread.connection_id,v_thread.id,v_external_message_id,v_direction,v_occurred_at)
  on conflict(connection_id,external_message_id) do nothing returning id into v_receipt_id;

  if v_receipt_id is null then
    if v_thread.bound_person_id is not null then
      select e.organisation_id into v_organisation_id from djm_os.employments e
      where e.tenant_id=p_tenant_id and e.person_id=v_thread.bound_person_id and e.is_current=true
      order by coalesce(e.last_verified_at,e.updated_at) desc nulls last,e.updated_at desc,e.id limit 1;

      with target as (
        select i.id from djm_os.interactions i
        where i.tenant_id=p_tenant_id and i.team_member_id=p_user_id
          and i.channel='instagram_selected_chat' and i.source_type='instagram_history'
          and i.source_external_id=v_external_message_id
        order by i.created_at desc,i.id limit 1
      )
      update djm_os.interactions i
      set person_id=v_thread.bound_person_id,organisation_id=v_organisation_id,player_id=null,prospect_id=null
      from target where i.id=target.id and (
        i.person_id is distinct from v_thread.bound_person_id
        or i.organisation_id is distinct from v_organisation_id
        or i.player_id is not null or i.prospect_id is not null
      ) returning i.id into v_interaction_id;

      delete from djm_os.recruitment_interactions ri
      where ri.tenant_id=p_tenant_id and ri.source='instagram_selected_chat_history' and ri.external_ref=v_external_message_id;

    elsif v_thread.bound_player_id is not null then
      with target as (
        select i.id from djm_os.interactions i
        where i.tenant_id=p_tenant_id and i.team_member_id=p_user_id
          and i.channel='instagram_selected_chat' and i.source_type='instagram_history'
          and i.source_external_id=v_external_message_id
        order by i.created_at desc,i.id limit 1
      )
      update djm_os.interactions i
      set person_id=null,organisation_id=null,player_id=v_thread.bound_player_id,prospect_id=null
      from target where i.id=target.id and (
        i.person_id is not null or i.organisation_id is not null
        or i.player_id is distinct from v_thread.bound_player_id or i.prospect_id is not null
      ) returning i.id into v_interaction_id;

      delete from djm_os.recruitment_interactions ri
      where ri.tenant_id=p_tenant_id and ri.source='instagram_selected_chat_history' and ri.external_ref=v_external_message_id;

    else
      with target as (
        select i.id from djm_os.interactions i
        where i.tenant_id=p_tenant_id and i.team_member_id=p_user_id
          and i.channel='instagram_selected_chat' and i.source_type='instagram_history'
          and i.source_external_id=v_external_message_id
        order by i.created_at desc,i.id limit 1
      )
      update djm_os.interactions i
      set person_id=null,organisation_id=null,player_id=null,prospect_id=v_thread.bound_prospect_id
      from target where i.id=target.id and (
        i.person_id is not null or i.organisation_id is not null or i.player_id is not null
        or i.prospect_id is distinct from v_thread.bound_prospect_id
      ) returning i.id into v_interaction_id;

      update djm_os.recruitment_interactions ri
      set prospect_id=v_thread.bound_prospect_id,owner_user_id=p_user_id,channel='instagram',direction=v_direction,
          summary=coalesce(v_message,ri.summary),occurred_at=v_occurred_at
      where ri.tenant_id=p_tenant_id and ri.source='instagram_selected_chat_history' and ri.external_ref=v_external_message_id;

      if not found and v_message is not null then
        insert into djm_os.recruitment_interactions(
          tenant_id,prospect_id,owner_user_id,channel,direction,summary,occurred_at,source,external_ref
        ) values(p_tenant_id,v_thread.bound_prospect_id,p_user_id,'instagram',v_direction,left(v_message,1800),v_occurred_at,
          'instagram_selected_chat_history',v_external_message_id);
      end if;
    end if;

    return jsonb_build_object('accepted',true,'duplicate',true,'selected',true,
      'identity_refreshed',v_interaction_id is not null,'interaction_id',v_interaction_id);
  end if;

  if v_message is null then
    return jsonb_build_object('accepted',true,'duplicate',false,'selected',true,'unsupported_content',true,'interaction_id',null);
  end if;

  if v_thread.bound_person_id is not null then
    select e.organisation_id into v_organisation_id from djm_os.employments e
    where e.tenant_id=p_tenant_id and e.person_id=v_thread.bound_person_id and e.is_current=true
    order by coalesce(e.last_verified_at,e.updated_at) desc nulls last,e.updated_at desc,e.id limit 1;
  end if;

  v_source_uri:='instagram://conversation/'||coalesce(nullif(trim(v_thread.metadata->>'catalog_conversation_id'),''),v_thread.external_thread_id);

  insert into djm_os.interactions(
    tenant_id,occurred_at,channel,direction,team_member_id,person_id,organisation_id,player_id,prospect_id,
    source_external_id,source_type,source_uri,raw_text,summary,confidence
  ) values(
    p_tenant_id,v_occurred_at,'instagram_selected_chat',v_direction,p_user_id,v_thread.bound_person_id,
    case when v_thread.bound_person_id is not null then v_organisation_id else null end,
    v_thread.bound_player_id,v_thread.bound_prospect_id,v_external_message_id,'instagram_history',v_source_uri,null,left(v_message,1800),1
  ) returning id into v_interaction_id;

  if v_thread.bound_prospect_id is not null then
    insert into djm_os.recruitment_interactions(
      tenant_id,prospect_id,owner_user_id,channel,direction,summary,occurred_at,source,external_ref
    ) values(p_tenant_id,v_thread.bound_prospect_id,p_user_id,'instagram',v_direction,left(v_message,1800),v_occurred_at,
      'instagram_selected_chat_history',v_external_message_id);

    update djm_os.scouting_prospects
    set first_contact_at=case when first_contact_at is null and v_direction='outbound' then v_occurred_at else first_contact_at end,
        last_contact_at=case when v_direction='outbound' then greatest(coalesce(last_contact_at,'epoch'::timestamptz),v_occurred_at) else last_contact_at end,
        last_reply_at=case when v_direction='inbound' then greatest(coalesce(last_reply_at,'epoch'::timestamptz),v_occurred_at) else last_reply_at end,
        recruitment_stage=case
          when recruitment_stage in ('identified','researching','ready_to_contact') and v_direction='outbound' then 'contacted'
          when recruitment_stage in ('identified','researching','ready_to_contact','contacted') and v_direction='inbound' then 'replied'
          else recruitment_stage end,
        preferred_contact_channel=coalesce(preferred_contact_channel,'instagram'),updated_at=now()
    where id=v_thread.bound_prospect_id and tenant_id=p_tenant_id;
  end if;

  return jsonb_build_object(
    'accepted',true,'duplicate',false,'selected',true,'unsupported_content',false,'interaction_id',v_interaction_id,
    'direction',v_direction,'identity_kind',case
      when v_thread.bound_player_id is not null then 'player'
      when v_thread.bound_prospect_id is not null then 'recruitment_target'
      else 'network_person' end,'external_action',false
  );
end;
$function$;

create or replace function public.platform_server_messaging_history_complete(
  p_tenant_id uuid,p_user_id uuid,p_provider text,p_external_thread_id text,
  p_messages_seen integer,p_messages_imported integer,p_duplicates integer,p_unsupported integer,
  p_identity_refreshed integer,p_oldest_at timestamptz default null,p_newest_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_provider text:=lower(trim(coalesce(p_provider,'')));
  v_external_thread_id text:=trim(coalesce(p_external_thread_id,''));
  v_thread djm_os.messaging_threads%rowtype;
  v_organisation_id uuid;
begin
  if p_user_id is null or not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then raise exception 'workspace_access_denied' using errcode='42501'; end if;
  if v_provider<>'instagram' then raise exception 'unsupported_provider'; end if;

  select t.* into v_thread from djm_os.messaging_threads t
  where t.tenant_id=p_tenant_id and t.user_id=p_user_id and t.provider=v_provider
    and t.external_thread_id=v_external_thread_id and t.is_selected=true
    and num_nonnulls(t.bound_person_id,t.bound_player_id,t.bound_prospect_id)=1
  limit 1 for update;
  if v_thread.id is null then raise exception 'selected_identity_bound_thread_not_found'; end if;

  if v_thread.bound_person_id is not null then
    select e.organisation_id into v_organisation_id from djm_os.employments e
    where e.tenant_id=p_tenant_id and e.person_id=v_thread.bound_person_id and e.is_current=true
    order by coalesce(e.last_verified_at,e.updated_at) desc nulls last,e.updated_at desc,e.id limit 1;
  end if;

  update djm_os.messaging_threads
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'history_bootstrap_at',now(),'history_bootstrap_version','selected_history_v2',
      'history_messages_seen',greatest(0,coalesce(p_messages_seen,0)),
      'history_messages_imported',greatest(0,coalesce(p_messages_imported,0)),
      'history_duplicates',greatest(0,coalesce(p_duplicates,0)),
      'history_unsupported',greatest(0,coalesce(p_unsupported,0)),
      'history_identity_refreshed',greatest(0,coalesce(p_identity_refreshed,0)),
      'history_oldest_at',p_oldest_at,'history_newest_at',p_newest_at
    ),updated_at=now()
  where id=v_thread.id;

  insert into djm_os.events(tenant_id,event_type,actor_user_id,person_id,organisation_id,player_id,payload,source,confidence,occurred_at)
  values(p_tenant_id,'MESSAGING_HISTORY_BOOTSTRAPPED',p_user_id,v_thread.bound_person_id,
    case when v_thread.bound_person_id is not null then v_organisation_id else null end,v_thread.bound_player_id,
    jsonb_build_object(
      'provider',v_provider,'external_thread_id',v_external_thread_id,'thread_id',v_thread.id,
      'bound_player_id',v_thread.bound_player_id,'bound_prospect_id',v_thread.bound_prospect_id,
      'identity_kind',case when v_thread.bound_player_id is not null then 'player' when v_thread.bound_prospect_id is not null then 'recruitment_target' else 'network_person' end,
      'messages_seen',greatest(0,coalesce(p_messages_seen,0)),'messages_imported',greatest(0,coalesce(p_messages_imported,0)),
      'duplicates',greatest(0,coalesce(p_duplicates,0)),'unsupported',greatest(0,coalesce(p_unsupported,0)),
      'identity_refreshed',greatest(0,coalesce(p_identity_refreshed,0)),'oldest_at',p_oldest_at,'newest_at',p_newest_at,'external_action',false
    ),'redream_messaging',1,now());

  return jsonb_build_object(
    'ok',true,'thread_id',v_thread.id,'messages_seen',greatest(0,coalesce(p_messages_seen,0)),
    'messages_imported',greatest(0,coalesce(p_messages_imported,0)),'duplicates',greatest(0,coalesce(p_duplicates,0)),
    'unsupported',greatest(0,coalesce(p_unsupported,0)),'identity_refreshed',greatest(0,coalesce(p_identity_refreshed,0)),
    'external_action',false
  );
end;
$function$;

create or replace function public.platform_server_connected_work(
  p_tenant_id uuid,p_user_id uuid,p_limit integer default 6
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,6),12));
  v_unlinked_count integer:=0;
  v_followup_count integer:=0;
  v_recent_count integer:=0;
  v_meeting_count integer:=0;
  v_unlinked_by_provider jsonb:='[]'::jsonb;
  v_latest_unlinked_at timestamptz;
  v_recent jsonb:='[]'::jsonb;
  v_meetings jsonb:='[]'::jsonb;
  v_owner_name text;
begin
  if p_user_id is null then raise exception 'authentication_required'; end if;
  if not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then raise exception 'workspace_access_denied'; end if;

  select coalesce(nullif(trim(tm.display_name),''),'You') into v_owner_name
  from platform.tenant_memberships membership
  left join djm_os.team_members tm on tm.user_id=membership.user_id and tm.is_active
  where membership.tenant_id=p_tenant_id and membership.user_id=p_user_id
    and membership.status='active' and membership.role in ('owner','admin','agent','operations','scout')
  limit 1;
  v_owner_name:=coalesce(v_owner_name,'You');

  select count(*)::int,max(mt.last_activity_at) into v_unlinked_count,v_latest_unlinked_at
  from djm_os.messaging_threads mt
  where mt.tenant_id=p_tenant_id and mt.user_id=p_user_id and mt.is_selected=true
    and mt.bound_person_id is null and mt.bound_player_id is null and mt.bound_prospect_id is null;

  select coalesce(jsonb_agg(jsonb_build_object('provider',provider,'count',item_count) order by item_count desc,provider),'[]'::jsonb)
  into v_unlinked_by_provider
  from (
    select mt.provider,count(*)::int as item_count from djm_os.messaging_threads mt
    where mt.tenant_id=p_tenant_id and mt.user_id=p_user_id and mt.is_selected=true
      and mt.bound_person_id is null and mt.bound_player_id is null and mt.bound_prospect_id is null
    group by mt.provider
  ) q;

  select count(*)::int into v_followup_count
  from djm_os.tasks t
  where t.tenant_id=p_tenant_id and t.owner_user_id=p_user_id and t.status not in ('done','completed','cancelled')
    and t.source like 'tell_djm:%' and exists(
      select 1 from djm_os.captures c where c.tenant_id=p_tenant_id and t.source like 'tell_djm:'||c.id::text||':%'
        and (c.context_json->>'capture_origin'='email' or c.channel in ('instagram_selected_chat','whatsapp_selected_chat'))
    );

  select count(*)::int into v_recent_count
  from djm_os.interactions i
  where i.tenant_id=p_tenant_id and i.team_member_id=p_user_id
    and i.channel in ('google_email','microsoft_email','instagram_selected_chat','whatsapp_selected_chat')
    and i.occurred_at>now()-interval '30 days'
    and (i.person_id is not null or i.organisation_id is not null or i.player_id is not null or i.prospect_id is not null);

  select coalesce(jsonb_agg(item order by sort_at desc),'[]'::jsonb) into v_recent
  from (
    select jsonb_build_object(
      'interaction_id',i.id,'channel',i.channel,'direction',i.direction,'summary',i.summary,'occurred_at',i.occurred_at,
      'person_id',i.person_id,'person_name',pe.full_name,'organisation_id',i.organisation_id,'organisation_name',o.name,
      'player_id',i.player_id,
      'player_name',case when pl.id is null then null else coalesce(nullif(trim(pl.preferred_name),''),nullif(trim(concat_ws(' ',pl.first_name,pl.last_name)),''),'Player') end,
      'player_current_club',pl.current_club,'prospect_id',i.prospect_id,'prospect_name',sp.full_name,
      'prospect_current_club',sp.current_club,'prospect_stage',sp.recruitment_stage,
      'identity_kind',case when i.player_id is not null then 'player' when i.prospect_id is not null then 'recruitment_target' when i.person_id is not null then 'network_person' else null end,
      'owner_user_id',p_user_id,'owner_name',v_owner_name
    ) as item,i.occurred_at as sort_at
    from djm_os.interactions i
    left join djm_os.people pe on pe.id=i.person_id and pe.tenant_id=i.tenant_id
    left join djm_os.organisations o on o.id=i.organisation_id and o.tenant_id=i.tenant_id
    left join public.players pl on pl.id=i.player_id and pl.tenant_id=i.tenant_id
    left join djm_os.scouting_prospects sp on sp.id=i.prospect_id and sp.tenant_id=i.tenant_id
    where i.tenant_id=p_tenant_id and i.team_member_id=p_user_id
      and i.channel in ('google_email','microsoft_email','instagram_selected_chat','whatsapp_selected_chat')
      and i.occurred_at>now()-interval '30 days'
      and (i.person_id is not null or i.organisation_id is not null or i.player_id is not null or i.prospect_id is not null)
    order by i.occurred_at desc limit least(v_limit,4)
  ) q;

  select count(*)::int into v_meeting_count
  from djm_os.meetings m
  where m.tenant_id=p_tenant_id and m.owner_user_id=p_user_id and m.status='scheduled'
    and m.starts_at between now() and now()+interval '7 days'
    and (m.person_id is not null or m.organisation_id is not null);

  select coalesce(jsonb_agg(item order by starts_at),'[]'::jsonb) into v_meetings
  from (
    select jsonb_build_object(
      'meeting_id',m.id,'title',m.title,'starts_at',m.starts_at,'ends_at',m.ends_at,'provider',m.provider,
      'meeting_url',m.meeting_url,'person_id',m.person_id,'person_name',pe.full_name,
      'organisation_id',m.organisation_id,'organisation_name',o.name,'owner_user_id',p_user_id,'owner_name',v_owner_name
    ) as item,m.starts_at
    from djm_os.meetings m
    left join djm_os.people pe on pe.id=m.person_id and pe.tenant_id=m.tenant_id
    left join djm_os.organisations o on o.id=m.organisation_id and o.tenant_id=m.tenant_id
    where m.tenant_id=p_tenant_id and m.owner_user_id=p_user_id and m.status='scheduled'
      and m.starts_at between now() and now()+interval '7 days'
      and (m.person_id is not null or m.organisation_id is not null)
    order by m.starts_at limit 2
  ) q;

  return jsonb_build_object(
    'contract_version','redream_connected_work_home_v3','generated_at',now(),
    'summary',jsonb_build_object('selected_chats_needing_link',v_unlinked_count,'connected_followups_open',v_followup_count,
      'recent_connected_conversations',v_recent_count,'linked_meetings_next_7_days',v_meeting_count),
    'identity_resolution',jsonb_build_object('count',v_unlinked_count,'by_provider',v_unlinked_by_provider,'latest_activity_at',v_latest_unlinked_at),
    'recent_conversations',v_recent,'upcoming_meetings',v_meetings,
    'owner',jsonb_build_object('user_id',p_user_id,'name',v_owner_name),
    'truth_contract',jsonb_build_object(
      'personal_scope','Home Connected Work shows only the signed-in agent connected accounts, owned follow-ups, recorded interactions and personal Calendar.',
      'shared_context','Network people, signed players and recruitment targets come only from the current agency workspace.',
      'identity','Unlinked selected chats remain unresolved until an agent explicitly links them to an existing Network person, signed player or recruitment target.',
      'player_club','A player or recruitment target current club is display context only and is never treated as the sender organisation or recruitment authority.',
      'external_action','Connected Work never sends an external message automatically.'
    )
  );
end;
$function$;



create or replace function private.redream_mirror_connected_prospect_interaction()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_direction text;
  v_external_ref text;
begin
  if new.prospect_id is null
     or new.channel not in ('instagram_selected_chat','whatsapp_selected_chat')
     or coalesce(new.source_type,'')<>'tell_djm'
  then
    return new;
  end if;

  v_direction:=case lower(coalesce(new.direction,''))
    when 'inbound' then 'inbound'
    when 'received' then 'inbound'
    when 'outbound' then 'outbound'
    when 'sent' then 'outbound'
    else null
  end;
  v_external_ref:=coalesce(nullif(trim(coalesce(new.source_external_id,'')),''),new.id::text);

  if not exists(
    select 1
    from djm_os.recruitment_interactions ri
    where ri.tenant_id=new.tenant_id
      and ri.prospect_id=new.prospect_id
      and ri.source='connected_messaging'
      and ri.external_ref=v_external_ref
  ) then
    insert into djm_os.recruitment_interactions(
      tenant_id,prospect_id,owner_user_id,channel,direction,summary,
      occurred_at,source,external_ref
    )
    values(
      new.tenant_id,new.prospect_id,new.team_member_id,
      case when new.channel='instagram_selected_chat' then 'instagram' else 'whatsapp' end,
      v_direction,left(coalesce(new.summary,'Connected message recorded.'),1800),
      new.occurred_at,'connected_messaging',v_external_ref
    );
  end if;

  update djm_os.scouting_prospects
  set
    first_contact_at=case
      when first_contact_at is null and v_direction='outbound' then new.occurred_at
      else first_contact_at
    end,
    last_contact_at=case
      when v_direction='outbound' then greatest(coalesce(last_contact_at,'epoch'::timestamptz),new.occurred_at)
      else last_contact_at
    end,
    last_reply_at=case
      when v_direction='inbound' then greatest(coalesce(last_reply_at,'epoch'::timestamptz),new.occurred_at)
      else last_reply_at
    end,
    recruitment_stage=case
      when recruitment_stage in ('identified','researching','ready_to_contact') and v_direction='outbound' then 'contacted'
      when recruitment_stage in ('identified','researching','ready_to_contact','contacted') and v_direction='inbound' then 'replied'
      else recruitment_stage
    end,
    preferred_contact_channel=coalesce(
      preferred_contact_channel,
      case when new.channel='instagram_selected_chat' then 'instagram' else 'whatsapp' end
    ),
    updated_at=now()
  where id=new.prospect_id
    and tenant_id=new.tenant_id
    and linked_player_id is null;

  return new;
end;
$function$;

create or replace function private.redream_promote_messaging_prospect_identity()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_player_id uuid:=coalesce(new.signed_player_id,new.linked_player_id);
  v_count integer:=0;
begin
  if v_player_id is null
     or v_player_id is not distinct from coalesce(old.signed_player_id,old.linked_player_id)
  then
    return new;
  end if;

  update djm_os.messaging_threads
  set
    bound_player_id=v_player_id,
    bound_prospect_id=null,
    bound_person_id=null,
    bound_organisation_id=null,
    bound_at=now(),
    updated_at=now()
  where tenant_id=new.tenant_id
    and bound_prospect_id=new.id;

  get diagnostics v_count=row_count;

  if v_count>0 then
    insert into djm_os.events(
      tenant_id,event_type,player_id,payload,source,confidence,occurred_at
    )
    values(
      new.tenant_id,'MESSAGING_PROSPECT_IDENTITY_PROMOTED',v_player_id,
      jsonb_build_object(
        'prospect_id',new.id,
        'player_id',v_player_id,
        'threads_updated',v_count,
        'identity_kind','player'
      ),
      'redream_messaging',1,now()
    );
  end if;

  return new;
end;
$function$;

create or replace function public.platform_server_connected_reply_context(
  p_tenant_id uuid,
  p_user_id uuid,
  p_interaction_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_interaction djm_os.interactions%rowtype;
  v_person_name text;
  v_source_org_name text;
  v_current_org_id uuid;
  v_current_org_name text;
  v_current_role text;
  v_player_name text;
  v_player_current_club text;
  v_prospect_name text;
  v_prospect_current_club text;
  v_prospect_stage text;
  v_recent jsonb:='[]'::jsonb;
  v_existing jsonb:=null;
  v_identity_kind text;
begin
  if p_user_id is null or not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then
    raise exception 'workspace_access_denied' using errcode='42501';
  end if;

  select * into v_interaction
  from djm_os.interactions i
  where i.id=p_interaction_id
    and i.tenant_id=p_tenant_id
    and i.team_member_id=p_user_id
    and i.channel in ('google_email','microsoft_email','instagram_selected_chat','whatsapp_selected_chat')
    and num_nonnulls(i.person_id,i.player_id,i.prospect_id)=1
    and nullif(trim(i.summary),'') is not null
  limit 1;

  if v_interaction.id is null then raise exception 'connected_interaction_not_available'; end if;

  if (v_interaction.channel in ('google_email','microsoft_email') and lower(coalesce(v_interaction.direction,'')) not in ('inbound','received'))
     or (v_interaction.channel in ('instagram_selected_chat','whatsapp_selected_chat') and lower(coalesce(v_interaction.direction,'')) in ('outbound','sent'))
  then
    raise exception 'reply_draft_requires_inbound_interaction';
  end if;

  if v_interaction.player_id is not null then
    v_identity_kind:='player';
    select coalesce(nullif(trim(p.preferred_name),''),nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),'Player'),p.current_club
    into v_player_name,v_player_current_club
    from public.players p
    where p.id=v_interaction.player_id and p.tenant_id=p_tenant_id
    limit 1;
    if v_player_name is null then raise exception 'connected_player_not_available'; end if;
  elsif v_interaction.prospect_id is not null then
    v_identity_kind:='recruitment_target';
    select sp.full_name,sp.current_club,sp.recruitment_stage
    into v_prospect_name,v_prospect_current_club,v_prospect_stage
    from djm_os.scouting_prospects sp
    where sp.id=v_interaction.prospect_id and sp.tenant_id=p_tenant_id
    limit 1;
    if v_prospect_name is null then raise exception 'connected_recruitment_target_not_available'; end if;
  else
    v_identity_kind:='network_person';
    select p.full_name into v_person_name
    from djm_os.people p where p.id=v_interaction.person_id and p.tenant_id=p_tenant_id;
    if v_person_name is null then raise exception 'connected_person_not_available'; end if;

    if v_interaction.organisation_id is not null then
      select o.name into v_source_org_name
      from djm_os.organisations o
      where o.id=v_interaction.organisation_id and o.tenant_id=p_tenant_id;
    end if;

    select e.organisation_id,o.name,e.role_title
    into v_current_org_id,v_current_org_name,v_current_role
    from djm_os.employments e
    join djm_os.organisations o on o.id=e.organisation_id and o.tenant_id=p_tenant_id
    where e.tenant_id=p_tenant_id and e.person_id=v_interaction.person_id and e.is_current
    order by coalesce(e.last_verified_at,e.updated_at) desc nulls last,e.updated_at desc
    limit 1;
  end if;

  select coalesce(jsonb_agg(item order by occurred_at desc),'[]'::jsonb)
  into v_recent
  from (
    select jsonb_build_object(
      'interaction_id',i.id,'channel',i.channel,'direction',i.direction,
      'summary',left(i.summary,1200),'occurred_at',i.occurred_at
    ) as item,i.occurred_at
    from djm_os.interactions i
    where i.tenant_id=p_tenant_id
      and i.team_member_id=p_user_id
      and (
        (v_identity_kind='player' and i.player_id=v_interaction.player_id)
        or (v_identity_kind='recruitment_target' and i.prospect_id=v_interaction.prospect_id)
        or (v_identity_kind='network_person' and i.person_id=v_interaction.person_id)
      )
      and i.id<>v_interaction.id
      and i.channel in ('google_email','microsoft_email','instagram_selected_chat','whatsapp_selected_chat')
      and nullif(trim(i.summary),'') is not null
      and i.occurred_at<=v_interaction.occurred_at
      and i.occurred_at>=v_interaction.occurred_at-interval '90 days'
    order by i.occurred_at desc limit 4
  ) q;

  select jsonb_build_object(
    'draft_id',d.id,'draft_text',d.draft_text,'model',d.model,
    'prompt_version',d.prompt_version,'updated_at',d.updated_at
  ) into v_existing
  from djm_os.connected_reply_drafts d
  where d.tenant_id=p_tenant_id and d.owner_user_id=p_user_id and d.interaction_id=p_interaction_id
  limit 1;

  return jsonb_build_object(
    'contract_version','redream_connected_reply_drafts_v3',
    'interaction',jsonb_build_object(
      'interaction_id',v_interaction.id,'channel',v_interaction.channel,'direction',v_interaction.direction,
      'summary',left(v_interaction.summary,1800),'occurred_at',v_interaction.occurred_at
    ),
    'identity',jsonb_build_object(
      'kind',v_identity_kind,
      'name',coalesce(v_player_name,v_prospect_name,v_person_name),
      'person_id',v_interaction.person_id,
      'player_id',v_interaction.player_id,
      'prospect_id',v_interaction.prospect_id,
      'source_organisation_id',case when v_identity_kind='network_person' then v_interaction.organisation_id else null end,
      'source_organisation_name',case when v_identity_kind='network_person' then v_source_org_name else null end,
      'current_organisation_id',case when v_identity_kind='network_person' then v_current_org_id else null end,
      'current_organisation_name',case when v_identity_kind='network_person' then v_current_org_name else null end,
      'current_role',case when v_identity_kind='network_person' then v_current_role else null end,
      'player_current_club',case when v_identity_kind='player' then v_player_current_club else null end,
      'prospect_current_club',case when v_identity_kind='recruitment_target' then v_prospect_current_club else null end,
      'recruitment_stage',case when v_identity_kind='recruitment_target' then v_prospect_stage else null end
    ),
    'person',case when v_identity_kind='network_person' then jsonb_build_object(
      'person_id',v_interaction.person_id,'name',v_person_name,
      'source_organisation_id',v_interaction.organisation_id,'source_organisation_name',v_source_org_name,
      'current_organisation_id',v_current_org_id,'current_organisation_name',v_current_org_name,'current_role',v_current_role
    ) else null end,
    'player',case when v_identity_kind='player' then jsonb_build_object(
      'player_id',v_interaction.player_id,'name',v_player_name,'current_club',v_player_current_club
    ) else null end,
    'prospect',case when v_identity_kind='recruitment_target' then jsonb_build_object(
      'prospect_id',v_interaction.prospect_id,'name',v_prospect_name,'current_club',v_prospect_current_club,'recruitment_stage',v_prospect_stage
    ) else null end,
    'recent_context',v_recent,
    'existing_draft',v_existing,
    'truth_contract',jsonb_build_object(
      'source_scope','The draft is grounded in one specific connected interaction owned by the signed-in agent.',
      'context_scope','Recent context includes only that same agent connected conversation summaries with the same confirmed identity.',
      'identity','The sender is an explicitly bound Network person, signed player or recruitment target. Recruitment targets are not treated as represented players until promotion is recorded.',
      'club','Player and recruitment-target clubs are display context only and are not treated as club authority.',
      'external_action','This contract prepares internal draft context only. It never sends a message or changes external provider data.',
      'commitments','A draft must not invent representation status, prices, dates, promises, availability, deal terms or other commitments that are not supported by recorded evidence.'
    )
  );
end;
$function$;

create or replace function public.platform_server_connected_reply_store(
  p_tenant_id uuid,p_user_id uuid,p_interaction_id uuid,p_draft_text text,
  p_model text,p_prompt_version text,p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_interaction djm_os.interactions%rowtype;
  v_text text:=nullif(trim(coalesce(p_draft_text,'')),'');
  v_hash text;
  v_draft djm_os.connected_reply_drafts%rowtype;
  v_identity_kind text;
begin
  if p_user_id is null or not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then
    raise exception 'workspace_access_denied' using errcode='42501';
  end if;
  if v_text is null or length(v_text)>4000 then raise exception 'reply_draft_invalid'; end if;
  if jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))<>'object' then raise exception 'reply_evidence_invalid'; end if;

  select * into v_interaction
  from djm_os.interactions i
  where i.id=p_interaction_id and i.tenant_id=p_tenant_id and i.team_member_id=p_user_id
    and i.channel in ('google_email','microsoft_email','instagram_selected_chat','whatsapp_selected_chat')
    and num_nonnulls(i.person_id,i.player_id,i.prospect_id)=1
    and nullif(trim(i.summary),'') is not null
  limit 1;
  if v_interaction.id is null then raise exception 'connected_interaction_not_available'; end if;

  if (v_interaction.channel in ('google_email','microsoft_email') and lower(coalesce(v_interaction.direction,'')) not in ('inbound','received'))
     or (v_interaction.channel in ('instagram_selected_chat','whatsapp_selected_chat') and lower(coalesce(v_interaction.direction,'')) in ('outbound','sent'))
  then raise exception 'reply_draft_requires_inbound_interaction'; end if;

  v_identity_kind:=case
    when v_interaction.player_id is not null then 'player'
    when v_interaction.prospect_id is not null then 'recruitment_target'
    else 'network_person'
  end;
  v_hash:=md5(coalesce(v_interaction.summary,'')||'|'||v_interaction.occurred_at::text);

  insert into djm_os.connected_reply_drafts(
    tenant_id,owner_user_id,interaction_id,person_id,player_id,prospect_id,organisation_id,channel,
    source_occurred_at,source_summary_hash,draft_text,model,prompt_version,evidence_json,updated_at
  ) values(
    p_tenant_id,p_user_id,p_interaction_id,v_interaction.person_id,v_interaction.player_id,v_interaction.prospect_id,
    case when v_identity_kind='network_person' then v_interaction.organisation_id else null end,
    v_interaction.channel,v_interaction.occurred_at,v_hash,v_text,
    nullif(trim(coalesce(p_model,'')),''),coalesce(nullif(trim(coalesce(p_prompt_version,'')),''),'connected_reply_v2'),
    coalesce(p_evidence,'{}'::jsonb),now()
  )
  on conflict (tenant_id,owner_user_id,interaction_id)
  do update set
    person_id=excluded.person_id,player_id=excluded.player_id,prospect_id=excluded.prospect_id,
    organisation_id=excluded.organisation_id,channel=excluded.channel,
    source_occurred_at=excluded.source_occurred_at,source_summary_hash=excluded.source_summary_hash,
    draft_text=excluded.draft_text,model=excluded.model,prompt_version=excluded.prompt_version,
    evidence_json=excluded.evidence_json,updated_at=now()
  returning * into v_draft;

  insert into djm_os.events(
    tenant_id,event_type,actor_user_id,person_id,organisation_id,player_id,payload,source,confidence,occurred_at
  ) values(
    p_tenant_id,
    case when lower(coalesce(v_draft.model,''))='human_edit' then 'CONNECTED_REPLY_DRAFT_EDITED' else 'CONNECTED_REPLY_DRAFT_GENERATED' end,
    p_user_id,v_interaction.person_id,
    case when v_identity_kind='network_person' then v_interaction.organisation_id else null end,
    v_interaction.player_id,
    jsonb_build_object(
      'draft_id',v_draft.id,'interaction_id',p_interaction_id,'channel',v_interaction.channel,
      'identity_kind',v_identity_kind,'prospect_id',v_interaction.prospect_id,
      'model',v_draft.model,'prompt_version',v_draft.prompt_version,'source_summary_hash',v_hash
    ),'connected_work',1,now()
  );

  return jsonb_build_object(
    'draft_id',v_draft.id,'interaction_id',v_draft.interaction_id,'draft_text',v_draft.draft_text,
    'model',v_draft.model,'prompt_version',v_draft.prompt_version,'updated_at',v_draft.updated_at,
    'identity_kind',v_identity_kind,'prospect_id',v_interaction.prospect_id,'external_action',false
  );
end;
$function$;


create or replace function public.platform_server_user_task_commands(
  p_tenant_id uuid,
  p_user_id uuid,
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_limit integer := greatest(
    1,
    least(coalesce(p_limit,12),50)
  );
  v_commands jsonb;
begin
  if not exists (
    select 1
    from platform.tenant_memberships m
    join platform.tenants tenant
      on tenant.id=m.tenant_id
     and tenant.status='active'
    join djm_os.team_members tm
      on tm.user_id=m.user_id
     and tm.is_active
    where m.tenant_id=p_tenant_id
      and m.user_id=p_user_id
      and m.status='active'
      and m.role in (
        'owner',
        'admin',
        'agent',
        'scout',
        'operations'
      )
  ) then
    raise exception 'active_tenant_staff_required';
  end if;

  with task_groups as (
    select
      lower(
        regexp_replace(
          trim(t.title),
          '\s+',
          ' ',
          'g'
        )
      ) as normalised_title,
      (
        array_agg(
          t.id
          order by
            t.due_at nulls last,
            t.created_at,
            t.id
        )
      )[1] as source_id,
      (
        array_agg(
          i.id
          order by
            t.due_at nulls last,
            t.created_at,
            t.id
        ) filter (
          where i.id is not null
            and i.team_member_id=p_user_id
            and i.channel in (
              'google_email',
              'microsoft_email',
              'instagram_selected_chat',
              'whatsapp_selected_chat'
            )
            and num_nonnulls(i.person_id,i.player_id,i.prospect_id)=1
            and nullif(trim(i.summary),'') is not null
            and (
              (
                i.channel in ('google_email','microsoft_email')
                and lower(coalesce(i.direction,'')) in ('inbound','received')
              )
              or (
                i.channel in ('instagram_selected_chat','whatsapp_selected_chat')
                and lower(coalesce(i.direction,'')) not in ('outbound','sent')
              )
            )
        )
      )[1] as reply_interaction_id,
      (
        array_agg(
          t.title
          order by
            t.due_at nulls last,
            t.created_at,
            t.id
        )
      )[1] as title,
      min(t.due_at) as due_at,
      count(*)::integer as task_count,
      max(t.priority)::integer as source_priority,
      jsonb_agg(
        jsonb_build_object(
          'task_id',t.id,
          'interaction_id',t.interaction_id,
          'owner_user_id',t.owner_user_id,
          'due_at',t.due_at,
          'player_id',t.player_id,
          'club_need_id',t.club_need_id,
          'source',t.source
        )
        order by
          t.due_at nulls last,
          t.created_at,
          t.id
      ) as task_evidence
    from djm_os.tasks t
    left join djm_os.interactions i
      on i.id=t.interaction_id
     and i.tenant_id=p_tenant_id
    where t.tenant_id=p_tenant_id
      and t.owner_user_id=p_user_id
      and t.status='open'
    group by lower(
      regexp_replace(
        trim(t.title),
        '\s+',
        ' ',
        'g'
      )
    )
  ),
  base as (
    select jsonb_build_object(
      'command_id','task:'||tg.source_id::text,
      'category','operations',
      'source_type','task',
      'source_id',tg.source_id,
      'reply_interaction_id',tg.reply_interaction_id,
      'owner_user_id',p_user_id,
      'command_type',
        case
          when tg.task_count>1
            then 'Consolidate duplicate follow-up'
          else 'Complete follow-up'
        end,
      'title',
        case
          when tg.task_count>1
            then tg.title||' ('||tg.task_count||' open copies)'
          else tg.title
        end,
      'recommended_action',
        case
          when tg.task_count>1
            then 'Complete the real follow-up, then close or merge your duplicate task records.'
          else 'Complete this follow-up and record the outcome.'
        end,
      'why_now',
        case
          when tg.due_at is not null
               and tg.due_at<now()
            then 'Your earliest open task is overdue.'
          when tg.due_at is not null
            then 'Your task is due soon.'
          else 'Your task is open with no due date.'
        end,
      'priority_score',
        least(
          100,
          case
            when tg.due_at is not null
                 and tg.due_at<now()
              then 72+least(
                23,
                ceil(
                  extract(
                    epoch from (now()-tg.due_at)
                  )/21600.0
                )::integer
              )
            when tg.due_at is not null
                 and tg.due_at<=now()+interval '24 hours'
              then 62
            when tg.due_at is null
              then 45
            else 35
          end
          + case
              when tg.task_count>1 then 6
              else 0
            end
        )::integer,
      'due_at',tg.due_at,
      'player_id',null,
      'club_need_id',null,
      'deal_room_id',null,
      'evidence',jsonb_build_object(
        'owner_user_id',p_user_id,
        'task_count',tg.task_count,
        'tasks',tg.task_evidence,
        'source_priority',tg.source_priority
      )
    ) as command
    from task_groups tg
    where tg.due_at is null
       or tg.due_at<=now()+interval '7 days'
       or tg.task_count>1
  ),
  profiled as (
    select
      b.command,
      profile,
      platform.command_evidence_health_v2(
        p_tenant_id,
        b.command
      ) as health,
      platform.command_actionability(
        b.command
      ) as base_actionability
    from base b
    cross join lateral
      platform.command_priority_profile(
        b.command
      ) profile
  ),
  enriched as (
    select command || jsonb_build_object(
      'base_priority_score',
        (command->>'priority_score')::integer,
      'priority_score',
        (profile->>'effective_score')::integer,
      'priority_band',
        profile->>'effective_band',
      'decision_basis',profile,
      'evidence_health',health,
      'actionability',
        base_actionability || jsonb_build_object(
          'evidence_gate','ready'
        )
    ) as command
    from profiled
  ),
  ranked as (
    select
      e.command,
      row_number() over(
        order by
          (e.command->>'priority_score')::integer desc,
          e.command->>'title'
      ) as rank
    from enriched e
  )
  select coalesce(
    jsonb_agg(
      command || jsonb_build_object(
        'rank',rank
      )
      order by rank
    ),
    '[]'::jsonb
  )
  into v_commands
  from ranked
  where rank<=v_limit;

  return jsonb_build_object(
    'tenant_id',p_tenant_id,
    'user_id',p_user_id,
    'generated_at',now(),
    'commands',v_commands,
    'truth_contract',jsonb_build_object(
      'ownership',
      'Only open tasks owned by this active agency user are returned.',
      'duplicates',
      'Duplicate grouping happens only inside one user’s task list. Identically named tasks owned by different people are never merged.',
      'reply_context',
      'A reply interaction is exposed only when the owned task points to one inbound connected email, Instagram or WhatsApp interaction for this same user with exactly one confirmed Network person or signed player identity.'
    )
  );
end;
$function$;

drop trigger if exists redream_keep_single_messaging_identity on djm_os.messaging_threads;
create trigger redream_keep_single_messaging_identity
before update of bound_person_id,bound_player_id,bound_prospect_id on djm_os.messaging_threads
for each row execute function private.redream_keep_single_messaging_identity();

drop trigger if exists redream_enrich_messaging_capture_prospect on djm_os.captures;
create trigger redream_enrich_messaging_capture_prospect
before insert on djm_os.captures
for each row execute function private.redream_enrich_messaging_capture_prospect();

drop trigger if exists redream_enrich_connected_interaction_prospect on djm_os.interactions;
create trigger redream_enrich_connected_interaction_prospect
before insert on djm_os.interactions
for each row execute function private.redream_enrich_connected_interaction_prospect();


drop trigger if exists redream_mirror_connected_prospect_interaction on djm_os.interactions;
create trigger redream_mirror_connected_prospect_interaction
after insert on djm_os.interactions
for each row execute function private.redream_mirror_connected_prospect_interaction();

drop trigger if exists redream_promote_messaging_prospect_identity on djm_os.scouting_prospects;
create trigger redream_promote_messaging_prospect_identity
after update of linked_player_id,signed_player_id on djm_os.scouting_prospects
for each row execute function private.redream_promote_messaging_prospect_identity();

revoke all on function private.redream_keep_single_messaging_identity() from public,anon,authenticated;
revoke all on function private.redream_enrich_messaging_capture_prospect() from public,anon,authenticated;
revoke all on function private.redream_enrich_connected_interaction_prospect() from public,anon,authenticated;

revoke all on function private.redream_mirror_connected_prospect_interaction() from public,anon,authenticated;
revoke all on function private.redream_promote_messaging_prospect_identity() from public,anon,authenticated;

revoke all on function public.redream_messaging_prospect_candidates() from public,anon;
grant execute on function public.redream_messaging_prospect_candidates() to authenticated,service_role;
revoke all on function public.redream_messaging_thread_bind_prospect(text,text,uuid) from public,anon;
grant execute on function public.redream_messaging_thread_bind_prospect(text,text,uuid) to authenticated,service_role;
revoke all on function public.redream_messaging_thread_create_prospect_and_bind(text,text,text,text,text,text) from public,anon;
grant execute on function public.redream_messaging_thread_create_prospect_and_bind(text,text,text,text,text,text) to authenticated,service_role;
revoke all on function public.redream_messaging_threads(text) from public,anon;
grant execute on function public.redream_messaging_threads(text) to authenticated,service_role;

revoke all on function public.platform_server_messaging_history_context(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.platform_server_messaging_history_context(uuid,uuid,text,text) to postgres,service_role;
revoke all on function public.platform_server_messaging_history_ingest(uuid,uuid,text,text,text,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_messaging_history_ingest(uuid,uuid,text,text,text,text,text,timestamptz,jsonb) to postgres,service_role;
revoke all on function public.platform_server_messaging_history_complete(uuid,uuid,text,text,integer,integer,integer,integer,integer,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.platform_server_messaging_history_complete(uuid,uuid,text,text,integer,integer,integer,integer,integer,timestamptz,timestamptz) to postgres,service_role;
revoke all on function public.platform_server_connected_work(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_connected_work(uuid,uuid,integer) to postgres,service_role;

revoke all on function public.platform_server_connected_reply_context(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_connected_reply_context(uuid,uuid,uuid) to postgres,service_role;
revoke all on function public.platform_server_connected_reply_store(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.platform_server_connected_reply_store(uuid,uuid,uuid,text,text,text,jsonb) to postgres,service_role;
revoke all on function public.platform_server_user_task_commands(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.platform_server_user_task_commands(uuid,uuid,integer) to postgres,service_role;

notify pgrst,'reload schema';
commit;
