# Pool Match Results — Public View V1

This document is the implementation handoff for showing pool match results to public users (players and audience). It extends [public-class-live-view-v1.md](./public-class-live-view-v1.md) — read that first for the surrounding architecture of the class live view.

---

## Background

The public class live view today shows the draw: pools with player rosters. Once matches start being played, the OnData snapshot also carries completed match records, but they are ignored by the UI. Players and spectators on the floor want to see match results for a class without hunting through the OnData system.

This feature surfaces those results inline within each pool card on the existing class live view.

---

## Scope

V1 includes:

- A `Matcher` section inside each pool card, listing completed matches with full names and set score
- A `{played}/{total} matcher spelade` pill in the pool card header once at least one match is played
- A parsing helper that turns the raw OnData `result` string into a set score
- Extension of `getClassLiveData` to carry matches alongside players
- Extension of the shared `ClassLiveView` component to render matches
- Disabling route cache on the dedicated class page so a browser reload fetches the latest snapshot
- E2E tests covering pools with zero, partial, and full match coverage

V1 does not include:

- Standings, rankings, or tiebreaker calculation (logic belongs in the upstream competition system that feeds OnData)
- Game-by-game score display (e.g. `11-8, 9-11, 11-6, 11-7`) — set score only
- Match state indicators (in progress, upcoming) — OnData only sends completed matches, so every row is a completed result
- Match number prefixes (no `M3`, `M5`, etc. in the UI)
- Highlighting a specific player's own matches (no login system)
- Client-side polling or auto-refresh — pull-to-refresh via a normal browser reload is sufficient for V1
- Any admin-side UI for entering or editing results — data is read-only from OnData
- Unit tests — the project has no unit test infrastructure; parsing is covered via E2E assertions

---

## Key design decisions

### Set score is derived from the raw `result` string, not stored

OnData delivers match results as a comma-separated list of signed integers, one per game. Each integer is the **loser's point total** for that game. The sign tells us the winner:

- Positive → player A won the game
- Negative → player B won the game

Example: `-4, 6, 4, 11` means four games were played:

| Token | Meaning |
|---|---|
| `-4` | Player B won the first game, player A scored 4 |
| `6` | Player A won the second game, player B scored 6 |
| `4` | Player A won the third game, player B scored 4 |
| `11` | Player A won the fourth game 13-11 (deuce; must win by 2) |

Set score is derived by counting signs: 3 positive + 1 negative → `3–1` for player A.

Magnitude is not used in V1 — it only matters if we later show game scores.

### Only completed matches arrive in the snapshot

The ingestion pipeline already filters to completed matches. The UI does not need to render "pending" or "in progress" rows, and the `Matcher` section only lists rows that exist in the snapshot.

### Total match count is computed from player count

The denominator in `{played}/{total} matcher spelade` is the number of matches a full round-robin would contain: `n * (n - 1) / 2` where `n` is the current player count in the pool. This avoids trusting an ingested total that might drift and stays consistent with the roster rendered in the same card.

Numerator is the length of the matches array (equivalent to `completed_match_count` on the snapshot pool; either source is acceptable, pick one and be consistent).

### Matches render inline, always visible when they exist

There is no collapse / expand interaction. If the pool has at least one match, the `Matcher` section is rendered under the player list. The card stays minimal when no matches exist yet (unchanged from today).

### Behavior is shared between the class page and the dashboard inline expand

`ClassLiveView` is rendered both on the dedicated `/{slug}/classes/{classId}` page and inline in the landing-page dashboard card expand. Because the component is shared, adding matches to it automatically enables matches in both surfaces. That is intentional — the two surfaces are meant to be consistent.

---

## Data model

No schema changes. All required columns already exist.

Relevant existing table (from `supabase/migrations/20260406110000_add_ondata_integration.sql:72-85`):

```sql
create table ondata_integration_snapshot_matches (
  id uuid primary key default gen_random_uuid(),
  snapshot_pool_id uuid not null references ondata_integration_snapshot_pools(id) on delete cascade,
  match_order int not null,
  match_number int,
  player_a_name text,
  player_a_club text,
  player_b_name text,
  player_b_club text,
  result text
);
```

Matches for a pool are ordered by `match_order ASC`.

---

## Result parsing helper

### File: `src/lib/match-result.ts` (new)

A pure function with no I/O.

```typescript
export type ParsedMatchResult = {
  setScoreA: number
  setScoreB: number
}

/**
 * Parses a raw OnData result string into a set score.
 * Returns null when the input is null, empty, or unparseable.
 */
export function parseMatchResult(raw: string | null): ParsedMatchResult | null
```

Behavior:

1. Return `null` if `raw` is `null`, empty after trimming, or contains no digits.
2. Split on `,`, trim each token.
3. For each token:
   - Reject and return `null` if the token is not a signed or unsigned integer.
  - Increment `setScoreA` if the token is unsigned or positive, `setScoreB` if it is negative.
  - A token equal to `0` is valid and represents an 11-0 set win for player A.
