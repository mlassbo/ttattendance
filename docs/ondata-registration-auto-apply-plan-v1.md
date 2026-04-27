# OnData Registration Auto-Apply Plan V1

This document is the implementation handoff for making OnData registration import part of the normal sync workflow while keeping TTAttendance as the owner of safe apply decisions.

The plan covers both repositories:

- `c:\repos\TTAttendance`
- `c:\repos\TTAttendanceIntegrations`

This plan supersedes the in-competition registration-import policy in `docs/ondata-registration-import-live-sync-plan-v1.md`. The older document assumed that OnData registration snapshots must always stop at stored snapshot + manual superadmin preview/apply. The new direction is conditional auto-apply with explicit fallback to manual review.

## Decision Summary

### Product Direction

- During competition, the integration app should publish OnData registration snapshots automatically as part of the ordinary sync flow.
- The integration app should no longer require a separate manual `Importera anmälningar` action for the common case.
- TTAttendance should attempt automatic apply when the received registration snapshot is safe enough.
- TTAttendance should still keep the superadmin preview/apply path for blocked cases.
- The integration app should show whether TTAttendance auto-applied the latest registration snapshot or is waiting for manual review.
- The registration ingest endpoint should return the immediate outcome in its response body.
- TTAttendance should also expose a separate machine-facing registration-import status endpoint so the integration app can recover state after restart and show the current truth even when the state changed after the original ingest request.

### Default Safety Policy

Treat TTAttendance attendance statuses as:

- `confirmed`: player is expected to attend
- `absent`: player has explicitly marked that they are not attending

The default auto-apply policy is:

- allow auto-apply when preview has no blocking errors
- allow auto-apply when every class has a resolved effective session assignment
- allow auto-apply when every removal touches only registrations with attendance status `null` or `absent`
- require manual review when any removal touches a registration with attendance status `confirmed`
- require manual review when preview has blocking errors
- require manual review when any class lacks a resolved session assignment

This policy is intentionally narrower than “always auto-apply” and intentionally broader than the current “any attendance status blocks apply”.

## Goals

- Remove unnecessary secretariat friction during competition
- Keep TTAttendance as the owner of diff, apply, and attendance safety rules
- Preserve the ability to manually preview and approve a blocked registration import
- Show clear status in the integration app when TTAttendance requires manual review
- Keep the live sync and roster import payloads separate
- Keep separate runner/publisher responsibilities in the integration app, even if the UI action becomes combined

## Non-Goals

- No TTAttendance-side PDF parsing
- No merging live sync payloads and registration payloads into one contract
- No removal of the TT Coordinator fallback import flow
- No automatic deletion of registrations with `confirmed` attendance
- No requirement that TTAttendanceIntegrations infer import status from timestamps alone

## Current Constraints

### TTAttendance

Current state:

- OnData registration snapshots are ingested through `POST /api/integrations/ondata/competitions/[competitionSlug]/registration-snapshots`
- ingest currently persists the snapshot only
- manual preview/apply runs through the shared roster import planner
- the shared planner blocks apply when `registrationsToRemoveWithAttendance > 0`
- superadmin UI already shows `latestSnapshotId`, `lastAppliedSnapshotId`, and `lastAppliedAt`

Relevant files:

- `src/app/api/integrations/ondata/competitions/[competitionSlug]/registration-snapshots/route.ts`
- `src/lib/roster-import/ondata-roster-server.ts`
- `src/lib/roster-import/planner.ts`
- `src/app/api/super/competitions/[competitionId]/integration/registration-import/preview/route.ts`
- `src/app/api/super/competitions/[competitionId]/integration/registration-import/apply/route.ts`
- `src/app/super/competitions/[competitionId]/integration/CompetitionIntegrationView.tsx`
- `src/components/OnDataRosterImportPanel.tsx`

### TTAttendanceIntegrations

Current state:

- `Starta synk` and `Synka nu` run the ordinary live/result sync path only
- `Importera anmälningar` runs the roster-import path separately
- the integration app currently publishes registration snapshots but does not read registration-import status back from TTAttendance

Relevant files:

- `src/TTAttendanceOndataIntegration.App/MainWindow.xaml`
- `src/TTAttendanceOndataIntegration.App/ViewModels/MainWindowViewModel.cs`
- `src/TTAttendanceOndataIntegration.App/ViewModels/CompetitionMonitorItemViewModel.cs`
- `src/TTAttendanceOndataIntegration.Core/Models.cs`
- `src/TTAttendanceOndataIntegration.Infrastructure/OnDataRosterImportRunner.cs`
- `src/TTAttendanceOndataIntegration.Infrastructure/TtAttendanceRosterImportPublisher.cs`

