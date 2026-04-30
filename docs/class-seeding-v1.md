# Class Seeding V1

This document specifies the first version of configurable class seeding support in TTAttendance.

## Purpose

The secretariat already has a workflow step for seeding, but the app currently treats it as a generic manual checklist item. That is not enough operational guidance.

The goal of this change is to:

- let the super admin configure whether a class should use seeding at all
- let the super admin configure the intended number of players per pool for the class
- make the secretariat workflow show a concrete seeding instruction when the class reaches the seeding step
- hide the seeding step entirely for classes that do not use seeding

This should help the secretariat answer two practical questions without having to remember the rule table:

- should this class be seeded?
- how many players should be seeded today?

## Product Decision

V1 uses two class-level settings:

- `has_seeding` — whether the class uses seeding
- `players_per_pool` — the intended number of players per pool

The seeding recommendation shown to the secretariat is derived from actual attendance, not from the full registered roster and not from a manually stored pool count.

Reason:

- the final draw shape may change when players do not show up
- the secretariat needs a day-of recommendation based on the players who actually reported attendance
- storing planned pool count directly would become stale too easily

The flow is therefore:

1. Super admin configures whether the class uses seeding.
2. Super admin configures intended players per pool.
3. When attendance is complete, TTAttendance estimates the number of pools from confirmed players.
4. TTAttendance derives how many players should be seeded from the estimated pool count.
5. The secretariat still performs the seeding manually in the competition system and marks the workflow step done.

## Scope

V1 includes:

- new per-class settings in the super admin UI:
  - `Seedning` on or off
  - `Antal spelare per pool`
- dynamic seeding helper text in the admin workflow
- hiding the seeding step entirely when the class has seeding turned off
- derived seeding calculation based on confirmed attendance

V1 does not include:

- automatic synchronization of seeding status from the competition system
- manual override of the calculated pool count in the secretariat UI
- warning UI comparing full-class planning vs day-of estimated pool count
- changing pool draw logic or external competition system integration

## Existing Context

Relevant current surfaces:

- [src/lib/class-workflow.ts](src/lib/class-workflow.ts)
- [src/lib/class-workflow-server.ts](src/lib/class-workflow-server.ts)
- [src/app/api/admin/sessions/route.ts](src/app/api/admin/sessions/route.ts)
- [src/app/api/admin/classes/[classId]/workflow/route.ts](src/app/api/admin/classes/%5BclassId%5D/workflow/route.ts)
- [src/app/[slug]/admin/dashboard/AdminDashboard.tsx](src/app/%5Bslug%5D/admin/dashboard/AdminDashboard.tsx)
- [src/app/[slug]/admin/classes/[classId]/ClassAttendanceView.tsx](src/app/%5Bslug%5D/admin/classes/%5BclassId%5D/ClassAttendanceView.tsx)
- [src/app/super/competitions/[competitionId]/classes/ClassSettingsView.tsx](src/app/super/competitions/%5BcompetitionId%5D/classes/ClassSettingsView.tsx)

Today:

- `seed_class` exists as a workflow step
- the step is always visible
- its helper text is generic: `Gör seedning i tävlingssystemet om klassen ska seedas.`
- class settings already support class-level toggles such as `has_a_playoff` and `has_b_playoff`

This change should follow the same product shape already used for playoff toggles: configure in super admin, act in admin workflow.

## UX

### Super admin

In the class settings UI, each class gets a new field group for seeding.

Fields:

- `Seedning` — checkbox
- `Antal spelare per pool` — positive integer input

Recommended behavior:

- `Seedning` defaults to on for existing and new classes
- when `Seedning` is off, the players-per-pool input is disabled or visually muted
- when `Seedning` is on, `Antal spelare per pool` must be a positive integer
- save behavior should follow the existing inline-save patterns already used by other class settings

Recommended Swedish copy:

- group label: `Seedning`
- checkbox label: `Använd seedning`
- numeric field label: `Antal spelare per pool`

### Secretariat workflow

When a class reaches the seeding step and seeding is enabled, the workflow helper text should be explicit.

Example:

> Gör seedning i tävlingssystemet. 2 spelare ska seedas (beräknat antal pooler: 3).

Important behavior:

- the calculation uses the current number of `confirmed` players in the class
- the helper text only needs to be shown once attendance is complete, which already matches the existing workflow dependency model
- if seeding is disabled for the class, the seeding step is not shown at all

### Missing configuration

If `Seedning` is on but `Antal spelare per pool` is missing or invalid, the workflow should still surface the step, but the helper text should clearly explain the configuration problem.

Recommended helper text:

> Seedning är aktiverad men antal spelare per pool saknas.

V1 should not block the rest of the workflow with a hard error. A clear operational warning is sufficient.

## Calculation Model

The secretariat-facing calculation is based on two derived values:

1. estimated pool count
2. seeded player count

### Estimated pool count

Use confirmed attendance count and configured players-per-pool.

