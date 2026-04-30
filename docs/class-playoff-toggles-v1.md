# Class Playoff Toggles V1

This document specifies per-class toggles for whether a class has an A-playoff and/or a B-playoff, and how the secretariat workflow adapts to those settings.

## Purpose

Today every class workflow includes both `a_playoff` and `b_playoff` steps; they are skippable but always visible. In reality, classes are configured ahead of time to have neither, only A, or both — and the secretariat would benefit from a workflow that only shows the steps that actually apply. This is also the first step toward more per-class workflow configuration; the next pass will add seeding settings (out of scope here).

## Scope

V1 introduces two boolean settings per class:

- `has_a_playoff` (default `true`)
- `has_b_playoff` (default `true`)

Both default to `true` so existing classes keep their current workflow.

The settings are editable by the super admin only, on the existing `Inställningar → Klasser` page. They can be toggled at any time — no guard rails based on workflow progress. If a step is hidden after it has been started or completed, its DB row in `class_workflow_steps` is preserved but no longer surfaced; toggling back on restores its visible state.

The workflow adapts as follows:

- `has_a_playoff = false` → the `a_playoff` step is hidden from the workflow.
- `has_b_playoff = false` → the `b_playoff` step is hidden from the workflow.
- Both `false` → `register_playoff_match_results` is also hidden, so the workflow goes straight from `publish_pool_results` to `prize_ceremony`. The `publish_pool_results` helper text is adapted to drop the "...slutspelet lottas inom kort" wording (see Helper Text Adaptation below).

The Playoff progress strip on the admin dashboard hides entirely when neither playoff exists.

## Non-Goals

- Seeding settings (separate, follow-up plan)
- Allowing admin/secretariat to toggle these settings (super admin only in V1)
- Any guard rails around toggling after a playoff step has been started or completed
- Localized labels beyond what is needed for the toggle UI and the adapted helper text

---

## Data Model

New migration: `supabase/migrations/<next-timestamp>_add_class_playoff_settings.sql`

```sql
alter table classes
  add column has_a_playoff boolean not null default true,
  add column has_b_playoff boolean not null default true;
```

Both default to `true`, which preserves current behavior for existing classes (no backfill needed).

---

## Workflow Logic — `src/lib/class-workflow.ts`

Add a new config type used by callers to describe per-class workflow configuration:

```ts
export type ClassWorkflowConfig = {
  hasAPlayoff: boolean
  hasBPlayoff: boolean
}
```

Thread it into the public functions that compute visibility, derived state, and summaries:

- `buildClassWorkflowSummary` — accept `config: ClassWorkflowConfig` (required new param). Pass it down internally.
- `getClassWorkflowDerivedStepState` — accept `config: ClassWorkflowConfig` so callers that compute single-step state outside the summary stay correct (currently only the summary path uses it; no production callers exist outside the summary, but keep the signature consistent).

