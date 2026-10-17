-- Bounded server-only reads for questions. Keep djm_os outside the exposed API schemas.
create or replace function private.redream_agent_fields(p_row jsonb,p_fields text[])
returns jsonb language sql immutable set search_path='' as $function$
 select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
 from jsonb_each(p_row) where key=any(p_fields)
$function$;
revoke all on function private.redream_agent_fields(jsonb,text[]) from public,anon,authenticated;

create or replace function public.platform_server_redream_agent_context(
 p_tenant_id uuid,p_user_id uuid,p_kind text,p_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $function$
declare
 v_admin boolean; v_row jsonb; v_fields text[]; v_key text;
 v_result jsonb:='{}'::jsonb; v_rows jsonb;
begin
 if not private.user_has_staff_tenant_access(p_tenant_id,p_user_id) then
  raise exception 'staff_tenant_access_required' using errcode='42501';
 end if;
 v_admin:=private.user_is_tenant_admin(p_tenant_id,p_user_id);
 if p_kind='player' then
  select to_jsonb(p) into v_row from public.players p
  where p.id=p_id and p.tenant_id=p_tenant_id and p.archived_at is null
   and (v_admin or exists(select 1 from public.staff_player_access a where a.player_id=p.id and a.staff_user_id=p_user_id));
  v_key:='player';
  v_fields:=array['id','first_name','last_name','preferred_name','date_of_birth','nationalities','height_cm','preferred_foot','primary_position','secondary_positions','current_club','current_league','current_country','football_status','transfermarkt_url','wyscout_url','stats_url','verification_status','verified_at','current_season_label'];
  if v_admin then v_fields:=v_fields||array['contract_status','contract_expiry','agency_priority','next_action','next_action_due','transfermarkt_market_value','transfermarkt_market_value_currency','transfermarkt_value_verified_at']; end if;
 elsif p_kind='recruitment' then
  select to_jsonb(p) into v_row from djm_os.scouting_prospects p
  where p.id=p_id and p.tenant_id=p_tenant_id and (to_jsonb(p)->>'archived_at') is null;
  v_key:='recruitment';
  v_fields:=array['id','full_name','date_of_birth','nationality','current_club','current_country','current_league','current_season_label','primary_position','secondary_positions','preferred_foot','contract_expiry','market_value','market_value_currency','transfermarkt_url','wyscout_url','stats_url','agent_status','agent_name','availability_status','source','source_confidence','last_verified_at','notes','recruitment_stage','recruitment_priority','first_contact_at','last_contact_at','next_action_at','recruitment_notes','whatsapp','email','phone'];
 elsif p_kind='club' then
  select to_jsonb(o) into v_row from djm_os.organisations o
  where o.id=p_id and o.tenant_id=p_tenant_id and o.organisation_type='club' and o.archived_at is null;
  v_key:='club';
  v_fields:=array['id','name','country','city','website_url','linkedin_url','instagram_url','transfermarkt_url','league_name','last_verified_at'];
 elsif p_kind='contact' then
  select to_jsonb(p) into v_row from djm_os.people p
  where p.id=p_id and p.tenant_id=p_tenant_id and p.archived_at is null and coalesce(p.person_type,'contact')<>'player';
  v_key:='contact';
  v_fields:=array['id','full_name','preferred_name','country','city','linkedin_url','instagram_url','last_verified_at'];
 elsif p_kind='opportunity' then
  if not v_admin then raise exception 'agency_admin_access_required' using errcode='42501'; end if;
  select to_jsonb(n) into v_row from djm_os.club_needs n
  where n.id=p_id and n.tenant_id=p_tenant_id and (to_jsonb(n)->>'archived_at') is null;
  v_key:='opportunity';
  v_fields:=array['id','organisation_id','source_person_id','owner_user_id','title','position','preferred_foot','min_age','max_age','transfer_type','transfer_budget','salary_budget','currency','salary_period','registration_notes','profile_notes','status','confidence','confirmed_at','expires_at','priority','need_type','prediction_probability','playing_style','updated_at'];
 elsif p_kind='deal' then
  if not v_admin then raise exception 'agency_admin_access_required' using errcode='42501'; end if;
  select to_jsonb(d) into v_row from djm_os.deal_rooms d
  where d.id=p_id and d.tenant_id=p_tenant_id and (to_jsonb(d)->>'archived_at') is null;
  v_key:='deal';
  v_fields:=array['id','title','organisation_id','source_person_id','player_id','prospect_id','club_need_id','owner_user_id','stage','status','expected_commission','currency','probability','primary_blocker','next_decision','next_action_at','last_meaningful_at','outcome_reason','next_action_text','model_probability','manual_probability','probability_source','pitch_status','transfer_fee','player_salary','salary_period','financial_notes','updated_at'];
 elsif p_kind<>'tasks' or p_kind is null then
  raise exception 'unsupported_record_kind';
 end if;
 if p_kind<>'tasks' then
  if v_row is null then return null; end if;
  v_result:=jsonb_build_object(v_key,private.redream_agent_fields(v_row,v_fields));
 end if;

 if p_kind='player' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_rows from (
   select club_name,country,league,season_label,start_date,end_date,appearances,starts,minutes,goals,assists,source_name,source_url,source_reviewed_at,source_provider,source_synced_at
   from public.career_entries where player_id=p_id order by start_date desc limit 8
  ) x;
  v_result:=v_result||jsonb_build_object('career',v_rows);
 end if;

 if v_admin and p_kind in ('player','club','contact') then
  select coalesce(jsonb_agg(private.redream_agent_fields(to_jsonb(x),array['id','occurred_at','channel','direction','person_id','organisation_id','summary','source_type','confidence'])),'[]'::jsonb)
  into v_rows from (
   select i.* from djm_os.interactions i where i.tenant_id=p_tenant_id
    and ((p_kind='player' and to_jsonb(i)->>'player_id'=p_id::text) or (p_kind='club' and i.organisation_id=p_id) or (p_kind='contact' and i.person_id=p_id))
   order by i.occurred_at desc limit 8
  ) x;
  v_result:=v_result||jsonb_build_object('recent_interactions',v_rows);
 end if;

 if p_kind='contact' and v_admin then
  select coalesce(jsonb_agg(private.redream_agent_fields(to_jsonb(x),array['organisation_id','role_title','is_current','started_on','ended_on','updated_at'])),'[]'::jsonb)
  into v_rows from (
   select e.* from djm_os.employments e where e.tenant_id=p_tenant_id and e.person_id=p_id
   order by e.is_current desc,e.updated_at desc limit 6
  ) x;
  v_result:=v_result||jsonb_build_object('employments',v_rows);
  select coalesce(jsonb_agg(private.redream_agent_fields(to_jsonb(o),array['id','name','country','league_name'])),'[]'::jsonb)
  into v_rows from djm_os.organisations o where o.tenant_id=p_tenant_id and o.archived_at is null
   and o.id in(select (e->>'organisation_id')::uuid from jsonb_array_elements(v_result->'employments') e);
  v_result:=v_result||jsonb_build_object('organisations',v_rows);
 end if;

 if p_kind='club' and v_admin then
  select coalesce(jsonb_agg(private.redream_agent_fields(to_jsonb(x),array['id','title','position','preferred_foot','min_age','max_age','transfer_type','transfer_budget','salary_budget','currency','status','confidence','confirmed_at','expires_at','priority','need_type','updated_at'])),'[]'::jsonb)
  into v_rows from (
   select n.* from djm_os.club_needs n where n.tenant_id=p_tenant_id and n.organisation_id=p_id and (to_jsonb(n)->>'archived_at') is null
   order by n.updated_at desc limit 8
  ) x;
  v_result:=v_result||jsonb_build_object('needs',v_rows);
 end if;

 if p_kind in ('tasks','player') or (v_admin and p_kind in ('club','contact')) then
  select coalesce(jsonb_agg(private.redream_agent_fields(to_jsonb(x),array['id','tenant_id','owner_user_id','title','task_type','person_id','organisation_id','player_id','club_need_id','due_at','status','priority','source','created_at','updated_at'])),'[]'::jsonb)
  into v_rows from (
   select t.* from djm_os.tasks t where t.tenant_id=p_tenant_id and t.owner_user_id=p_user_id
    and t.status not in ('completed','done','cancelled','archived')
    and (to_jsonb(t)->>'archived_at') is null
    and (p_kind='tasks' or (p_kind='player' and t.player_id=p_id) or (p_kind='club' and t.organisation_id=p_id) or (p_kind='contact' and t.person_id=p_id))
   order by t.due_at nulls last,t.created_at desc limit 12
  ) x;
  v_result:=v_result||jsonb_build_object(case when p_kind='tasks' then 'tasks' else 'my_tasks' end,v_rows);
 end if;
 return v_result;
end $function$;
revoke all on function public.platform_server_redream_agent_context(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.platform_server_redream_agent_context(uuid,uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
