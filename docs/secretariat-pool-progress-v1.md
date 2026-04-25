# Secretariat Pool Progress V1

This document is the implementation handoff for surfacing pool match progress and schedule delays to the secretariat on the admin dashboard.

It builds on:

- [pool-progress-integration-v1.md](./pool-progress-integration-v1.md) — the OnData snapshot integration that feeds `completed_match_count` per pool
- [pool-match-results-public-v1.md](./pool-match-results-public-v1.md) — the public-facing pool/match live view
- [class-dashboard-v1.md](./class-dashboard-v1.md) — the existing secretariat dashboard surface

Read those first for the surrounding architecture.

---

## Background

During a live competition the secretariat needs a fast answer to two questions:

1. How is the competition progressing overall?
2. Which pools are falling behind schedule so we can intervene?

Today the admin dashboard (`/[slug]/admin/dashboard`) shows attendance counts and workflow steps per class but nothing about how pool play is actually going. OnData snapshots already carry `completed_match_count` per pool and a per-pool player roster, so the raw data is available — we just don't surface it to secretariat staff.

The public class live view shows `{played}/{total} matcher spelade` per pool, but that is a per-class deep-link, not a dashboard overview.

---

## Scope

V1 includes:

- A new progress strip inside each class card on the admin dashboard, shown when the class is in pool play
- A compact per-pool row (dots + delay chip) inside the same card
- Class-level and pool-level delay calculation based on 20 min per match and a class-level `planned_tables_per_pool` setting
- Inline sync-staleness messaging on pool-play cards when delay numbers may no longer be trustworthy
- E2E coverage for the four states: no data, on schedule, delayed, and sync-stale

V1 does not include:

- A separate "pool progress" page or panel competing with the existing class cards
- Any top-of-dashboard pool-progress banner or warning summary
- Per-match timestamps (OnData only carries snapshot-level timestamps)
- Predicted finish time for a class
- Configurable per-class match duration — 20 min per match is a system-wide constant
- Per-pool table allocation inside a class — one class-level `planned_tables_per_pool` setting is used in v1
- Any change to the public class live view
- Push notifications or alerting — the dashboard's existing 30 s auto-refresh is sufficient

---

## Key design decisions

### Fold progress into the existing class card, not a new panel or top banner

An earlier sketch proposed a dedicated "Poolspel – status" block at the top of the dashboard. That would have shadowed the per-class cards and split a class's state across two surfaces. Each class lives in exactly one place on the dashboard. When a class is in `pool_play_in_progress`, the card grows a progress strip above the workflow panel. Everything else about the card stays as-is.

V1 intentionally skips a cross-class banner. The first version should answer a simpler question: are the inline class-card states enough for secretariat staff to spot delayed pools during normal use? If not, a banner can be added in v2 with real usage feedback.

### Delay is measured from expected match throughput

TTAttendance now treats pool delay as a match-throughput problem. Each class has a `planned_tables_per_pool` setting that defaults to `1` and can be raised when larger pools are expected to use two tables.

- `total_matches = pool_size × (pool_size - 1) / 2`
- `expected_matches = floor(elapsed / 20 min) × planned_tables_per_pool`, capped at pool total
- `delay_matches = max(0, expected_matches - completed_match_count)`
- `delay_min = max(progress_delay, elapsed - expected_finish)` where `progress_delay = ceil(delay_matches / planned_tables_per_pool) × 20 min`

This keeps a 4-player pool on one table at roughly 120 min total while still allowing larger pools on two tables to advance faster when that has been planned for the class. It also means a pool with one match left can keep getting later after its expected finish time instead of flattening at `+20 min` forever.

### Planned tables per pool is a class setting

The default is one table per pool, which matches normal pool play. When a class is expected to split each pool across two tables, secretariat can raise the class setting instead of relying on a different global formula.

### Clamp `expected` at `last_sync_at`, surface staleness separately

Delay is `expected − actual`. `actual` is only as fresh as the last OnData snapshot. If `last_sync_at` is 15 min old and we compute `expected` against wall-clock now, we manufacture a fake 15 min delay on every pool.

Fix: `elapsed = min(now, last_sync_at) − start_time`. When sync stops flowing, delay numbers *freeze* rather than drift upward.

