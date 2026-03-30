-- Adds a search function that allows the query planner to use the functional
-- index idx_players_competition_lower_name (on lower(name)).
-- ILIKE from the JS client generates "name ILIKE $1" which PostgreSQL will NOT
-- rewrite to use a lower(name) index. This function uses the explicit
-- lower(name) LIKE lower($2) || '%' form that the planner CAN index-scan.

create or replace function search_players(
  p_competition_id uuid,
  p_query         text
)
returns table(id uuid, name text, club text)
language sql stable
as $$
  select id, name, club
  from players
  where competition_id = p_competition_id
    and lower(name) like lower(p_query) || '%'
  order by name
  limit 20;
$$;
