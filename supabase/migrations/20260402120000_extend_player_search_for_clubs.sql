create index if not exists idx_players_competition_lower_name
  on players (competition_id, lower(name));

create index if not exists idx_players_competition_lower_club
  on players (competition_id, lower(coalesce(club, '')));

create or replace function search_players(
  p_competition_id uuid,
  p_query text
)
returns table(id uuid, name text, club text)
language sql stable
as $$
  select id, name, club
  from players
  where competition_id = p_competition_id
    and (
      lower(name) like lower(p_query) || '%'
      or lower(coalesce(club, '')) like lower(p_query) || '%'
    )
  order by
    case
      when lower(name) like lower(p_query) || '%' then 0
      else 1
    end,
    name,
    club nulls last
  limit 20;
$$;