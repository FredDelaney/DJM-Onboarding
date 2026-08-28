alter table djm_os.scouting_prospects drop constraint if exists scouting_prospects_transfermarkt_enrichment_status_check;
alter table djm_os.scouting_prospects add constraint scouting_prospects_transfermarkt_enrichment_status_check check (transfermarkt_enrichment_status = any (array['never'::text,'queued'::text,'verified'::text,'review'::text,'failed'::text]));
