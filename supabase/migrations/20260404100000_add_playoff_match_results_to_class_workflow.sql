alter table class_workflow_steps
  drop constraint if exists class_workflow_steps_step_key_check;

alter table class_workflow_steps
  add constraint class_workflow_steps_step_key_check
  check (step_key in (
    'seed_class',
    'publish_pools',
    'register_match_results',
    'publish_pool_results',
    'a_playoff',
    'b_playoff',
    'register_playoff_match_results',
    'prize_ceremony'
  ));

create or replace function seed_class_workflow_steps(p_class_id uuid)
returns void
language sql
as $$
  insert into class_workflow_steps (class_id, step_key, status)
  select
    p_class_id,
    step_row.step_key,
    'not_started'
  from (values
    ('seed_class'),
    ('publish_pools'),
    ('register_match_results'),
    ('publish_pool_results'),
    ('a_playoff'),
    ('b_playoff'),
    ('register_playoff_match_results'),
    ('prize_ceremony')
  ) as step_row(step_key)
  on conflict (class_id, step_key) do nothing;
$$;

insert into class_workflow_steps (class_id, step_key, status)
select
  class_row.id,
  'register_playoff_match_results',
  'not_started'
from classes as class_row
on conflict (class_id, step_key) do nothing;