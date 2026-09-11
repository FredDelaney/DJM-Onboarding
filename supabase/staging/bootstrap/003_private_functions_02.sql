-- DJM Player staging private-function bootstrap — batch 02
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql, 002_application_integrity.sql,
-- and 003_private_functions_01.sql.
--
-- Exact current-production definitions for private functions 5-8 of 70,
-- ordered by function name + identity arguments.
-- Production body MD5: 8864ec1835c79bb16a011f0c76be0398
--
-- Body validation is disabled only during bootstrap because later batches
-- provide cross-function dependencies. No function is executed by this file.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.can_view_player(target_player_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select
    private.is_admin()
    or exists (select 1 from public.players p where p.id = target_player_id and p.user_id = auth.uid())
    or exists (select 1 from public.staff_player_access a where a.player_id = target_player_id and a.staff_user_id = auth.uid());
$function$;


CREATE OR REPLACE FUNCTION private.can_view_sensitive_player(target_player_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select private.is_admin()
    or exists (select 1 from public.players p where p.id=target_player_id and p.user_id=auth.uid())
    or exists (select 1 from public.staff_player_access a where a.player_id=target_player_id and a.staff_user_id=auth.uid() and a.can_edit=true);
$function$;


CREATE OR REPLACE FUNCTION private.career_change_requires_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_player_id uuid := coalesce(new.player_id, old.player_id);
begin
  perform pg_catalog.set_config('djm.internal_career_change', 'on', true);

  update public.players
  set verification_status = 'reviewing',
      verified_at = null,
      review_required_at = now(),
      review_reason = 'Career statistics changed'
  where id = v_player_id;

  perform pg_catalog.set_config('djm.internal_career_change', 'off', true);

  update public.player_public_profiles
  set career_timeline = private.player_career_timeline(v_player_id),
      published = false
  where player_id = v_player_id;

  return coalesce(new, old);
end;
$function$;


CREATE OR REPLACE FUNCTION private.djm_age_performance_adjustment(p_age integer, p_position_group text, p_performance_score numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_peak_end integer := case p_position_group
    when 'GK' then 32 when 'CB' then 31 when 'FB_WB' then 29
    when 'DM' then 30 when 'CM' then 30 when 'AM' then 29
    when 'W' then 28 when 'ST' then 29 else 29 end;
  v_step numeric := case p_position_group
    when 'GK' then .9 when 'CB' then 1.1 when 'FB_WB' then 1.5
    when 'DM' then 1.25 when 'CM' then 1.25 when 'AM' then 1.4
    when 'W' then 1.6 when 'ST' then 1.45 else 1.35 end;
  v_factor numeric := case
    when p_performance_score >= 75 then .35
    when p_performance_score >= 60 then .55
    when p_performance_score >= 45 then .75
    else 1 end;
  v_years integer;
begin
  if p_age is null then return 0; end if;
  v_years := greatest(0, p_age - v_peak_end);
  if v_years = 0 then return 0; end if;
  return -least(6::numeric, v_years * v_step * v_factor);
end;
$function$;

commit;
