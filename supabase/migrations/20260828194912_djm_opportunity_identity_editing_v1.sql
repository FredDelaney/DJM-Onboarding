create or replace function public.djm_opportunity_update_identity(
  p_opportunity_id uuid,
  p_organisation_id uuid,
  p_source_person_id uuid default null,
  p_player_id uuid default null,
  p_prospect_id uuid default null,
  p_club_need_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_before jsonb;
  v_prediction jsonb;
  v_model smallint;
  v_manual smallint;
  v_effective smallint;
  v_stage text;
begin
  if not djm_os.is_team_member() then raise exception 'DJM team access required'; end if;
  if p_organisation_id is null or not exists(select 1 from djm_os.organisations where id=p_organisation_id and organisation_type='club') then raise exception 'Club is required'; end if;
  if num_nonnulls(p_player_id,p_prospect_id) <> 1 then raise exception 'Choose exactly one signed player or recruitment target'; end if;
  if p_source_person_id is not null and not exists(select 1 from djm_os.people where id=p_source_person_id) then raise exception 'Source contact not found'; end if;
  if p_club_need_id is not null and not exists(select 1 from djm_os.club_needs where id=p_club_need_id and organisation_id=p_organisation_id) then raise exception 'Club Need must belong to the selected club'; end if;

  select to_jsonb(d),d.stage,d.manual_probability into v_before,v_stage,v_manual from djm_os.deal_rooms d where d.id=p_opportunity_id;
  if v_before is null then raise exception 'Opportunity not found'; end if;

  v_prediction:=public.djm_opportunity_probability(p_club_need_id,p_player_id,p_prospect_id,v_stage,null,null);
  v_model:=(v_prediction->>'probability')::smallint;
  v_effective:=coalesce(v_manual,v_model);

  update djm_os.deal_rooms set
    organisation_id=p_organisation_id,
    source_person_id=p_source_person_id,
    player_id=p_player_id,
    prospect_id=p_prospect_id,
    club_need_id=p_club_need_id,
    model_probability=v_model,
    probability=v_effective,
    probability_source=case when v_manual is null then 'model' else 'manual' end,
    probability_basis=v_prediction,
    last_meaningful_at=now(),
    updated_at=now()
  where id=p_opportunity_id;

  insert into djm_os.events(event_type,actor_user_id,organisation_id,person_id,player_id,payload,source,confidence,occurred_at)
  values('OPPORTUNITY_IDENTITY_UPDATED',auth.uid(),p_organisation_id,p_source_person_id,p_player_id,
    jsonb_build_object('opportunity_id',p_opportunity_id,'before',v_before,'organisation_id',p_organisation_id,'source_person_id',p_source_person_id,'player_id',p_player_id,'prospect_id',p_prospect_id,'club_need_id',p_club_need_id,'model_probability',v_model,'effective_probability',v_effective),
    'manual_ui',1,now());

  return jsonb_build_object('opportunity_id',p_opportunity_id,'model_probability',v_model,'probability',v_effective,'probability_source',case when v_manual is null then 'model' else 'manual' end);
end; $$;

revoke all on function public.djm_opportunity_update_identity(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.djm_opportunity_update_identity(uuid,uuid,uuid,uuid,uuid,uuid) to authenticated,service_role;
notify pgrst,'reload schema';
