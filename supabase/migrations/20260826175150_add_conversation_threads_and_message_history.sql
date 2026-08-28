create table if not exists djm_os.conversation_threads (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  owner_user_id uuid not null references djm_os.team_members(user_id) on delete cascade,
  person_id uuid references djm_os.people(id) on delete set null,
  organisation_id uuid references djm_os.organisations(id) on delete set null,
  external_thread_id text,
  thread_label text,
  status text not null default 'active',
  first_message_at timestamptz,
  last_message_at timestamptz,
  message_count integer not null default 0,
  latest_summary text,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id,channel,external_thread_id)
);
create index if not exists conversation_threads_person_idx on djm_os.conversation_threads(person_id,last_message_at desc);
create index if not exists conversation_threads_org_idx on djm_os.conversation_threads(organisation_id,last_message_at desc);

create table if not exists djm_os.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references djm_os.conversation_threads(id) on delete cascade,
  external_message_id text,
  message_hash text,
  sent_at timestamptz not null,
  direction text not null,
  sender_label text,
  raw_text text,
  message_type text not null default 'text',
  asset_uri text,
  transcript_text text,
  reply_to_external_id text,
  extracted_json jsonb not null default '{}'::jsonb,
  processing_status text not null default 'stored',
  created_at timestamptz not null default now()
);
create unique index if not exists messages_thread_external_unique on djm_os.messages(thread_id,external_message_id) where external_message_id is not null;
create unique index if not exists messages_thread_hash_unique on djm_os.messages(thread_id,message_hash) where message_hash is not null;
create index if not exists messages_thread_time_idx on djm_os.messages(thread_id,sent_at desc);

alter table djm_os.conversation_threads enable row level security;
alter table djm_os.messages enable row level security;
grant select,insert,update,delete on djm_os.conversation_threads,djm_os.messages to authenticated;
create policy djm_team_select on djm_os.conversation_threads for select to authenticated using ((select djm_os.is_team_member()));
create policy djm_team_insert on djm_os.conversation_threads for insert to authenticated with check ((select djm_os.is_team_member()) and owner_user_id=auth.uid());
create policy djm_team_update on djm_os.conversation_threads for update to authenticated using ((select djm_os.is_team_member()) and owner_user_id=auth.uid()) with check ((select djm_os.is_team_member()) and owner_user_id=auth.uid());
create policy djm_team_delete on djm_os.conversation_threads for delete to authenticated using ((select djm_os.is_team_member()) and owner_user_id=auth.uid());
create policy djm_team_select on djm_os.messages for select to authenticated using ((select djm_os.is_team_member()) and exists(select 1 from djm_os.conversation_threads t where t.id=thread_id));
create policy djm_team_insert on djm_os.messages for insert to authenticated with check ((select djm_os.is_team_member()) and exists(select 1 from djm_os.conversation_threads t where t.id=thread_id and t.owner_user_id=auth.uid()));
create policy djm_team_update on djm_os.messages for update to authenticated using ((select djm_os.is_team_member()) and exists(select 1 from djm_os.conversation_threads t where t.id=thread_id and t.owner_user_id=auth.uid())) with check ((select djm_os.is_team_member()) and exists(select 1 from djm_os.conversation_threads t where t.id=thread_id and t.owner_user_id=auth.uid()));
create policy djm_team_delete on djm_os.messages for delete to authenticated using ((select djm_os.is_team_member()) and exists(select 1 from djm_os.conversation_threads t where t.id=thread_id and t.owner_user_id=auth.uid()));

