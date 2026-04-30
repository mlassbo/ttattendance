create table if not exists class_pool_tables (
  class_id    uuid not null references classes(id) on delete cascade,
  pool_number int not null check (pool_number >= 1),
  tables      int[] not null default '{}',
  updated_at  timestamptz not null default now(),
  primary key (class_id, pool_number)
);

alter table class_pool_tables enable row level security;
