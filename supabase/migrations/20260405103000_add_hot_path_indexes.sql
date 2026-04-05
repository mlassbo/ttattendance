create index if not exists idx_sessions_competition_session_order
  on sessions (competition_id, session_order);

create index if not exists idx_classes_session_start_time
  on classes (session_id, start_time);