This alone is not enough — frozen numbers look fine and can hide a real problem. Staleness is therefore surfaced inside each affected card:

- < 5 min since last sync: nothing shown
- 5–15 min: small `Data från HH:MM` caption under the progress strip on each pool-play card
- `>` 15 min: stronger inline warning on each pool-play card: `OnData-sync har inte gått sedan HH:MM — poolstatus kan vara inaktuell.`

### Grace period after class start

Applying the delay formula strictly from `start_time` penalises the normal 5–10 min it takes to call players to tables. V1 suppresses the delay chip entirely while `elapsed < 20 min` (i.e. before the first round should have completed). Until then the card shows `Startar`.

### Anchor on `classes.start_time`

Using the scheduled start is simpler and predictable. Anchoring on "first snapshot with ≥ 1 completed match" was considered but rejected — it masks late starts, which are exactly what we want to flag.

### Class-level delay is the max of its pools' delays

One stuck pool holds up the class. Averaging would dilute the signal.

### Delay chip is not shown when the class is finished or has no data

- If `actual == total` for all pools: `✓ Klart`
- If `last_sync_at` is null for the competition: `Inväntar data` on every pool-play card; no delay chips anywhere

---

## UX

### Dashboard layout

The existing two-column session grid (`lg:grid-cols-2`) is unchanged. The current top-of-dashboard "Deadline passerad" banner remains as-is, but V1 adds no new pool-progress banner above the grid.

### Class card — in pool play

The card gains a progress strip between the header and the workflow panel:

```
┌──────────────────────────────────────────────┐
│ [Poolspel pågår]              Visa detaljer │
│ Herrar B · Start 10:00                       │
│                                              │
│ 16/24 matcher            🔴 +22 min          │
│ ████████░░░░░░                               │
│ P1 ✓  P2 ✓  P3 🟡+5  P4 🔴+22  P5 🟡+10 P6✓ │
│ Data från 10:38                              │   (only if stale 5–15 min)
│ OnData-sync kan vara inaktuell               │   (only if stale > 15 min)
│                                              │
│ ┌─ Registrera matchresultat ──────────────┐  │
│ │ [ Klar ]  [ Skippa ]                    │  │
│ └─────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

Elements:

- **Progress bar** — completed matches summed across pools in the class, over total expected matches
- **Class delay chip** — `✓ Klart`, `På schema`, `+N min` (yellow 5–15, red > 15)
- **Per-pool row** — one `P<n>` token per pool, each with its own state:
  - `✓` when the pool is complete
  - `+N` with yellow/red tone when delayed
  - No suffix when on schedule
- **Staleness caption** — shown only while last sync is 5–15 min old
- **Staleness warning** — shown inline on the card when last sync is older than 15 min

### Class card — other phases

Cards in `awaiting_attendance`, `callout_needed`, `playoffs_in_progress`, etc. are unchanged. The progress strip is only rendered when `currentPhaseKey === 'pool_play_in_progress'` or `'pool_play_complete'` (the latter so the "Klart" state is visible briefly before the next phase kicks in).

### Empty and loading states

- No OnData snapshot yet for the competition: progress strip shows `Inväntar data`, no delay chip, no per-pool row
- Snapshot exists but no pools for this class: progress strip is hidden (class may not have pool play)
- Pool play marked complete in workflow: `✓ Klart` chip, full progress bar

### Auto-refresh

No changes. The existing 30 s interval on the dashboard already picks up new snapshots. Delay numbers recompute on every render from `last_sync_at` and class `start_time`, so they update during the countdown between fetches without extra work.

---

## Delay algorithm

```
Constants:
  ROUND_DURATION_MIN = 20
  GRACE_MIN          = 20     // suppresses chip until first round is due
  YELLOW_THRESHOLD   = 5      // min; 5–15 = yellow, > 15 = red
  RED_THRESHOLD      = 15
  SYNC_SOFT_MIN      = 5      // show per-card "Data från HH:MM"
  SYNC_HARD_MIN      = 15     // show stronger per-card warning

Inputs per class:
  start_time                  (from classes.start_time)
  pools[] with:
    pool_size                 (count of players in snapshot)
    completed_match_count     (from snapshot pool row)
  last_sync_at                (from ondata_integration_status.last_received_at)
  now                         (wall-clock at render time)