## Target Behavior

### Operator Workflow

1. Secretariat starts sync in the integration app.
2. Each sync cycle continues to run live/result sync as today.
3. Each sync cycle also publishes the latest registration snapshot when OnData registration data changed.
4. TTAttendance receives the snapshot and immediately decides one of:
   - auto-applied
   - pending manual review
   - ingest/apply failed
   - unchanged/no new snapshot effect
5. The integration app shows that outcome in its main status area.
6. If TTAttendance marks the latest registration snapshot as pending manual review, the secretariat can open TTAttendance and use the existing preview/apply UI.

### Manual Review Cases

Manual review is required when at least one of the following is true:

- the preview contains blocking dataset or assignment errors
- at least one class still lacks a resolved session assignment
- at least one removal would delete a registration whose attendance status is `confirmed`

### Allowed Automatic Removal Cases

Automatic apply is allowed when removed registrations are only in one of these states:

- no attendance row yet
- attendance status `absent`

This specifically covers the common case where a player has already marked `not attending` in TTAttendance and is later removed from the upstream competition system.

## TTAttendance Changes

### 1. Expand The Preview Model To Separate Removal Risk Levels

Update the shared roster planner preview contract so it can distinguish removal types.

Required changes:

- replace or supplement `registrationsToRemoveWithAttendance` with:
  - `registrationsToRemoveWithConfirmedAttendance`
  - `registrationsToRemoveWithAbsentAttendance`
- keep `registrationsToRemove` as the total removal count
- update warning text so `confirmed` removals are described as blocking and `absent` removals are described as informational
- update both TT Coordinator and OnData import panels to render the new counters cleanly

Implementation note:

- If backward compatibility inside the codebase is useful during refactor, keep the old aggregate temporarily as a derived field until all callers are migrated.

### 2. Introduce A Registration Import Decision Model

TTAttendance needs an explicit machine-facing status model rather than forcing clients to infer state from `latestSnapshotId` and `lastAppliedSnapshotId`.

Add a registration-import decision payload shape such as:

```ts
type RegistrationImportDecisionState =
  | 'auto_applied'
  | 'pending_manual_review'
  | 'apply_failed'
  | 'ingested_only'
  | 'no_snapshot'

type RegistrationImportDecision = {
  state: RegistrationImportDecisionState
  reasonCode:
    | 'none'
    | 'confirmed_removals'
    | 'missing_session_assignment'
    | 'preview_errors'
    | 'ingest_failed'
    | 'apply_failed'
  message: string | null
  latestSnapshotId: string | null
  lastAppliedSnapshotId: string | null
  latestSnapshotProcessedAt: string | null
  lastAppliedAt: string | null
  latestSummary: {
    classes: number
    players: number
    registrations: number
  }
  previewSummary?: {
    registrationsToAdd: number
    registrationsToRemove: number
    registrationsToRemoveWithConfirmedAttendance: number
    registrationsToRemoveWithAbsentAttendance: number
  }
}
```

The exact field names can vary, but the endpoint must return an explicit decision state and reason code.

### 3. Attempt Auto-Apply During Ingest

Change the registration ingest flow so it persists the snapshot and then attempts automatic apply using the shared planner.

Recommended implementation shape:

- keep `persistOnDataRegistrationSnapshot(...)` focused on storing the snapshot and updating ingest status
- add a higher-level function, for example `ingestAndMaybeApplyOnDataRegistrationSnapshot(...)`
- after successful persistence:
  - load the snapshot dataset
  - build preview
  - compute effective default class-session assignments using the same logic already used by the UI
  - if policy allows auto-apply, call shared `applyRosterImport(...)`
  - if policy blocks auto-apply, update registration status with `pending_manual_review`
  - if auto-apply throws after the snapshot was stored, update registration status with `apply_failed`

Important:

- auto-apply must use the same planner and RPC path as manual apply
- the ingest endpoint must never bypass shared validation rules
- manual preview/apply must remain available even when auto-apply is enabled

### 4. Resolve Session Assignment For Auto-Apply

Auto-apply needs a deterministic session assignment strategy.

Use the same default resolution order already present in the planner/UI:

- saved override for this external class key
- current session number for an existing matched class
- suggested session number derived from class time

If any class still does not end up with a valid session assignment option, block to manual review.

This preserves existing behavior and prevents a separate hidden assignment algorithm from drifting away from the superadmin UI.

### 5. Return Immediate Decision Data From The Ingest Endpoint

