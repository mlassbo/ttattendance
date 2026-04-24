# Secretariat Playoff Progress V1

Implementation handoff for surfacing playoff (slutspel) progress — A-bracket and B-bracket — to the secretariat on the admin dashboard, in the same card slot that already hosts pool progress.

Builds on:

- [secretariat-pool-progress-v1.md](./secretariat-pool-progress-v1.md) — the existing per-class pool progress strip this work mirrors
- [pool-progress-integration-v1.md](./pool-progress-integration-v1.md) — the OnData snapshot ingestion pattern that the playoff data model now follows
- [class-dashboard-v1.md](./class-dashboard-v1.md) — the admin dashboard surface

Read those first.

---

## Background

During the pool phase the secretariat already has a live `PoolProgressStrip` inside each class card. Once pools complete and playoff starts, that strip disappears and the card only shows a workflow panel — there is no sense of how far into the playoff the class is, or how the A and B brackets are progressing relative to each other.

The integration pipeline now persists playoff snapshots from OnData stage 5/6 PDFs into `ondata_playoff_snapshots` and a companion `ondata_playoff_status` row per `(competition_id, parent_external_class_key, playoff_bracket)`. The raw data needed for a progress view is therefore already in the database — V1 is a pure read+render feature.

OnData models A and B brackets as two separate OnData classes with a `~B` naming convention (e.g. `Max 350` and `Max 350~B`). The integration runner in the sibling `ttattendanceintegrations` repo filters out "B playoff-only" classes before calling the class-import endpoint, so **only the parent class ("Max 350") exists as a row in the app's `classes` table**. B-bracket playoff data arrives attached to that same parent via `parent_external_class_key`.

---

## Scope

V1 includes:

- A new `PlayoffProgressStrip` inside each class card on the admin dashboard, shown when the class is in any playoff phase
- Separate A-bracket and B-bracket sub-strips stacked within the same card; B block hidden entirely when no B snapshot exists for the parent class
- Per-round progress bar with a Swedish round label derived from position-from-end (not match count)
- Inline staleness messaging matching the pool strip's 5-min / 15-min thresholds, using the most recent snapshot across A and B
- E2E coverage for the main states (no data, A only, A+B, hidden when complete, staleness)
- Manual dev seed updates so the local dashboard shows representative playoff cards

V1 does **not** include:

- A top-of-dashboard playoff banner or cross-class rollup
- Any bracket-tree visualisation (showing who plays who) — only round-level aggregate counts
- Match-level detail inside the active round (names, scores). That detail already exists elsewhere and would bloat the card.
- Predicted finish time, countdown-to-final, or per-round scheduled times — OnData snapshots do not carry scheduled timings for playoff rounds
- Delay chips. Unlike pool play, playoff rounds have no shared cadence we can model.
- Changes to the public class live view or player-facing surfaces
- Any schema changes. The tables introduced by `20260424150000_replace_ondata_playoff_snapshots_for_b_brackets.sql` are sufficient.

---

## Key design decisions

### Fold into the existing class card, not a new panel

Same reasoning as the pool progress strip. The class card is the single source of truth for a class's state. The playoff strip replaces the (now-absent) pool strip as the in-card status surface during playoff phases.

### One card per parent class; A and B stacked

OnData lists B brackets as separate classes with a `~B` suffix, but the integration filters those out before class import — the app only knows about the parent class. The new playoff snapshot rows carry `parent_external_class_key` and `playoff_bracket` ('A' or 'B'), so we can fetch "all brackets for a parent class" with one indexed query. The card always renders the A block (when any A snapshot exists) and conditionally renders the B block below it (only when a B snapshot exists for the same parent).

Most classes only have an A-bracket. The layout must degrade gracefully — no "B-slutspel 0/0" placeholder or empty frame.

### Label rounds by position from the end, not by match count

An earlier "derive round name from number of matches" scheme breaks as soon as there are byes. A 6-qualifier bracket has a quarterfinal of 2 matches + 2 byes, which a match-count scheme would mislabel as a "Semifinal".

The rule:

