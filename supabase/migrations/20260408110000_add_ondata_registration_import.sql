create table if not exists competition_import_session_overrides (
  competition_id uuid not null references competitions(id) on delete cascade,
  source_type text not null,
  external_class_key text not null,
  session_number integer not null check (session_number between 1 and 3),
  updated_at timestamptz not null default now(),
  primary key (competition_id, source_type, external_class_key)
);

create index if not exists idx_competition_import_session_overrides_lookup
  on competition_import_session_overrides (competition_id, source_type);

create table if not exists ondata_registration_snapshots (
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
  source_processed_at timestamptz not null,
  source_file_hash text not null,
  summary_classes int not null,
  summary_players int not null,
  summary_registrations int not null,
  raw_payload jsonb not null
);

create index if not exists idx_ondata_registration_snapshots_competition_received
  on ondata_registration_snapshots (competition_id, received_at desc);

create table if not exists ondata_registration_snapshot_classes (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references ondata_registration_snapshots(id) on delete cascade,
  class_order int not null,
  external_class_key text not null,
  source_class_id text,
  class_name text not null,
  start_at timestamptz not null,
  unique (snapshot_id, external_class_key)
);

create index if not exists idx_ondata_registration_snapshot_classes_snapshot_order
  on ondata_registration_snapshot_classes (snapshot_id, class_order);

create table if not exists ondata_registration_snapshot_registrations (
  id uuid primary key default gen_random_uuid(),
  snapshot_class_id uuid not null references ondata_registration_snapshot_classes(id) on delete cascade,
  registration_order int not null,
  player_name text not null,
  club_name text not null
);

create index if not exists idx_ondata_registration_snapshot_registrations_class_order
  on ondata_registration_snapshot_registrations (snapshot_class_id, registration_order);

create table if not exists ondata_registration_status (
  competition_id uuid primary key references competitions(id) on delete cascade,
  current_snapshot_id uuid references ondata_registration_snapshots(id) on delete set null,
  last_received_at timestamptz,
  last_processed_at timestamptz,
  last_payload_hash text,
  last_error text,
  last_summary_classes int not null default 0,
  last_summary_players int not null default 0,
  last_summary_registrations int not null default 0,
  last_applied_snapshot_id uuid references ondata_registration_snapshots(id) on delete set null,
  last_applied_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table competition_import_session_overrides enable row level security;
alter table ondata_registration_snapshots enable row level security;
alter table ondata_registration_snapshot_classes enable row level security;
alter table ondata_registration_snapshot_registrations enable row level security;
alter table ondata_registration_status enable row level security;