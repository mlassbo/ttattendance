create table if not exists competitions (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null,
  slug            text        not null,
  start_date      timestamptz not null,
  end_date        timestamptz not null,
  player_pin_hash text        not null,
  admin_pin_hash  text        not null,
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- Slug must be unique among non-deleted competitions.
-- Deleted competitions free up their slug for reuse.
create unique index competitions_slug_idx
  on competitions (slug)
  where deleted_at is null;

alter table competitions enable row level security;
-- No RLS policies needed: all access goes through the service role key which bypasses RLS.
