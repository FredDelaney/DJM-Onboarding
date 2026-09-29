begin;

alter table djm_os.messaging_threads
  add column if not exists bound_player_id uuid
    references public.players(id)
    on delete set null;

create index if not exists messaging_threads_bound_player_idx
  on djm_os.messaging_threads(tenant_id,bound_player_id)
  where bound_player_id is not null;

alter table djm_os.messaging_threads
  drop constraint if exists messaging_threads_single_bound_identity;

alter table djm_os.messaging_threads
  add constraint messaging_threads_single_bound_identity
  check (num_nonnulls(bound_person_id,bound_player_id) <= 1);

alter table djm_os.interactions
  add column if not exists player_id uuid
    references public.players(id)
    on delete set null;

create index if not exists interactions_tenant_player_occurred_idx
  on djm_os.interactions(tenant_id,player_id,occurred_at desc)
  where player_id is not null;

alter table djm_os.connected_reply_drafts
  add column if not exists player_id uuid
    references public.players(id)
    on delete cascade;

alter table djm_os.connected_reply_drafts
  alter column person_id drop not null;

alter table djm_os.connected_reply_drafts
  drop constraint if exists connected_reply_drafts_single_identity;

alter table djm_os.connected_reply_drafts
  add constraint connected_reply_drafts_single_identity
  check (num_nonnulls(person_id,player_id)=1);

create index if not exists connected_reply_drafts_player_idx
  on djm_os.connected_reply_drafts(tenant_id,player_id,updated_at desc)
  where player_id is not null;


create or replace function public.redream_messaging_player_candidates()
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
        'player_id',p.id,
        'player_name',coalesce(
          nullif(trim(p.preferred_name),''),
          nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
          'Player'
        ),
        'primary_position',p.primary_position,
        'current_club',p.current_club,
        'instagram_url',p.instagram_url,
        'instagram_handle',case
          when nullif(trim(coalesce(p.instagram_url,'')),'') is null then null
          else nullif(
            lower(
              regexp_replace(
                regexp_replace(
                  trim(p.instagram_url),
                  '^.*instagram\.com/',
                  '',
                  'i'
                ),
                '[/?#].*$',
                '',
                'g'
              )
            ),
            ''
          )
        end
      )
      order by lower(coalesce(
        nullif(trim(p.preferred_name),''),
        nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
        'Player'
      )),p.id
    ),
    '[]'::jsonb
  )
  into v_items
  from public.players p
  where p.tenant_id=v_tenant
    and coalesce(p.football_status,'active') not in ('retired','inactive');

  return jsonb_build_object(
    'players',v_items,
    'truth_contract',jsonb_build_object(
      'scope','Only signed players in the current agency workspace are returned.',
      'instagram','An exact recorded Instagram handle may be shown as a suggestion, but no player is linked automatically.'
    )
  );
end;
$function$;

revoke all on function public.redream_messaging_player_candidates()
from public,anon;

grant execute on function public.redream_messaging_player_candidates()
to authenticated,service_role;


create or replace function public.redream_messaging_threads(
  p_provider text
)
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
  if v_user is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if not private.user_has_staff_tenant_access(v_tenant,v_user) then
    raise exception 'workspace_access_denied' using errcode='42501';
  end if;

  if v_provider not in ('whatsapp','instagram') then
    raise exception 'unsupported_provider';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'provider',t.provider,
        'external_thread_id',t.external_thread_id,
        'participant_label',t.participant_label,
        'is_selected',t.is_selected,
        'last_activity_at',t.last_activity_at,
        'bound_person_id',t.bound_person_id,
        'bound_person_name',pe.full_name,
        'bound_organisation_id',ce.organisation_id,
        'bound_organisation_name',o.name,
        'bound_player_id',t.bound_player_id,
        'bound_player_name',case
          when pl.id is null then null
          else coalesce(
            nullif(trim(pl.preferred_name),''),
            nullif(trim(concat_ws(' ',pl.first_name,pl.last_name)),''),
            'Player'
          )
        end,
        'bound_player_current_club',pl.current_club,
        'identity_kind',case
          when t.bound_player_id is not null then 'player'
          when t.bound_person_id is not null then 'network_person'
          else null
        end
      )
      order by t.is_selected desc,t.last_activity_at desc nulls last
    ),
    '[]'::jsonb
  )
  into v_items
  from djm_os.messaging_threads t
  left join djm_os.people pe
    on pe.id=t.bound_person_id
   and pe.tenant_id=v_tenant
  left join lateral (
    select e.organisation_id
    from djm_os.employments e
    where e.tenant_id=v_tenant
      and e.person_id=t.bound_person_id
      and e.is_current=true
    order by e.started_on desc nulls last,e.updated_at desc,e.id
    limit 1
  ) ce on true
  left join djm_os.organisations o
    on o.id=ce.organisation_id
   and o.tenant_id=v_tenant
  left join public.players pl
    on pl.id=t.bound_player_id
   and pl.tenant_id=v_tenant
  where t.tenant_id=v_tenant
    and t.user_id=v_user
    and t.provider=v_provider;

  return jsonb_build_object('threads',v_items);
