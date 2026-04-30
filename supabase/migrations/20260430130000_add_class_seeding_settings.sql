alter table classes
  add column has_seeding boolean not null default true,
  add column players_per_pool int;

alter table classes
  add constraint classes_players_per_pool_positive
  check (players_per_pool is null or players_per_pool >= 1);
