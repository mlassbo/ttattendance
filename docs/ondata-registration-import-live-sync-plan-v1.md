# OnData Registration Import And Live Sync Plan V1

> Note
>
> For the current in-competition direction, use `docs/ondata-registration-auto-apply-plan-v1.md` instead.
> This document reflects the earlier decision that OnData registration snapshots should always stop at stored snapshot + manual superadmin preview/apply.
> The newer plan changes that policy to conditional auto-apply with explicit fallback to manual review.

This document is the implementation handoff for splitting the current OnData work into two separate flows:

1. a manual registration import flow used before the competition
2. an automatic live sync flow used during the competition

The plan covers both repositories:

- `c:\repos\TTAttendance`
- `c:\repos\TTAttendanceIntegrations`

The intent is to give a new agent enough detail to implement the change without having to rediscover the architecture from scratch.

## Decision Summary

The current combined direction should be replaced with two explicit OnData workflows.

### Workflow A: Registration Import

- Source: OnData stage 1 PDF (`players`)
- Trigger: manual button in the integration app
- Frequency: a few times before the competition, not on a timer
- Data scope: classes and registered players only
- TTAttendance behavior: store snapshot, preview diff, require superadmin apply
- Session numbering: assigned in TTAttendance, with persisted manual overrides
- Backup path: TT Coordinator paste import remains available inside the same superadmin page as a fallback source

### Workflow B: Live Sync

- Source: existing OnData pool and match parsing flow
- Trigger: automatic polling every 10 minutes and manual `Synka live-data nu`
- Frequency: during the competition
- Data scope: pools, match progress, match results count, player names in matches
- TTAttendance behavior: store latest live snapshot and update live status/read model
- Must not: create players, registrations, sessions, or attendance

This split keeps all PDF parsing in `TTAttendanceIntegrations`, while TTAttendance remains the owner of roster preview/apply logic and session assignment.

## Goals

- Keep all OnData PDF parsing in `TTAttendanceIntegrations`
- Make stage 1 the primary source for roster import if it contains complete roster data
- Preserve manual session-number assignment in TTAttendance
- Move TT Coordinator paste import into the OnData integration page as a fallback source
- Keep the existing live sync contract narrow and safe
- Avoid leaving two overlapping import subsystems in TTAttendance
- Keep database and API naming clean enough that the split is obvious in six months

## Non-Goals

- No TTAttendance-side PDF parsing
- No automatic roster apply directly on ingest from the integration app
- No merging roster import and live sync into one payload or one button
- No changes to attendance semantics
- No removal of the TT Coordinator fallback import capability

## Current State

### TTAttendance

Current roster import is driven by pasted TT Coordinator text.

Relevant files:

- `src/lib/import/competition-import.ts`
- `src/app/api/super/competitions/[competitionId]/import/preview/route.ts`
- `src/app/api/super/competitions/[competitionId]/import/apply/route.ts`
- `src/app/super/competitions/[competitionId]/import/CompetitionImportView.tsx`

Current OnData integration is a live snapshot ingest path and status page.

Relevant files:

- `src/lib/ondata-integration-contract.ts`
- `src/lib/ondata-integration-server.ts`
- `src/app/api/integrations/ondata/competitions/[competitionSlug]/snapshots/route.ts`
- `src/app/api/super/competitions/[competitionId]/integration/route.ts`
- `src/app/super/competitions/[competitionId]/integration/CompetitionIntegrationView.tsx`

Current competition list page exposes both a separate import action and a separate integration action.

Relevant file:

- `src/app/super/competitions/CompetitionsView.tsx`

### TTAttendanceIntegrations

The integration app is currently structured around a single live sync runner and publisher.

Relevant files:

- `src/TTAttendanceOndataIntegration.App/MainWindow.xaml`
- `src/TTAttendanceOndataIntegration.App/ViewModels/MainWindowViewModel.cs`
- `src/TTAttendanceOndataIntegration.Core/Models.cs`
- `src/TTAttendanceOndataIntegration.Core/Abstractions.cs`
- `src/TTAttendanceOndataIntegration.Infrastructure/OnDataCompetitionRunner.cs`
- `src/TTAttendanceOndataIntegration.Infrastructure/TtAttendanceSnapshotPublisher.cs`
- `docs/ondata-integration-approach.md`

