create index if not exists player_value_proof_snapshots_player_fk_idx on platform.player_value_proof_snapshots(player_id);
create index if not exists deal_receivables_deal_room_fk_idx on djm_os.deal_receivables(deal_room_id);
create index if not exists deal_receivables_payer_org_fk_idx on djm_os.deal_receivables(payer_organisation_id) where payer_organisation_id is not null;
create index if not exists deal_receivable_events_receivable_fk_idx on djm_os.deal_receivable_events(receivable_id);;