end;
$function$;


create or replace function public.redream_messaging_thread_bind_contact(
  p_provider text,
  p_external_thread_id text,
  p_person_id uuid default null
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
  v_person_name text;
  v_organisation_id uuid;
  v_organisation_name text;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if not private.user_has_staff_tenant_access(v_tenant,v_user) then
    raise exception 'workspace_access_denied' using errcode='42501';
  end if;

  if v_provider not in ('whatsapp','instagram') then
    raise exception 'unsupported_provider';
  end if;

  if v_external_thread_id='' then
    raise exception 'thread_required';
  end if;

  select t.id,t.participant_label
  into v_thread_id,v_participant_label
  from djm_os.messaging_threads t
  where t.tenant_id=v_tenant
    and t.user_id=v_user
    and t.provider=v_provider
    and t.external_thread_id=v_external_thread_id
  limit 1;

  if v_thread_id is null then
    raise exception 'thread_not_found';
  end if;

  if p_person_id is null then
    update djm_os.messaging_threads
    set
      bound_person_id=null,
      bound_organisation_id=null,
      bound_player_id=null,
      bound_at=null,
      bound_by=null,
      updated_at=now()
    where id=v_thread_id;

    return jsonb_build_object(
      'thread_id',v_thread_id,
      'bound',false,
      'identity_kind',null,
      'bound_person_id',null,
      'bound_person_name',null,
      'bound_organisation_id',null,
      'bound_organisation_name',null,
      'bound_player_id',null,
      'bound_player_name',null
    );
  end if;

  select p.full_name
  into v_person_name
  from djm_os.people p
  where p.id=p_person_id
    and p.tenant_id=v_tenant
    and coalesce(p.person_type,'contact')<>'player'
  limit 1;

  if v_person_name is null then
    raise exception 'contact_not_found';
  end if;

  select e.organisation_id,o.name
  into v_organisation_id,v_organisation_name
  from djm_os.employments e
  join djm_os.organisations o
    on o.id=e.organisation_id
   and o.tenant_id=v_tenant
  where e.tenant_id=v_tenant
    and e.person_id=p_person_id
    and e.is_current=true
  order by e.started_on desc nulls last,e.updated_at desc,e.id
  limit 1;

  update djm_os.messaging_threads
  set
    bound_person_id=p_person_id,
    bound_organisation_id=v_organisation_id,
    bound_player_id=null,
    bound_at=now(),
    bound_by=v_user,
    updated_at=now()
  where id=v_thread_id;

  insert into djm_os.events(
    tenant_id,event_type,actor_user_id,person_id,organisation_id,
    payload,source,confidence,occurred_at
  )
  values(
    v_tenant,'MESSAGING_THREAD_CONTACT_BOUND',v_user,
    p_person_id,v_organisation_id,
    jsonb_build_object(
      'provider',v_provider,
      'external_thread_id',v_external_thread_id,
      'participant_label',v_participant_label,
      'person_name',v_person_name,
      'organisation_name',v_organisation_name,
      'identity_kind','network_person'
    ),
    'redream_messaging',1,now()
  );

  return jsonb_build_object(
    'thread_id',v_thread_id,
    'bound',true,
    'identity_kind','network_person',
    'bound_person_id',p_person_id,
    'bound_person_name',v_person_name,
    'bound_organisation_id',v_organisation_id,
    'bound_organisation_name',v_organisation_name,
    'bound_player_id',null,
    'bound_player_name',null
  );
end;
$function$;


create or replace function public.redream_messaging_thread_bind_player(
  p_provider text,
  p_external_thread_id text,
  p_player_id uuid default null
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
  v_player_name text;
  v_current_club text;
begin
  if v_user is null then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if not private.user_has_staff_tenant_access(v_tenant,v_user) then
    raise exception 'workspace_access_denied' using errcode='42501';
  end if;

  if v_provider not in ('whatsapp','instagram') then
    raise exception 'unsupported_provider';
  end if;

  if v_external_thread_id='' then
    raise exception 'thread_required';
  end if;

  select t.id,t.participant_label
  into v_thread_id,v_participant_label
  from djm_os.messaging_threads t
  where t.tenant_id=v_tenant
    and t.user_id=v_user
    and t.provider=v_provider
    and t.external_thread_id=v_external_thread_id
  limit 1;

  if v_thread_id is null then
    raise exception 'thread_not_found';
  end if;

  if p_player_id is null then
    update djm_os.messaging_threads
    set
      bound_person_id=null,
      bound_organisation_id=null,
      bound_player_id=null,
      bound_at=null,
      bound_by=null,
      updated_at=now()
    where id=v_thread_id;

    return jsonb_build_object(
      'thread_id',v_thread_id,
      'bound',false,
      'identity_kind',null,
      'bound_player_id',null,
      'bound_player_name',null
    );
  end if;

  select
    coalesce(
      nullif(trim(p.preferred_name),''),
      nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
      'Player'
    ),
    p.current_club
  into v_player_name,v_current_club
  from public.players p
  where p.id=p_player_id
    and p.tenant_id=v_tenant
    and coalesce(p.football_status,'active') not in ('retired','inactive')
  limit 1;

  if v_player_name is null then
    raise exception 'player_not_found';
  end if;

  update djm_os.messaging_threads
  set
    bound_person_id=null,
    bound_organisation_id=null,
    bound_player_id=p_player_id,
    bound_at=now(),
    bound_by=v_user,
    updated_at=now()
  where id=v_thread_id;

  insert into djm_os.events(
    tenant_id,event_type,actor_user_id,player_id,
    payload,source,confidence,occurred_at
  )
  values(
    v_tenant,'MESSAGING_THREAD_PLAYER_BOUND',v_user,p_player_id,
    jsonb_build_object(
      'provider',v_provider,
      'external_thread_id',v_external_thread_id,
      'participant_label',v_participant_label,
      'player_name',v_player_name,
      'player_current_club',v_current_club,
      'identity_kind','player'
    ),
    'redream_messaging',1,now()
  );

  return jsonb_build_object(
    'thread_id',v_thread_id,
    'bound',true,
    'identity_kind','player',
    'bound_person_id',null,
    'bound_organisation_id',null,
    'bound_player_id',p_player_id,
    'bound_player_name',v_player_name,
    'bound_player_current_club',v_current_club
  );
end;
$function$;


create or replace function private.redream_enrich_messaging_capture_context()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_provider text;
  v_external_thread_id text;
  v_person_id uuid;
  v_person_name text;
  v_organisation_id uuid;
  v_organisation_name text;
  v_player_id uuid;
  v_player_name text;
  v_player_current_club text;
begin
  v_provider:=lower(trim(coalesce(new.context_json->>'capture_origin','')));

  if v_provider not in ('instagram','whatsapp') then
    return new;
  end if;

  v_external_thread_id:=trim(coalesce(new.context_json->>'external_thread_id',''));

  if v_external_thread_id='' then
    return new;
  end if;

  select
    t.bound_person_id,
    pe.full_name,
    ce.organisation_id,
    o.name,
    t.bound_player_id,
    case
      when pl.id is null then null
      else coalesce(
        nullif(trim(pl.preferred_name),''),
        nullif(trim(concat_ws(' ',pl.first_name,pl.last_name)),''),
        'Player'
      )
    end,
    pl.current_club
  into
    v_person_id,
    v_person_name,
    v_organisation_id,
    v_organisation_name,
    v_player_id,
    v_player_name,
    v_player_current_club
  from djm_os.messaging_threads t
  left join djm_os.people pe
    on pe.id=t.bound_person_id
   and pe.tenant_id=t.tenant_id
  left join lateral (
    select e.organisation_id
    from djm_os.employments e
    where e.tenant_id=t.tenant_id
      and e.person_id=t.bound_person_id
      and e.is_current=true
    order by e.started_on desc nulls last,e.updated_at desc,e.id
    limit 1
  ) ce on true
  left join djm_os.organisations o
    on o.id=ce.organisation_id
   and o.tenant_id=t.tenant_id
  left join public.players pl
    on pl.id=t.bound_player_id
   and pl.tenant_id=t.tenant_id
  where t.tenant_id=new.tenant_id
    and t.user_id=new.submitted_by
    and t.provider=v_provider
    and t.external_thread_id=v_external_thread_id
    and t.is_selected=true
  limit 1;

  if v_person_id is null and v_player_id is null then
    return new;
  end if;

  if v_player_id is not null then
    new.player_id:=coalesce(new.player_id,v_player_id);
    new.context_json:=coalesce(new.context_json,'{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'player_id',v_player_id,
        'player_name',v_player_name,
        'player_current_club',v_player_current_club,
        'messaging_identity_kind','player',
        'messaging_identity_bound',true
      ));
    return new;
  end if;

  new.person_id:=coalesce(new.person_id,v_person_id);
  new.organisation_id:=coalesce(new.organisation_id,v_organisation_id);
  new.context_json:=coalesce(new.context_json,'{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'person_id',v_person_id,
      'person_name',v_person_name,
      'organisation_id',v_organisation_id,
      'organisation_name',v_organisation_name,
      'messaging_identity_kind','network_person',
      'messaging_identity_bound',true
    ));

  return new;
