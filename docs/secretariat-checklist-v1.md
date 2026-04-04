# Checklista V1

This document specifies the first version of the checklist flow for TTAttendance.

## Purpose

The system must help the secretariat keep track of what has happened in each class, what is currently ongoing, and what should happen next.

The feature should:

- fit into the existing secretariat flow built around attendance
- support operational follow-up per class after attendance closes
- show ongoing phases, not only completed milestones
- allow optional steps to be skipped when a class does not use them
- be designed so a simplified class status can later be shown to players

## Decisions

- Attendance remains a derived live state from registrations plus attendance records.
- Post-attendance workflow is stored as explicit per-class checklist state.
- Pool play is the default flow for now.
- All classes show the same checklist steps in V1.
- Optional steps can be skipped by the secretariat instead of being preconfigured away.
- A-slutspel and B-slutspel are independent steps and may run at the same time.
- Prisutdelning is always applicable.
- `active` is optional in V1. Staff may go directly from `not_started` to `done`.
- Resetting a step should reset that step and all downstream dependent steps.
- Step order, `canSkip`, and dependencies should be encoded as structured data in the workflow helper.
- The first implementation extends the existing admin dashboard and class detail page instead of introducing a separate area.

## Non-Goals

- No integration with the external competition system in V1.
- No automatic synchronization of seeding, lottning, pool results, or playoff progress.
- No staff identity or audit trail beyond timestamps and optional notes in V1.
- No player-facing UI in V1, but the API and state model should support it later.

## Existing Context

The current secretariat flow already has:

- an admin dashboard with live attendance counts and past-deadline warnings
- a class detail page with per-player attendance status and admin overrides
- attendance rules derived from class start time and attendance deadline

Relevant code:

- [src/app/[slug]/admin/dashboard/AdminDashboard.tsx](src/app/%5Bslug%5D/admin/dashboard/AdminDashboard.tsx)
- [src/app/[slug]/admin/classes/[classId]/ClassAttendanceView.tsx](src/app/%5Bslug%5D/admin/classes/%5BclassId%5D/ClassAttendanceView.tsx)
- [src/app/api/admin/sessions/route.ts](src/app/api/admin/sessions/route.ts)
- [src/app/api/admin/classes/[classId]/attendance/route.ts](src/app/api/admin/classes/%5BclassId%5D/attendance/route.ts)

## Product Model

The class workflow is a mix of:

- derived state
- manual step state
- repeatable operational events

### Derived state

Derived state should not be manually edited.

It includes:

- attendance status
- whether a callout is currently needed
- whether pool play is currently in progress
- whether playoff work is currently in progress
- the class headline status shown on the dashboard
- the next recommended action shown to the secretariat

### Manual step state

Manual step state is used for milestones the app cannot observe automatically.

The V1 manual steps are:

1. `seed_class`
2. `publish_pools`
3. `register_match_results`
4. `publish_pool_results`
5. `a_playoff`
6. `b_playoff`
7. `prize_ceremony`

Each manual step stores one of these statuses:

- `not_started`
- `active`
- `done`
- `skipped`

`ready` and `blocked` are derived in application code from dependencies and current attendance state. They should not be stored in the database.

`active` is an operational hint, not a required part of the lifecycle. V1 should allow direct `not_started -> done` so the system still works if staff skip the intermediate state.

In the implemented UI, attendance is rendered as the first checklist step, `Kolla närvaro`, even though attendance itself is still derived rather than stored as a manual workflow step.

### Repeatable events

Some actions are not best represented as a single status.

V1 includes one repeatable event:

- `missing_players_callout`

The secretariat may call out missing players more than once. The app should therefore store callouts as events and show the latest timestamp.

## Database Design

V1 should add two tables.

### `class_workflow_steps`

One row per class and step.

Suggested schema:

```sql
create table class_workflow_steps (
  class_id    uuid        not null references classes(id) on delete cascade,
  step_key    text        not null check (step_key in (
    'seed_class',
    'publish_pools',
    'register_match_results',
    'publish_pool_results',
    'a_playoff',
    'b_playoff',
    'prize_ceremony'
  )),
  status      text        not null check (status in (
    'not_started',
    'active',
    'done',
    'skipped'
  )),
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (class_id, step_key)
);

create index idx_class_workflow_steps_class on class_workflow_steps (class_id);
```

Recommended behavior:

- Backfill one row per existing class and step in the migration.
- When future imports create new classes, insert the default workflow rows at the same time.
- When classes are removed, workflow rows should cascade delete automatically.
- Do not add `started_at` in V1. It is useful, but it adds schema and mutation complexity before there is a concrete UI need.

### `class_workflow_events`

Append-only operational events.

Suggested schema:

```sql
create table class_workflow_events (
  id          uuid        primary key default gen_random_uuid(),
  class_id    uuid        not null references classes(id) on delete cascade,
  event_key   text        not null check (event_key in (
    'missing_players_callout'
  )),
  note        text,
  created_at  timestamptz not null default now()
);

create index idx_class_workflow_events_class_created
  on class_workflow_events (class_id, created_at desc);
```

### Why this split

This split avoids two common problems:

- trying to force repeatable operational actions into one boolean or one status field
- storing derived readiness in the database and then having it drift from reality

## State Machine

V1 should treat the class workflow as a dependency graph, not one single linear status field.

That is required because:

- attendance is partly derived
- A-slutspel and B-slutspel can run in parallel
- some steps can be skipped

### Attendance state

Attendance state is derived from the existing attendance data.

Possible derived states:

- `awaiting_attendance`
- `callout_needed`
- `attendance_complete`

Rules:

- If `noResponse > 0` and the deadline has not passed: `awaiting_attendance`
- If `noResponse > 0` and the deadline has passed: `callout_needed`
- If `noResponse === 0`: `attendance_complete`

### Step dependencies

Dependencies should be represented as workflow metadata in code, not only as ad hoc conditional logic. Each step definition should include:

- `order`
- `dependsOn`
- `canSkip`
- `requiresAttendanceComplete`

`seed_class`

- blocked until attendance is complete
- may be skipped

`publish_pools`

- blocked until attendance is complete
- if `seed_class` is `done`, continue
- if `seed_class` is `skipped`, continue
- if `seed_class` is `not_started` or `active`, stay blocked

`publish_pool_results`

- blocked until `register_match_results` is `done`

`register_match_results`

- blocked until `publish_pools` is `done`

`a_playoff`

- blocked until `publish_pool_results` is `done`
- may be skipped

`b_playoff`

- blocked until `publish_pool_results` is `done`
- may be skipped

`prize_ceremony`

- blocked until `a_playoff` is `done` or `skipped`
- blocked until `b_playoff` is `done` or `skipped`

### Derived current phase

The app should derive a single headline phase for cards and future player visibility.

Recommended precedence:

1. `callout_needed` if attendance is incomplete and deadline has passed
2. `awaiting_attendance` if attendance is incomplete and deadline has not passed
3. `seeding_in_progress` if `seed_class = active`
4. `pool_draw_in_progress` if `publish_pools = active`
5. `pool_play_in_progress` if `publish_pools = done` and `publish_pool_results` is not `done` or `skipped`
6. `publishing_pool_results` if `publish_pool_results = active`
7. `playoffs_in_progress` if one or both playoffs are active
8. `playoffs_in_progress` if one or both playoffs are done and prize ceremony is not yet started
9. `prize_ceremony_in_progress` if `prize_ceremony = active`
10. `finished` if `prize_ceremony = done`
11. otherwise fall back to `attendance_complete`

Important implementation note:

- ready steps should not become the current phase label
- this avoids redundant states like `Aktuell fas Seeda klass` together with `Nästa: Seeda klass`

### Derived next action

The dashboard should also compute one next action per class.

Rules:

- prefer active steps before ready steps
- if several steps are active, use the workflow step order as the tie-breaker
- if no step is active, use the first ready step in workflow order

