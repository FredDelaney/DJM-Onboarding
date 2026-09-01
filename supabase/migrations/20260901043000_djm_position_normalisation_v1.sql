-- Keep the universal score model aligned with the position vocabulary already
-- accepted by player dossiers and development projections.
create or replace function private.djm_position_group(p_position text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := upper(regexp_replace(trim(coalesce(p_position,'')), '[.[:space:]-]+', '_', 'g'));
begin
  if v ~ '^(GK|GOALKEEPER)$' then return 'GK'; end if;
  if v ~ '^(CB|LCB|RCB|CENTRE_BACK|CENTER_BACK|CENTRAL_DEFENDER)$' then return 'CB'; end if;
  if v ~ '^(LB|RB|LWB|RWB|WB|FULL_BACK|FULLBACK|WING_BACK|WINGBACK|LEFT_BACK|RIGHT_BACK|LEFT_FULL_BACK|RIGHT_FULL_BACK|LEFT_WING_BACK|RIGHT_WING_BACK)$' then return 'FB_WB'; end if;
  if v ~ '^(DM|CDM|6|DEFENSIVE_MIDFIELDER|DEFENSIVE_MIDFIELD|HOLDING_MIDFIELDER)$' then return 'DM'; end if;
  if v ~ '^(CM|8|CENTRAL_MIDFIELDER|CENTRAL_MIDFIELD|CENTRE_MIDFIELDER|CENTRE_MIDFIELD)$' then return 'CM'; end if;
  if v ~ '^(AM|CAM|10|NO_10|ATTACKING_MIDFIELDER|ATTACKING_MIDFIELD)$' then return 'AM'; end if;
  if v ~ '^(LW|RW|LM|RM|W|WINGER|LEFT_WINGER|RIGHT_WINGER|LEFT_WING|RIGHT_WING|LEFT_MIDFIELDER|RIGHT_MIDFIELDER|LEFT_MIDFIELD|RIGHT_MIDFIELD)$' then return 'W'; end if;
  if v ~ '^(ST|CF|9|STRIKER|CENTRE_FORWARD|CENTER_FORWARD|CENTRAL_FORWARD|FORWARD|SECOND_STRIKER)$' then return 'ST'; end if;
  return 'UNKNOWN';
end;
$$;

revoke all on function private.djm_position_group(text) from public, anon;
grant execute on function private.djm_position_group(text) to authenticated, service_role;

-- Fail the migration if a common football label ever stops mapping to its
-- canonical score group.
do $$
begin
  if exists (
    select 1
    from (values
      ('Central Midfield', 'CM'),
      ('Centre Midfielder', 'CM'),
      ('Defensive Midfield', 'DM'),
      ('Attacking Midfield', 'AM'),
      ('Left Winger', 'W'),
      ('Right Wing', 'W'),
      ('Left Back', 'FB_WB'),
      ('Centre Forward', 'ST')
    ) as expected(source_label, position_group)
    where private.djm_position_group(expected.source_label) <> expected.position_group
  ) then
    raise exception 'DJM position normalisation self-test failed';
  end if;
end
$$;

-- Recalculate only subjects that were previously stranded in UNKNOWN and are
-- now covered by the canonical vocabulary. The existing scorecard trigger also
-- re-evaluates their projection eligibility.
do $$
declare
  r record;
begin
  for r in
    select s.id
    from djm_os.football_intelligence_subjects s
    join djm_os.football_subject_scorecards sc on sc.subject_id = s.id
    where sc.position_group = 'UNKNOWN'
      and private.djm_position_group(s.primary_position) <> 'UNKNOWN'
  loop
    perform djm_os.refresh_football_subject_scorecard(r.id);
  end loop;
end
$$;

notify pgrst, 'reload schema';
