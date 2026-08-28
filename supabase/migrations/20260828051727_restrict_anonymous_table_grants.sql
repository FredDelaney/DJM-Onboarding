-- Anonymous visitors only need the explicitly public read surfaces.
revoke all privileges on table public.player_agreements from anon;
revoke all privileges on table public.player_opportunities from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.site_content
  from anon;
grant select on table public.site_content to anon;
