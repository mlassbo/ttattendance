create table if not exists ondata_integration_settings (
  competition_id uuid primary key references competitions(id) on delete cascade,
  api_token_hash text,
  api_token_last4 text,
  token_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ondata_integration_snapshots (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  schema_version int not null,
  payload_hash text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'error')),
  error_message text,
  source_file_name text not null,
  source_file_path text not null,
  source_file_modified_at timestamptz not null,
  source_copied_to_temp_at timestamptz not null,
  source_processed_at timestamptz not null,
  source_file_hash text not null,
  summary_classes int not null,
  summary_pools int not null,
  summary_completed_matches int not null,
  raw_payload jsonb not null,
  unique (competition_id, payload_hash)
);

create index if not exists idx_ondata_snapshots_competition_received
  on ondata_integration_snapshots (competition_id, received_at desc);

create table if not exists ondata_integration_snapshot_classes (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references ondata_integration_snapshots(id) on delete cascade,
  class_order int not null,
  external_class_key text not null,
  class_name text not null,
  class_date text not null,
  class_time text not null,
  unique (snapshot_id, external_class_key)
);

create index if not exists idx_ondata_snapshot_classes_snapshot_order
  on ondata_integration_snapshot_classes (snapshot_id, class_order);

create table if not exists ondata_integration_snapshot_pools (
  id uuid primary key default gen_random_uuid(),
  snapshot_class_id uuid not null references ondata_integration_snapshot_classes(id) on delete cascade,
  pool_order int not null,
  pool_number int not null,
  completed_match_count int not null,
  unique (snapshot_class_id, pool_number)
);

create index if not exists idx_ondata_snapshot_pools_class_order
  on ondata_integration_snapshot_pools (snapshot_class_id, pool_order);

create table if not exists ondata_integration_snapshot_players (
  id uuid primary key default gen_random_uuid(),
  snapshot_pool_id uuid not null references ondata_integration_snapshot_pools(id) on delete cascade,
  player_order int not null,
  name text not null,
  club text
);

create index if not exists idx_ondata_snapshot_players_pool_order
  on ondata_integration_snapshot_players (snapshot_pool_id, player_order);

create table if not exists ondata_integration_snapshot_matches (
  id uuid primary key default gen_random_uuid(),
  snapshot_pool_id uuid not null references ondata_integration_snapshot_pools(id) on delete cascade,
  match_order int not null,
  match_number int,
  player_a_name text,
  player_a_club text,
  player_b_name text,
  player_b_club text,
  result text
);

create index if not exists idx_ondata_snapshot_matches_pool_order
  on ondata_integration_snapshot_matches (snapshot_pool_id, match_order);

create table if not exists ondata_integration_status (
  competition_id uuid primary key references competitions(id) on delete cascade,
  current_snapshot_id uuid references ondata_integration_snapshots(id) on delete set null,
  last_received_at timestamptz,
  last_processed_at timestamptz,
  last_payload_hash text,
  last_source_file_modified_at timestamptz,
  last_source_processed_at timestamptz,
  last_error text,
  last_summary_classes int not null default 0,
  last_summary_pools int not null default 0,
  last_summary_completed_matches int not null default 0,
  updated_at timestamptz not null default now()
);

alter table ondata_integration_settings enable row level security;
alter table ondata_integration_snapshots enable row level security;
alter table ondata_integration_snapshot_classes enable row level security;
alter table ondata_integration_snapshot_pools enable row level security;
alter table ondata_integration_snapshot_players enable row level security;
alter table ondata_integration_snapshot_matches enable row level security;
alter table ondata_integration_status enable row level security;