end;
$function$;


create or replace function private.redream_enrich_connected_interaction_player()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_capture_id uuid;
  v_player_id uuid;
begin
  if new.player_id is not null
     or new.channel not in ('instagram_selected_chat','whatsapp_selected_chat')
     or coalesce(new.source_type,'')<>'tell_djm'
     or coalesce(new.source_external_id,'') !~
       '^tell:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:'
  then
    return new;
  end if;

  begin
    v_capture_id:=split_part(new.source_external_id,':',2)::uuid;
  exception when others then
    return new;
  end;

  select c.player_id
  into v_player_id
  from djm_os.captures c
  where c.id=v_capture_id
    and c.tenant_id=new.tenant_id
    and c.submitted_by is not distinct from new.team_member_id
  limit 1;

  if v_player_id is not null then
    new.player_id:=v_player_id;
  end if;

  return new;
end;
$function$;

drop trigger if exists redream_enrich_connected_interaction_player
on djm_os.interactions;

create trigger redream_enrich_connected_interaction_player
before insert on djm_os.interactions
for each row
execute function private.redream_enrich_connected_interaction_player();


create or replace function public.platform_server_connected_work(
  p_tenant_id uuid,
  p_user_id uuid,
  p_limit integer default 6
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
  if p_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then
    raise exception 'workspace_access_denied';
  end if;

  select coalesce(nullif(trim(tm.display_name),''),'You')
  into v_owner_name
  from platform.tenant_memberships membership
  left join djm_os.team_members tm
    on tm.user_id=membership.user_id
   and tm.is_active
  where membership.tenant_id=p_tenant_id
    and membership.user_id=p_user_id
    and membership.status='active'
    and membership.role in ('owner','admin','agent','operations','scout')
  limit 1;

  v_owner_name:=coalesce(v_owner_name,'You');

  select count(*)::int,max(mt.last_activity_at)
  into v_unlinked_count,v_latest_unlinked_at
  from djm_os.messaging_threads mt
  where mt.tenant_id=p_tenant_id
    and mt.user_id=p_user_id
    and mt.is_selected=true
    and mt.bound_person_id is null
    and mt.bound_player_id is null;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('provider',provider,'count',item_count)
      order by item_count desc,provider
    ),
    '[]'::jsonb
  )
  into v_unlinked_by_provider
  from (
    select mt.provider,count(*)::int as item_count
    from djm_os.messaging_threads mt
    where mt.tenant_id=p_tenant_id
      and mt.user_id=p_user_id
      and mt.is_selected=true
      and mt.bound_person_id is null
      and mt.bound_player_id is null
    group by mt.provider
  ) q;

  select count(*)::int
  into v_followup_count
  from djm_os.tasks t
  where t.tenant_id=p_tenant_id
    and t.owner_user_id=p_user_id
    and t.status not in ('done','completed','cancelled')
    and t.source like 'tell_djm:%'
    and exists (
      select 1
      from djm_os.captures c
      where c.tenant_id=p_tenant_id
        and t.source like 'tell_djm:'||c.id::text||':%'
        and (
          c.context_json->>'capture_origin'='email'
          or c.channel in ('instagram_selected_chat','whatsapp_selected_chat')
        )
    );

  select count(*)::int
  into v_recent_count
  from djm_os.interactions i
  where i.tenant_id=p_tenant_id
    and i.team_member_id=p_user_id
    and i.channel in (
      'google_email','microsoft_email',
      'instagram_selected_chat','whatsapp_selected_chat'
    )
    and i.occurred_at>now()-interval '30 days'
    and (
      i.person_id is not null
      or i.organisation_id is not null
      or i.player_id is not null
    );

  select coalesce(jsonb_agg(item order by sort_at desc),'[]'::jsonb)
  into v_recent
  from (
    select
      jsonb_build_object(
        'interaction_id',i.id,
        'channel',i.channel,
        'direction',i.direction,
        'summary',i.summary,
        'occurred_at',i.occurred_at,
        'person_id',i.person_id,
        'person_name',pe.full_name,
        'organisation_id',i.organisation_id,
        'organisation_name',o.name,
        'player_id',i.player_id,
        'player_name',case
          when pl.id is null then null
          else coalesce(
            nullif(trim(pl.preferred_name),''),
            nullif(trim(concat_ws(' ',pl.first_name,pl.last_name)),''),
            'Player'
          )
        end,
        'player_current_club',pl.current_club,
        'identity_kind',case
          when i.player_id is not null then 'player'
          when i.person_id is not null then 'network_person'
          else null
        end,
        'owner_user_id',p_user_id,
        'owner_name',v_owner_name
      ) as item,
      i.occurred_at as sort_at
    from djm_os.interactions i
    left join djm_os.people pe
      on pe.id=i.person_id
     and pe.tenant_id=i.tenant_id
    left join djm_os.organisations o
      on o.id=i.organisation_id
     and o.tenant_id=i.tenant_id
    left join public.players pl
      on pl.id=i.player_id
     and pl.tenant_id=i.tenant_id
    where i.tenant_id=p_tenant_id
      and i.team_member_id=p_user_id
      and i.channel in (
        'google_email','microsoft_email',
        'instagram_selected_chat','whatsapp_selected_chat'
      )
      and i.occurred_at>now()-interval '30 days'
      and (
        i.person_id is not null
        or i.organisation_id is not null
        or i.player_id is not null
      )
    order by i.occurred_at desc
    limit least(v_limit,4)
  ) q;

  select count(*)::int
  into v_meeting_count
  from djm_os.meetings m
  where m.tenant_id=p_tenant_id
    and m.owner_user_id=p_user_id
    and m.status='scheduled'
    and m.starts_at between now() and now()+interval '7 days'
    and (m.person_id is not null or m.organisation_id is not null);

  select coalesce(jsonb_agg(item order by starts_at),'[]'::jsonb)
  into v_meetings
  from (
    select
      jsonb_build_object(
        'meeting_id',m.id,
        'title',m.title,
        'starts_at',m.starts_at,
        'ends_at',m.ends_at,
        'provider',m.provider,
        'meeting_url',m.meeting_url,
        'person_id',m.person_id,
        'person_name',pe.full_name,
        'organisation_id',m.organisation_id,
        'organisation_name',o.name,
        'owner_user_id',p_user_id,
        'owner_name',v_owner_name
      ) as item,
      m.starts_at
    from djm_os.meetings m
    left join djm_os.people pe
      on pe.id=m.person_id
     and pe.tenant_id=m.tenant_id
    left join djm_os.organisations o
      on o.id=m.organisation_id
     and o.tenant_id=m.tenant_id
    where m.tenant_id=p_tenant_id
      and m.owner_user_id=p_user_id
      and m.status='scheduled'
      and m.starts_at between now() and now()+interval '7 days'
      and (m.person_id is not null or m.organisation_id is not null)
    order by m.starts_at
    limit 2
  ) q;

  return jsonb_build_object(
    'contract_version','redream_connected_work_home_v2',
    'generated_at',now(),
    'summary',jsonb_build_object(
      'selected_chats_needing_link',v_unlinked_count,
      'connected_followups_open',v_followup_count,
      'recent_connected_conversations',v_recent_count,
      'linked_meetings_next_7_days',v_meeting_count
    ),
    'identity_resolution',jsonb_build_object(
      'count',v_unlinked_count,
      'by_provider',v_unlinked_by_provider,
      'latest_activity_at',v_latest_unlinked_at
    ),
    'recent_conversations',v_recent,
    'upcoming_meetings',v_meetings,
    'owner',jsonb_build_object('user_id',p_user_id,'name',v_owner_name),
    'truth_contract',jsonb_build_object(
      'personal_scope','Home Connected Work shows only the signed-in agent connected accounts, owned follow-ups, recorded interactions and personal Calendar.',
      'shared_context','Network people come from the tenant Network and signed players come from the tenant player roster.',
      'identity','Unlinked selected chats remain unresolved until an agent explicitly links them to an existing Network person or signed player.',
      'player_club','A signed player current club is display context only and is never treated as the sender organisation or recruitment authority.',
      'external_action','Connected Work never sends an external message automatically.'
    )
  );
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
  v_recent jsonb:='[]'::jsonb;
  v_existing jsonb:=null;
  v_identity_kind text;
