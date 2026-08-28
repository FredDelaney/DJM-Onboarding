create or replace function djm_os.position_matches_player(
  p_need_position text,
  p_primary text,
  p_secondary text[]
) returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  with values_normalised as (
    select
      lower(trim(coalesce(p_need_position, ''))) as need,
      lower(concat_ws(' ', coalesce(p_primary, ''), array_to_string(coalesce(p_secondary, '{}'), ' '))) as player_roles
  )
  select case
    when need = '' then true
    when need ~ '(^|[^a-z])(gk)([^a-z]|$)' or need like '%goalkeep%' then player_roles ~ '(^|[^a-z])(gk)([^a-z]|$)' or player_roles like '%goalkeep%'
    when need ~ 'defensive mid|holding mid|(^|[^a-z])(cdm|dm|6)([^a-z]|$)' then player_roles ~ 'defensive mid|holding mid|(^|[^a-z])(cdm|dm|6)([^a-z]|$)'
    when need ~ 'attacking mid|(^|[^a-z])(cam|am|10)([^a-z]|$)' then player_roles ~ 'attacking mid|(^|[^a-z])(cam|am|10)([^a-z]|$)'
    when need ~ 'central mid|centre mid|box.to.box|(^|[^a-z])(cm|rcm|lcm|8)([^a-z]|$)' then player_roles ~ 'central mid|centre mid|box.to.box|(^|[^a-z])(cm|rcm|lcm|8)([^a-z]|$)'
    when need ~ 'left wing.back|(^|[^a-z])(lwb)([^a-z]|$)' then player_roles ~ 'left wing.back|(^|[^a-z])(lwb)([^a-z]|$)'
    when need ~ 'right wing.back|(^|[^a-z])(rwb)([^a-z]|$)' then player_roles ~ 'right wing.back|(^|[^a-z])(rwb)([^a-z]|$)'
    when need ~ 'left back|(^|[^a-z])(lb)([^a-z]|$)' then player_roles ~ 'left back|(^|[^a-z])(lb)([^a-z]|$)'
    when need ~ 'right back|(^|[^a-z])(rb)([^a-z]|$)' then player_roles ~ 'right back|(^|[^a-z])(rb)([^a-z]|$)'
    when need ~ 'centre back|center back|central defend|(^|[^a-z])(cb|lcb|rcb)([^a-z]|$)' then player_roles ~ 'centre back|center back|central defend|(^|[^a-z])(cb|lcb|rcb)([^a-z]|$)'
    when need ~ 'left wing|left winger|(^|[^a-z])(lw)([^a-z]|$)' then player_roles ~ 'left wing|left winger|(^|[^a-z])(lw)([^a-z]|$)'
    when need ~ 'right wing|right winger|(^|[^a-z])(rw)([^a-z]|$)' then player_roles ~ 'right wing|right winger|(^|[^a-z])(rw)([^a-z]|$)'
    when need ~ 'winger|wide forward' then player_roles ~ 'winger|wide forward|left wing|right wing|(^|[^a-z])(lw|rw)([^a-z]|$)'
    when need ~ 'striker|centre forward|center forward|(^|[^a-z])(st|cf|9)([^a-z]|$)' then player_roles ~ 'striker|centre forward|center forward|forward|(^|[^a-z])(st|cf|9)([^a-z]|$)'
    else player_roles like '%' || need || '%'
  end
  from values_normalised;
$$;

revoke all on function djm_os.position_matches_player(text,text,text[]) from public, anon;
grant execute on function djm_os.position_matches_player(text,text,text[]) to authenticated, service_role;

do $$
declare r record;
begin
  for r in select id from djm_os.club_needs where status in ('active', 'open', 'confirmed') loop
    perform djm_os.refresh_need_matches(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