Update the visibility helper at [src/lib/class-workflow.ts:376](src/lib/class-workflow.ts#L376):

```ts
function isWorkflowStepVisible(
  definition: ClassWorkflowStepDefinition,
  counts: ClassWorkflowAttendanceCounts,
  config: ClassWorkflowConfig,
) {
  if (definition.key === 'remove_absent_players') {
    return counts.absent > 0
  }

  if (definition.key === 'a_playoff') {
    return config.hasAPlayoff
  }

  if (definition.key === 'b_playoff') {
    return config.hasBPlayoff
  }

  if (definition.key === 'register_playoff_match_results') {
    return config.hasAPlayoff || config.hasBPlayoff
  }

  return true
}
```

The dependency-resolution helper `hasResolvedDependencies` ([src/lib/class-workflow.ts:229-237](src/lib/class-workflow.ts#L229-L237)) already treats invisible steps as resolved, so `prize_ceremony` correctly unblocks when its predecessors are hidden. No change needed there.

Update `canSkipClassWorkflowStep` at [src/lib/class-workflow.ts:239-253](src/lib/class-workflow.ts#L239-L253) so the special case for `register_playoff_match_results` treats "not visible" as equivalent to "skipped":

```ts
function canSkipClassWorkflowStep(
  definition: ClassWorkflowStepDefinition,
  stepsByKey: Map<ClassWorkflowStepKey, ClassWorkflowStepRecord>,
  visibleStepKeys: ReadonlySet<ClassWorkflowStepKey>,
) {
  if (!definition.canSkip) {
    return false
  }

  if (definition.key !== 'register_playoff_match_results') {
    return true
  }

  const aResolved = !visibleStepKeys.has('a_playoff')
    || getStepStatus(stepsByKey, 'a_playoff') === 'skipped'
  const bResolved = !visibleStepKeys.has('b_playoff')
    || getStepStatus(stepsByKey, 'b_playoff') === 'skipped'
  return aResolved && bResolved
}
```

`getConflictingActiveWorkflowStepKey` ([src/lib/class-workflow.ts:420-438](src/lib/class-workflow.ts#L420-L438)) does not need to change — its existing "both A and B playoff can be active simultaneously" exception still works correctly when only one of the two exists.

### Helper Text Adaptation

The `publish_pool_results` step helper today reads:

> Skriv ut och sätt upp poolresultaten. Ropa ut att resultaten är uppsatta och att slutspelet lottas inom kort.

When neither playoff exists, the second sentence is wrong. Adapt the helper inside `buildClassWorkflowSummary` (not in the static definition) so the step summary reflects the configured class:

- If `config.hasAPlayoff || config.hasBPlayoff` → use the existing helper.
- Else → "Skriv ut och sätt upp poolresultaten. Ropa ut att resultaten är uppsatta och att prisutdelning sker inom kort."

Implementation: when assembling the step summary in `buildClassWorkflowSummary`, override `helper` for `publish_pool_results` based on `config`. This keeps the static `CLASS_WORKFLOW_STEP_DEFINITIONS` immutable.

### Surface helper text in `nextAction`

Today `getClassWorkflowActionHelper(key)` does a static lookup — that worked when helpers were per-step constants, but with config-dependent helpers we need to pass the resolved string. Change `ClassWorkflowNextAction`:

```ts
export type ClassWorkflowNextAction = {
  key: ClassWorkflowActionKey
  label: string
  helper: string  // new
}
```

Populate `helper` inside `buildClassWorkflowSummary` from the resolved step helper (or from `getClassWorkflowActionHelper` for the `missing_players_callout` event helper). Then update the consumer at [src/app/api/admin/sessions/route.ts:157-159](src/app/api/admin/sessions/route.ts#L157-L159) to read `workflow.nextAction.helper` directly instead of calling `getClassWorkflowActionHelper`.

`getClassWorkflowActionHelper` and `getClassWorkflowStepDefinition(stepKey).helper` continue to return the static helper (used in places that want the canonical definition). Do not remove them.

---

## Server Helpers — `src/lib/class-workflow-server.ts`

Extend the descriptor types and queries to carry the new flags through to `buildClassWorkflowSummary`:

- `AdminClassRow` — add `has_a_playoff: boolean` and `has_b_playoff: boolean`.
- `AdminClassDescriptor` and `ClassWorkflowClassInput` — add `hasAPlayoff: boolean` and `hasBPlayoff: boolean`.
- `toAdminClassDescriptor` — map the snake_case columns to camelCase.
- `getAuthorizedAdminClass` — select `has_a_playoff, has_b_playoff` in the query.
- `getClassWorkflowSummaryMap` — when calling `buildClassWorkflowSummary`, pass `{ hasAPlayoff: classRow.hasAPlayoff, hasBPlayoff: classRow.hasBPlayoff }` as `config`.

---

## API Routes

### `GET /api/super/competitions/[competitionId]/classes` — [src/app/api/super/competitions/[competitionId]/classes/route.ts](src/app/api/super/competitions/[competitionId]/classes/route.ts)

Include `has_a_playoff, has_b_playoff` in the `select(...)` and map them to `hasAPlayoff` / `hasBPlayoff` in the JSON response.

### `PATCH /api/super/competitions/[competitionId]/classes/[classId]` — [src/app/api/super/competitions/[competitionId]/classes/[classId]/route.ts](src/app/api/super/competitions/[competitionId]/classes/[classId]/route.ts)

Accept two new optional fields in the request body: `hasAPlayoff: boolean`, `hasBPlayoff: boolean`. Validate each is a boolean when present. Update the existing "at least one field required" check at line 22 to include the new keys. Persist as `has_a_playoff` and `has_b_playoff`. Include the two flags in the returned row's `select(...)` and JSON response.

No additional cross-field validation is required — toggling is always allowed regardless of workflow state.

### `GET /api/admin/sessions` — [src/app/api/admin/sessions/route.ts](src/app/api/admin/sessions/route.ts)

- Add `has_a_playoff, has_b_playoff` to the `select(...)` at [line 22](src/app/api/admin/sessions/route.ts#L22).
- Add `hasAPlayoff` / `hasBPlayoff` to `classSummaries` at [lines 36-43](src/app/api/admin/sessions/route.ts#L36-L43).
- Pass them into `getClassWorkflowSummaryMap` (already taken care of by the server-helper changes above, since `classRow` is spread into the input).
- Include them in each class entry of the response at [lines 142-176](src/app/api/admin/sessions/route.ts#L142-L176) so the dashboard can use them for conditional UI (e.g. hiding `PlayoffProgressStrip`).
- Replace the `getClassWorkflowActionHelper(workflow.nextAction.key)` call with `workflow.nextAction.helper`.

### `GET /api/admin/classes/[classId]/workflow`

Uses `getAdminClassWorkflowPayload` from `class-workflow-server.ts`, which is updated above. No further changes needed beyond ensuring the response includes `hasAPlayoff` / `hasBPlayoff` on the `class` field if `ClassAttendanceView` needs them for conditional UI.

---

## UI

### Super admin: `ClassSettingsView.tsx`

File: [src/app/super/competitions/[competitionId]/classes/ClassSettingsView.tsx](src/app/super/competitions/[competitionId]/classes/ClassSettingsView.tsx)

- Extend `ClassData` (line 8) with `hasAPlayoff: boolean` and `hasBPlayoff: boolean`.
- Add a new field group after the existing `Bord per pool` row inside each class card (around [line 991](src/app/super/competitions/[competitionId]/classes/ClassSettingsView.tsx#L991)) with the label `Slutspel`, containing two checkboxes:
  - `A-slutspel` — `data-testid="has-a-playoff-checkbox-${cls.id}"`
  - `B-slutspel` — `data-testid="has-b-playoff-checkbox-${cls.id}"`
- On change, immediately PATCH with `{ hasAPlayoff }` or `{ hasBPlayoff }` (matching the pattern used by the session select at [line 879-892](src/app/super/competitions/[competitionId]/classes/ClassSettingsView.tsx#L879-L892)).
- Show inline `StatusNote` for save errors, mirroring the other fields.

### Admin dashboard: `AdminDashboard.tsx`

File: [src/app/[slug]/admin/dashboard/AdminDashboard.tsx](src/app/[slug]/admin/dashboard/AdminDashboard.tsx)

- Add `hasAPlayoff` / `hasBPlayoff` to the class-shape type that mirrors the `/api/admin/sessions` response.
- Around [line 572-578](src/app/[slug]/admin/dashboard/AdminDashboard.tsx#L572-L578) where `PlayoffProgressStrip` is conditionally rendered, also gate on `cls.hasAPlayoff || cls.hasBPlayoff`.
- The quick-skip buttons at [lines 117-122](src/app/[slug]/admin/dashboard/AdminDashboard.tsx#L117-L122) need no logic change — `a_playoff` / `b_playoff` simply will not appear in the workflow when hidden, so their next-action / follow-up labels won't reference them.

### Class attendance view: `ClassAttendanceView.tsx`

File: [src/app/[slug]/admin/classes/[classId]/ClassAttendanceView.tsx](src/app/[slug]/admin/classes/[classId]/ClassAttendanceView.tsx)

The step list at [line 935](src/app/[slug]/admin/classes/[classId]/ClassAttendanceView.tsx#L935) renders `step.helper` directly from the server response, so it will pick up the adapted helper for `publish_pool_results` automatically. No structural change required.

---

## Public View

The public class live view ([src/app/[slug]/classes/[classId]/page.tsx](src/app/[slug]/classes/[classId]/page.tsx)) shows playoff brackets only when live data is present, so it does not need to consult the new flags. Out of scope.

---

## Test Helpers — `tests/helpers/db.ts`

Any seed helper that inserts into `classes` should accept optional `hasAPlayoff?: boolean` and `hasBPlayoff?: boolean` arguments, defaulting to `true`. Search the file for existing class inserts and add the columns where the test scenarios will need to vary them. Default behavior must remain identical so unrelated tests keep passing.

---

## E2E Tests

### Super admin

`tests/e2e/superadmin/class-settings.spec.ts` — extend the existing class settings spec with three cases:

1. **Toggles render and persist** — super admin unchecks `A-slutspel` on a class, reloads the page, and the box is still unchecked. Same for `B-slutspel`.
2. **Default for new classes is both on** — after seeding a class without the flags, both boxes are checked.

Slug prefix: `test-sm-*`.

### Admin

`tests/e2e/admin/class-playoff-toggles.spec.ts` (new file) — slug prefix `test-admin-*`. All cases assume attendance is complete and the workflow is past `publish_pool_results`.

1. **Both playoffs off** — seed a class with `has_a_playoff=false, has_b_playoff=false`. The class detail view's step list does **not** show `a_playoff`, `b_playoff`, or `register_playoff_match_results`; it shows `prize_ceremony` as the next ready step after `publish_pool_results` is done. The dashboard card does not render `PlayoffProgressStrip`.
2. **Only A playoff** — seed with `has_a_playoff=true, has_b_playoff=false`. The step list shows `a_playoff` and `register_playoff_match_results` but not `b_playoff`. `register_playoff_match_results` is skippable only when `a_playoff` is skipped.
3. **Only B playoff** — symmetric.
4. **Both on (default)** — sanity test that the existing flow is unchanged.
5. **Adapted helper** — when both playoffs are off, the `publish_pool_results` helper text in the step list contains "prisutdelning sker inom kort" and does **not** contain "slutspelet lottas inom kort".

---

## Implementation Order

| Step | What | Notes |
|---|---|---|
| 1 | DB migration adding `has_a_playoff` / `has_b_playoff` | Both default `true` |
| 2 | Update `class-workflow.ts`: `ClassWorkflowConfig`, visibility, skip rule, helper override, `nextAction.helper` field | Pure logic; cover with the existing workflow unit-test patterns if any exist |
| 3 | Update `class-workflow-server.ts` types + queries to thread flags through | Required by every server caller |
| 4 | Update `GET /api/super/.../classes` and `PATCH /api/super/.../classes/[classId]` | Read + write the two flags |
| 5 | Update `GET /api/admin/sessions` (select, response, helper field) | Switch dashboard to `workflow.nextAction.helper` |
| 6 | Update `GET /api/admin/classes/[classId]/workflow` response if needed | Mostly automatic via server helper |
| 7 | Add toggles to `ClassSettingsView` | New `Slutspel` group with two checkboxes |
| 8 | Hide `PlayoffProgressStrip` in `AdminDashboard` when neither playoff exists | Consume the new flags from response |
| 9 | Update test seed helpers in `tests/helpers/db.ts` | Default flags to `true` |
| 10 | Add super admin E2E tests for the toggles | `test-sm-*` |
| 11 | Add admin E2E tests for the workflow adaptation | `test-admin-*` |
| 12 | Run `npm run build` and `npm run test:e2e:agent`, fix any failures | Required before commit |

Steps 1–3 must be done in order. Steps 4–6 can be parallelized after step 3. Steps 7–8 can be parallelized after steps 4–5. Tests come last.