Formula:

`estimatedPoolCount = ceil(confirmedPlayers / playersPerPool)`

Behavior:

- if `confirmedPlayers = 0`, estimated pool count is `0`
- if `playersPerPool` is missing or invalid, estimated pool count is unknown

### Seeded player count

The rule provided by the user can be expressed as an algorithm instead of hardcoded ranges.

Principle:

- seed as many players as the largest power of two that does not exceed the number of pools
- if the class has fewer than 2 pools, seed 0 players

Mathematically:

$$
seededPlayers =
\begin{cases}
0, & \text{if } poolCount < 2 \\
2^{\lfloor \log_2(poolCount) \rfloor}, & \text{if } poolCount \ge 2
\end{cases}
$$

Examples:

- `0-1` pools -> `0`
- `2-3` pools -> `2`
- `4-7` pools -> `4`
- `8-15` pools -> `8`
- `16-31` pools -> `16`
- `32-63` pools -> `32`

Recommended helper functions:

```ts
export function getEstimatedPoolCount(
  confirmedPlayers: number,
  playersPerPool: number | null,
): number | null {
  if (!Number.isInteger(confirmedPlayers) || confirmedPlayers < 0) {
    return null
  }

  if (!Number.isInteger(playersPerPool) || playersPerPool === null || playersPerPool < 1) {
    return null
  }

  if (confirmedPlayers === 0) {
    return 0
  }

  return Math.ceil(confirmedPlayers / playersPerPool)
}

export function getSeededPlayerCount(poolCount: number): number {
  if (!Number.isInteger(poolCount) || poolCount < 2) {
    return 0
  }

  return 2 ** Math.floor(Math.log2(poolCount))
}
```

Recommended composition:

```ts
const estimatedPoolCount = getEstimatedPoolCount(confirmedPlayers, playersPerPool)

const seededPlayers = estimatedPoolCount === null
  ? null
  : getSeededPlayerCount(estimatedPoolCount)
```

## Data Model

Add two new columns to `classes`:

```sql
alter table classes
  add column has_seeding boolean not null default true,
  add column players_per_pool int;

alter table classes
  add constraint classes_players_per_pool_positive
  check (players_per_pool is null or players_per_pool >= 1);
```

Notes:

- `has_seeding` defaults to `true` so existing classes keep the current behavior until explicitly changed
- `players_per_pool` is nullable to make the migration and rollout safe
- UI validation should require a positive integer when `has_seeding = true`

## Workflow Logic

Update [src/lib/class-workflow.ts](src/lib/class-workflow.ts) so the seeding step behaves like a configurable workflow step.

### Config

Extend `ClassWorkflowConfig`:

```ts
export type ClassWorkflowConfig = {
  hasAPlayoff: boolean
  hasBPlayoff: boolean
  hasSeeding: boolean
  playersPerPool: number | null
}
```

### Visibility

Update the workflow visibility helper so:

- `seed_class` is visible only when `config.hasSeeding` is true

This should follow the same approach already used for `a_playoff`, `b_playoff`, and `register_playoff_match_results`.

### Helper text

The `seed_class` helper should no longer be static.

When seeding is enabled and configuration is valid, derive helper text from:

- `counts.confirmed`
- `config.playersPerPool`
- `getEstimatedPoolCount(...)`
- `getSeededPlayerCount(...)`

Recommended helper variants:

- valid config, estimated pool count >= 2:
  - `Gör seedning i tävlingssystemet. 2 spelare ska seedas (beräknat antal pooler: 3).`
- valid config, estimated pool count < 2:
  - `Gör seedning i tävlingssystemet. Ingen seedning behövs just nu (beräknat antal pooler: 1).`
- invalid or missing config:
  - `Seedning är aktiverad men antal spelare per pool saknas.`

Implementation note:

Keep the static step definition immutable. Override the resolved helper inside `buildClassWorkflowSummary`, similar to how helper text is already adapted for `publish_pool_results` based on playoff configuration.

## Server Helpers

Update [src/lib/class-workflow-server.ts](src/lib/class-workflow-server.ts):

- `AdminClassRow` — add `has_seeding` and `players_per_pool`
- `AdminClassDescriptor` — add `hasSeeding` and `playersPerPool`
- `ClassWorkflowClassInput` — add the same fields
- `toAdminClassDescriptor(...)` — map snake_case to camelCase
- `getAuthorizedAdminClass(...)` — select the new fields
- `getClassWorkflowSummaryMap(...)` — pass `hasSeeding` and `playersPerPool` into `buildClassWorkflowSummary`

## API Changes

### `GET /api/super/competitions/[competitionId]/classes`

File:

- [src/app/api/super/competitions/[competitionId]/classes/route.ts](src/app/api/super/competitions/%5BcompetitionId%5D/classes/route.ts)

Include in the select:

- `has_seeding`
- `players_per_pool`

Map to response fields:

- `hasSeeding`
- `playersPerPool`

### `PATCH /api/super/competitions/[competitionId]/classes/[classId]`

File:

- [src/app/api/super/competitions/[competitionId]/classes/[classId]/route.ts](src/app/api/super/competitions/%5BcompetitionId%5D/classes/%5BclassId%5D/route.ts)

Accept new optional request fields:

```json
{
  "hasSeeding": true,
  "playersPerPool": 4
}
```

Validation:

- `hasSeeding`, when present, must be boolean
- `playersPerPool`, when present, must be `null` or a positive integer
- extend the existing "at least one recognized field" check to include the new keys

Persist as:

- `has_seeding`
- `players_per_pool`

Return the updated values in the response.

### `GET /api/admin/sessions`

File:

- [src/app/api/admin/sessions/route.ts](src/app/api/admin/sessions/route.ts)

Include the new class fields in the session/class select and in the mapped response so workflow rendering has what it needs.

### `GET /api/admin/classes/[classId]/workflow`

File:

- [src/app/api/admin/classes/[classId]/workflow/route.ts](src/app/api/admin/classes/%5BclassId%5D/workflow/route.ts)

No route-specific behavior change is needed beyond ensuring the server helper includes the new class config so the returned workflow step helper is correct.

## UI Changes

### Super admin: class settings

File:

- [src/app/super/competitions/[competitionId]/classes/ClassSettingsView.tsx](src/app/super/competitions/%5BcompetitionId%5D/classes/ClassSettingsView.tsx)

Extend `ClassData` with:

- `hasSeeding: boolean`
- `playersPerPool: number | null`

Add a new field group in the existing class card UI:

- checkbox for `Seedning`
- number input for `Antal spelare per pool`

Recommended UI behavior:

- save immediately on checkbox toggle, following the existing playoff toggle pattern
- save number input with the same inline-save pattern already used by `Max spelare` and `Bord per pool`
- disable or mute the numeric input when seeding is off

### Admin dashboard

File:

- [src/app/[slug]/admin/dashboard/AdminDashboard.tsx](src/app/%5Bslug%5D/admin/dashboard/AdminDashboard.tsx)

No new section is needed.

The dashboard already has a workflow panel showing:

- current action label
- current action helper
- quick complete / skip buttons

This change should only improve the seeding helper text and remove the seeding step from the workflow when seeding is disabled.

### Class detail checklist

File:

- [src/app/[slug]/admin/classes/[classId]/ClassAttendanceView.tsx](src/app/%5Bslug%5D/admin/classes/%5BclassId%5D/ClassAttendanceView.tsx)

No structural change is needed.

The checklist already renders `step.helper` from the workflow payload, so the improved seeding helper text will appear automatically if the workflow summary is updated correctly.

## Testing

This is a user-facing feature and must include Playwright coverage.

Test area:

- super admin settings
- admin secretariat workflow

### Super admin tests

Suggested file:

- `tests/e2e/superadmin/class-seeding-settings.spec.ts`

Cases:

1. auth gate for the class settings page
2. seeding toggle is shown for each class
3. players-per-pool input is shown for each class
4. turning seeding off persists and survives reload
5. setting players per pool persists and survives reload
6. invalid players-per-pool input shows inline error

### Admin workflow tests

Suggested file:

- `tests/e2e/admin/class-seeding-workflow.spec.ts`

Cases:

1. class with `hasSeeding = false` does not show the `seed_class` step
2. class with seeding enabled and valid `playersPerPool` shows the computed helper text
3. helper text uses confirmed attendance, not total registrations
4. helper text updates when attendance changes enough to change estimated pool count
5. class with seeding enabled but missing `playersPerPool` shows the configuration-warning helper text

### Seed helper updates

Add or extend a test helper in [tests/helpers/db.ts](tests/helpers/db.ts) so tests can create classes with:

- `has_seeding`
- `players_per_pool`
- a controlled number of registered players
- a controlled number of confirmed players

That will allow deterministic verification of the seeding helper text.

## Suggested Implementation Order

1. Add DB migration for `has_seeding` and `players_per_pool`.
2. Extend super admin classes API read/write support.
3. Extend `ClassSettingsView.tsx` to edit the new fields.
4. Add shared helper functions for estimated pool count and seeded player count.
5. Extend workflow config and helper-text resolution in `class-workflow.ts`.
6. Thread the new class config through `class-workflow-server.ts` and admin APIs.
7. Verify admin dashboard and class detail render the new helper text correctly.
8. Add Playwright tests for both super admin and admin flows.
9. Run `npm run test:e2e:agent` and fix failures.

## Future Follow-Up

Possible follow-up improvements, intentionally out of scope for V1:

- show a comparison between planned full-class pool count and day-of estimated pool count
- allow a day-of pool-count override by the secretariat
- expose the calculated seeding recommendation elsewhere in the admin UI before the step is active
- add super admin defaults for players-per-pool at competition level
