create or replace function apply_competition_import_plan(
  p_competition_id uuid,
  p_session_slots jsonb,
  p_classes jsonb,
  p_players jsonb,
  p_registration_adds jsonb,
  p_registration_removals jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_sessions_created integer := 0;
  v_classes_created integer := 0;
  v_classes_updated integer := 0;
  v_players_created integer := 0;
  v_players_deleted integer := 0;
  v_registrations_added integer := 0;
  v_registrations_removed integer := 0;
begin
  perform 1
  from competitions
  where id = p_competition_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Competition not found';
  end if;

  create temp table temp_session_slots (
    slot_key text primary key,
    date date not null,
    session_number integer not null check (session_number between 1 and 3),
    existing_session_id uuid,
    session_id uuid
  ) on commit drop;

  insert into temp_session_slots (slot_key, date, session_number, existing_session_id)
  select slot_key, date, session_number, existing_session_id
  from jsonb_to_recordset(coalesce(p_session_slots, '[]'::jsonb)) as rows(
    slot_key text,
    date date,
    session_number integer,
    existing_session_id uuid
  );

  update temp_session_slots
  set session_id = existing_session_id
  where existing_session_id is not null;

  with inserted as (
    insert into sessions (competition_id, name, date, session_order)
    select
      p_competition_id,
      'Pass ' || session_number,
      date,
      0
    from temp_session_slots
    where existing_session_id is null
    returning id, date, regexp_replace(name, '^Pass\s+', '')::integer as session_number
  ),
  resolved as (
    update temp_session_slots as target
    set session_id = inserted.id
    from inserted
    where target.session_id is null
      and target.date = inserted.date
      and target.session_number = inserted.session_number
    returning 1
  )
  select count(*)::integer into v_sessions_created
  from inserted;

  if exists (select 1 from temp_session_slots where session_id is null) then
    raise exception 'Failed to resolve session ids for import';
  end if;

  with ordered as (
    select
      session_id,
      session_number,
      row_number() over (order by date, session_number) as next_session_order
    from temp_session_slots
  )
  update sessions as session_row
  set
    name = 'Pass ' || ordered.session_number,
    session_order = ordered.next_session_order
  from ordered
  where session_row.id = ordered.session_id
    and session_row.competition_id = p_competition_id
    and (
      session_row.name is distinct from 'Pass ' || ordered.session_number
      or session_row.session_order is distinct from ordered.next_session_order
    );

  create temp table temp_classes (
    class_key text primary key,
    existing_class_id uuid,
    class_id uuid,
    class_name text not null,
    start_time timestamptz not null,
    attendance_deadline timestamptz not null,
    session_slot_key text not null references temp_session_slots(slot_key)
  ) on commit drop;

  insert into temp_classes (
    class_key,
    existing_class_id,
    class_name,
    start_time,
    attendance_deadline,
    session_slot_key
  )
  select
    class_key,
    existing_class_id,
    class_name,
    start_time,
    attendance_deadline,
    session_slot_key
  from jsonb_to_recordset(coalesce(p_classes, '[]'::jsonb)) as rows(
    class_key text,
    existing_class_id uuid,
    class_name text,
    start_time timestamptz,
    attendance_deadline timestamptz,
    session_slot_key text
  );

  update temp_classes
  set class_id = existing_class_id
  where existing_class_id is not null;

  with updated as (
    update classes as class_row
    set
      session_id = target_session.session_id,
      start_time = target_class.start_time,
      attendance_deadline = target_class.attendance_deadline
    from temp_classes as target_class
    join temp_session_slots as target_session
      on target_session.slot_key = target_class.session_slot_key
    where class_row.id = target_class.existing_class_id
      and (
        class_row.session_id is distinct from target_session.session_id
        or class_row.start_time is distinct from target_class.start_time
        or class_row.attendance_deadline is distinct from target_class.attendance_deadline
      )
    returning class_row.id
  )
  select count(*)::integer into v_classes_updated
  from updated;

  with inserted as (
    insert into classes (session_id, name, start_time, attendance_deadline)
    select
      target_session.session_id,
      target_class.class_name,
      target_class.start_time,
      target_class.attendance_deadline
    from temp_classes as target_class
    join temp_session_slots as target_session
      on target_session.slot_key = target_class.session_slot_key
    where target_class.existing_class_id is null
    returning id, name, start_time
  ),
  resolved as (
    update temp_classes as target_class
    set class_id = inserted.id
    from inserted
    where target_class.class_id is null
      and target_class.existing_class_id is null
      and target_class.class_name = inserted.name
      and target_class.start_time = inserted.start_time
    returning 1
  )
  select count(*)::integer into v_classes_created
  from inserted;

  if exists (select 1 from temp_classes where class_id is null) then
    raise exception 'Failed to resolve class ids for import';
  end if;

  create temp table temp_players (
    player_key text primary key,
    existing_player_id uuid,
    player_id uuid,
    player_name text not null,
    club_name text not null
  ) on commit drop;

  insert into temp_players (
    player_key,
    existing_player_id,
    player_name,
    club_name
  )
  select
    player_key,
    existing_player_id,
    player_name,
    club_name
  from jsonb_to_recordset(coalesce(p_players, '[]'::jsonb)) as rows(
    player_key text,
    existing_player_id uuid,
    player_name text,
    club_name text
  );

  update temp_players
  set player_id = existing_player_id
  where existing_player_id is not null;

  with inserted as (
    insert into players (competition_id, name, club)
    select
      p_competition_id,
      player_name,
      nullif(club_name, '')
    from temp_players
    where existing_player_id is null
    returning id, name, coalesce(club, '') as club_name
  ),
  resolved as (
    update temp_players as target_player
    set player_id = inserted.id
    from inserted
    where target_player.player_id is null
      and target_player.existing_player_id is null
      and target_player.player_name = inserted.name
      and target_player.club_name = inserted.club_name
    returning 1
  )
  select count(*)::integer into v_players_created
  from inserted;

  if exists (select 1 from temp_players where player_id is null) then
    raise exception 'Failed to resolve player ids for import';
  end if;

  create temp table temp_registration_adds (
    class_key text not null references temp_classes(class_key),
    player_key text not null references temp_players(player_key)
  ) on commit drop;

  insert into temp_registration_adds (class_key, player_key)
  select class_key, player_key
  from jsonb_to_recordset(coalesce(p_registration_adds, '[]'::jsonb)) as rows(
    class_key text,
    player_key text
  );

  create temp table temp_registration_removals (
    registration_id uuid primary key,
    player_id uuid not null
  ) on commit drop;

  insert into temp_registration_removals (registration_id, player_id)
  select registration_id, player_id
  from jsonb_to_recordset(coalesce(p_registration_removals, '[]'::jsonb)) as rows(
    registration_id uuid,
    player_id uuid
  );

  with inserted as (
    insert into registrations (player_id, class_id)
    select
      target_player.player_id,
      target_class.class_id
    from temp_registration_adds as registration_add
    join temp_players as target_player
      on target_player.player_key = registration_add.player_key
    join temp_classes as target_class
      on target_class.class_key = registration_add.class_key
    on conflict (player_id, class_id) do update
      set status = 'registered', reserve_joined_at = null
    returning id
  )
  select count(*)::integer into v_registrations_added
  from inserted;

  with deleted as (
    delete from registrations
    where id in (select registration_id from temp_registration_removals)
    returning id
  )
  select count(*)::integer into v_registrations_removed
  from deleted;

  with deleted as (
    delete from players as player_row
    where player_row.id in (
      select distinct player_id
      from temp_registration_removals
    )
      and not exists (
        select 1
        from registrations
        where registrations.player_id = player_row.id
      )
    returning player_row.id
  )
  select count(*)::integer into v_players_deleted
  from deleted;

  delete from classes as class_row
  using sessions as session_row
  where class_row.session_id = session_row.id
    and session_row.competition_id = p_competition_id
    and not exists (
      select 1
      from registrations
      where registrations.class_id = class_row.id
    );

  delete from sessions as session_row
  where session_row.competition_id = p_competition_id
    and not exists (
      select 1
      from classes
      where classes.session_id = session_row.id
    );

  return jsonb_build_object(
    'summary',
    jsonb_build_object(
      'registrationsAdded', v_registrations_added,
      'registrationsRemoved', v_registrations_removed,
      'playersCreated', v_players_created,
      'playersDeleted', v_players_deleted,
      'sessionsCreated', v_sessions_created,
      'classesCreated', v_classes_created,
      'classesUpdated', v_classes_updated
    )
  );
end;
$$;