Recommended priority:

1. Call out missing players
2. Seed class
3. Publish pools
4. Publish pool results
5. Draw and publish A-slutspel
6. Draw and publish B-slutspel
7. Hold prize ceremony

In the current UI, the checklist only exposes `Klar`, `Skippa`, and `Nollställ`. There is no separate `Påbörja` button anymore.

## Swedish Checklist Copy

These labels should be used in the UI.

### Headline status copy

Derived class headline labels:

- `awaiting_attendance`: `Inväntar närvaro`
- `callout_needed`: `Ropa upp saknade spelare`
- `attendance_complete`: `Närvaro klar`
- `seeding_in_progress`: `Seedning pågår`
- `pool_draw_in_progress`: `Pooler lottas`
- `pool_play_in_progress`: `Poolspel pågår`
- `publishing_pool_results`: `Poolresultat förbereds`
- `a_playoff_in_progress`: `Slutspel pågår`
- `b_playoff_in_progress`: `Slutspel pågår`
- `playoffs_in_progress`: `Slutspel pågår`
- `prize_ceremony_in_progress`: `Prisutdelning pågår`
- `finished`: `Klassen är klar`

### Attendance step copy

- label: `Kolla närvaro`
- `awaiting_attendance`: `Inväntar fler svar före deadline.`
- `callout_needed`: `Deadline passerad och spelare saknas.`
- `attendance_complete`: `Närvaron är klar för klassen.`

### Manual checklist labels

`seed_class`

- label: `Seeda klass`
- helper: `Gör seedning i tävlingssystemet om klassen ska seedas.`

`publish_pools`

- label: `Lotta och publicera pooler`
- helper: `Skapa lottning, skriv ut, märk bord, anslå och ropa ut att poolspelet startar.`

`publish_pool_results`

- label: `Publicera poolresultat`
- helper: `Skriv ut och anslå poolresultaten när poolspelet är färdigt.`

`a_playoff`

- label: `Lotta och publicera A-slutspel`
- helper: `Lotta och publicera A-slutspel när poolresultaten har varit anslagna några minuter.`

`b_playoff`

- label: `Lotta och publicera B-slutspel`
- helper: `Lotta och publicera B-slutspel om klassen ska ha B-slutspel.`

`prize_ceremony`

- label: `Prisutdelning`
- helper: `Genomför prisutdelning när slutspelet är färdigt.`

### Button copy

- mark done: `Klar`
- skip: `Skippa`
- reopen: `Nollställ`
- log callout: `Markera upprop gjort`

### Status chip copy

- `blocked`: `Blockerad`
- `ready`: `Kan påbörjas`
- `active`: `Pågår`
- `done`: `Klar`
- `skipped`: `Skippad`

## API Design

V1 should extend the current admin API rather than create a separate service area.

### `GET /api/admin/classes/[classId]/workflow`

Returns the full class workflow for the checklist UI.

Suggested response shape:

```ts
{
  class: {
    id: string
    name: string
    startTime: string
    attendanceDeadline: string
  }
  attendance: {
    confirmed: number
    absent: number
    noResponse: number
    total: number
    state: 'awaiting_attendance' | 'callout_needed' | 'attendance_complete'
    lastCalloutAt: string | null
  }
  workflow: {
    currentPhaseKey: string
    currentPhaseLabel: string
    nextAction: {
      key: string
      label: string
    } | null
    canLogCallout: boolean
    steps: Array<{
      key:
        | 'seed_class'
        | 'publish_pools'
        | 'register_match_results'
        | 'publish_pool_results'
        | 'a_playoff'
        | 'b_playoff'
        | 'prize_ceremony'
      order: number
      label: string
      helper: string
      canSkip: boolean
      dependsOn: string[]
      requiresAttendanceComplete: boolean
      status: 'not_started' | 'active' | 'done' | 'skipped'
      derivedState: 'blocked' | 'ready' | 'active' | 'done' | 'skipped'
      note: string | null
      updatedAt: string | null
      canStart: boolean
      canMarkDone: boolean
      canSkip: boolean
      canReopen: boolean
    }>
  }
}
```

