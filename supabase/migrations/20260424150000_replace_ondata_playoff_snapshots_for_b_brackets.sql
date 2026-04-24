drop table if exists ondata_playoff_status;
drop table if exists ondata_playoff_snapshot_matches;
drop table if exists ondata_playoff_snapshot_rounds;
drop table if exists ondata_playoff_snapshots;

create table ondata_playoff_snapshots (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  schema_version int not null,
  payload_hash text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'error')),
  error_message text,
  source_type text not null,
  source_competition_url text not null,
  source_class_id text not null,
  source_stage5_path text not null,
  source_stage6_path text,
  source_processed_at timestamptz not null,
  source_file_hash text not null,
  class_source_class_id text not null,
  external_class_key text not null,
  class_name text not null,
  playoff_bracket text not null check (playoff_bracket in ('A', 'B')),
  parent_source_class_id text not null,
  parent_external_class_key text not null,
  parent_class_name text not null,
  parent_class_date text not null,
  parent_class_time text not null,
  summary_rounds int not null,
  summary_matches int not null,
  summary_completed_matches int not null,
  raw_payload jsonb not null
);

create index idx_ondata_playoff_snapshots_parent_bracket_recv
  on ondata_playoff_snapshots (competition_id, parent_external_class_key, playoff_bracket, received_at desc);

create index idx_ondata_playoff_snapshots_competition_received
  on ondata_playoff_snapshots (competition_id, received_at desc);

create table ondata_playoff_snapshot_rounds (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references ondata_playoff_snapshots(id) on delete cascade,
  round_order int not null,
  round_name text not null,
  unique (snapshot_id, round_order)
);

create index idx_ondata_playoff_snapshot_rounds_snapshot_order
  on ondata_playoff_snapshot_rounds (snapshot_id, round_order);

create table ondata_playoff_snapshot_matches (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references ondata_playoff_snapshots(id) on delete cascade,
  snapshot_round_id uuid not null references ondata_playoff_snapshot_rounds(id) on delete cascade,
  match_order int not null,
  match_key text not null,
  player_a_name text not null,
  player_b_name text not null,
  winner_name text,
  result text,
  is_completed boolean not null default false,
  unique (snapshot_id, match_key)
);

create index idx_ondata_playoff_snapshot_matches_round_order
  on ondata_playoff_snapshot_matches (snapshot_round_id, match_order);

create table ondata_playoff_status (
  competition_id uuid not null references competitions(id) on delete cascade,
  parent_external_class_key text not null,
  playoff_bracket text not null check (playoff_bracket in ('A', 'B')),
  current_snapshot_id uuid references ondata_playoff_snapshots(id) on delete set null,
  last_received_at timestamptz,
  last_processed_at timestamptz,
  last_payload_hash text,
  last_source_processed_at timestamptz,
  last_error text,
  last_summary_rounds int not null default 0,
  last_summary_matches int not null default 0,
  last_summary_completed_matches int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (competition_id, parent_external_class_key, playoff_bracket)
);

create index idx_ondata_playoff_status_competition_parent_bracket
  on ondata_playoff_status (competition_id, parent_external_class_key, playoff_bracket);

alter table ondata_playoff_snapshots enable row level security;
alter table ondata_playoff_snapshot_rounds enable row level security;
alter table ondata_playoff_snapshot_matches enable row level security;
alter table ondata_playoff_status enable row level security;