The current runner shape is appropriate for periodic live sync but should not be overloaded with roster import behavior.

## Target Architecture

### Separation Of Responsibilities

#### TTAttendanceIntegrations

Owns:

- OnData HTTP fetches
- HTML parsing
- stage 1 PDF parsing for registrations
- stage 2, 3, 4 PDF parsing for live progress
- building normalized JSON payloads
- manual publish action for roster import
- scheduled publish action for live sync

Does not own:

- session assignment
- destructive diff review
- class/session creation rules in TTAttendance

#### TTAttendance

Owns:

- receiving roster snapshots
- storing roster snapshots/status
- computing preview diff against current competition state
- warning when imported removals would delete attendance-linked registrations
- applying roster changes through the existing import apply machinery
- persisted session overrides per imported class
- rendering both the OnData import status and the TT Coordinator fallback import UI
- receiving live sync snapshots and serving live sync status

Does not own:

- PDF parsing

## High-Level Design

### A. Shared Roster Import Core In TTAttendance

Refactor the current TT Coordinator import code into a shared roster import core.

Recommended internal shape:

- `RosterImportDataset`
- `RosterImportClass`
- `RosterImportRegistration`
- `buildRosterImportPreview(...)`
- `applyRosterImport(...)`

Adapters feed that shared core:

- TT Coordinator pasted text adapter
- OnData roster snapshot adapter

Important: do not duplicate diff/apply logic for OnData. Reuse the same import planning logic and the same `apply_competition_import_plan` RPC.

### B. Separate OnData Contracts

Do not expand the current live snapshot contract to carry registrations.

Introduce two contracts:

1. `OnDataRosterSnapshotPayload`
2. existing live snapshot payload, kept for live sync only

### C. Separate UI Actions In The Integration App

The integration app should expose two explicit actions:

- `Importera anmälningar`
- `Synka live-data nu`

The existing timer should only run live sync.

## Recommended Contracts

### 1. Roster Import Payload

Recommended route in TTAttendance:

- `POST /api/integrations/ondata/competitions/[competitionSlug]/registration-snapshots`

Recommended payload:

```json
{
  "schemaVersion": 1,
  "competitionSlug": "example-competition",
  "source": {
    "sourceType": "ondata-stage1",
    "fileName": "class-players.pdf",
    "filePath": "https://resultat.ondata.se/ViewClassPDF.php?classID=12345&stage=1",
    "fileModifiedAt": "2026-04-08T12:00:00Z",
    "processedAt": "2026-04-08T12:00:10Z",
    "fileHash": "sha256:..."
  },
  "summary": {
    "classes": 12,
    "players": 187,
    "registrations": 211
  },
  "classes": [
    {
      "externalClassKey": "max-650::2026-05-03::09:00",
      "sourceClassId": "31882",
      "className": "Max 650 poäng",
      "startAt": "2026-05-03T07:00:00.000Z",
      "registrations": [
        {
          "playerName": "Anna Andersson",
          "clubName": "BTK Rekord"
        }
      ]
    }
  ]
}
```

Rules:

- `startAt` must be canonical and required
- `externalClassKey` must be stable across re-imports
- `registrations[]` is explicit and complete for that class
- `clubName` should be a string, not `null`, if the source always has it
- the payload is a snapshot, not a partial patch

### 2. Live Sync Payload

Keep the existing route for now:

- `POST /api/integrations/ondata/competitions/[competitionSlug]/snapshots`

Keep the current payload shape limited to:

- classes
- pools
- match progress and match results

No registrations should be added to this payload.

### 3. API Key Handling

Reuse the current OnData API token generation and verification path if possible.

Recommended approach:

- keep `ondata_integration_settings` as the shared per-competition auth/settings table
- use the same bearer token for both roster import and live sync endpoints
- show two endpoints and one shared API key in the TTAttendance UI

This avoids needless duplication in auth setup.

## TTAttendance Detailed Plan

