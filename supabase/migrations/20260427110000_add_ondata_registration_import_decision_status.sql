alter table ondata_registration_status
  add column if not exists decision_state text not null default 'no_snapshot'
    check (decision_state in ('no_snapshot', 'ingested_only', 'pending_manual_review', 'auto_applied', 'manually_applied', 'apply_failed')),
  add column if not exists decision_reason_code text not null default 'none'
    check (decision_reason_code in ('none', 'confirmed_removals', 'missing_session_assignment', 'preview_errors', 'ingest_failed', 'apply_failed')),
  add column if not exists decision_message text,
  add column if not exists preview_registrations_to_add int not null default 0,
  add column if not exists preview_registrations_to_remove int not null default 0,
  add column if not exists preview_registrations_to_remove_with_confirmed_attendance int not null default 0,
  add column if not exists preview_registrations_to_remove_with_absent_attendance int not null default 0;

update ondata_registration_status
set decision_state = case
      when current_snapshot_id is null then 'no_snapshot'
      when last_applied_snapshot_id is not null and last_applied_snapshot_id = current_snapshot_id then 'manually_applied'
      else 'ingested_only'
    end,
    decision_reason_code = 'none'
where decision_state = 'no_snapshot';