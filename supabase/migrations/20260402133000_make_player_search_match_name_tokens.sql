create or replace function search_players(
  p_competition_id uuid,
  p_query text,
  p_mode text
)
returns table(id uuid, name text, club text)
language sql stable
as $$
  with params as (
    select regexp_replace(lower(trim(p_query)), '\s+', ' ', 'g') as query
  )
  select player.id, player.name, player.club
  from players as player
  cross join params
  cross join lateral (
    select
      regexp_replace(lower(player.name), '[^[:alnum:]]+', ' ', 'g') as normalized_name,
      regexp_replace(lower(coalesce(player.club, '')), '[^[:alnum:]]+', ' ', 'g') as normalized_club
  ) as normalized
  where player.competition_id = p_competition_id
    and case
      when p_mode = 'player' then
        normalized.normalized_name like params.query || '%'
        or normalized.normalized_name like '% ' || params.query || '%'
      when p_mode = 'club' then
        normalized.normalized_club like params.query || '%'
        or normalized.normalized_club like '% ' || params.query || '%'
      else false
    end
  order by
    case
      when p_mode = 'player' and normalized.normalized_name like params.query || '%' then 0
      when p_mode = 'club' and normalized.normalized_club like params.query || '%' then 0
      else 1
    end,
    player.name,
    player.club nulls last
  limit 20;
$$;