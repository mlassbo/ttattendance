create or replace function competition_date_ranges(
  p_competition_ids uuid[] default null
)
returns table(
  competition_id uuid,
  first_class_start timestamptz,
  last_class_start timestamptz
)
language sql stable
as $$
  select
    c.id as competition_id,
    min(cl.start_time) as first_class_start,
    max(cl.start_time) as last_class_start
  from competitions c
  left join sessions s on s.competition_id = c.id
  left join classes cl on cl.session_id = s.id
  where c.deleted_at is null
    and (p_competition_ids is null or c.id = any(p_competition_ids))
  group by c.id;
$$;

alter table competitions
  drop column if exists start_date,
  drop column if exists end_date;