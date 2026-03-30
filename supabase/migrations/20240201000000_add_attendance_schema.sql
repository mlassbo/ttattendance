create table sessions (
  id             uuid        primary key default gen_random_uuid(),
  competition_id uuid        not null references competitions(id),
  name           text        not null,
  date           date        not null,
  session_order  int         not null
);

create table classes (
  id                  uuid        primary key default gen_random_uuid(),
  session_id          uuid        not null references sessions(id),
  name                text        not null,
  start_time          timestamptz not null,
  attendance_deadline timestamptz not null
);

create table players (
  id             uuid        primary key default gen_random_uuid(),
  competition_id uuid        not null references competitions(id),
  name           text        not null,
  club           text,
  created_at     timestamptz not null default now()
);

-- Supports prefix search scoped to a competition
create index idx_players_competition_name on players (competition_id, name);

create table registrations (
  id        uuid not null primary key default gen_random_uuid(),
  player_id uuid not null references players(id),
  class_id  uuid not null references classes(id),
  unique (player_id, class_id)
);

create index idx_registrations_player on registrations (player_id);
create index idx_registrations_class  on registrations (class_id);

create table attendance (
  id               uuid        primary key default gen_random_uuid(),
  registration_id  uuid        not null references registrations(id),
  status           text        not null check (status in ('confirmed', 'absent')),
  reported_at      timestamptz not null default now(),
  reported_by      text        check (reported_by in ('player', 'admin')),
  idempotency_key  text        not null,
  notes            text,
  unique (registration_id),
  unique (idempotency_key)
);

create index idx_attendance_status on attendance (status);

alter table sessions     enable row level security;
alter table classes      enable row level security;
alter table players      enable row level security;
alter table registrations enable row level security;
alter table attendance   enable row level security;
-- No RLS policies needed: all access goes through the service role key which bypasses RLS.