### `PATCH /api/admin/classes/[classId]/workflow/steps/[stepKey]`

Updates one manual step.

Suggested request body:

```ts
{
  status: 'not_started' | 'active' | 'done' | 'skipped'
  note?: string
}
```

Rules:

- must validate admin auth the same way as existing admin routes
- must verify the class belongs to the current competition
- must reject impossible transitions such as `done` on a blocked step
- should allow reopening by setting `not_started`
- reopening should reset the selected step and all downstream dependent steps to `not_started`
- should always return the recomputed workflow payload after mutation

### `POST /api/admin/classes/[classId]/workflow/events`

Creates a repeatable workflow event.

Suggested request body:

```ts
{
  eventKey: 'missing_players_callout'
  note?: string
}
```

Rules:

- allowed only when attendance state is `callout_needed`
- returns the recomputed workflow payload including `lastCalloutAt`

### `GET /api/admin/sessions`

Extend the existing dashboard response per class with:

```ts
workflow: {
  currentPhaseKey: string | null
  currentPhaseLabel: string
  nextActionKey: string | null
  nextActionLabel: string | null
  lastCalloutAt: string | null
}
```

This keeps the dashboard fast while avoiding a second query per class from the client.

### Future player-facing shape

Do not implement this in V1, but the workflow helper should be reusable from:

- [src/app/api/players/[playerId]/classes/route.ts](src/app/api/players/%5BplayerId%5D/classes/route.ts)
- [src/app/api/players/search/route.ts](src/app/api/players/search/route.ts)

Future public status should expose only:

- `publicPhaseKey`
- `publicPhaseLabel`
- optional `updatedAt`

It should not expose internal notes or operational controls.

## UI Design

### Dashboard

Extend the existing admin dashboard class cards with:

- one headline workflow badge
- one next-action label
- one subtle marker when a callout was already logged

Examples:

- `Inväntar närvaro`
- `Ropa upp saknade spelare`
- `Poolspel pågår`
- `A- och B-slutspel pågår`
- `Nästa: Publicera poolresultat`

The existing attendance counts remain the most prominent quantitative data.

### Class detail

Extend the class detail page with a checklist panel above the player table.

The checklist should show:

- `Kolla närvaro` as the first checklist step
- latest callout timestamp when present
- manual step list in dependency order
- status chips for each step
- action buttons based on allowed transitions

Recommended action rules:

- `ready` step: show `Klar`, and if optional, `Skippa`
- `active` step: show `Klar` and `Nollställ` when active is represented
- `done` step: show `Nollställ`
- `skipped` step: show `Nollställ`
- `blocked` step: show no primary action

## Implementation Plan

### Ticket 1: Schema and workflow engine

Scope:

- add migration for `class_workflow_steps`
- add migration for `class_workflow_events`
- backfill step rows for existing classes
- update import flow so newly created classes get default workflow rows
- add TypeScript workflow types and one shared derivation helper under `src/lib/`

Output:

- stable database schema
- deterministic workflow computation used by all later APIs and UI

### Ticket 2: Admin workflow API

Scope:

- add `GET /api/admin/classes/[classId]/workflow`
- add `PATCH /api/admin/classes/[classId]/workflow/steps/[stepKey]`
- add `POST /api/admin/classes/[classId]/workflow/events`
- extend `GET /api/admin/sessions` with workflow summary fields

Output:

- admin clients can fetch and mutate checklist state
- dashboard can show next action without additional client-side orchestration

### Ticket 3: Class detail checklist UI

Scope:

- extend [src/app/[slug]/admin/classes/[classId]/ClassAttendanceView.tsx](src/app/%5Bslug%5D/admin/classes/%5BclassId%5D/ClassAttendanceView.tsx)
- show attendance state, latest callout, and manual checklist
- add mutation actions with optimistic UI where safe
- preserve the current attendance override behavior

Output:

- secretariat can manage class progress from one screen

### Ticket 4: Dashboard summary UI

Scope:

- extend [src/app/[slug]/admin/dashboard/AdminDashboard.tsx](src/app/%5Bslug%5D/admin/dashboard/AdminDashboard.tsx)
- show workflow headline status and next action for each class
- keep overdue attendance warnings and counts as they are

Output:

- dashboard becomes a usable operational overview instead of attendance-only overview

### Ticket 5: Public-status ready refactor

Scope:

- extract reusable workflow summary mapping so player APIs can consume it later
- do not build player UI yet

Output:

- future player visibility becomes an API extension instead of a redesign

## Playwright Coverage Plan

Add a new admin E2E spec under:

- `tests/e2e/admin/checklist.spec.ts`

Add or extend seed helpers in:

- [tests/helpers/db.ts](tests/helpers/db.ts)

### Minimum coverage

1. Auth gate

- unauthenticated access to the new admin workflow endpoints returns `401`
- unauthenticated navigation to the class checklist UI redirects to admin login through the existing gate

2. Happy path

- class detail shows `Inväntar närvaro` before deadline when responses are missing
- class detail shows `Ropa upp saknade spelare` after deadline when responses are missing
- secretariat can log an upprop event and see the timestamp update
- when all attendance is complete, `Seeda klass` becomes ready
- secretariat can mark `Seeda klass` done
- `Lotta och publicera pooler` becomes ready, then active, then done
- once pooler are done and poolresultat not done, UI shows `Poolspel pågår`
- secretariat can mark `Publicera poolresultat` done
- secretariat can start both `Lotta och publicera A-slutspel` and `Lotta och publicera B-slutspel`
- when both are active, UI shows `A- och B-slutspel pågår`
- when both are done, `Prisutdelning` becomes ready
- secretariat can complete `Prisutdelning` and the class shows `Klassen är klar`

3. Optional-step behavior

- secretariat can skip `Seeda klass`
- secretariat can skip `Lotta och publicera A-slutspel`
- secretariat can skip `Lotta och publicera B-slutspel`
- if both playoffs are skipped, `Prisutdelning` still becomes ready after poolresultaten are done

4. Dependency enforcement

- `Lotta och publicera pooler` cannot be started before attendance is complete and seedning is done or skipped
- `Publicera poolresultat` cannot be completed before pooler are done
- `Prisutdelning` cannot be completed while either playoff is still active or not started

5. Dashboard summary

- dashboard class cards show headline workflow status
- dashboard class cards show next action label
- dashboard reflects concurrent A and B playoff state correctly

### Test data notes

- use the existing admin test slug isolation pattern from [tests/e2e/admin/attendance.spec.ts](tests/e2e/admin/attendance.spec.ts)
- keep selectors based on `data-testid`
- add test ids for workflow chips, action buttons, and current-phase labels

## Reliability Notes

This feature is operational support during live events, so the implementation should prefer simple behavior over smart behavior.

Recommended reliability rules:

- derive as much as possible from existing data instead of storing duplicate truth
- reject illegal transitions on the server, not only in the UI
- keep mutations idempotent where practical by allowing the same status to be written repeatedly
- avoid hidden auto-transitions beyond derived display states
- keep `active` optional so the workflow still works when staff jump straight to `done`
- use reset cascades instead of allowing partial reopen operations to leave impossible downstream states
- show the latest update time on the workflow panel so staff trust the current screen

## Import Interaction

Current competition import can remove empty classes. That is acceptable technically because workflow rows and events will cascade delete with the class.

Operationally, this becomes risky once a competition is live.

Recommended follow-up after V1:

- if an import would remove a class that already has workflow progress or callout events, show a destructive warning similar to the existing attendance-removal warning

## Recommendation

Build V1 in the ticket order above.

The key architectural decision is to keep:

- attendance as derived state
- checklist milestones as stored per-step state
- callouts as append-only events

That gives the secretariat a practical operational tool now and keeps the design compatible with future player-visible class statuses.