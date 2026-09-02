alter table public.notification_preferences
  add column if not exists email_reminders boolean not null default false,
  add column if not exists reminder_intensity text not null default 'normal',
  add column if not exists email_address text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='notification_preferences_reminder_intensity_check'
      and conrelid='public.notification_preferences'::regclass
  ) then
    alter table public.notification_preferences
      add constraint notification_preferences_reminder_intensity_check
      check (reminder_intensity in ('minimal','normal','everything'));
  end if;
end $$;

update public.notification_preferences np
set email_reminders=np.email_enabled,
    reminder_intensity=np.reminder_mode,
    email_address=coalesce(np.email_address,u.email)
from auth.users u
where u.id=np.user_id;

create or replace function private.djm_sync_notification_preference_aliases()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $$
begin
  if tg_op='INSERT' then
    new.email_enabled := coalesce(new.email_reminders,new.email_enabled,false);
    new.email_reminders := new.email_enabled;
    new.reminder_mode := coalesce(nullif(new.reminder_intensity,''),new.reminder_mode,'normal');
    new.reminder_intensity := new.reminder_mode;
  else
    if new.email_reminders is distinct from old.email_reminders then
      new.email_enabled := new.email_reminders;
    elsif new.email_enabled is distinct from old.email_enabled then
      new.email_reminders := new.email_enabled;
    end if;

    if new.reminder_intensity is distinct from old.reminder_intensity then
      new.reminder_mode := new.reminder_intensity;
    elsif new.reminder_mode is distinct from old.reminder_mode then
      new.reminder_intensity := new.reminder_mode;
    end if;
  end if;

  if new.reminder_mode not in ('minimal','normal','everything') then
    new.reminder_mode := 'normal';
  end if;
  new.reminder_intensity := new.reminder_mode;
  return new;
end;
$$;

drop trigger if exists trg_djm_sync_notification_preference_aliases on public.notification_preferences;
create trigger trg_djm_sync_notification_preference_aliases
before insert or update on public.notification_preferences
for each row execute function private.djm_sync_notification_preference_aliases();
