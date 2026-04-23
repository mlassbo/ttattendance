create table if not exists ondata_pool_result_snapshots (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  external_class_key text not null,
  source_class_id text not null,
  class_name text not null,
  class_date text not null,
  class_time text not null,
  source_file_name text not null,
  source_file_path text not null,
  source_file_modified_at timestamptz not null,
  source_processed_at timestamptz not null,
  source_file_hash text not null,
  payload_hash text not null,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'error')),
  last_error text,
  raw_payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_ondata_pool_results_competition_class
  on ondata_pool_result_snapshots (competition_id, external_class_key);

create table if not exists ondata_pool_result_snapshot_pools (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references ondata_pool_result_snapshots(id) on delete cascade,
  pool_number integer not null,
  unique (snapshot_id, pool_number)
);

create table if not exists ondata_pool_result_snapshot_standings (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null references ondata_pool_result_snapshot_pools(id) on delete cascade,
  placement integer not null,
  player_name text not null,
  club_name text,
  matches_won integer not null,
  matches_lost integer not null,
  sets_won integer not null,
  sets_lost integer not null,
  points_for integer not null,
  points_against integer not null
);

create index if not exists idx_ondata_pool_result_standings_pool
  on ondata_pool_result_snapshot_standings (pool_id, placement);

create table if not exists ondata_pool_result_status (
  competition_id uuid not null references competitions(id) on delete cascade,
  external_class_key text not null,
  current_snapshot_id uuid references ondata_pool_result_snapshots(id) on delete set null,
  last_payload_hash text,
  last_processed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (competition_id, external_class_key)
);

alter table ondata_pool_result_snapshots enable row level security;
alter table ondata_pool_result_snapshot_pools enable row level security;
alter table ondata_pool_result_snapshot_standings enable row level security;
alter table ondata_pool_result_status enable row level security;