4. Require at least one valid token. If zero valid tokens, return `null`.
5. Return `{ setScoreA, setScoreB }`.

Callers treat `null` as "skip this match row" — do not render a partial or placeholder row for unparseable data. Record the outcome server-side with a single `console.warn` including the raw string, so bad ingestions surface in logs without crashing the page.

---

## Shared data function

### Extend `getClassLiveData` in `src/lib/public-competition.ts`

Add matches and counts to each pool in the returned `ClassLiveData`.

Updated types:

```typescript
export interface ClassLiveMatch {
  playerA: { name: string; club: string | null }
  playerB: { name: string; club: string | null }
  setScoreA: number
  setScoreB: number
}

export interface ClassLivePool {
  poolNumber: number
  players: Array<{ name: string; club: string | null }>
  matches: ClassLiveMatch[]
  totalMatches: number   // n * (n - 1) / 2 from players.length
}
```

Implementation addition (on top of existing logic):

1. After loading each pool's players, query `ondata_integration_snapshot_matches` for that pool, ordered by `match_order ASC`.
2. For each row, call `parseMatchResult(row.result)`. Skip rows where parsing returns `null` (with a `console.warn`).
3. Build `ClassLiveMatch` entries using `player_a_name` / `player_a_club` and `player_b_name` / `player_b_club` verbatim. If `player_a_name` or `player_b_name` is null, skip the row.
4. Set `totalMatches = players.length * (players.length - 1) / 2`.

The function still returns `null` under the same conditions as today (no snapshot, no matching snapshot class, zero players across all pools). Presence or absence of matches does not affect the null decision.

### No changes needed to `getClassDashboardLiveStatus`

The dashboard status signal remains "does this class have any pool data" — matches do not change the pill.

---

## API route

### `GET /api/public/classes/[classId]/live`

File: `src/app/api/public/classes/[classId]/live/route.ts` (existing).

The response shape widens automatically since it returns the `ClassLiveData` from `getClassLiveData`. No code change required beyond making sure the returned JSON includes the new `matches` and `totalMatches` fields. Verify by inspecting the route handler and confirming it does not project or whitelist fields.

Extended response example:

```json
{
  "status": "pools_available",
  "data": {
    "pools": [
      {
        "poolNumber": 1,
        "players": [
          { "name": "Anna Svensson", "club": "Spårvägen" },
          { "name": "Björn Andersson", "club": "SBTK" }
        ],
        "matches": [
          {
            "playerA": { "name": "Anna Svensson", "club": "Spårvägen" },
            "playerB": { "name": "Björn Andersson", "club": "SBTK" },
            "setScoreA": 3,
            "setScoreB": 1
          }
        ],
        "totalMatches": 6
      }
    ]
  }
}
```

---

## Shared display component

### Update `ClassLiveView` in `src/components/ClassLiveView.tsx`

Extend the existing component. The pool card gains a header pill when matches exist and a `Matcher` section under the player list.

Rendering rules per pool:

- Header row becomes a flex row with the `Pool {n}` heading on the left and a pill on the right. Pill is rendered only when `pool.matches.length > 0` and its text is `{pool.matches.length}/{pool.totalMatches} matcher spelade`. Use muted pill styling (e.g. `app-pill-muted`).
- Player list: wrap the existing `<ul>` in a section with a small `Spelare` subheading only when `pool.matches.length > 0` — this disambiguates from the new `Matcher` section. When there are no matches, the player list renders exactly as today (no subheading), so pre-match cards are unchanged.
- New `Matcher` section below the player list, rendered only when `pool.matches.length > 0`. Each match row is a three-column grid: left player name, centered score, right player name.

Match row layout:

```tsx
<li className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm text-ink">
  <span className="text-right font-medium">{m.playerA.name}</span>
  <span className="text-muted tabular-nums">
    {m.setScoreA}&ndash;{m.setScoreB}
  </span>
  <span className="text-left font-medium">{m.playerB.name}</span>
</li>
```

Clubs are **not** rendered in match rows (only in the player list at the top of the card) to keep rows scannable.

The three-column grid handles mobile wrapping naturally: long names wrap within their own column and the score stays centered. No breakpoint-specific styles needed.

Use the project's existing utility classes (`app-pill-muted` etc.). Do not introduce new color tokens. Keep the visual change minimal and consistent with the current card styling.

### data-testid additions

- `class-live-pool-progress-{poolNumber}` — the `N/M matcher spelade` pill
- `class-live-pool-matches-{poolNumber}` — the `Matcher` section wrapper
- `class-live-match-{poolNumber}-{matchIndex}` — each individual match row (0-indexed by position in `matches`)

These are for tests only — never read them from production code.

---

## Refresh behavior

Pull-to-refresh on mobile uses the browser's native reload. For the reload to actually fetch fresh data, the class page must not be cached.

Add the following to `src/app/[slug]/classes/[classId]/page.tsx`:

```typescript
export const dynamic = 'force-dynamic'
```

The dashboard card expand already fetches from the API route on each expansion, so no change is needed there.

---

## Swedish copy

| Key | Swedish |
|---|---|
| Player section subheading (only when matches exist) | Spelare |
| Match section heading | Matcher |
| Progress pill | {played}/{total} matcher spelade |

Note: when a pool has zero matches, no subheading or pill appears — the card is unchanged from today.

---

## Test plan

### Test file: `tests/e2e/player/pool-match-results.spec.ts`

Use slug prefix `test-player-pmr-` for scoped cleanup:

```typescript
test.beforeEach(async () => {
  await cleanTestCompetitions(supabase, 'test-player-pmr-%')
})
```

### Seed helper

Add to `tests/helpers/db.ts`:

```typescript
async function seedCompetitionWithPoolMatches(supabase, slug, options: {
  poolCount?: number
  playersPerPool?: number
  matchesPerPool?: Array<Array<{
    playerAIndex: number      // index into the pool's players array
    playerBIndex: number
    result: string            // raw OnData format, e.g. "-4, 6, 4, 11"
  }>>
}): Promise<{
  competitionId: string
  classId: string
  poolIds: string[]
}>
```

This builds on the existing `seedCompetitionWithPools` helper from `public-class-live-view-v1.md`. It inserts `ondata_integration_snapshot_matches` rows with correct `match_order` values per pool, wiring the result strings passed in by each test.

### Test cases

Focus on the user-visible behavior. Every case is driven through a real browser — no helper assertions on parsed output.

1. **Pool with zero matches renders unchanged** — no progress pill, no `Matcher` section, no `Spelare` subheading. Only the player list shows.
2. **Pool with partial matches** — seed 2 of 6 matches. Pill reads `2/6 matcher spelade`. Both match rows render with correct player names and set scores.
3. **Pool with all matches played** — seed 6 of 6. Pill reads `6/6 matcher spelade`.
4. **Set score from varied result strings** — seed matches with these `result` strings and assert the rendered set scores:
   - `"6, 3, 8"` → `3–0`
   - `"-4, 6, 4, 11"` → `3–1`
   - `"-9, -7, 5, 3, -8"` → `2–3`
   - `"11, -12, 10, -9, 11"` → `3–2`
5. **Unparseable result is skipped** — seed one valid match and one match with `result: "invalid"`. Assert the valid row renders and the invalid one does not appear. Pill reflects the valid count only.
6. **Match order** — seed three matches with `match_order` values `2, 0, 1`. Assert the rendered rows are in `0, 1, 2` order.
7. **Dashboard card expand shows matches** — expand a class card on the landing page and assert match rows are present in the inline expansion (confirms the shared component works identically in both surfaces).
8. **Force-dynamic smoke test** — load the class page, update the snapshot's matches directly in Supabase, reload the page, and assert the new match appears. This validates the cache disable actually took effect.

Each case should assert:
- Presence or absence of the progress pill and its text
- The exact list of match rows rendered (count and content)
- The player list is still present and unchanged

### Scoped cleanup

Follow the existing pattern for the player project:

```typescript
await cleanTestCompetitions(supabase, 'test-player-pmr-%')
```

Never use a broader `test-%` pattern.

---

## Implementation order

1. **`parseMatchResult`** — new pure helper in `src/lib/match-result.ts`.
2. **Extend `getClassLiveData`** — add matches and `totalMatches` to each pool. Verify manually with a seeded snapshot.
3. **Extend `ClassLiveView`** — add the progress pill, `Spelare` subheading, and `Matcher` section. Use hardcoded props or a preview page to iterate on the visual layout before wiring data.
4. **Disable cache on the class page** — add `export const dynamic = 'force-dynamic'`.
5. **Confirm API route passes through new fields** — inspect `src/app/api/public/classes/[classId]/live/route.ts` and make sure no projection strips them.
6. **Seed helper** — extend `tests/helpers/db.ts`.
7. **E2E tests** — write cases 1-8 above.
8. **Build check** — run `npm run build` and fix any type errors before considering the work done.
9. **Manual smoke** — run the dev server, open a seeded competition's class page and the landing page dashboard expand, verify rendering on a narrow viewport (375px) and desktop.

---

## Files to create

| File | Purpose |
|---|---|
| `src/lib/match-result.ts` | `parseMatchResult` helper |
| `tests/e2e/player/pool-match-results.spec.ts` | E2E tests |

## Files to modify

| File | Change |
|---|---|
| `src/lib/public-competition.ts` | Extend `ClassLivePool` type and `getClassLiveData` to include matches and `totalMatches` |
| `src/components/ClassLiveView.tsx` | Add progress pill, `Spelare` subheading (when matches present), and `Matcher` section |
| `src/app/[slug]/classes/[classId]/page.tsx` | Add `export const dynamic = 'force-dynamic'` |
| `tests/helpers/db.ts` | Add `seedCompetitionWithPoolMatches` helper |