```
rounds[n-1] → Final
rounds[n-2] → Semifinal
rounds[n-3] → Kvartsfinal
rounds[n-4] → Åttondel
rounds[n-5] → Sextondel
rounds[n-6] → Trettiotvåondelsfinal
otherwise   → use the raw round.name from the snapshot
```

`n` is the number of rounds in the snapshot (`ondata_playoff_snapshot_rounds` ordered by `round_order`). Position-from-end is robust to byes in round 1 and to any bracket size.

### Keep the round rows quiet

The strip should stay compact. Round labels and match counters are enough to show progress; a separate `pågår` pill and `+ N frilott` suffix add noise without improving the secretariat's scan speed.

### No delay chip, no schedule anchoring

Unlike pool play, playoff rounds are sequential (round N+1 can only start once round N finishes) and OnData does not give us per-round scheduled times. There is no meaningful "rounds-behind-schedule" signal available. V1 deliberately omits delay UI for playoff to avoid fabricating a metric.

### Active round = first round where `completed < total`

Used only to decide which later rounds should render with reduced opacity. Completed rounds get a subtle checkmark. No round is explicitly marked as `pågår`, because the active step is already apparent from the unfinished row.

### Staleness is shared across A and B

One staleness notice per card, computed from `max(a.last_source_processed_at, b.last_source_processed_at)`. The same 5-min and 15-min thresholds and copy as the pool strip, relabelled for playoff context.

### Read-only, no server-side derivation

Same pattern as pool progress. The API returns raw counts per round, and the React component derives round labels, bye counts, and staleness on every render. Keeps the API cacheable and the client cheap.

---

## UX

### Dashboard layout

Unchanged. Two-column session grid, class cards identical in size, same workflow panel at the bottom.

### Class card — in playoff

The card renders `<PlayoffProgressStrip />` between the header and the workflow panel when any playoff step is active or any bracket has snapshot data. Width matches the pool strip exactly so the visual rhythm of the card stays consistent when a class transitions from pool to playoff.

```
┌──────────────────────────────────────────────────┐
│ [Slutspel pågår]                                 │
│ Max 350 · Start 09:40                            │
│                                                  │
│ A-slutspel                       6 / 15 matcher  │
│ ─────────────────────────────────────────────    │
│ Åttondel       ████████████  8/8   ✓             │
│ Kvartsfinal    ██████░░░░░░  2/4   pågår         │
│ Semifinal      ░░░░░░░░░░░░  0/2                 │
│ Final          ░░░░░░░░░░░░  0/1                 │
│                                                  │
│ B-slutspel                        3 / 7 matcher  │
│ ─────────────────────────────────────────────    │
│ Kvartsfinal    █████████░░░  3/4   pågår         │
│ Semifinal      ░░░░░░░░░░░░  0/2                 │
│ Final          ░░░░░░░░░░░░  0/1                 │
│                                                  │
│ Data från 10:38                                  │  (only if stale 5–15 min)
│ OnData-sync har inte gått sedan 10:20            │  (only if stale > 15 min)
│                                                  │
│ ┌─ Registrera slutspelsresultat ──────────────┐  │
│ │ [ Klar ]  [ Skippa ]                        │  │
│ └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

Variant — uneven first round with byes:

```
│ A-slutspel                       0 / 5 matcher   │
│ ─────────────────────────────────────────────    │
│ Kvartsfinal                 ░░░░░░░░  0/2        │
│ Semifinal                   ░░░░░░░░  0/2        │
│ Final                       ░░░░░░░░  0/1        │
```

Variant — A-only class (the common case):

```
│ A-slutspel                       2 / 7 matcher   │
│ ─────────────────────────────────────────────    │
│ Kvartsfinal  ██████░░░░░░  2/4                   │
│ Semifinal    ░░░░░░░░░░░░  0/2                   │
│ Final        ░░░░░░░░░░░░  0/1                   │
```
(no B-slutspel block at all)

### Class card — other phases

Cards in pool-play or earlier phases render the existing `PoolProgressStrip` (unchanged). Cards with no playoff snapshot yet but already in an `a_playoff_in_progress` phase render a compact `Inväntar slutspelsdata` placeholder inside the strip, matching the pool-progress empty state's style.

Cards in `playoffs_complete` do not render the strip. Once every playoff round is done, the dashboard should get out of the way and leave only the remaining workflow state.

### Visible phase keys

Render the strip for any of these `currentPhaseKey` values (from [class-workflow.ts](../src/lib/class-workflow.ts)):

- `a_playoff_in_progress`
- `b_playoff_in_progress`
- `playoffs_in_progress`

Do not render for `pool_play_*` or earlier — those belong to the pool strip.

### Auto-refresh

No changes. Existing 30-second dashboard polling already picks up new snapshots. Staleness timestamps recompute on each render, so the `Data från HH:MM` caption stays accurate between fetches.

---

## Round labelling & bye computation

```
Inputs per bracket (A or B):
  rounds[]          ordered by round_order (ascending)
    each round:
      roundName     raw name from OnData (fallback)
      matches[]     ordered by match_order

