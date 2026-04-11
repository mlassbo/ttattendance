alter table registrations
  add column status text not null default 'registered'
    check (status in ('registered', 'reserve')),
  add column reserve_joined_at timestamptz;