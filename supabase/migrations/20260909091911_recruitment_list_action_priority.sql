create or replace function public.djm_recruitment_targets(p_search text default null::text, p_stage text default null::text, p_limit integer default 250)
returns table(id uuid, full_name text, date_of_birth date, nationality text, current_club text, current_country text, primary_position text, preferred_foot text, transfermarkt_url text, instagram_url text, agent_status text, agent_name text, availability_status text, recruitment_stage text, recruitment_priority smallint, owner_user_id uuid, first_contact_at timestamptz, last_contact_at timestamptz, next_action_at timestamptz, preferred_contact_channel text, notes text, recruitment_notes text, updated_at timestamptz)
language sql
set search_path to ''
as $function$
  select s.id,s.full_name,s.date_of_birth,s.nationality,s.current_club,s.current_country,s.primary_position,s.preferred_foot,s.transfermarkt_url,s.instagram_url,s.agent_status,s.agent_name,s.availability_status,s.recruitment_stage,s.recruitment_priority,s.owner_user_id,s.first_contact_at,s.last_contact_at,s.next_action_at,s.preferred_contact_channel,s.notes,s.recruitment_notes,s.updated_at
  from djm_os.scouting_prospects s
  where s.linked_player_id is null
    and (p_stage is null or p_stage='' or s.recruitment_stage=p_stage)
    and (p_search is null or p_search='' or concat_ws(' ',s.full_name,s.current_club,s.current_country,s.primary_position,s.nationality,s.agent_name) ilike '%'||p_search||'%')
  order by
    case
      when s.recruitment_stage not in ('signed','declined','lost','paused') and s.next_action_at is not null and s.next_action_at < now() then 0
      when s.recruitment_stage not in ('signed','declined','lost','paused') and s.first_contact_at is not null and s.next_action_at is null then 1
      when s.recruitment_stage not in ('signed','declined','lost','paused') and s.next_action_at is not null then 2
      when s.recruitment_stage not in ('signed','declined','lost','paused') and s.first_contact_at is null then 3
      else 4
    end,
    s.next_action_at asc nulls last,
    s.recruitment_priority desc,
    s.updated_at desc
  limit greatest(1,least(coalesce(p_limit,250),500));
$function$;