Update `POST /api/integrations/ondata/competitions/[competitionSlug]/registration-snapshots` so the response body contains the immediate outcome for the snapshot that was just received.

Recommended response shape:

```json
{
  "snapshotId": "...",
  "receivedAt": "...",
  "processedAt": "...",
  "decision": {
    "state": "auto_applied",
    "reasonCode": "none",
    "message": "Anmälningssnapshot applicerades automatiskt.",
    "latestSnapshotId": "...",
    "lastAppliedSnapshotId": "...",
    "lastAppliedAt": "..."
  }
}
```

This response is a convenience for the client that just posted the snapshot.

### 6. Add A Separate Machine-Facing Status Endpoint

Add a new integration-facing status route, authenticated with the same bearer token as the other machine endpoints.

Recommended route:

- `GET /api/integrations/ondata/competitions/[competitionSlug]/registration-import-status`

Responsibilities:

- return the latest authoritative `RegistrationImportDecision`
- return the current/latest registration snapshot summary
- return `lastError` when ingest failed
- return enough information for the integration app to detect that manual review is still pending even if the app restarts later

Reason for keeping this route even though the ingest response also returns decision data:

- the authoritative state can change after the original ingest request
- the integration app may restart or reconnect later
- a superadmin may manually apply a previously pending snapshot after the ingest response is gone

### 7. Update Superadmin UI Copy And Status Rendering

The superadmin integration page should no longer describe registration import as “must always be previewed before apply”.

Update copy to reflect:

- automatic apply is attempted when safe
- manual review is required only when TTAttendance blocks the latest snapshot

Recommended UI additions:

- explicit decision badge: `Automatiskt applicerad`, `Väntar på manuell granskning`, `Applicering misslyckades`
- short reason text for pending review, for example `Bekräftad närvaro påverkas` or `Passmappning saknas`

### 8. TTAttendance Test Plan

Add or update tests for:

- preview summary counts split between `confirmed` and `absent`
- `absent` removals do not block auto-apply
- `confirmed` removals block auto-apply and return `pending_manual_review`
- no-attendance removals can be auto-applied
- preview errors block auto-apply
- missing session assignment blocks auto-apply
- ingest endpoint returns immediate decision object
- status endpoint returns latest authoritative decision
- manually applying a pending snapshot updates the status endpoint from `pending_manual_review` to `auto_applied` or equivalent applied state

Suggested files to extend:

- `tests/e2e/superadmin/ondata-integration.spec.ts`
- `tests/e2e/superadmin/competition-import.spec.ts`
- any planner-focused unit tests already present or newly introduced

## TTAttendanceIntegrations Changes

### 1. Fold Registration Import Into The Normal Sync Workflow

The integration app should keep separate runner implementations but combine them at the workflow level.

Recommended behavior:

- `Synka nu` runs live/result sync and registration import sequentially
- `Starta synk` polling loop also runs both sequentially per cycle
- the dedicated `Importera anmälningar` button can be removed after status feedback is added

Implementation options:

- simplest: orchestrate sequential calls in `MainWindowViewModel`
- cleaner long-term: introduce a small application service/orchestrator that calls both runners and returns a combined result

Either option is acceptable as long as the runners remain separate and independently testable.

### 2. Preserve Independent Failure Semantics

Do not let registration import failure incorrectly masquerade as live sync failure.

Required behavior:

- if live sync succeeds and registration import is auto-applied, overall sync is healthy
- if live sync succeeds and TTAttendance reports `pending_manual_review`, overall sync is healthy but needs operator attention
- if live sync succeeds and registration import apply fails, overall sync is degraded but not equivalent to live sync failure
- if live sync fails, keep the existing error behavior for the monitor itself

In other words, registration import review state should be visible without collapsing everything into one generic `error` string.

### 3. Add Registration Import Decision State To The App Model

Extend the integration app runtime/UI model to store the latest TTAttendance registration-import decision.

Suggested additions:

- decision state enum
- reason code
- last decision message
- latest TTAttendance snapshot id
- last applied snapshot id
- last applied at

These fields can live in `IntegrationRuntimeState.RosterImport` or in a nested TTAttendance-specific child object if that reads more clearly.

### 4. Use Both Immediate Response And Status Endpoint

The integration app should use both TTAttendance responses:

- ingest response: immediate outcome for the snapshot that was just posted
- status endpoint: authoritative read model for what TTAttendance currently believes

Recommended client flow:

1. publish registration snapshot
2. read decision data from the POST response
3. optionally follow with a GET to the status endpoint immediately after publish to normalize client state
4. on subsequent sync cycles, refresh the registration-import status from the GET endpoint even if no new snapshot was published

This avoids stale UI after app restarts and allows the app to notice that a superadmin manually resolved a previously pending snapshot.

### 5. Update Main UI Status Copy

Add clear operator-facing strings in the main card.

Minimum cases:

- `Anmälningar uppdaterade automatiskt.`
- `TTAttendance kräver manuell granskning av anmälningsimporten.`
- `Anmälningsimporten misslyckades i TTAttendance.`
- `Ingen ändring i anmälningarna.`

If the app keeps a single status line, combine it carefully so that live sync success is not obscured.

Better option:

- keep the existing top-level sync status
- add a secondary line or summary for registration import state

### 6. Remove The Dedicated Manual Import Button

After the combined sync workflow and TTAttendance status feedback are in place, remove `Importera anmälningar` from the main action row.

Do not remove the button before the app can show pending-manual-review status. Otherwise the operator loses the only visible clue that anything needs attention.

### 7. TTAttendanceIntegrations Test Plan

Add or update tests for:

- `Synka nu` triggers both live sync and registration import
- monitoring loop triggers both paths
- registration import status from TTAttendance is persisted to app runtime state
- pending-manual-review is shown distinctly from hard failure
- app status survives restart via saved runtime state
- button removal does not break the normal sync workflow

Suggested areas:

- `TTAttendanceOndataIntegration.App` view model tests if present
- infrastructure tests for any new TTAttendance status client
- integration tests around combined workflow behavior

## Shared API Contract Proposal

### POST Registration Snapshot

Route:

- `POST /api/integrations/ondata/competitions/[competitionSlug]/registration-snapshots`

Auth:

- existing bearer token

Response body:

```json
{
  "snapshotId": "...",
  "receivedAt": "...",
  "processedAt": "...",
  "decision": {
    "state": "pending_manual_review",
    "reasonCode": "confirmed_removals",
    "message": "1 bekräftad anmälan skulle tas bort. Manuell granskning krävs.",
    "latestSnapshotId": "...",
    "lastAppliedSnapshotId": "...",
    "latestSummary": {
      "classes": 10,
      "players": 125,
      "registrations": 143
    },
    "previewSummary": {
      "registrationsToAdd": 1,
      "registrationsToRemove": 2,
      "registrationsToRemoveWithConfirmedAttendance": 1,
      "registrationsToRemoveWithAbsentAttendance": 1
    }
  }
}
```

### GET Registration Import Status

Route:

- `GET /api/integrations/ondata/competitions/[competitionSlug]/registration-import-status`

Auth:

- existing bearer token

Response body:

- same `decision` payload shape as above
- may omit `previewSummary` when no pending review exists

## Suggested Implementation Order

1. TTAttendance: split removal counters and refactor planner decision helpers.
2. TTAttendance: implement `RegistrationImportDecision` model and status derivation helpers.
3. TTAttendance: update ingest flow to attempt auto-apply and return immediate decision.
4. TTAttendance: add machine-facing registration-import status endpoint.
5. TTAttendance: update superadmin integration page and OnData roster import panel copy.
6. TTAttendance: add tests for absent vs confirmed removal behavior and status transitions.
7. TTAttendanceIntegrations: add TTAttendance registration-import status client and state model.
8. TTAttendanceIntegrations: combine live sync + roster import in `Synka nu` and monitor loop.
9. TTAttendanceIntegrations: update UI/status strings and remove the manual import button.
10. TTAttendanceIntegrations: add tests for combined workflow and pending-review display.

## Acceptance Criteria

The work is complete when all of the following are true:

- starting sync in the integration app publishes both live sync and registration import updates
- a newly received registration snapshot can be auto-applied without superadmin interaction when it only adds registrations or removes registrations with attendance `null` or `absent`
- any snapshot that would remove a `confirmed` registration remains unapplied and is clearly marked as requiring manual review
- TTAttendance exposes machine-readable registration-import status for the latest snapshot
- the integration app displays that status clearly after publish and after restart
- the integration app no longer depends on a dedicated `Importera anmälningar` action for the standard competition workflow
- a superadmin can still preview and manually apply a blocked snapshot in TTAttendance

## Notes For The Implementing Agent

- keep the live sync contract and registration snapshot contract separate
- do not duplicate roster diff logic; TTAttendance must continue using the shared planner/apply path
- prefer explicit decision-state fields over timestamp inference in client code
- if a migration is needed for new status fields or enum-like values, keep it backward compatible with existing registration status rows