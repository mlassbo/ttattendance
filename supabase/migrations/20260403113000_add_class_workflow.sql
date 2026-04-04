create table if not exists class_workflow_steps (
  class_id uuid not null references classes(id) on delete cascade,
  step_key text not null check (step_key in (
    'seed_class',
    'publish_pools',
    'publish_pool_results',
    'a_playoff',
    'b_playoff',
    'prize_ceremony'
  )),
  status text not null default 'not_started' check (status in (
    'not_started',
    'active',
    'done',
    'skipped'
  )),
  note text,
  updated_at timestamptz not null default now(),
  primary key (class_id, step_key)
);

create table if not exists class_workflow_events (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  event_key text not null check (event_key in (
    'missing_players_callout'
  )),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_class_workflow_events_class_event_created
  on class_workflow_events (class_id, event_key, created_at desc);

alter table class_workflow_steps enable row level security;
alter table class_workflow_events enable row level security;

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
    ('publish_pool_results'),
    ('a_playoff'),
    ('b_playoff'),
    ('prize_ceremony')
  ) as step_row(step_key)
  on conflict (class_id, step_key) do nothing;
$$;

create or replace function seed_class_workflow_steps_after_class_insert()
returns trigger
language plpgsql
as $$
begin
  perform seed_class_workflow_steps(new.id);
  return new;
end;
$$;

drop trigger if exists seed_class_workflow_steps_after_class_insert on classes;

create trigger seed_class_workflow_steps_after_class_insert
after insert on classes
for each row
execute function seed_class_workflow_steps_after_class_insert();

do $$
begin
  perform seed_class_workflow_steps(class_row.id)
  from classes as class_row;
end;
$$;