Label rule:
  totalRounds = rounds.length
  for i in 0..totalRounds-1:
    positionFromEnd = totalRounds - 1 - i
    label = SWEDISH_LABEL_BY_POSITION[positionFromEnd] ?? rounds[i].name

SWEDISH_LABEL_BY_POSITION = {
  0: 'Final',
  1: 'Semifinal',
  2: 'Kvartsfinal',
  3: 'Åttondel',
  4: 'Sextondel',
  5: 'Trettiotvåondelsfinal',
}

Match completion:
  a match counts as completed when `is_completed = true`
  (the `ondata_playoff_snapshot_matches.is_completed` flag is set by the ingest code
   when `winner_name IS NOT NULL OR result IS NOT NULL`)

Active round:
  first i where completed(rounds[i]) < rounds[i].matches.length
  no dedicated pill; only affects future-round dimming

Bracket summary:
  totalMatches     = sum over rounds of rounds[i].matches.length
  completedMatches = sum over rounds of completed(rounds[i])
  (should equal ondata_playoff_status.last_summary_matches / _completed_matches
   for the bracket — prefer those cached summary fields for the header counter)
```

---

## Implementation plan

Five stages. Each stage should leave the dashboard usable.

### Stage 1 — Data layer

**Files:** new `src/lib/playoff-progress.ts`, plus `src/app/api/admin/sessions/route.ts`.

- Add `getPlayoffProgressByClassId(supabase, competitionId, classesWithExternalKeys)` that:
  - For each class's external_class_key, loads up to two `ondata_playoff_status` rows where `parent_external_class_key = ?` (the class's external key)
  - For each status row whose `current_snapshot_id` is non-null, loads the snapshot's rounds and matches
  - Returns `Map<classId, PlayoffProgress>` where
    ```ts
    type PlayoffProgress = {
      a: BracketProgress | null
      b: BracketProgress | null
      lastSourceProcessedAt: string | null  // max across brackets
    }
    type BracketProgress = {
      bracket: 'A' | 'B'
      className: string                    // from snapshot (e.g. "Max 350~B")
      rounds: Array<{
        name: string                       // raw round_name
        totalMatches: number
        completedMatches: number
      }>
      totalMatches: number                 // from status.last_summary_matches
      completedMatches: number             // from status.last_summary_completed_matches
      lastSourceProcessedAt: string | null
    }
    ```
  - Classes not in any playoff phase still get their progress loaded — the renderer decides what to show. Loading data for classes not in playoff is cheap (no-op when no rows exist) and keeps the API shape simple.
- Extend the `/api/admin/sessions` response with `playoffProgress: PlayoffProgress | null` per class. The top-level `lastSyncAt` from the pool-progress loader stays as is; playoff has its own per-class `lastSourceProcessedAt` because ingestion cadence may differ.
- No delay computation, no label derivation, no bye math server-side. Pure data passthrough.

**Mapping playoff snapshots to local classes:** `parent_external_class_key` matches `classes.external_class_key` directly (no name matching). If `classes` does not yet store `external_class_key` for OnData-imported classes, use whichever existing mapping the pool progress loader uses. Confirm by reading [pool-progress integration](../src/lib/pool-progress.ts) and follow the same join.

### Stage 2 — Pure rendering utilities

**Files:** new `src/lib/playoff-progress-view.ts`.

Exports pure, side-effect-free functions (importable from both client and server):

- `labelRound(totalRounds: number, roundIndex: number, rawName: string): string`
- `computeByesIntoNextRound(rounds: BracketProgress['rounds'], roundIndex: number): number`
- `findActiveRoundIndex(rounds: BracketProgress['rounds']): number | null`
- `computeStaleness({ lastSourceProcessedAt, now }): { level: 'fresh' | 'soft' | 'hard', capturedAt: string | null }` — thresholds and copy semantics match [pool-delay.ts](../src/lib/pool-delay.ts); do not introduce a separate module for playoff staleness, call the existing helper if it is already generic or extract it to `src/lib/sync-staleness.ts` and have both strips consume it.

Unit tests (Vitest, if project uses it) aren't currently present in the pool-progress code — follow existing conventions. Playwright coverage is in Stage 4.

### Stage 3 — UI

**Files:** `src/app/[slug]/admin/dashboard/AdminDashboard.tsx`, new sibling `PlayoffProgressStrip.tsx` in the same folder, possibly a tiny shared `BracketProgressBlock.tsx`.

- Render `<PlayoffProgressStrip progress={playoffProgress} />` in place of (or alongside, depending on phase) the pool strip, gated on `currentPhaseKey` being one of `a_playoff_in_progress | b_playoff_in_progress | playoffs_in_progress | playoffs_complete`.
- A-bracket block renders when `progress.a` is present; B-bracket block renders below only when `progress.b` is present.
- Reuse Tailwind tokens from the pool strip: `app-card`, `app-pill-*`, `app-banner-warning`, and whatever progress-bar component the pool strip uses. Do not introduce new design primitives.
- Styling details:
  - Round label column left-aligned, fixed min-width so bars align across rounds
  - Completed rounds: full-opacity with subtle ✓ suffix
  - Active round: `pågår` pill, same style as the pool strip's delay chip but always neutral-coloured (no yellow/red)
  - Future rounds: reduced opacity
  - Bye suffix: small secondary text next to the label, e.g. `Kvartsfinal · +2 frilott`
- Empty / placeholder: when no snapshot yet, render `Inväntar slutspelsdata` with the same structural height so the card doesn't pop in/out mid-polling.
- `data-testid` hooks:
  - `playoff-progress-strip-<classId>`
  - `playoff-bracket-block-<classId>-<a|b>`
  - `playoff-round-<classId>-<a|b>-<roundIndex>`
  - `playoff-round-active-<classId>-<a|b>`
  - `playoff-sync-stale-<classId>`

Remember: `data-testid` is test-only. Do not read, query, or style based on it in app code.

### Stage 4 — E2E tests

**Files:** new `tests/e2e/admin/playoff-progress.spec.ts` under the admin project (slug prefix `test-admin-playoff-`). Seed helper additions in `tests/helpers/db.ts`.

New seed helpers:

- `seedOnDataPlayoffSnapshot({ competitionId, parentClassId, parentExternalClassKey, parentClassName, classDate, classTime, bracket, classExternalKey, className, rounds, sourceProcessedAt })` — writes rows into `ondata_playoff_snapshots`, `_rounds`, `_matches`, and upserts `ondata_playoff_status`. `rounds` is an array of `{ name, matches: Array<{ playerA, playerB, winner?, result? }> }`; `is_completed` is computed from `winner || result`.
- Accept a `sourceProcessedAt` / `receivedAt` to test staleness.

Test scenarios (each with `cleanTestCompetitions(supabase, 'test-admin-playoff-%')` in `beforeEach`):

1. **No playoff data yet, phase is `a_playoff_in_progress`** — strip renders with `Inväntar slutspelsdata` placeholder.
2. **A-only, partially complete** — A-slutspel block shows, B block absent, one round `pågår`, earlier round ✓.
3. **A and B both in progress** — both blocks visible stacked, independent active rounds, independent totals.
4. **A with byes in first round** — `+ 2 frilott` suffix on the bye-affected round; bars still render correctly.
5. **Active round highlighting** — `pågår` pill on the correct round; later rounds are muted; earlier rounds carry the ✓.
6. **Sync stale (soft)** — `last_source_processed_at` 8 min ago; `Data från HH:MM` caption appears once at the card bottom.
7. **Sync stale (hard)** — `last_source_processed_at` 20 min ago; stronger warning appears.
8. **All complete** — every round at `matches === total`; class-level `✓ Klart` chip; bars fully filled.
9. **Non-playoff phase** — class in `awaiting_attendance` or `pool_play_in_progress`; playoff strip must NOT render even if a stray playoff snapshot exists in the DB.

Use `npm run test:e2e:agent` for agent-driven runs.

### Stage 5 — Manual dev seed data

**Files:** `scripts/prepare-dev-competition.ts`, `scripts/fixtures/manual-competition.json`.

**Goal:** the local manual competition must show at least one class in each of these playoff states so the developer can visually verify the strip without manual SQL:

- Class **A-slutspel in progress**, B absent (most classes look like this)
- Class **A + B both in progress**
- Class **A-slutspel with byes** (uneven first round)
- Class **A-slutspel complete** (so the `✓ Klart` state is visible — this can double as the "all complete" playoff state while the workflow phase is still `playoffs_complete`)
- Optionally one class with a **stale sync** (`last_source_processed_at` backdated ~10 min) if it does not make the default fixture confusing — otherwise leave stale coverage to E2E only.

**Required changes:**

1. **Extend `ManualClassSeedState`** (in `scripts/prepare-dev-competition.ts`) with new states:
   - `a_playoff_in_progress`
   - `playoff_a_and_b_in_progress`
   - `a_playoff_with_byes`
   - `playoffs_complete`

   Keep backward-compatible: the JSON validator must accept these new values.

2. **Extend `ManualFixtureClass`** with two new optional fields:
   - `playoffBracketSize?: number` — the size of the A-bracket's first round (4 / 8 / 16). Defaults to the next power of two ≤ registered attendees.
   - `playoffBBracket?: boolean` — when true and the seed state is a playoff state, also synthesize a B-bracket.
   - `playoffStalenessMinutes?: number` — when set, backdate `source_processed_at` by this many minutes so the staleness banner shows.
   - `playoffProgress?: 'first_round_live' | 'quarterfinals_live' | 'semifinals_live' | 'finals_live' | 'complete'` — controls which round is the "active" round in the synthesized snapshot. Defaults to `quarterfinals_live`.

3. **Seed the playoff workflow steps.** In `seedPoolPlayWorkflow` (or a new sibling `seedPlayoffWorkflow`), for any playoff seed state:
   - Mark the pool-play steps as `done` / `skipped` appropriately so the class is past pool play
   - Upsert `class_workflow_steps` rows for `a_playoff` / `b_playoff` / `register_playoff_match_results` with statuses matching the seed state:
     - `a_playoff_in_progress` → `a_playoff` active, others not_started (or `b_playoff` skipped)
     - `playoff_a_and_b_in_progress` → both `a_playoff` and `b_playoff` active
     - `a_playoff_with_byes` → `a_playoff` active
     - `playoffs_complete` → all three done

4. **Synthesize playoff snapshot payloads** with a new helper `buildPlayoffPayload` in the seed script. For each seeded playoff class:
   - Use the class's registered player list (already available) as the pool of bracket entrants, taking the top `playoffBracketSize` as qualifiers for A. For a B-bracket, take the next 4–8 players as the B qualifiers (or whatever fits the "mirror" shape).
   - Build `rounds[]` from the bracket size down to the final: `[8, 4, 2, 1]` for size 8, `[4, 2, 1]` for size 4, `[2, 2, 1]` for a size-6 shape that models 2 quarters + 2 byes, etc.
   - Fill matches up through the "active round" per `playoffProgress`, leaving later rounds with empty winner/result.
   - Call `persistOnDataPlayoffSnapshot(supabase, competitionId, payload, hash)` for each bracket payload (A first, then B if enabled). Use the new contract in [src/lib/ondata-playoff-contract.ts](../src/lib/ondata-playoff-contract.ts); schema version is `ONDATA_PLAYOFF_SNAPSHOT_SCHEMA_VERSION`.
   - When `playoffStalenessMinutes` is set, pass a backdated `source.processedAt` in the payload.
   - `parent` fields: `parent_external_class_key` must match the seeded `class.external_class_key` — the class itself is the parent. For the B snapshot, `class.externalClassKey` should be `<parent>~B` to mirror OnData's convention.

5. **Clear out playoff snapshot tables before seeding**, symmetric to how `seedDrawData` does `delete from ondata_integration_snapshots/_status`. Clear `ondata_playoff_snapshots` (cascades to rounds/matches) and `ondata_playoff_status` for the competition.

6. **Update the seed summary log line** so developers see how many classes got playoff data:
   ```
   Slutspel: 3 klass(er), 2 med A+B, 1 med frilotter
   ```

7. **Update `manual-competition.json`** to wire at least three example classes into playoff seed states. Simplest approach: repurpose three of the existing "not_open" day-2 classes so the day 1 schedule stays familiar. Example edits:

   ```json
   {
     "key": "max300-day1-pass1",
     "seedState": "a_playoff_in_progress",
     "playoffBracketSize": 8,
     "playoffProgress": "quarterfinals_live"
     // was pool_play_complete; upgrades the existing completed-pool class into
     // a now-in-playoff class so the card transitions visibly
   },
   {
     "key": "max750-day2-pass1",
     "seedState": "playoff_a_and_b_in_progress",
     "playoffBracketSize": 8,
     "playoffBBracket": true,
     "playoffProgress": "quarterfinals_live"
   },
   {
     "key": "max950-day2-pass1",
     "seedState": "a_playoff_with_byes",
     "playoffBracketSize": 8,
     "playoffProgress": "first_round_live"
     // 8-slot bracket fed by 6 qualifiers → 2 matches + 2 byes in round 1
   },
   {
     "key": "max1250-day2-pass1",
     "seedState": "playoffs_complete",
     "playoffBracketSize": 4
   }
   ```

8. **Validator changes.** Update the fixture validation in `loadManualFixture` to:
   - Accept the new seed states in the allowlist
   - Accept `playoffBracketSize`, `playoffBBracket`, `playoffStalenessMinutes`, `playoffProgress`
   - Reject `publishPoolResults: true` combined with playoff seed states (pool results still make sense for completed-pool classes only)

After the seed runs, `http://localhost:3000/manual-2026/admin/dashboard` (PIN 2222) should visibly render playoff cards covering each of the four representative states. Document this briefly at the bottom of the updated `prepare-dev-competition.ts` docstring, if one exists.

---

## Data & schema impact

No migrations, no new tables. V1 reads exclusively from:

- `ondata_playoff_snapshots` (+ `_rounds`, `_matches`)
- `ondata_playoff_status.current_snapshot_id`, `.last_source_processed_at`, `.last_summary_matches`, `.last_summary_completed_matches`
- `classes.external_class_key` (or whatever key the existing pool-progress loader uses) for the join

All introduced by [20260424150000_replace_ondata_playoff_snapshots_for_b_brackets.sql](../supabase/migrations/20260424150000_replace_ondata_playoff_snapshots_for_b_brackets.sql).

---

## Open questions for v2

- **Match-level drill-down.** If the secretariat later wants to see who is playing right now, the active-round block could be expanded to list matches with live scores. Parked until there is demand.
- **Round scheduling.** If OnData starts emitting per-round start/end times, a delay chip mirroring the pool strip becomes possible. Until then, none.
- **Cross-class playoff rollup.** A top-of-dashboard summary of how many brackets are in progress / complete / stuck. Same wait-and-see approach as the pool banner.
- **Super-admin cross-competition view.** V1 is admin-only.