begin
  if p_user_id is null
    or not private.user_has_staff_tenant_access(p_tenant_id,p_user_id)
  then
    raise exception 'workspace_access_denied' using errcode='42501';
  end if;

  select *
  into v_interaction
  from djm_os.interactions i
  where i.id=p_interaction_id
    and i.tenant_id=p_tenant_id
    and i.team_member_id=p_user_id
    and i.channel in (
      'google_email','microsoft_email',
      'instagram_selected_chat','whatsapp_selected_chat'
    )
    and num_nonnulls(i.person_id,i.player_id)=1
    and nullif(trim(i.summary),'') is not null
  limit 1;

  if v_interaction.id is null then
    raise exception 'connected_interaction_not_available';
  end if;

  if (
    v_interaction.channel in ('google_email','microsoft_email')
    and lower(coalesce(v_interaction.direction,'')) not in ('inbound','received')
  )
  or (
    v_interaction.channel in ('instagram_selected_chat','whatsapp_selected_chat')
    and lower(coalesce(v_interaction.direction,'')) in ('outbound','sent')
  )
  then
    raise exception 'reply_draft_requires_inbound_interaction';
  end if;

  if v_interaction.player_id is not null then
    v_identity_kind:='player';

    select
      coalesce(
        nullif(trim(p.preferred_name),''),
        nullif(trim(concat_ws(' ',p.first_name,p.last_name)),''),
        'Player'
      ),
      p.current_club
    into v_player_name,v_player_current_club
    from public.players p
    where p.id=v_interaction.player_id
      and p.tenant_id=p_tenant_id
    limit 1;

    if v_player_name is null then
      raise exception 'connected_player_not_available';
    end if;
  else
    v_identity_kind:='network_person';

    select p.full_name
    into v_person_name
    from djm_os.people p
    where p.id=v_interaction.person_id
      and p.tenant_id=p_tenant_id;

    if v_person_name is null then
      raise exception 'connected_person_not_available';
    end if;

    if v_interaction.organisation_id is not null then
      select o.name
      into v_source_org_name
      from djm_os.organisations o
      where o.id=v_interaction.organisation_id
        and o.tenant_id=p_tenant_id;
    end if;

    select e.organisation_id,o.name,e.role_title
    into v_current_org_id,v_current_org_name,v_current_role
    from djm_os.employments e
    join djm_os.organisations o
      on o.id=e.organisation_id
     and o.tenant_id=p_tenant_id
    where e.tenant_id=p_tenant_id
      and e.person_id=v_interaction.person_id
      and e.is_current
    order by coalesce(e.last_verified_at,e.updated_at) desc nulls last,
             e.updated_at desc
    limit 1;
  end if;

  select coalesce(jsonb_agg(item order by occurred_at desc),'[]'::jsonb)
  into v_recent
  from (
    select
      jsonb_build_object(
        'interaction_id',i.id,
        'channel',i.channel,
        'direction',i.direction,
        'summary',left(i.summary,1200),
        'occurred_at',i.occurred_at
      ) as item,
      i.occurred_at
    from djm_os.interactions i
    where i.tenant_id=p_tenant_id
      and i.team_member_id=p_user_id
      and (
        (v_identity_kind='player' and i.player_id=v_interaction.player_id)
        or
        (v_identity_kind='network_person' and i.person_id=v_interaction.person_id)
      )
      and i.id<>v_interaction.id
      and i.channel in (
        'google_email','microsoft_email',
        'instagram_selected_chat','whatsapp_selected_chat'
      )
      and nullif(trim(i.summary),'') is not null
      and i.occurred_at<=v_interaction.occurred_at
      and i.occurred_at>=v_interaction.occurred_at-interval '90 days'
    order by i.occurred_at desc
    limit 4
  ) q;

  select jsonb_build_object(
    'draft_id',d.id,
    'draft_text',d.draft_text,
    'model',d.model,
    'prompt_version',d.prompt_version,
    'updated_at',d.updated_at
  )
  into v_existing
  from djm_os.connected_reply_drafts d
  where d.tenant_id=p_tenant_id
    and d.owner_user_id=p_user_id
    and d.interaction_id=p_interaction_id
  limit 1;

  return jsonb_build_object(
    'contract_version','redream_connected_reply_drafts_v2',
    'interaction',jsonb_build_object(
      'interaction_id',v_interaction.id,
      'channel',v_interaction.channel,
      'direction',v_interaction.direction,
      'summary',left(v_interaction.summary,1800),
      'occurred_at',v_interaction.occurred_at
    ),
    'identity',jsonb_build_object(
      'kind',v_identity_kind,
      'name',coalesce(v_player_name,v_person_name),
      'person_id',v_interaction.person_id,
      'player_id',v_interaction.player_id,
      'source_organisation_id',case
        when v_identity_kind='network_person'
        then v_interaction.organisation_id
        else null
      end,
      'source_organisation_name',case
        when v_identity_kind='network_person'
        then v_source_org_name
        else null
      end,
      'current_organisation_id',case
        when v_identity_kind='network_person'
        then v_current_org_id
        else null
      end,
      'current_organisation_name',case
        when v_identity_kind='network_person'
        then v_current_org_name
        else null
      end,
      'current_role',case
        when v_identity_kind='network_person'
        then v_current_role
        else null
      end,
      'player_current_club',case
        when v_identity_kind='player'
        then v_player_current_club
        else null
      end
    ),
    'person',case
      when v_identity_kind='network_person'
      then jsonb_build_object(
        'person_id',v_interaction.person_id,
        'name',v_person_name,
        'source_organisation_id',v_interaction.organisation_id,
        'source_organisation_name',v_source_org_name,
        'current_organisation_id',v_current_org_id,
        'current_organisation_name',v_current_org_name,
        'current_role',v_current_role
      )
      else null
    end,
    'player',case
      when v_identity_kind='player'
      then jsonb_build_object(
        'player_id',v_interaction.player_id,
        'name',v_player_name,
        'current_club',v_player_current_club
      )
      else null
    end,
    'recent_context',v_recent,
    'existing_draft',v_existing,
    'truth_contract',jsonb_build_object(
      'source_scope','The draft is grounded in one specific connected interaction owned by the signed-in agent.',
      'context_scope','Recent context includes only that same agent connected conversation summaries with the same confirmed identity.',
      'identity','The sender identity is an explicitly bound Network person or signed player. Player current club is display context only and is not treated as club authority.',
      'external_action','This contract prepares internal draft context only. It never sends a message or changes external provider data.',
      'commitments','A draft must not invent prices, dates, promises, player availability, deal terms or other commitments that are not supported by recorded evidence.'
    )
  );
