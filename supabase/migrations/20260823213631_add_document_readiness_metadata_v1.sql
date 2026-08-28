alter table public.player_documents add column if not exists country text;
alter table public.player_documents add column if not exists expires_at date;
create index if not exists player_documents_expiry_idx on public.player_documents(expires_at) where expires_at is not null;

create or replace function private.set_updated_at_document()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin new.created_at=coalesce(new.created_at,now()); return new; end $$;
