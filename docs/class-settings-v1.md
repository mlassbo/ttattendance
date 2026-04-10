# Class Settings V1

This document specifies the first version of per-class settings editing for TTAttendance.

## Purpose

Classes are currently write-once — created by import and immutable afterwards. There are real-world cases where settings need to be corrected after import:

- The attendance deadline for a specific class needs to be moved (e.g. a class starts later than planned)
- A class has been assigned to the wrong session and needs to be moved

This feature adds class settings as a tab in a unified competition settings area, alongside the existing OnData integration tab. The tabbed layout is an intentional extension point — a future "Allmänt" tab can hold editable PINs and other competition-level settings.

## Scope

V1 covers two editable fields per class:

- **Attendance deadline** (`classes.attendance_deadline`) — datetime, must be before the class start time
- **Session** (`classes.session_id`) — which session the class belongs to, chosen from the sessions that exist for the same competition

All other class fields (name, start time) remain read-only in V1.

## Non-Goals

- Editing class name or start time
- Creating or deleting classes manually
- Creating or deleting sessions
- Moving classes across competitions
- "Allmänt" tab with editable competition settings (future)

---

## URL Structure and Navigation

### Shared competition settings layout

A Next.js nested layout at `src/app/super/competitions/[competitionId]/layout.tsx` renders the competition header (name, slug, back link) and a tab bar. Child routes render their content below the tabs.

Tabs:

| Label | Route |
|---|---|
| Integration | `/super/competitions/[competitionId]/integration` |
| Klasser | `/super/competitions/[competitionId]/classes` |

Using route-based tabs means deep links work, the browser back button works correctly, and adding a third tab later is just a new child route. The existing `/integration` URL continues to work without any redirect.

### Competition list

Replace the current "OnData-integration" button on each competition card in `CompetitionsView.tsx` with a single "Inställningar" button pointing to the integration tab (the first and default tab):

```tsx
<Link
  href={`/super/competitions/${c.id}/integration`}
  data-testid={`settings-action-${c.slug}`}
  className="app-button-secondary min-h-10 h-fit px-4 py-2"
>
  Inställningar
</Link>
```

The existing `data-testid` value `integration-action-${c.slug}` must be updated to `settings-action-${c.slug}` and existing E2E tests that reference it must be updated accordingly.

---

## Data Model

No schema changes are required. The relevant columns already exist:

```sql
-- classes table (existing)
id                  uuid        primary key
session_id          uuid        not null references sessions(id)
name                text        not null
start_time          timestamptz not null
attendance_deadline timestamptz not null

-- sessions table (existing)
id              uuid        primary key
competition_id  uuid        not null references competitions(id)
name            text        not null
date            date        not null
session_order   int         not null
```

---

## API Routes

### `GET /api/super/competitions/[competitionId]/classes`

Returns all sessions for the competition, each containing their classes.

Response shape:

```json
[
  {
    "id": "uuid",
    "name": "Pass 1",
    "date": "2025-03-15",
    "sessionOrder": 1,
    "classes": [
      {
        "id": "uuid",
        "name": "Herrar A",
        "startTime": "2025-03-15T09:00:00Z",
        "attendanceDeadline": "2025-03-15T08:15:00Z"
      }
    ]
  }
]
```

### `PATCH /api/super/competitions/[competitionId]/classes/[classId]`

Updates one or both editable fields on a class.

Request body (all fields optional, at least one required):

```json
{
  "attendanceDeadline": "2025-03-15T08:30:00Z",
  "sessionId": "uuid"
}
```

Validation:
- `attendanceDeadline` must be a valid ISO 8601 timestamp
- `attendanceDeadline` must be strictly before the class's `start_time`
- `sessionId` must belong to the same competition as the class

Returns the updated class row on success. Returns `400` with `{ "error": "..." }` on validation failure.

Both routes are protected by the existing `role=superadmin` middleware.

---

## UI

### Shared layout: `CompetitionSettingsLayout`

File: `src/app/super/competitions/[competitionId]/layout.tsx`

Renders:
- Back link to `/super/competitions`
- Competition name and slug as a page heading
- Tab bar with "Integration" and "Klasser" as links using `usePathname` to highlight the active tab

The layout fetches the competition name from a lightweight API endpoint or derives it from the integration endpoint that already exists.

> **Note:** The existing `CompetitionIntegrationView` currently renders its own header section (back link + heading). Once the shared layout exists, remove the duplicate header from `CompetitionIntegrationView` to avoid double headings.

### Tab: `ClassSettingsView`