Per-pool computation:
  total_matches     = pool_size * (pool_size - 1) / 2
  planned_tables    = max(1, class.planned_tables_per_pool)

  if last_sync_at is null:
    state = "awaiting_data"
    return

  clamp_time        = min(now, last_sync_at)
  elapsed_min       = (clamp_time - start_time) / 60_000

  if elapsed_min < GRACE_MIN:
    state = "starting"
    return

  if completed_match_count >= total_matches:
    state = "done"
    return

  expected_matches  = min(total_matches, floor(elapsed_min / MATCH_DURATION_MIN) * planned_tables)
  delay_matches     = max(0, expected_matches - completed_match_count)
  progress_delay    = ceil(delay_matches / planned_tables) * MATCH_DURATION_MIN
  expected_finish   = ceil(total_matches / planned_tables) * MATCH_DURATION_MIN
  overrun_delay     = max(0, elapsed_min - expected_finish)
  delay_min         = max(progress_delay, overrun_delay)

  if delay_min == 0:   state = "on_schedule"
  elif delay_min < RED_THRESHOLD: state = "yellow"
  else:                state = "red"

Per-class aggregation:
  class.total_matches    = sum of pool total_matches
  class.completed        = sum of pool completed_match_count
  class.delay_min        = max of pool delay_min
  class.state            = worst of pool state (done < on_schedule < starting < awaiting_data < yellow < red)
  (ordering is for display priority; "red" wins)

Sync staleness:
  age_min = (now - last_sync_at) / 60_000
  if age_min < SYNC_SOFT_MIN:   no indicator
  elif age_min < SYNC_HARD_MIN: per-card caption
  else:                         stronger per-card warning
