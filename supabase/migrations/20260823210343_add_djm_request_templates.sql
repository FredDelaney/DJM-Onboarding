create table if not exists public.request_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text,
  request_type text not null default 'action',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint request_templates_request_type_check check (request_type in ('action','information','document','video','checkin'))
);
alter table public.request_templates enable row level security;
grant select,insert,update,delete on public.request_templates to authenticated;
create policy "admins manage request templates" on public.request_templates for all to authenticated using (private.is_admin()) with check (private.is_admin());
insert into public.request_templates(title,message,request_type,sort_order) values
('Upload your passport','Please upload a clear copy of your current passport in Documents so DJM has it ready when needed.','document',10),
('Confirm your availability','Please confirm your current playing, travel and move availability.','information',20),
('Send your latest full match','Please send DJM a link to your most useful recent full match or footage.','video',30),
('Update your contract situation','Please confirm whether anything has changed with your club, contract or availability.','information',40),
('Review your market preferences','Please check your private profile and make sure the countries, move timing and relocation preferences are still accurate.','action',50),
('Complete this week’s check-in','Please send your quick weekly update so DJM has the latest context.','checkin',60)
on conflict do nothing;
