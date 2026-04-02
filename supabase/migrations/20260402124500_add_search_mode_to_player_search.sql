drop function if exists search_players(uuid, text);

create or replace function search_players(
  p_competition_id uuid,
  p_query text,
  p_mode text
)
returns table(id uuid, name text, club text)
language sql stable
as $$
  select id, name, club
  from players
  where competition_id = p_competition_id
    and case
      when p_mode = 'player' then lower(name) like lower(p_query) || '%'
      when p_mode = 'club' then lower(coalesce(club, '')) like lower(p_query) || '%'
      else false
    end
  order by name, club nulls last
  limit 20;
$$;