### Phase 1: Extract Shared Roster Import Core

Refactor `src/lib/import/competition-import.ts` into a clearer split.

Recommended target structure:

- `src/lib/roster-import/types.ts`
- `src/lib/roster-import/planner.ts`
- `src/lib/roster-import/apply.ts`
- `src/lib/roster-import/ttcoordinator-source.ts`
- `src/lib/roster-import/ondata-roster-contract.ts`
- `src/lib/roster-import/ondata-roster-server.ts`

Minimum acceptable alternative:

- keep one file temporarily, but separate parser-specific code from shared preview/apply code with clear exported functions

The new shared core should accept a source-independent dataset and return:

- summary counts
- `classSessionPrompts`
- `toAdd`
- `toRemove`
- final apply plan

Keep reuse of:

- player identity matching
- class identity matching
- registration diff logic
- attendance destructive-removal guard
- existing `apply_competition_import_plan` RPC

### Phase 2: Persist Session Overrides

Add a table for manual session-number overrides.

Recommended new table:

```sql
create table competition_import_session_overrides (
  competition_id uuid not null references competitions(id) on delete cascade,
  source_type text not null,
  external_class_key text not null,
  session_number integer not null check (session_number between 1 and 3),
  updated_at timestamptz not null default now(),
  primary key (competition_id, source_type, external_class_key)
);
```

Use cases:

- OnData roster import remembers previous pass assignment
- TT Coordinator fallback import can optionally reuse the same mechanism

Rules:

- existing imported classes should still default to their current session
- for new classes, a saved override should win over time-based suggestion
- if neither exists, fall back to the current time-based suggestion logic

### Phase 3: Add Roster Snapshot Storage

Add separate storage for OnData registration snapshots.

Recommended tables:

- `ondata_registration_snapshots`
- `ondata_registration_snapshot_classes`
- `ondata_registration_snapshot_registrations`
- `ondata_registration_status`

Recommended minimal fields:

#### `ondata_registration_snapshots`

- `id uuid primary key`
- `competition_id uuid not null`
- `schema_version int not null`
- `payload_hash text not null`
- `received_at timestamptz not null`
- `processed_at timestamptz`
- `processing_status text not null`
- `error_message text`
- `source_file_name text not null`
- `source_file_path text not null`
- `source_file_modified_at timestamptz not null`
- `source_processed_at timestamptz not null`
- `source_file_hash text not null`
- `summary_classes int not null`
- `summary_players int not null`
- `summary_registrations int not null`
- `raw_payload jsonb not null`

#### `ondata_registration_snapshot_classes`

- `id uuid primary key`
- `snapshot_id uuid not null`
- `class_order int not null`
- `external_class_key text not null`
- `source_class_id text`
- `class_name text not null`
- `start_at timestamptz not null`

#### `ondata_registration_snapshot_registrations`

- `id uuid primary key`
- `snapshot_class_id uuid not null`
- `registration_order int not null`
- `player_name text not null`
- `club_name text not null`

#### `ondata_registration_status`

- `competition_id uuid primary key`
- `current_snapshot_id uuid`
- `last_received_at timestamptz`
- `last_processed_at timestamptz`
- `last_payload_hash text`
- `last_error text`
- `last_summary_classes int not null default 0`
- `last_summary_players int not null default 0`
- `last_summary_registrations int not null default 0`
- `last_applied_snapshot_id uuid`
- `last_applied_at timestamptz`
- `updated_at timestamptz not null default now()`

Rationale:

- keep live sync state and registration import state separate
- keep immutable snapshots for investigation and replay
- allow the superadmin page to show “received” versus “applied” separately

### Phase 4: Add Roster Ingest Endpoint

Add route:

- `src/app/api/integrations/ondata/competitions/[competitionSlug]/registration-snapshots/route.ts`

Behavior:

- authenticate with the same bearer token mechanism used today
- parse and validate `OnDataRosterSnapshotPayload`
- store immutable snapshot rows
- update `ondata_registration_status`
- do not auto-apply to competition data
- return snapshot metadata with `202`

### Phase 5: Add Superadmin Preview/Apply For Latest OnData Roster Snapshot

