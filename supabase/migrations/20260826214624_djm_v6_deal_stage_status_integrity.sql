create or replace function public.djm_deal_room_upsert(
  p_id uuid default null,
  p_title text default null,
  p_organisation_id uuid default null,
  p_source_person_id uuid default null,
  p_player_id uuid default null,
  p_prospect_id uuid default null,
  p_club_need_id uuid default null,
  p_stage text default 'qualifying',
  p_expected_commission numeric default null,
  p_currency text default 'EUR',
  p_probability smallint default 25,
  p_primary_blocker text default null,
  p_next_decision text default null,
  p_next_action_at timestamptz default null,
  p_source text default 'manual'
) returns jsonb language plpgsql set search_path='' as $$
declare v_id uuid; v_owner uuid := (select auth.uid()); v_status text; v_probability smallint;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_stage not in ('qualifying','contacted','interest','negotiating','offer','contracting','won','lost','paused') then raise exception 'Invalid deal stage'; end if;
  v_status:=case when p_stage='won' then 'won' when p_stage='lost' then 'lost' when p_stage='paused' then 'paused' else 'active' end;
  v_probability:=case when p_stage='won' then 100 when p_stage='lost' then 0 else greatest(0,least(100,coalesce(p_probability,25))) end;
  if p_id is null then
    if p_organisation_id is null then raise exception 'Club is required'; end if;
    if num_nonnulls(p_player_id,p_prospect_id) <> 1 then raise exception 'Choose exactly one signed player or recruitment target'; end if;
    insert into djm_os.deal_rooms(title,organisation_id,source_person_id,player_id,prospect_id,club_need_id,owner_user_id,stage,status,expected_commission,currency,probability,primary_blocker,next_decision,next_action_at,last_meaningful_at,source)
    values(coalesce(nullif(trim(p_title),''),'DJM deal'),p_organisation_id,p_source_person_id,p_player_id,p_prospect_id,p_club_need_id,v_owner,p_stage,v_status,p_expected_commission,coalesce(nullif(trim(p_currency),''),'EUR'),v_probability,nullif(trim(p_primary_blocker),''),nullif(trim(p_next_decision),''),p_next_action_at,now(),coalesce(nullif(trim(p_source),''),'manual'))
    returning id into v_id;
  else
    update djm_os.deal_rooms set
      title=coalesce(nullif(trim(p_title),''),title),
      stage=p_stage,
      status=v_status,
      expected_commission=coalesce(p_expected_commission,expected_commission),
      currency=coalesce(nullif(trim(p_currency),''),currency),
      probability=case when p_stage in ('won','lost') then v_probability else greatest(0,least(100,coalesce(p_probability,probability))) end,
      primary_blocker=coalesce(nullif(trim(p_primary_blocker),''),primary_blocker),
      next_decision=coalesce(nullif(trim(p_next_decision),''),next_decision),
      next_action_at=coalesce(p_next_action_at,next_action_at),
      last_meaningful_at=now(),updated_at=now()
    where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Deal room not found'; end if;
  end if;
  return jsonb_build_object('deal_room_id',v_id,'status',v_status,'probability',v_probability);
end $$;
grant execute on function public.djm_deal_room_upsert(uuid,text,uuid,uuid,uuid,uuid,uuid,text,numeric,text,smallint,text,text,timestamptz,text) to authenticated;
