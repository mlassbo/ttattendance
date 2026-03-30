-- Add ON DELETE CASCADE to all FK constraints so deleting a competition
-- (or any parent) automatically cleans up all child rows.
-- This removes the need for manual multi-step cascaded deletes in seed/test helpers.

alter table sessions
  drop constraint sessions_competition_id_fkey,
  add constraint sessions_competition_id_fkey
    foreign key (competition_id) references competitions(id) on delete cascade;

alter table classes
  drop constraint classes_session_id_fkey,
  add constraint classes_session_id_fkey
    foreign key (session_id) references sessions(id) on delete cascade;

alter table players
  drop constraint players_competition_id_fkey,
  add constraint players_competition_id_fkey
    foreign key (competition_id) references competitions(id) on delete cascade;

alter table registrations
  drop constraint registrations_player_id_fkey,
  add constraint registrations_player_id_fkey
    foreign key (player_id) references players(id) on delete cascade;

alter table registrations
  drop constraint registrations_class_id_fkey,
  add constraint registrations_class_id_fkey
    foreign key (class_id) references classes(id) on delete cascade;

alter table attendance
  drop constraint attendance_registration_id_fkey,
  add constraint attendance_registration_id_fkey
    foreign key (registration_id) references registrations(id) on delete cascade;

-- Add functional index for case-insensitive prefix search on player names.
-- The existing idx_players_competition_name index covers case-sensitive LIKE but
-- not ILIKE. This index allows the query planner to use an index scan for
-- WHERE competition_id = $1 AND lower(name) LIKE lower($2) || '%'.
create index idx_players_competition_lower_name
  on players (competition_id, lower(name));