File: `src/app/super/competitions/[competitionId]/classes/page.tsx` + `ClassSettingsView.tsx`

Layout: one section per session, ordered by date and session order. Each section has the session name and date as a heading, followed by a table of its classes.

**Class table columns:**

| Klass | Starttid | Anmälningsstopp | Pass |
|---|---|---|---|
| Herrar A | Lör 09:00 | Lör 08:15 | (editable select) |

Both "Anmälningsstopp" and "Pass" are editable.

**Inline editing — attendance deadline:**

- Display the current value as a formatted datetime string
- Clicking it replaces it with a `datetime-local` input pre-filled with the current value
- Save / Avbryt buttons appear next to the input
- On save: call `PATCH`, update the displayed value, hide the input
- On error: show the error message inline next to the field, keep the input open
- Client-side validation before submit: reject if the entered time is not strictly before the class start time

**Inline editing — session:**

- Show the current session name as a `<select>` (always rendered as a select, not a click-to-edit pattern — the options are a small bounded list)
- When the value changes, immediately call `PATCH` with the new `sessionId`
- Show a brief inline error if the call fails
- On success, the class row moves to the new session section without a full page reload

**Loading and error states:**

- Show a loading indicator while the initial data fetch is in progress
- Show a clear error banner if the fetch fails
- Never silently hide failures

**Empty state:**

- If the competition has no sessions or classes yet, show: "Inga klasser importerade än."

---

## Import Planner Interaction

The TT Coordinator import planner (`src/lib/roster-import/planner.ts`) currently recalculates `attendance_deadline` for every class on re-import. This would silently overwrite any manually set deadline.

**Required change:** When a class already exists in the database (matched by identity key), the planner must preserve the existing `attendance_deadline` rather than recalculating it. The same applies to `session_id` — if the class already has a session assignment, re-import must not reassign it.

The `apply` step for existing classes should only update fields that come directly from the import source (player registrations, class name), not fields that the super admin may have edited.

---

## E2E Tests

### Updates to existing tests

The `data-testid` attribute on the competition list link changes from `integration-action-${slug}` to `settings-action-${slug}`. Find and update all existing E2E tests that reference `integration-action-`.

### New test file

`tests/e2e/superadmin/class-settings.spec.ts`

Slug prefix: `test-sm-*` (existing superadmin project, existing `beforeEach` cleanup pattern)

### Test cases

1. **Auth gate** — visiting `/super/competitions/[id]/classes` without the superadmin cookie redirects or returns 401

2. **Tab navigation** — the competition settings page shows "Integration" and "Klasser" tabs; clicking "Klasser" navigates to the classes route and highlights the correct tab

3. **Page renders** — after seeding a competition with sessions and classes, the class settings tab shows all sessions and classes with their current deadlines and session assignments

4. **Edit attendance deadline — happy path** — super admin changes the deadline on a class to a valid earlier time; on page reload the new value is shown

5. **Edit attendance deadline — validation** — entering a deadline after the class start time shows an error and does not save

6. **Move class to different session — happy path** — super admin changes the session for a class; the class appears under the new session after the change

7. **Re-import preserves manual edits** — after manually editing a deadline, running a re-import does not reset it to the calculated value

### Seed helpers

Add to `tests/helpers/db.ts`:

```typescript
// seedClassSettingsCompetition(supabase, slug, playerPin, adminPin)
// Creates a competition with two sessions and a handful of classes across them.
// Returns { competitionId, sessions: [{id, name, classes: [{id, name, startTime, attendanceDeadline}]}] }
```

---

## Implementation Order

| Step | What | Notes |
|---|---|---|
| 1 | `GET /api/super/competitions/[competitionId]/classes` | Sessions + classes read endpoint |
| 2 | `PATCH /api/super/competitions/[competitionId]/classes/[classId]` | Validate + update deadline and/or session |
| 3 | Fix import planner to preserve manual edits on re-import | Prerequisite for test 7 |
| 4 | Shared `layout.tsx` with tab bar for competition settings | Header + tabs shared by both child routes |
| 5 | Remove duplicate header from `CompetitionIntegrationView` | Avoid double heading after layout is added |
| 6 | `ClassSettingsView` page | Inline editing for deadline and session |
| 7 | Update competition list: replace two buttons with one "Inställningar" button | Update `data-testid` and fix affected existing tests |
| 8 | Seed helper + E2E tests | All seven test cases |

Steps 1, 2, and 3 can be built in parallel. Step 4 must come before steps 5 and 6. Step 7 must update existing test `data-testid` references before new tests are written. Step 8 depends on all prior steps.
