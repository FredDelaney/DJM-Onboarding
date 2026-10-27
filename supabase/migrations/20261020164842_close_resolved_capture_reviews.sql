-- Keep Today/review lists aligned after a capture's last unresolved action is
-- approved or dismissed. Other kinds of review remain independently actionable.
create or replace function private.redream_ai_close_action_review()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status not in ('applied','undone','superseded') then return new; end if;
  if not exists(select 1 from djm_os.tell_djm_actions where capture_id=new.capture_id and tenant_id=new.tenant_id and status in ('pending','needs_review','failed'))
    and not exists(select 1 from djm_os.tell_djm_questions where capture_id=new.capture_id and status='open') then
    update djm_os.review_items set status='resolved',resolved_at=now()
    where capture_id=new.capture_id and tenant_id=new.tenant_id and review_type='tell_djm_action_review' and status='open';
  end if;
  return new;
end;
$$;
revoke all on function private.redream_ai_close_action_review() from public,anon,authenticated,service_role;
create trigger redream_ai_close_action_review after insert or update of status on djm_os.tell_djm_actions
for each row execute function private.redream_ai_close_action_review();
