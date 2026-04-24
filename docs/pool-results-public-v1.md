# Pool Results — Public View V1

This document is the implementation handoff for showing **final pool standings** to public users on the class live view. It extends [pool-match-results-public-v1.md](./pool-match-results-public-v1.md) — read that first for the surrounding architecture of the pool card, match grid, and data flow.

---

## Background

OnData pushes two independent snapshot streams per class:

1. **Integration snapshot** (stage 1–3): pool draw + live match results. Already rendered via `ClassLiveView`.
2. **Pool result snapshot** (stage 4, new): final standings per pool — placement, player, club, and W/L / set / point aggregates.

The second stream is already ingested by `POST /api/integrations/ondata/competitions/[slug]/pool-results` and persisted into `ondata_pool_result_snapshots` / `_pools` / `_standings`, but no UI reads from it.

This feature surfaces those standings inline inside each pool card on the public class view. Publishing pool results is a meaningful step in the competition: once published, players get a window to review and object before the playoff is drawn.

---

## Scope

V1 includes:

- A per-pool lifecycle with three states in `ClassLiveView`:
  1. Results published → show ordered standings (`placement` + name + club), with a `Klar · poolresultat publicerat` status pill.
  2. All matches played but results not yet imported → keep current player list, show an inline notice `Alla matcher klara — resultat inte inlästa än`.
  3. Pool in progress or not started → render unchanged from today.
- `getClassLiveData` extended to read the current pool-result snapshot for the class and attach standings to matching pools by `pool_number`.
- Match grid (`<details>Visa matcher</details>`) preserved in the standings state, collapsed by default (unchanged).
- Extension of the manual dev seed so at least one class exposes the published-results state for manual testing.
- E2E test coverage for the three states.

V1 does not include:

- Displaying matches won/lost, sets won/lost, or points for/against. The public view shows placement + player only. The columns exist in the DB and can be surfaced later.
- Column headers in the standings list.
- Advancement cut-off indicators ("top N advance").
- A freshness / `processedAt` timestamp banner.
- Re-sorting or surfacing the logged-in player's pool first (there is no logged-in public identity here).
- Changes to the admin/secretariat dashboard.
- Any new API route — `getClassLiveData` is the single shared data function.
- Unit tests — project has no unit test infra; logic is covered via E2E.

---

## Key design decisions

### Standings replace nothing — they sort the existing roster

Visually, the published-results state looks almost identical to the pre-results player list: the same names and clubs in a column. The only differences are a small placement number in front of each row and the updated status pill. The match grid stays available below, collapsed.

That means the rendered list of "pool members" is actually sourced from **two places depending on state**:

- No standings: iterate `pool.players` (from the integration snapshot) in `player_order`.
- Standings present: iterate `pool.standings` in `placement` ascending, render `placement` + `playerName` + `clubName`.

These are distinct data sources. We do not try to reconcile the two — if OnData has published standings, we render standings; otherwise we render the draw roster.

### Matching live pools to result pools

The integration snapshot's class row already carries `external_class_key` (see [supabase/migrations/20260406110000_add_ondata_integration.sql:39](../supabase/migrations/20260406110000_add_ondata_integration.sql#L39)). That is the same key the pool-results ingestion writes into `ondata_pool_result_status.external_class_key`.

Resolution:

1. In `getClassLiveData`, select `external_class_key` alongside the existing `id` on the snapshot class row.
2. Read `ondata_pool_result_status` for `(competition_id, external_class_key)`; take `current_snapshot_id`. If no row or null snapshot, there are no standings — done.
3. Load `ondata_pool_result_snapshot_pools` where `snapshot_id = current_snapshot_id`.
4. Load `ondata_pool_result_snapshot_standings` for those pool ids, ordered by `placement ASC`.
5. Group standings by `pool_number` and attach to the corresponding live pool (matching `pool_number` directly — both sides use the same integer from OnData).

Per-pool independence falls out naturally: a pool without a matching entry in `ondata_pool_result_snapshot_pools` simply gets no standings on the live side, while its siblings can have standings. In practice OnData sends results for a whole class at once, but the code should not assume it.

### State 2 copy lives in the card, not the pill