create or replace function public.djm_upsert_thread(p_channel text,p_external_thread_id text,p_person_id uuid default null,p_organisation_id uuid default null,p_thread_label text default null,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security invoker set search_path=''
as $$ declare v_id uuid; begin
  insert into djm_os.conversation_threads(channel,owner_user_id,person_id,organisation_id,external_thread_id,thread_label,source_metadata)
  values(lower(trim(p_channel)),auth.uid(),p_person_id,p_organisation_id,nullif(trim(coalesce(p_external_thread_id,'')),''),nullif(trim(coalesce(p_thread_label,'')),''),coalesce(p_metadata,'{}'::jsonb))
  on conflict(owner_user_id,channel,external_thread_id) do update set person_id=coalesce(excluded.person_id,djm_os.conversation_threads.person_id),organisation_id=coalesce(excluded.organisation_id,djm_os.conversation_threads.organisation_id),thread_label=coalesce(excluded.thread_label,djm_os.conversation_threads.thread_label),source_metadata=djm_os.conversation_threads.source_metadata||excluded.source_metadata,updated_at=now()
  returning id into v_id; return v_id;
end; $$;

create or replace function public.djm_store_message(p_thread_id uuid,p_sent_at timestamptz,p_direction text,p_raw_text text default null,p_external_message_id text default null,p_sender_label text default null,p_message_type text default 'text',p_asset_uri text default null,p_transcript_text text default null,p_reply_to_external_id text default null)
returns jsonb language plpgsql security invoker set search_path=''
as $$ declare v_id uuid; v_hash text; v_new boolean:=false; begin
  if not exists(select 1 from djm_os.conversation_threads t where t.id=p_thread_id and t.owner_user_id=auth.uid()) then raise exception 'Thread not found'; end if;
  v_hash:=encode(extensions.digest(coalesce(p_external_message_id,'')||'|'||coalesce(p_sent_at::text,'')||'|'||coalesce(p_direction,'')||'|'||coalesce(p_raw_text,'')||'|'||coalesce(p_transcript_text,''),'sha256'),'hex');
  insert into djm_os.messages(thread_id,external_message_id,message_hash,sent_at,direction,sender_label,raw_text,message_type,asset_uri,transcript_text,reply_to_external_id)
  values(p_thread_id,nullif(trim(coalesce(p_external_message_id,'')),''),v_hash,coalesce(p_sent_at,now()),lower(trim(p_direction)),nullif(trim(coalesce(p_sender_label,'')),''),p_raw_text,coalesce(nullif(lower(trim(p_message_type)),''),'text'),p_asset_uri,p_transcript_text,p_reply_to_external_id)
  on conflict(thread_id,message_hash) where message_hash is not null do nothing returning id into v_id;
  if v_id is not null then v_new:=true; update djm_os.conversation_threads set first_message_at=least(coalesce(first_message_at,p_sent_at),p_sent_at),last_message_at=greatest(coalesce(last_message_at,p_sent_at),p_sent_at),message_count=message_count+1,updated_at=now() where id=p_thread_id; end if;
  return jsonb_build_object('message_id',v_id,'created',v_new,'duplicate',not v_new);
end; $$;

create or replace function djm_os.thread_interaction_rollup(p_thread_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$ declare t djm_os.conversation_threads%rowtype; v_interaction uuid; v_summary text; begin
  select * into t from djm_os.conversation_threads where id=p_thread_id; if not found then return null; end if;
  select left(string_agg(coalesce(nullif(trim(coalesce(m.transcript_text,m.raw_text)),''),'['||m.message_type||']'),' | ' order by m.sent_at desc),1200) into v_summary from (select * from djm_os.messages where thread_id=p_thread_id order by sent_at desc limit 8)m;
  select id into v_interaction from djm_os.interactions where source_type='thread_rollup' and source_external_id=p_thread_id::text limit 1;
  if v_interaction is null then
    insert into djm_os.interactions(occurred_at,channel,direction,team_member_id,person_id,organisation_id,source_external_id,source_type,summary,confidence)
    values(coalesce(t.last_message_at,now()),t.channel,'thread',t.owner_user_id,t.person_id,t.organisation_id,p_thread_id::text,'thread_rollup',v_summary,1) returning id into v_interaction;
  else
    update djm_os.interactions set occurred_at=coalesce(t.last_message_at,occurred_at),person_id=coalesce(t.person_id,person_id),organisation_id=coalesce(t.organisation_id,organisation_id),summary=v_summary where id=v_interaction;
  end if;
  update djm_os.conversation_threads set latest_summary=v_summary where id=p_thread_id;
  if t.person_id is not null then insert into djm_os.relationships(team_member_id,person_id,last_meaningful_at,first_known_at,strength_score) values(t.owner_user_id,t.person_id,t.last_message_at,t.first_message_at,35) on conflict(team_member_id,person_id) do update set last_meaningful_at=greatest(coalesce(djm_os.relationships.last_meaningful_at,excluded.last_meaningful_at),excluded.last_meaningful_at),first_known_at=least(coalesce(djm_os.relationships.first_known_at,excluded.first_known_at),excluded.first_known_at),updated_at=now(); end if;
  return v_interaction;
end; $$;
revoke all on function djm_os.thread_interaction_rollup(uuid) from public,anon,authenticated;

create or replace function public.djm_thread_messages(p_thread_id uuid,p_before timestamptz default null,p_limit integer default 100)
returns table(id uuid,sent_at timestamptz,direction text,sender_label text,raw_text text,message_type text,asset_uri text,transcript_text text,processing_status text)
language sql stable security invoker set search_path=''
as $$ select m.id,m.sent_at,m.direction,m.sender_label,m.raw_text,m.message_type,m.asset_uri,m.transcript_text,m.processing_status from djm_os.messages m join djm_os.conversation_threads t on t.id=m.thread_id where m.thread_id=p_thread_id and (p_before is null or m.sent_at<p_before) and t.owner_user_id=auth.uid() order by m.sent_at desc limit greatest(1,least(coalesce(p_limit,100),500)); $$;

revoke execute on function public.djm_upsert_thread(text,text,uuid,uuid,text,jsonb),public.djm_store_message(uuid,timestamptz,text,text,text,text,text,text,text,text),public.djm_thread_messages(uuid,timestamptz,integer) from public,anon;
grant execute on function public.djm_upsert_thread(text,text,uuid,uuid,text,jsonb),public.djm_store_message(uuid,timestamptz,text,text,text,text,text,text,text,text),public.djm_thread_messages(uuid,timestamptz,integer) to authenticated;
notify pgrst,'reload schema';
