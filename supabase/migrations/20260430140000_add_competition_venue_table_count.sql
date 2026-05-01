alter table competitions
  add column venue_table_count int;

alter table competitions
  add constraint competitions_venue_table_count_positive
  check (venue_table_count is null or venue_table_count >= 1);
