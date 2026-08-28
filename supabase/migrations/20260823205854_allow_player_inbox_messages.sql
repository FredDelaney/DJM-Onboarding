alter table public.player_requests drop constraint if exists player_requests_request_type_check;
alter table public.player_requests add constraint player_requests_request_type_check check (request_type in ('action','information','document','video','checkin','message'));
