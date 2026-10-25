-- Carry the reviewed contract expiry through the existing approved profile snapshots.
-- Existing snapshots remain NULL until an agent explicitly republishes. No backfill.
do $migration$
declare
 manifest constant jsonb:=$manifest$[{"identity":"public.platform_server_publish_player_profile_snapshot(uuid,uuid,uuid,jsonb)","before":"14d97ec779ff7e208132581dfb9cf217","after":"89bc32e73621efe8a584cbb68baa45c0","rules":[{"old":"current_status,current_club,key_stats","new":"current_status,contract_expiry,current_club,key_stats","count":1},{"old":"    v_player.contract_status,\n    v_player.current_club,","new":"    v_player.contract_status,\n    v_player.contract_expiry,\n    v_player.current_club,","count":1},{"old":"    current_status=excluded.current_status,","new":"    current_status=excluded.current_status,\n    contract_expiry=excluded.contract_expiry,","count":1}]},{"identity":"private.protect_public_profile_admin_fields()","before":"892f6bbd5a84852275ca2224c2048357","after":"37f58edc12aee45874525506027ae062","rules":[{"old":"'nationalities','current_status','current_club'","new":"'nationalities','current_status','contract_expiry','current_club'","count":2},{"old":"and new.verified_at is not distinct from old.verified_at","new":"and new.verified_at is not distinct from old.verified_at\n      and new.contract_expiry is not distinct from old.contract_expiry","count":1},{"old":"or new.verified_at is distinct from old.verified_at","new":"or new.verified_at is distinct from old.verified_at\n      or new.contract_expiry is distinct from old.contract_expiry","count":1}]},{"identity":"private.visible_public_player_profile(jsonb)","before":"ccd5fa0ef4523b2f16a7bd96aef54632","after":"addb0207b379bfd89e231a4d3d19ecf5","rules":[{"old":"'current_status','current_club'","new":"'current_status','contract_expiry','current_club'","count":1}]},{"identity":"private.protect_player_profile_version()","before":"c1f38d64bd79826d571e9d4de2505ec6","after":"c7e881bd87863575a8a5845f745590f9","rules":[{"old":"'current_status', 'current_club'","new":"'current_status', 'contract_expiry', 'current_club'","count":2},{"old":"  foreach v_key in array array[\n    'secondary_positions', 'nationalities', 'notable_experience',","new":"  if new.presentation ? 'contract_expiry' and\n     (new.presentation ->> 'contract_expiry') is distinct from\n       (select pp.contract_expiry::text from public.player_public_profiles pp where pp.player_id=new.player_id) then\n    raise exception 'Profile contract expiry must match the published player profile';\n  end if;\n\n  foreach v_key in array array[\n    'secondary_positions', 'nationalities', 'notable_experience',","count":1}]},{"identity":"public.get_club_share(uuid)","before":"b60b8a295564f1cd714504c99e9dd468","after":"61edbdb4a3021e7c84d89a5a3e70ba8b","rules":[{"old":"'current_status', pp.current_status,","new":"'current_status', pp.current_status,\n        'contract_expiry', pp.contract_expiry,","count":1},{"old":"'current_status', v.presentation -> 'current_status',","new":"'current_status', v.presentation -> 'current_status',\n        'contract_expiry', v.presentation -> 'contract_expiry',","count":1}]},{"identity":"private.enforce_public_profile_publish_rules()","before":"c43d7b83aaec7b1465cd1611e133625d","after":"921841253cbbbf225e78ccce58588aa5","rules":[{"old":"declare v_status text; v_verified timestamptz;","new":"declare v_status text; v_verified timestamptz; v_contract_expiry date; v_check_expiry boolean:=false;","count":1},{"old":"    new.verified_at := v_verified;","new":"    new.verified_at := v_verified;\n    if tg_op='INSERT' then v_check_expiry:=true;\n    elsif new.contract_expiry is distinct from old.contract_expiry then v_check_expiry:=true;end if;\n    if v_check_expiry and new.contract_expiry is not null then\n      select p.contract_expiry into v_contract_expiry from public.players p where p.id=new.player_id;\n      if new.contract_expiry is distinct from v_contract_expiry then\n        raise exception 'Published contract expiry must match the verified player record';\n      end if;\n    end if;","count":1}]}]$manifest$::jsonb;
 item jsonb;rule jsonb;target oid;definition text;source_hash text;
 original_metadata jsonb;column_exists boolean;
begin
 perform set_config('lock_timeout','5s',true);
 perform set_config('statement_timeout','30s',true);
 -- Refuse unknown implementations before changing the schema or any function.
 for item in select value from jsonb_array_elements(manifest) loop
  target:=to_regprocedure(item->>'identity');
  select md5(prosrc) into source_hash from pg_proc where oid=target;
  if target is null or source_hash not in (item->>'before',item->>'after') then
   raise exception 'Profile contract expiry differs from reviewed function: %',item->>'identity';
  end if;
 end loop;
 select exists(select 1 from pg_attribute where attrelid='public.player_public_profiles'::regclass and attname='contract_expiry' and not attisdropped) into column_exists;
 if column_exists then
  if not exists(select 1 from pg_attribute a where a.attrelid='public.player_public_profiles'::regclass and a.attname='contract_expiry' and a.atttypid='date'::regtype and not a.attnotnull and not a.atthasdef and not a.attisdropped) then
   raise exception 'Profile contract expiry column differs from the reviewed nullable date';
  end if;
 else
  alter table public.player_public_profiles add column contract_expiry date;
 end if;
 for item in select value from jsonb_array_elements(manifest) loop
  target:=to_regprocedure(item->>'identity');
  select md5(prosrc),jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef)
   into source_hash,original_metadata from pg_proc where oid=target;
  if source_hash=item->>'after' then continue;end if;
  definition:=pg_get_functiondef(target);
  for rule in select value from jsonb_array_elements(item->'rules') loop
   if (length(definition)-length(replace(definition,rule->>'old','')))/length(rule->>'old')<>(rule->>'count')::integer then
    raise exception 'Profile contract expiry reviewed edit is missing: %',item->>'identity';
   end if;
   definition:=replace(definition,rule->>'old',rule->>'new');
  end loop;
  execute definition;
  if target is distinct from to_regprocedure(item->>'identity') or not exists(
   select 1 from pg_proc where oid=target and md5(prosrc)=item->>'after'
    and jsonb_build_object('oid',oid,'owner',proowner,'acl',proacl,'config',proconfig,'definer',prosecdef)=original_metadata
  ) then raise exception 'Profile contract expiry changed the existing function contract: %',item->>'identity';end if;
 end loop;
end;
$migration$;