The progress pill keeps its existing meaning — `{played}/{total} matcher spelade`. When all matches are played but no results have arrived, we **do not** change the pill to `10/10 spelade · väntar på resultat`; that wording invites the question "why am I waiting when 10/10 are played?". Instead, a small inline notice inside the pool card reads `Alla matcher klara — resultat inte inlästa än`, rendered only when `playedMatches === totalMatches && totalMatches > 0 && standings == null`.

### Finalized state uses a single pill

When `standings != null`, the progress pill is **replaced** by a finalized pill: `Klar · poolresultat publicerat`. The played/total pill is suppressed because the standings themselves communicate the same thing and more. This avoids two competing status pills on one card.

### No schema changes

All required tables already exist from `20260421120000_add_ondata_pool_results.sql`. We only read.

---

## Data model

Existing and read-only:

- [`ondata_pool_result_status`](../supabase/migrations/20260421120000_add_ondata_pool_results.sql#L49-L58) — `(competition_id, external_class_key)` → `current_snapshot_id`. Use this instead of `MAX(received_at)` on the snapshots table; it is the authoritative "latest processed" pointer and is set only on successful processing.
- [`ondata_pool_result_snapshot_pools`](../supabase/migrations/20260421120000_add_ondata_pool_results.sql#L25-L30) — `(snapshot_id, pool_number)` unique.
- [`ondata_pool_result_snapshot_standings`](../supabase/migrations/20260421120000_add_ondata_pool_results.sql#L32-L44) — `pool_id` + `placement` + `player_name` + `club_name` + W/L/set/points columns (last four are **not** read in V1).

Already exposed on the integration side:

- [`ondata_integration_snapshot_classes.external_class_key`](../supabase/migrations/20260406110000_add_ondata_integration.sql#L39) — the bridging identifier.

---

## Shared data function

### Extend `getClassLiveData` in [src/lib/public-competition.ts](../src/lib/public-competition.ts)

Current function (lines 496–690) returns `ClassLiveData | null`. Extend:

Updated types (place alongside `ClassLivePool`):

```typescript
export interface ClassLivePoolStanding {
  placement: number
  playerName: string
  clubName: string | null
}

export interface ClassLivePool {
  poolNumber: number
  players: Array<{ name: string; club: string | null }>
  matches: ClassLiveMatch[]
  playedMatches: number
  totalMatches: number
  standings: ClassLivePoolStanding[] | null   // null when no pool-result snapshot for this pool
}
```

Implementation additions (on top of the existing body):

1. Change the snapshot-class select around [line 528](../src/lib/public-competition.ts#L528) to include `external_class_key`:
   ```ts
   .select('id, external_class_key')
   ```
2. After the `livePools` array is built (around [line 681](../src/lib/public-competition.ts#L681)) but before the `if (livePools.every(...))` short-circuit and final return:
   - Query `ondata_pool_result_status` by `(competition_id, external_class_key)`. If missing or `current_snapshot_id` is null, set `standings = null` on every pool and return.
   - Otherwise, select `id, pool_number` from `ondata_pool_result_snapshot_pools` where `snapshot_id = current_snapshot_id`.
   - Select `pool_id, placement, player_name, club_name` from `ondata_pool_result_snapshot_standings` where `pool_id in (...)` order by `placement asc`.
   - Group standings by `pool_number` (via the pool-id-to-number map built one step above) and attach to the matching live pool. Live pools without a matching result pool keep `standings: null`.
3. The `livePools.every(pool => pool.players.length === 0)` short-circuit at [line 683](../src/lib/public-competition.ts#L683) stays as-is. Standings do not affect the null decision.

The function remains the single source of truth for the class live view. The existing API route [src/app/api/public/classes/[classId]/live/route.ts](../src/app/api/public/classes/%5BclassId%5D/live/route.ts) widens automatically; verify it does not project fields.

### Status enum unchanged

`getClassLiveStatus` in the same file keeps its three values (`none`, `pools_available`, `pool_play_started`). The presence of standings does not introduce a new top-level status — it's a per-pool concern rendered within the card.

---

## Display component

### Update [src/components/ClassLiveView.tsx](../src/components/ClassLiveView.tsx)

Per pool, render one of three branches in this priority order:

**Branch A — standings published** (`pool.standings != null`):

- Header: pool title on the left, pill `Klar · poolresultat publicerat` on the right. Use muted pill styling (`app-pill-muted`).
- Suppress the `{played}/{total} matcher spelade` pill.
- Below the header, render an ordered list of standings rows:
  ```tsx
  <ol data-testid={`class-live-pool-standings-${pool.poolNumber}`} className="mt-3 space-y-2">
    {pool.standings.map(s => (
      <li
        key={`${pool.poolNumber}-${s.placement}-${s.playerName}`}
        data-testid={`class-live-pool-standing-${pool.poolNumber}-${s.placement}`}
        className="flex items-start gap-3 text-sm text-ink"
      >
        <span className="w-5 shrink-0 text-right font-medium tabular-nums">{s.placement}</span>
        <span className="min-w-0">
          <span className="block font-medium">{s.playerName}</span>
          {s.clubName ? <span className="block text-xs text-muted">{s.clubName}</span> : null}
        </span>
      </li>
    ))}
  </ol>
  ```
  No column headers. No W/L/set/points columns. A fixed-width `w-5` number column keeps the names aligned. `tabular-nums` on the number column.
- Keep the existing match grid `<details>` collapsed by default (unchanged from today).

**Branch B — all matches played, no standings yet** (`pool.standings == null && pool.totalMatches > 0 && pool.playedMatches === pool.totalMatches`):

- Header unchanged — the `{played}/{total} matcher spelade` pill still reads e.g. `10/10 spelade`.
- Render the existing player list as today.
- Below the player list (above the `<details>`), render a small inline notice:
  ```tsx
  <p
    data-testid={`class-live-pool-awaiting-results-${pool.poolNumber}`}
    className="mt-3 text-sm text-muted"
  >
    Alla matcher klara — resultat inte inlästa än
  </p>
  ```
  Keep it as a plain muted paragraph — do not use an alert box or colored panel. This is an expected transient state, not an error.

**Branch C — everything else** (no standings and not all matches played): render exactly as today.

### data-testid additions

- `class-live-pool-standings-{poolNumber}` — the standings `<ol>` wrapper.
- `class-live-pool-standing-{poolNumber}-{placement}` — each standing row.
- `class-live-pool-awaiting-results-{poolNumber}` — the state-2 notice paragraph.
- `class-live-pool-final-pill-{poolNumber}` — the `Klar · poolresultat publicerat` pill.

As always, tests only. Production code must not read these.

### Visual constraints

- No new Tailwind color tokens. Reuse existing `text-ink`, `text-muted`, `app-pill-muted`.
- Mobile target 360px wide. The standings row has: 5-char number column + flexible name/club column. No additional columns, so wrapping is trivial.
- The pool card height when standings are present is very close to its height in the current "players only" state — intended.

---

## Swedish copy

| Key | Swedish |
|---|---|
| Finalized pill | `Klar · poolresultat publicerat` |
| Awaiting-results inline notice | `Alla matcher klara — resultat inte inlästa än` |
| (Unchanged) progress pill | `{played}/{total} matcher spelade` |
| (Unchanged) match grid toggle | `Visa matcher` / `Dölj matcher` |

Use the em-dash `—` in the awaiting-results notice (same Unicode character used elsewhere in the app copy).

---

## Manual dev seed

The manual seed in [scripts/seed.ts](../scripts/seed.ts) currently populates a competition, sessions, classes, players, and registrations — but **no OnData snapshot data at all**. That means today you cannot exercise the pools tab or the new standings state without POSTing fake payloads by hand.

### Extend the seed

After the registrations block (currently ends around [line 253](../scripts/seed.ts#L253)), add an OnData snapshot seed that covers three of the four classes so all three states are visible in one run:

| Class | Pool draw | Matches played | Standings published | State in UI |
|---|---|---|---|---|
| `Herrar A-klass` | 1 pool, 4 players | 2 of 6 | no | in-progress (branch C) |
| `Damer A-klass` | 1 pool, 4 players | 6 of 6 | no | awaiting results (branch B) |
| `Herrar B-klass` | 1 pool, 4 players | 6 of 6 | yes | published (branch A) |
| `Damer B-klass` | — | — | — | no pools tab (unchanged) |

Use the existing registrations as the pool rosters. Keep the seed idempotent: before inserting, delete any `ondata_integration_snapshots` and `ondata_pool_result_snapshots` rows for this competition (cascades handle the children), and delete any `ondata_integration_status` / `ondata_pool_result_status` rows.

### Sketch

Factor a small helper inside `scripts/seed.ts` — keep it local to the file, do not couple to `tests/helpers/db.ts` (that file uses `bcrypt` cost 4 and test-only assumptions).

```typescript
async function seedOnDataFixture(opts: {
  competitionId: string
  className: string
  date: string             // e.g. '2025-09-13'
  time: string             // e.g. '09:00'
  players: Array<{ name: string; club: string | null }>
  playedMatches: number    // 0 .. n*(n-1)/2
  publishResults: boolean
  snapshotId: string       // caller allocates so one snapshot can hold multiple classes
}) { ... }
```

Implementation notes:

- Build one `ondata_integration_snapshots` row for the whole competition (all three classes live under it). Use `summary_*` fields consistent with the inserted children.
- For each class, build one `ondata_integration_snapshot_classes` row with a synthetic `external_class_key` like `seed::${className}::${date}::${time}`. Use the **same** key later in the pool-result snapshot so they resolve against each other.
- For each pool, insert `ondata_integration_snapshot_pools`, `ondata_integration_snapshot_players` (one row per player, carrying name+club), and `ondata_integration_snapshot_matches` for the first `playedMatches` round-robin pairings with a synthetic `result` string (e.g. `"6, 3, 8"` → 3–0). Use deterministic pairing order `(i, j)` with `i < j`.
- After all classes are inserted, upsert `ondata_integration_status` with `current_snapshot_id = snapshotId`.
- For each class where `publishResults === true`, insert a separate `ondata_pool_result_snapshots` row (own id) + `ondata_pool_result_snapshot_pools` + `ondata_pool_result_snapshot_standings` with made-up `placement` values `1..n`, and carry name/club from the roster. Set the W/L/set/points columns to any non-null integers — they are not displayed. Then upsert `ondata_pool_result_status` with `external_class_key` and `current_snapshot_id` pointing to that snapshot.

Add two console log lines at the end of the seed to make the states obvious to the developer:
```
  OnData snapshot: Herrar A (2/6 spelade), Damer A (6/6 spelade, väntar på resultat), Herrar B (resultat publicerat)
```

### Re-running the seed

`scripts/seed.ts` is safe to re-run. The existing script clears sessions and players per competition. Extend the clear step to also delete:

- `ondata_integration_snapshots where competition_id = …` (cascades classes/pools/players/matches)
- `ondata_integration_status where competition_id = …`
- `ondata_pool_result_snapshots where competition_id = …`
- `ondata_pool_result_status where competition_id = …`

Do **not** touch these tables for other competitions.

---

## Test plan

### Test file: `tests/e2e/player/pool-results-public.spec.ts`

Slug prefix for scoped cleanup: `test-player-pres-`.

```typescript
test.beforeEach(async () => {
  await cleanTestCompetitions(supabase, 'test-player-pres-%')
})
```

### Seed helper

Add to [tests/helpers/db.ts](../tests/helpers/db.ts):

```typescript
export async function seedPoolResultSnapshots(
  supabase: SupabaseClient,
  input: {
    competitionId: string
    classes: Array<{
      externalClassKey: string        // must match the integration snapshot class key
      className: string
      classDate: string               // '2025-09-13'
      classTime: string               // '09:00'
      pools: Array<{
        poolNumber: number
        standings: Array<{
          placement: number
          playerName: string
          clubName: string | null
        }>
      }>
    }>
  },
): Promise<{ snapshotIds: Record<string, string> }>   // keyed by externalClassKey
```

Behavior:

- One `ondata_pool_result_snapshots` row per class (pool results are class-scoped in the schema).
- Populate the W/L/set/points columns with zeros — required by schema but unused by the UI.
- Upsert `ondata_pool_result_status` pointing at each created snapshot.
- Use `randomUUID()` for ids, consistent with `seedOnDataSnapshotForClasses`.

Use this helper alongside the existing [`seedOnDataSnapshotForClasses`](../tests/helpers/db.ts#L1566) or [`seedCompetitionWithPoolMatches`](../tests/helpers/db.ts#L1095) depending on what live data the test needs. Be sure to use matching `externalClassKey` / `className` / `classDate` / `classTime` on both sides.

Note: `seedOnDataSnapshotForClasses` currently synthesizes `external_class_key` as `seed-${classOrder}` ([line 1617](../tests/helpers/db.ts#L1617)). Extend it with an optional `externalClassKey` override per class so tests can set a deterministic value that matches what they pass to `seedPoolResultSnapshots`.

### Test cases

1. **State 1 (in progress, unchanged)** — seed a pool with 4 players and 2 of 6 matches. Assert the progress pill reads `2/6 matcher spelade`, no standings, no awaiting-results notice.
2. **State 2 (all played, no results)** — seed 6 of 6 matches, no pool-result snapshot. Assert:
   - Progress pill still reads `6/6 matcher spelade` (unchanged).
   - The inline notice `Alla matcher klara — resultat inte inlästa än` is present.
   - No standings list, no finalized pill.
3. **State 3 (results published)** — seed 6 of 6 matches **and** a pool-result snapshot with 4 standings (placements 1–4). Assert:
   - The finalized pill reads `Klar · poolresultat publicerat`.
   - The `{played}/{total} matcher spelade` pill is NOT rendered.
   - A standings list is rendered with 4 rows in placement order, each showing the placement number, player name, and club.
   - The awaiting-results notice is NOT rendered.
   - The match grid `<details>` is still present and collapsed.
4. **Mixed per-pool state within one class** — seed a class with 2 pools. Pool 1 has a results snapshot row; pool 2 does not (pool-result snapshot contains only one pool). Assert pool 1 renders in branch A and pool 2 renders in branch B or C depending on its match progress.
5. **No `current_snapshot_id`** — seed the integration snapshot only, no pool-result snapshot at all. Assert the page renders in its current (pre-feature) form — no regressions to state 1.
6. **`external_class_key` mismatch** — seed a pool-result snapshot for the wrong class key (different `externalClassKey`). Assert the live pool for the real class shows no standings. This guards the join condition.
7. **Standings order** — seed standings with placements `3, 1, 2, 4` inserted in that order. Assert the rendered order is `1, 2, 3, 4`.
8. **Dashboard card expand shows standings** — expand the class card on the landing page, assert the standings render there too (shared-component check).

Every case asserts through the real browser against visible UI, not internal state. Standings assertions look for the `class-live-pool-standing-*` test ids and their text content.

---

## Implementation order

1. **Extend `getClassLiveData`** — add `standings` to the `ClassLivePool` type and populate it via the status→snapshot→pools→standings chain. Manual smoke: POST a fake payload to the pool-results endpoint (or extend the manual seed) and verify the data shape via the existing API route.
2. **Extend `ClassLiveView`** — branch A/B/C rendering, pill swap, awaiting notice. Iterate with hardcoded props or the seeded dev competition before wiring data.
3. **Extend the manual seed** — `scripts/seed.ts` adds the three ondata fixtures and the clear step. Run `npm run db:seed` and step through all four classes in a browser.
4. **Extend `seedOnDataSnapshotForClasses`** — optional per-class `externalClassKey` override.
5. **Add `seedPoolResultSnapshots`** helper.
6. **Write E2E cases 1–8** in `tests/e2e/player/pool-results-public.spec.ts`. Run `npm run test:e2e:agent`.
7. **Build check** — `npm run build`. Fix any type errors.
8. **Manual smoke** — dev server, the four seeded classes at 375px and desktop, reload to confirm the page is not over-cached (`dynamic = 'force-dynamic'` already set from the prior feature).

---

## Files to create

| File | Purpose |
|---|---|
| `tests/e2e/player/pool-results-public.spec.ts` | E2E tests for the three states |

## Files to modify

| File | Change |
|---|---|
| `src/lib/public-competition.ts` | Extend `ClassLivePool` type with `standings`; extend `getClassLiveData` to read the pool-result status + snapshot chain; also select `external_class_key` on the snapshot-class row |
| `src/components/ClassLiveView.tsx` | Add branches A/B/C: standings list with placement + name + club, finalized pill, awaiting-results inline notice; suppress the progress pill when standings present |
| `scripts/seed.ts` | Extend clear step; add OnData integration snapshot + pool-result snapshot fixtures for three of the four classes |
| `tests/helpers/db.ts` | Add `seedPoolResultSnapshots` helper; add optional per-class `externalClassKey` override to `seedOnDataSnapshotForClasses` |

---

## Open points deferred to V2

- Surface the W/L / set / points columns once the OnData payload starts filling them (schema already accepts the fields).
- Show the `processedAt` of the last results import next to the finalized pill if feedback from the first live use asks for it.
- Cross-class summary (e.g. competition home page showing which classes have published results).