Recommended routes:

- `POST /api/super/competitions/[competitionId]/integration/registration-import/preview`
- `POST /api/super/competitions/[competitionId]/integration/registration-import/apply`

Recommended request shape for preview:

```json
{
  "snapshotId": "optional-latest-by-default"
}
```

Recommended request shape for apply:

```json
{
  "snapshotId": "optional-latest-by-default",
  "confirmRemovalWithAttendance": true,
  "classSessionAssignments": [
    {
      "classKey": "max-650::2026-05-03::09:00",
      "sessionNumber": 1
    }
  ]
}
```

Implementation guidance:

- convert the stored latest OnData roster snapshot into `RosterImportDataset`
- call the shared preview/apply core
- save or update session overrides when apply succeeds
- write `last_applied_snapshot_id` and `last_applied_at`

### Phase 6: Keep TT Coordinator Backup Import But Move It Under Integration

Do not remove the TT Coordinator backup capability.

Change the UI and ownership:

- the backup import is displayed on the OnData integration page
- it is clearly labeled as fallback
- it uses the same shared roster preview/apply core

Recommended UI wording:

- section title: `Reservlösning: TT Coordinator-import`
- short helper text: use this only if OnData roster import is unavailable or incorrect

Recommended route strategy:

- keep current `/import/preview` and `/import/apply` routes temporarily for compatibility
- change the integration page to call them for the fallback panel
- optionally replace the old `/super/competitions/[competitionId]/import` page with a redirect to `/integration`

### Phase 7: Update Integration Page

The integration page should become the single surface for OnData-related import and sync.

Recommended layout:

1. `Anslutning`
   - shared API key
   - registration import endpoint
   - live sync endpoint

2. `Anmälningsimport`
   - latest roster snapshot summary
   - received time
   - applied time
   - preview button
   - apply button
   - class session assignment UI
   - destructive removal warning UI

3. `Live-synk`
   - keep current live snapshot status card

4. `Reservlösning: TT Coordinator-import`
   - existing pasted-text preview/apply UI moved here

Recommended file to update first:

- `src/app/super/competitions/[competitionId]/integration/CompetitionIntegrationView.tsx`

### Phase 8: Clean Up Competition List Page

Remove the separate `Importera startlista` action from:

- `src/app/super/competitions/CompetitionsView.tsx`

Keep:

- one `OnData-integration` action per competition

Optional compatibility step:

- keep the old import page route for one iteration but redirect users to the integration page

## TTAttendanceIntegrations Detailed Plan

### Phase 1: Split Manual Roster Import From Live Sync In The UI

Add a second explicit button in the main app UI.

Current buttons:

- `Starta/Stoppa`
- `Synka nu`

Recommended result:

- `Starta/Stoppa live-synk`
- `Synka live-data nu`
- `Importera anmälningar`

Update files:

- `src/TTAttendanceOndataIntegration.App/MainWindow.xaml`
- `src/TTAttendanceOndataIntegration.App/ViewModels/MainWindowViewModel.cs`

Important:

- only live sync participates in the polling loop
- registration import is always manual

### Phase 2: Add Separate Abstractions

Do not overload `IIntegrationRunner` and `ITtAttendanceSnapshotPublisher` with two unrelated behaviors.

Recommended additions:

- `IRosterImportRunner`
- `ITtAttendanceRosterImportPublisher`
- `OnDataRosterImportRunner`
- `TtAttendanceRosterImportPublisher`

The existing live sync runner and publisher should remain in place.

### Phase 3: Add Stage 1 Parser

Implement a parser for the stage 1 players PDF.

Recommended responsibilities:

- parse class roster rows from the PDF
- extract player names and clubs
- produce a normalized per-class registration list
- carry enough source information to build a stable snapshot hash

Suggested new types in `TTAttendanceOndataIntegration.Core`:

- `RosterImportSnapshot`
- `RosterImportSource`
- `RosterImportSummary`
- `RosterImportClass`
- `RosterImportRegistration`

If stage 1 parsing still requires HTML page metadata for canonical class date/time, combine:

- class metadata from `klasser_main.html`
- players from stage 1 PDF

Required output for each class:

- source class id
- class name
- canonical `startAt`
- registration list

### Phase 4: Add Roster Import Publisher

Add a second publisher that posts the roster snapshot to TTAttendance.

Recommended route target:

- `/api/integrations/ondata/competitions/[competitionSlug]/registration-snapshots`

Important:

- use the same API token as live sync
- keep request/response logging distinct from live sync logging
- do not try to publish the roster snapshot through the live snapshot endpoint

### Phase 5: Add Config Surface

Current config only models one TTAttendance endpoint field.

Recommended target config:

- `TtAttendanceLiveSyncEndpoint`
- `TtAttendanceRosterImportEndpoint`
- `TtAttendanceApiToken`

Minimum acceptable alternative:

- reuse a common base URL plus two derived paths

Avoid:

- one ambiguous `TtAttendanceBaseUrl` field that is used for two unrelated publish operations without clear UI labeling

### Phase 6: Add Runtime Status For Manual Roster Import

The app should show separate status for:

- latest live sync
- latest roster import attempt

Minimum acceptable implementation:

- log entries clearly distinguish event names
- status message after manual roster import reflects that a roster snapshot was published or failed

Better implementation:

- add dedicated runtime state fields for latest roster import time, result, and error

## Suggested File Changes

### TTAttendance

New files, recommended:

- `src/lib/roster-import/types.ts`
- `src/lib/roster-import/planner.ts`
- `src/lib/roster-import/apply.ts`
- `src/lib/roster-import/ttcoordinator-source.ts`
- `src/lib/roster-import/ondata-roster-contract.ts`
- `src/lib/roster-import/ondata-roster-server.ts`
- `src/app/api/integrations/ondata/competitions/[competitionSlug]/registration-snapshots/route.ts`
- `src/app/api/super/competitions/[competitionId]/integration/registration-import/preview/route.ts`
- `src/app/api/super/competitions/[competitionId]/integration/registration-import/apply/route.ts`
- one or more new SQL migrations under `supabase/migrations/`

Files to refactor:

- `src/lib/import/competition-import.ts`
- `src/lib/ondata-integration-server.ts`
- `src/app/super/competitions/[competitionId]/integration/CompetitionIntegrationView.tsx`
- `src/app/super/competitions/CompetitionsView.tsx`
- `tests/e2e/superadmin/ondata-integration.spec.ts`

Files to keep temporarily for compatibility:

- `src/app/super/competitions/[competitionId]/import/CompetitionImportView.tsx`
- `src/app/api/super/competitions/[competitionId]/import/preview/route.ts`
- `src/app/api/super/competitions/[competitionId]/import/apply/route.ts`

### TTAttendanceIntegrations

New files, recommended:

- `src/TTAttendanceOndataIntegration.Core/RosterImportModels.cs`
- `src/TTAttendanceOndataIntegration.Core/IRosterImportRunner.cs` or similar abstraction placement
- `src/TTAttendanceOndataIntegration.Infrastructure/OnDataRosterImportRunner.cs`
- `src/TTAttendanceOndataIntegration.Infrastructure/TtAttendanceRosterImportPublisher.cs`
- parser-specific helpers for stage 1 PDF extraction

Files to refactor:

- `src/TTAttendanceOndataIntegration.App/MainWindow.xaml`
- `src/TTAttendanceOndataIntegration.App/ViewModels/MainWindowViewModel.cs`
- `src/TTAttendanceOndataIntegration.Core/Models.cs`
- `src/TTAttendanceOndataIntegration.Core/Abstractions.cs`
- `src/TTAttendanceOndataIntegration.Infrastructure/OnDataCompetitionRunner.cs`
- `src/TTAttendanceOndataIntegration.Infrastructure/TtAttendanceSnapshotPublisher.cs`

## Implementation Order

Recommended order for a new agent:

