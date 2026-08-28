create or replace function private.audit_sensitive_change()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
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
$$;

drop trigger if exists audit_player_verification on public.players;
create trigger audit_player_verification after update on public.players for each row execute function private.audit_sensitive_change();
drop trigger if exists audit_public_profile on public.player_public_profiles;
create trigger audit_public_profile after insert or update on public.player_public_profiles for each row execute function private.audit_sensitive_change();
drop trigger if exists audit_club_share_link on public.club_share_links;
create trigger audit_club_share_link after insert or update on public.club_share_links for each row execute function private.audit_sensitive_change();
drop trigger if exists audit_document_club_share on public.player_documents;
create trigger audit_document_club_share after update on public.player_documents for each row execute function private.audit_sensitive_change();
drop trigger if exists audit_team_access on public.admin_allowlist;
create trigger audit_team_access after insert or update or delete on public.admin_allowlist for each row execute function private.audit_sensitive_change();