```

Notes:

- Delay is reported in whole multiples of 20 min by construction. Good enough for secretariat triage; no need to interpolate
- The class-level `planned_tables_per_pool` setting defaults to `1`, so existing competitions keep the conservative single-table model until a higher value is explicitly configured
- Nothing in the algorithm depends on per-match timestamps, which OnData does not provide

---

## Implementation plan

Work proceeds in five stages. Each stage should leave the dashboard usable.

### Stage 1 — Data layer

**Files:** new `src/lib/pool-progress.ts`, plus `src/app/api/admin/sessions/route.ts`.

- Add `getPoolProgressByClassId(supabase, competitionId)` that:
  - Reads `ondata_integration_status` to get `current_snapshot_id` and `last_received_at` for the competition
  - Joins `ondata_integration_snapshot_classes` → `snapshot_pools` → `snapshot_players` for that snapshot
  - Matches snapshot classes to local classes by `class_name` (the same matching used by `getClassLiveData`; see [public-competition.ts:525-538](../src/lib/public-competition.ts#L525-L538))
  - Returns `Map<classId, { pools: Array<{ poolNumber, playerCount, completedMatchCount }>, totalMatches, completedMatches }>`
- Extend the `/api/admin/sessions` response with:
  - `lastSyncAt: string | null` at the top level
  - Per class: `poolProgress: { pools, totalMatches, completedMatches } | null` (null when the class has no snapshot pools)
- Delay is **not** computed server-side. Keep the API response cacheable and let the client recompute on every render so the chip updates between fetches.

### Stage 2 — Delay computation utility

**Files:** new `src/lib/pool-delay.ts` and (if testable in isolation) a companion pure function.

- Pure function `computePoolDelay({ startTime, pool, lastSyncAt, now })` returning `{ state, delayMin, totalMatches, matchesPerRound }`
- Pure function `computeClassPoolProgress({ startTime, pools, lastSyncAt, now })` returning the aggregate per-class view (progress bar numbers, class-level delay, per-pool states)
- Pure function `computeSyncStaleness({ lastSyncAt, now })` returning `'fresh' | 'soft' | 'hard'` plus the formatted timestamp
- No React here. These functions must be safe to import from server utilities too in case we later want to persist derived delay.

### Stage 3 — UI

**Files:** `src/app/[slug]/admin/dashboard/AdminDashboard.tsx`, plus a small `PoolProgressStrip` component in the same folder.

- Inside each class card, render `<PoolProgressStrip />` between the header and the workflow panel when `currentPhaseKey === 'pool_play_in_progress' || 'pool_play_complete'`
- For stale data, show a low-emphasis `Data från HH:MM` caption at 5–15 min and a stronger inline warning at > 15 min
- All new strings in Swedish. Styling reuses existing Tailwind tokens (`app-card`, `app-pill-*`, `app-banner-warning`) — no new design primitives
- `data-testid` hooks: `pool-progress-strip-<classId>`, `pool-delay-chip-<classId>`, `pool-dot-<classId>-<poolNumber>`, `pool-sync-stale-<classId>`

### Stage 4 — E2E tests

**Files:** `tests/e2e/admin/pool-progress.spec.ts` under the admin project (slug prefix `test-admin-pool-`).

Seed helper additions in `tests/helpers/db.ts`:

- `seedOnDataSnapshotForClass({ classId, pools: [{ playerCount, completedMatchCount }], receivedAt })` — writes rows to `ondata_integration_snapshots`, `_classes`, `_pools`, `_players`, and bumps `ondata_integration_status` for the competition

Test scenarios:

1. **No snapshot yet** — pool-play class, no OnData data. Card renders without a progress strip or shows `Inväntar data`. No additional warning state.
2. **On schedule** — class started 25 min ago, 4-player pools, each pool has 2 matches done (round 1 + half of round 2 worth). No delay chip; per-pool dots all neutral.
3. **One pool delayed** — class started 60 min ago. Three pools at 6/6, one pool at 1/6. Red chip on the class, red dot on the delayed pool, green dots on others. No top banner.
4. **Sync stale (soft)** — last sync 8 min ago. Per-card `Data från HH:MM` caption present.
5. **Sync stale (hard)** — last sync 20 min ago. Strong inline warning present on the card with the exact time. Per-pool delay calculation freezes at the sync-time value.
6. **Class finished** — every pool at full match count. `✓ Klart` chip; no delay row.
7. **Non-pool-play class** — class in `awaiting_attendance`. Card renders as before with no progress strip.

Use `npm run test:e2e:agent` for agent-driven runs.

### Stage 5 — Manual dev seed data

**Files:** `scripts/prepare-dev-competition.ts`, `scripts/fixtures/manual-competition.json`.

- Extend the manual test competition seed so the secretariat dashboard shows a few distinct pool-progress card states without extra setup.
- At minimum, seed pool-play classes that render:
  - one class on schedule
  - one class clearly delayed
  - one class finished (`✓ Klart`)
  - one class with no pool snapshot yet or no pool-play strip
- Prefer doing this in `scripts/prepare-dev-competition.ts`, since that script already synthesizes OnData snapshot payloads for the manual fixture via `buildDrawPayload()`.
- The fixture should stay useful for normal manual testing too, so do not convert every draw-enabled class into an extreme delay case. A small set of representative cards is enough.
- If a stale-sync state is practical to seed without making the default fixture confusing, include one example by backdating `received_at`; otherwise keep stale-sync coverage in E2E only.

This gives developers a stable local dashboard they can use to visually verify the pool-progress strip, color states, and wording before or alongside Playwright coverage.

---

## Data & schema impact

No new tables, no migrations. V1 reads exclusively from tables introduced in [20260406110000_add_ondata_integration.sql](../supabase/migrations/20260406110000_add_ondata_integration.sql):

- `ondata_integration_status.last_received_at`, `current_snapshot_id`
- `ondata_integration_snapshot_classes` (class matching by `class_name`)
- `ondata_integration_snapshot_pools.completed_match_count`
- `ondata_integration_snapshot_players` (for `pool_size`)

If later we find we need to persist derived delay (e.g. to show historical pace on a post-event report), that would be a v2 concern.

---

## Open questions for v2

- **Shared-court configurations.** If real competitions appear where two pools share a court, the round-duration constant needs to become per-class. Simplest extension: `classes.minutes_per_round` override with `20` as the default.
- **"Recovering" signal.** A pool that was red but is catching up (completed_match_count jumped) is indistinguishable from one that is still stuck at the same delay. Could be addressed by comparing against the previous snapshot, but probably not worth it.
- **Predicted finish time.** Given current pace, when will pool play end for a class? Useful for scheduling playoffs but adds new failure modes. Out of scope for v1.
- **Surfacing pool progress to the super admin cross-competition view.** V1 is admin-only.
