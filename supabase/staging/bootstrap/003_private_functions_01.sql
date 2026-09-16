-- DJM Player staging private-function bootstrap — batch 01
-- STAGING BOOTSTRAP ONLY. Do not run against production.
-- Apply after 001_application_schema.sql and 002_application_integrity.sql.
--
-- Exact current-production definitions for private functions 1-4 of 70,
-- ordered by function name + identity arguments.
-- Production body MD5: 34d2bec00dd0d51b0fff4f893460b09a
--
-- Body validation is disabled only during bootstrap because later batches
-- provide cross-function dependencies. No function is executed by this file.

begin;
set local check_function_bodies = false;

CREATE OR REPLACE FUNCTION private.audit_sensitive_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare actor uuid := auth.uid(); action_name text; entity uuid; meta jsonb := '{}'::jsonb;
begin
  if tg_table_name='players' then
    entity := coalesce(new.id,old.id);
    if tg_op='UPDATE' and new.verification_status is distinct from old.verification_status then
      action_name := 'verification_'||new.verification_status;
      meta := jsonb_build_object('from',old.verification_status,'to',new.verification_status,'reason',new.review_reason);
    else return coalesce(new,old); end if;
  elsif tg_table_name='player_public_profiles' then
    entity := coalesce(new.player_id,old.player_id);
    if tg_op='UPDATE' and new.published is distinct from old.published then
      action_name := case when new.published then 'club_profile_published' else 'club_profile_unpublished' end;
      meta := jsonb_build_object('slug',new.public_slug);
    elsif tg_op='INSERT' and new.published then
      action_name := 'club_profile_published'; meta := jsonb_build_object('slug',new.public_slug);
    else return coalesce(new,old); end if;
  elsif tg_table_name='club_share_links' then
    entity := coalesce(new.player_id,old.player_id);
    if tg_op='INSERT' then action_name:='club_share_link_created'; meta:=jsonb_build_object('share_id',new.id,'label',new.label,'expires_at',new.expires_at);
    elsif tg_op='UPDATE' and new.active is distinct from old.active then action_name:=case when new.active then 'club_share_link_reactivated' else 'club_share_link_deactivated' end; meta:=jsonb_build_object('share_id',new.id,'label',new.label);
    else return coalesce(new,old); end if;
  elsif tg_table_name='player_documents' then
    entity := coalesce(new.player_id,old.player_id);
    if tg_op='UPDATE' and new.club_shareable is distinct from old.club_shareable then
      action_name := case when new.club_shareable then 'document_approved_for_club_share' else 'document_removed_from_club_share' end;
      meta := jsonb_build_object('document_id',new.id,'title',new.title);
    else return coalesce(new,old); end if;
  elsif tg_table_name='admin_allowlist' then
    entity := null;
    action_name := case tg_op when 'INSERT' then 'team_access_added' when 'DELETE' then 'team_access_removed' else 'team_access_changed' end;
    meta := jsonb_build_object('email',coalesce(new.email,old.email),'role',coalesce(new.role,old.role),'previous_role',case when tg_op='UPDATE' then old.role else null end);
  else return coalesce(new,old); end if;
  insert into public.audit_events(actor_id,action,entity_type,entity_id,metadata)
  values(actor,action_name,tg_table_name,entity,meta);
  return coalesce(new,old);
end;
$function$;


CREATE OR REPLACE FUNCTION private.can_edit_player(target_player_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select
    private.is_admin()
    or exists (select 1 from public.players p where p.id = target_player_id and p.user_id = auth.uid())
    or exists (select 1 from public.staff_player_access a where a.player_id = target_player_id and a.staff_user_id = auth.uid() and a.can_edit = true);
$function$;


CREATE OR REPLACE FUNCTION private.can_staff_edit_player(target_player_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select private.is_admin()
    or exists (select 1 from public.staff_player_access a where a.player_id=target_player_id and a.staff_user_id=auth.uid() and a.can_edit=true);
$function$;


CREATE OR REPLACE FUNCTION private.can_staff_view_player(target_player_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select private.is_admin()
    or exists (select 1 from public.staff_player_access a where a.player_id=target_player_id and a.staff_user_id=auth.uid());
$function$;


commit;