end;
$function$;


create or replace function public.platform_server_connected_reply_store(
  p_tenant_id uuid,
  p_user_id uuid,
  p_interaction_id uuid,
  p_draft_text text,
  p_model text,
  p_prompt_version text,
  p_evidence jsonb default '{}'::jsonb
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
begin
  if p_user_id is null
    or not private.user_has_staff_tenant_access(p_tenant_id,p_user_id)
  then
    raise exception 'workspace_access_denied' using errcode='42501';
  end if;

  if v_text is null or length(v_text)>4000 then
    raise exception 'reply_draft_invalid';
  end if;

  if jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))<>'object' then
    raise exception 'reply_evidence_invalid';
  end if;

  select *
  into v_interaction
  from djm_os.interactions i
  where i.id=p_interaction_id
    and i.tenant_id=p_tenant_id
    and i.team_member_id=p_user_id
    and i.channel in (
      'google_email','microsoft_email',
      'instagram_selected_chat','whatsapp_selected_chat'
    )
    and num_nonnulls(i.person_id,i.player_id)=1
    and nullif(trim(i.summary),'') is not null
  limit 1;

  if v_interaction.id is null then
    raise exception 'connected_interaction_not_available';
  end if;

  if (
    v_interaction.channel in ('google_email','microsoft_email')
    and lower(coalesce(v_interaction.direction,'')) not in ('inbound','received')
  )
  or (
    v_interaction.channel in ('instagram_selected_chat','whatsapp_selected_chat')
    and lower(coalesce(v_interaction.direction,'')) in ('outbound','sent')
  )
  then
    raise exception 'reply_draft_requires_inbound_interaction';
  end if;

  v_hash:=md5(
    coalesce(v_interaction.summary,'')||'|'||v_interaction.occurred_at::text
  );

  insert into djm_os.connected_reply_drafts(
    tenant_id,owner_user_id,interaction_id,
    person_id,player_id,organisation_id,channel,
    source_occurred_at,source_summary_hash,draft_text,
    model,prompt_version,evidence_json,updated_at
  )
  values(
    p_tenant_id,p_user_id,p_interaction_id,
    v_interaction.person_id,v_interaction.player_id,
    case when v_interaction.player_id is null
      then v_interaction.organisation_id
      else null
    end,
    v_interaction.channel,v_interaction.occurred_at,v_hash,v_text,
    nullif(trim(coalesce(p_model,'')),''),
    coalesce(
      nullif(trim(coalesce(p_prompt_version,'')),''),
      'connected_reply_v1'
    ),
    coalesce(p_evidence,'{}'::jsonb),
    now()
  )
  on conflict (tenant_id,owner_user_id,interaction_id)
  do update set
    person_id=excluded.person_id,
    player_id=excluded.player_id,
    organisation_id=excluded.organisation_id,
    channel=excluded.channel,
    source_occurred_at=excluded.source_occurred_at,
    source_summary_hash=excluded.source_summary_hash,
    draft_text=excluded.draft_text,
    model=excluded.model,
    prompt_version=excluded.prompt_version,
    evidence_json=excluded.evidence_json,
    updated_at=now()
  returning * into v_draft;

  insert into djm_os.events(
    tenant_id,event_type,actor_user_id,
    person_id,organisation_id,player_id,
    payload,source,confidence,occurred_at
  )
  values(
    p_tenant_id,
    case
      when lower(coalesce(v_draft.model,''))='human_edit'
        then 'CONNECTED_REPLY_DRAFT_EDITED'
      else 'CONNECTED_REPLY_DRAFT_GENERATED'
    end,
    p_user_id,
    v_interaction.person_id,
    case when v_interaction.player_id is null
      then v_interaction.organisation_id
      else null
    end,
    v_interaction.player_id,
    jsonb_build_object(
      'draft_id',v_draft.id,
      'interaction_id',p_interaction_id,
      'channel',v_interaction.channel,
      'identity_kind',case
        when v_interaction.player_id is not null then 'player'
        else 'network_person'
      end,
      'model',v_draft.model,
      'prompt_version',v_draft.prompt_version,
      'source_summary_hash',v_hash
    ),
    'connected_work',1,now()
  );

  return jsonb_build_object(
    'draft_id',v_draft.id,
    'interaction_id',v_draft.interaction_id,
    'draft_text',v_draft.draft_text,
    'model',v_draft.model,
    'prompt_version',v_draft.prompt_version,
    'updated_at',v_draft.updated_at,
    'external_action',false
  );
