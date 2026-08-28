alter table public.players drop constraint if exists players_preferred_foot_check;
update public.players set preferred_foot = case lower(preferred_foot) when 'left' then 'Left' when 'right' then 'Right' when 'both' then 'Both' else preferred_foot end where preferred_foot is not null;
alter table public.players add constraint players_preferred_foot_check check (preferred_foot is null or preferred_foot in ('Left','Right','Both'));
alter table public.players drop constraint if exists players_onboarding_status_check;
alter table public.players add constraint players_onboarding_status_check check (onboarding_status in ('not_started','in_progress','submitted','verified','complete'));
