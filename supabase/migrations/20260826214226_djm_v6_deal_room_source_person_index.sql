create index if not exists idx_deal_rooms_source_person on djm_os.deal_rooms(source_person_id) where source_person_id is not null;
