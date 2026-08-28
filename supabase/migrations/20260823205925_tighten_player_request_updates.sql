create or replace function private.protect_player_request_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if not private.is_admin() then
    if new.id is distinct from old.id
       or new.player_id is distinct from old.player_id
       or new.title is distinct from old.title
       or new.message is distinct from old.message
       or new.request_type is distinct from old.request_type
       or new.due_at is distinct from old.due_at
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'Not permitted to change DJM request fields';
    end if;
    if new.status is distinct from old.status and new.status <> 'completed' then
      raise exception 'Players may only complete a DJM request';
    end if;
    if new.completed_at is distinct from old.completed_at and not (new.status='completed' and old.status is distinct from 'completed') then
      raise exception 'Completion time is managed by DJM Player';
    end if;
  end if;
  new.updated_at := now();
  if new.status='completed' and old.status is distinct from 'completed' then new.completed_at := now(); end if;
  return new;
end;
$$;