end;
$function$;


revoke all on function public.redream_messaging_thread_bind_player(text,text,uuid)
from public,anon;

grant execute on function public.redream_messaging_thread_bind_player(text,text,uuid)
to authenticated,service_role;

revoke all on function public.redream_messaging_thread_bind_contact(text,text,uuid)
from public,anon;

grant execute on function public.redream_messaging_thread_bind_contact(text,text,uuid)
to authenticated,service_role;

revoke all on function public.redream_messaging_threads(text)
from public,anon;

grant execute on function public.redream_messaging_threads(text)
to authenticated,service_role;

revoke all on function public.redream_messaging_player_candidates()
from public,anon;

grant execute on function public.redream_messaging_player_candidates()
to authenticated,service_role;

revoke all on function private.redream_enrich_messaging_capture_context()
from public,anon,authenticated;

revoke all on function private.redream_enrich_connected_interaction_player()
from public,anon,authenticated;

revoke all on function public.platform_server_connected_work(uuid,uuid,integer)
from public,anon,authenticated;

grant execute on function public.platform_server_connected_work(uuid,uuid,integer)
to postgres,service_role;

revoke all on function public.platform_server_connected_reply_context(uuid,uuid,uuid)
from public,anon,authenticated;

grant execute on function public.platform_server_connected_reply_context(uuid,uuid,uuid)
to postgres,service_role;

revoke all on function public.platform_server_connected_reply_store(
  uuid,uuid,uuid,text,text,text,jsonb
)
from public,anon,authenticated;

grant execute on function public.platform_server_connected_reply_store(
  uuid,uuid,uuid,text,text,text,jsonb
)
to postgres,service_role;

notify pgrst,'reload schema';

commit;
