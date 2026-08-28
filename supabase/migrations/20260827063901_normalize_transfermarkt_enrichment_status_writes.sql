create or replace function djm_os.normalize_transfermarkt_enrichment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.transfermarkt_enrichment_status := case lower(coalesce(new.transfermarkt_enrichment_status, 'never'))
    when 'complete' then 'verified'
    when 'partial' then 'review'
    when 'blocked' then 'queued'
    when 'pending' then 'queued'
    else new.transfermarkt_enrichment_status
  end;
  return new;
end;
$$;

drop trigger if exists trg_normalize_transfermarkt_enrichment_status on djm_os.scouting_prospects;
create trigger trg_normalize_transfermarkt_enrichment_status
before insert or update of transfermarkt_enrichment_status on djm_os.scouting_prospects
for each row
execute function djm_os.normalize_transfermarkt_enrichment_status();