1. Define the new roster import payload contract in both repos.
2. Add TTAttendance database storage for OnData registration snapshots and session overrides.
3. Extract TTAttendance shared roster preview/apply logic from the current TT Coordinator import flow.
4. Add TTAttendance ingest, preview, and apply routes for OnData registration snapshots.
5. Add the new stage 1 parser and roster import publisher in `TTAttendanceIntegrations`.
6. Add the new manual `Importera anmälningar` button in the integration app.
7. Update the TTAttendance integration page to show both registration import and live sync areas.
8. Move the TT Coordinator fallback UI into the integration page.
9. Remove the separate competition-list import button.
10. Run and fix tests in both repos.

This order keeps the system functional at each step and avoids blocking UI work on final parser completeness.

## Testing Plan

### TTAttendance

Add or update Playwright E2E coverage for:

1. unauthenticated access to the integration page still redirects
2. superadmin sees two endpoints or two clearly separate import/sync areas
3. OnData registration snapshot ingest succeeds with valid token
4. preview from latest OnData registration snapshot shows:
   - classes parsed
   - players parsed
   - registrations parsed
   - session prompts
5. apply from OnData registration snapshot creates:
   - sessions
   - classes
   - players
   - registrations
6. re-import from OnData registration snapshot removes missing registrations only after confirmation when attendance exists
7. TT Coordinator fallback import still works from the integration page
8. competition list no longer shows a separate `Importera startlista` button
9. existing live sync snapshot tests still pass

Suggested test location:

- continue under `tests/e2e/superadmin/`

### TTAttendanceIntegrations

Add tests for:

1. parsing a stage 1 PDF fixture into class registrations
2. building stable external class keys and canonical `startAt`
3. publishing roster import payload to the new TTAttendance route
4. live sync publisher still posts the current live payload unchanged
5. manual roster import button triggers the correct runner and does not start the timer loop

## Acceptance Criteria

The change is done when all of the following are true.

1. A superadmin can manage both OnData roster import and live sync from one TTAttendance integration page.
2. The registration import path uses stage 1 data, not the live progress payload.
3. The live sync path still only updates live sync data and does not affect registrations.
4. Manual session-number assignment is preserved for imported classes and remembered across re-imports.
5. TT Coordinator paste import is still available as a fallback from the integration page.
6. The separate competition-list import button is gone.
7. The integration app has a dedicated manual button for registration import.
8. The integration app still supports scheduled live sync every 10 minutes.
9. There is no duplicated roster diff/apply engine in TTAttendance.

## Risks And Open Questions

### Risk 1: Stage 1 Date/Time Quality

The roster import plan assumes stage 1 plus index metadata can provide canonical class schedule data.

If stage 1 only gives short day text and the HTML index cannot reliably produce a full date, class identity may still be fragile.

Mitigation:

- validate one or more real stage 1 fixtures before implementing final matching logic
- if needed, combine stage 1 player extraction with class metadata from `klasser_main.html`

### Risk 2: Partial Or Incomplete Roster Data

The roster import should only be used as primary source if the stage 1 PDF contains the full class roster.

Mitigation:

- validate against a real competition where TT Coordinator paste import is already known-good
- compare class count and registration count across both sources during development

### Risk 3: UI Scope Growth

The TTAttendance integration page could become too dense.

Mitigation:

- keep only the core controls visible
- use short explanatory copy
- put TT Coordinator fallback in a secondary section or collapsible panel

## Recommended Naming Rules

Use naming that makes the split obvious.

Prefer:

- `roster import`
- `registration snapshot`
- `live sync`
- `live snapshot`

Avoid:

- one broad `ondata integration` service or table that mixes both concerns internally
- `snapshot` names without clarifying whether they are roster or live

## Handoff Notes For A New Agent

When implementing, prefer this strategy:

1. keep the existing live sync endpoint working throughout the refactor
2. extract shared roster import logic before changing UI heavily
3. add the new roster ingest path before wiring the integration app button
4. only remove the separate import button after the integration page fallback is working

If time is short, the minimum viable slice is:

1. add OnData roster snapshot ingest and storage
2. add manual preview/apply from latest roster snapshot in TTAttendance
3. add a manual `Importera anmälningar` button in the integration app
4. move the TT Coordinator fallback UI later

That minimum slice still preserves the architectural split and can be extended without cleanup debt.