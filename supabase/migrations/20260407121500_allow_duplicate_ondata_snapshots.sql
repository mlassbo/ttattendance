alter table if exists ondata_integration_snapshots
  drop constraint if exists ondata_integration_snapshots_competition_id_payload_hash_key;

create index if not exists idx_ondata_snapshots_competition_payload_hash
  on ondata_integration_snapshots (competition_id, payload_hash);