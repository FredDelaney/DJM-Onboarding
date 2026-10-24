-- An empty settings array means automatic selection, not an approved season total.
-- Agency-os already authorizes the tenant/player/operator before this service-role
-- write. Retain its bounded custom choices; browser/legacy writes keep filtering.
do $repair_profile_stat_settings$
declare
  v_oid oid:=pg_catalog.to_regprocedure('private.normalize_cv_key_stats()');
  v_definition text;
  v_anchor text:='  new.key_stats := private.player_authoritative_key_stats(new.player_id, new.key_stats);';
begin
  select pg_catalog.pg_get_functiondef(p.oid) into v_definition
  from pg_catalog.pg_proc p
  where p.oid=v_oid and pg_catalog.md5(p.prosrc)='f46035899762c318bb9880511833ecad'
    and p.prosecdef and p.provolatile='v' and p.prorettype='trigger'::regtype
    and p.proconfig=array['search_path=""']::text[]
    and pg_catalog.pg_get_userbyid(p.proowner)='postgres'
    and not exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
      where a.grantee<>p.proowner or a.privilege_type<>'EXECUTE' or a.is_grantable);
  if v_definition is null or pg_catalog.strpos(v_definition,v_anchor)=0 then
    raise exception 'profile_stat_settings_trigger_drift: review the current settings trigger before changing choices' using errcode='55000';
  end if;
  execute pg_catalog.replace(v_definition,v_anchor,$editor_choices$
  if pg_catalog.current_setting('role',true)='service_role' then
    if pg_catalog.jsonb_typeof(new.key_stats) is distinct from 'array' then
      raise exception 'Profile key numbers must be an array' using errcode='22023';
    end if;
    if pg_catalog.jsonb_array_length(new.key_stats)>6
       or exists(select 1 from pg_catalog.jsonb_array_elements(new.key_stats) item
         where pg_catalog.jsonb_typeof(item) is distinct from 'object'
           or pg_catalog.jsonb_typeof(item->'label') is distinct from 'string'
           or pg_catalog.jsonb_typeof(item->'value') is distinct from 'string'
           or pg_catalog.length(pg_catalog.btrim(item->>'label')) not between 1 and 50
           or pg_catalog.length(pg_catalog.btrim(item->>'value')) not between 1 and 50) then
      raise exception 'Choose up to six named profile key numbers' using errcode='22023';
    end if;
    -- Settings store editorial label/value pairs. Evidence belongs to selected refs.
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'label',pg_catalog.btrim(item->>'label'),'value',pg_catalog.btrim(item->>'value')) order by ord),'[]'::jsonb)
    into new.key_stats
    from pg_catalog.jsonb_array_elements(new.key_stats) with ordinality as items(item,ord);
  else
    new.key_stats := private.player_authoritative_key_stats(new.player_id, new.key_stats);
  end if;
$editor_choices$);
end;
$repair_profile_stat_settings$;
