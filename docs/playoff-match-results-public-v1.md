# Playoff Match Results — Public View V1

This document is the implementation handoff for showing playoff match results to public users on the class live view. It extends [public-class-live-view-v1.md](./public-class-live-view-v1.md), [pool-match-results-public-v1.md](./pool-match-results-public-v1.md), and [pool-results-public-v1.md](./pool-results-public-v1.md). Read those first for the surrounding architecture of the public class page, tabs, and live match rendering.

---

## Background

The public class page already supports three levels of live competition information:

1. Pool draw (`Pooler` tab)
2. Pool match results
3. Final pool standings

Once a class reaches playoff, the public UI currently has no way to show the next phase. The app already ingests playoff snapshots from OnData into `ondata_playoff_snapshots`, `ondata_playoff_snapshot_rounds`, and `ondata_playoff_snapshot_matches`, but that data is only used for the secretariat's compact progress strip on the admin dashboard.

This feature surfaces those playoff matches in the public class UI as a new top-level tab, focused on simple round-by-round match visibility rather than a full bracket visualization.

---

## Scope

V1 includes:

- A new `Slutspel` tab on the public class page when playoff data exists
- A read-only public playoff view that groups matches by round for A and B brackets
- Match rows showing full player names and result state using the same compact left-stack / right-status layout already proven in the pool match UI
- Support for both completed and unplayed matches when they exist in the snapshot
- Support for A-only and A+B playoff classes
- Defaulting the public class page to the `Slutspel` tab when playoff data exists
- E2E coverage for the main public states

V1 does not include:

- A visual bracket tree
- Any sync freshness or `Data från HH:MM` copy in the public UI
- Inferred placeholders such as `Vinnare kvartsfinal 2`
- Derived bye messaging such as `Två spelare är redan klara för semifinal`
- Any attempt to reconstruct bracket progression between matches
- Extra public dashboard surfaces beyond the class page unless added later as follow-up work
- Auto-refresh or polling changes

---

## Key design decisions

### Add a third top-level tab

The public class page currently uses a simple tab model in `PublicClassContentTabs`:

- `Spelare`
- `Pooler`

V1 extends that to:

- `Spelare`
- `Pooler`
- `Slutspel`

This is the cleanest continuation of the current page architecture. Pool content remains pool-specific, and playoff becomes a distinct phase instead of being stacked into the pool view.

### No freshness messaging in public UI

Unlike the admin dashboard, the public view should not show sync staleness messaging. It adds noise and invites the wrong kind of trust interpretation for players and audience.

The public assumption is simple: the live view updates when the upstream system updates. No extra freshness UI is needed.

### Show only what the snapshot explicitly contains

The current playoff data model stores:

- round ordering
- match ordering
- concrete `player_a_name`
- concrete `player_b_name`
- `winner_name`
- `result`
- `is_completed`

It does **not** store slot provenance such as:

- `winner_of_match_key`
- `source_match_id`
- `entrant_kind = bye`
- any explicit graph edge between rounds

That means the public UI must only render explicit round/match rows already present in the snapshot. It must not invent rows, inferred placeholders, or bye explanations.

Safe rule:

- If a match row exists in the snapshot, render it.
- If a later-round match does not exist yet, do not fabricate it.
- If a later-round match exists with concrete names, render those names.
- If the upstream snapshot includes unresolved placeholder text as participant names, render that text verbatim.

### Full names, not shortened names

The public pool match UI already uses full player names. Playoff must follow the same rule for consistency and to avoid ambiguity.

Do not switch to surname-only or initials in playoff rows.

### Reuse the proven match-row layout

Even though the `Slutspel` tab has more horizontal room than an individual pool card on larger screens, mobile remains the controlling constraint.

For V1, playoff rows should use the same layout pattern already used in the pool match list:

- left column: player A and player B stacked vertically
- right column: compact status block (`3–1`, `WO`, or `Ej spelad än`)

Use the same layout on both mobile and desktop in V1. We can revisit a wider desktop-only layout later if it clearly improves readability.

### Reuse the admin round-name computation

Round labels in the admin progress strip are not read verbatim from `ondata_playoff_snapshot_rounds.round_name`. They are computed by `labelRound` in `src/lib/playoff-progress-view.ts`, which labels by position from the end:

- last round → `Final`
- second-to-last → `Semifinal`
- third-to-last → `Kvartsfinal`
- fourth-to-last → `Åttondel`
- etc.

Raw `round_name` is only used as a fallback when the position does not map to a Swedish label.

The public Slutspel view must use the **same** `labelRound` helper so that the secretariat dashboard and the public page never disagree about what a given round is called. Do not render `round_name` directly.

### Keep the public playoff view simple

This is not a secretariat operational surface. The goal is to answer:

- Has playoff started?
- Which matches exist?
- Which are complete?
- What are the results?

That means:

- no progress bars
- no active-round highlighting
- no dimmed future rounds
- no explanatory copy about byes

Round headings plus ordered match rows are sufficient.

---

## Current data model constraints

The playoff payload contract in `src/lib/ondata-playoff-contract.ts` defines each match as:

```ts
type OnDataPlayoffSnapshotMatch = {
  matchKey: string
  playerA: string
  playerB: string
  winner: string | null
  result: string | null
}
```

The stored table in `ondata_playoff_snapshot_matches` contains:

- `match_key`
- `player_a_name`
- `player_b_name`
- `winner_name`
- `result`
- `is_completed`

This is enough for public match rendering, but not enough for deriving bracket-slot relationships.

Implication for V1:

- We can show match rows round by round.
- We cannot reliably render text like `Vinnare kvartsfinal 2` unless the upstream snapshot literally supplies that as a participant string.
- We cannot explain byes structurally, because the model does not tell us which entries advanced without a played match.

---

## UX

### Tab behavior

The public class page tabs should behave as follows:

| Data state | Tabs shown | Default active tab |
|---|---|---|
| No live data | `Spelare`, disabled `Pooler`, no `Slutspel` | `Spelare` |
| Pool data only | `Spelare`, `Pooler`, no `Slutspel` | `Pooler` |
| Playoff data exists | `Spelare`, `Pooler`, `Slutspel` | `Slutspel` |

The `Slutspel` tab is hidden entirely when there is no playoff data.

### Slutspel tab layout

Top-level structure:

```text
[Spelare] [Pooler] [Slutspel]

Slutspel

A-slutspel
Kvartsfinal
  [match rows...]

Semifinal
  [match rows...]

Final
  [match rows...]

B-slutspel
Kvartsfinal
  [match rows...]
```

Rules:

- Render bracket sections in order: A first, B second
- Hide the B section entirely if no B snapshot exists
- Inside a bracket, render rounds in snapshot order (`round_order ASC`)
- Inside a round, render matches in snapshot order (`match_order ASC`)
- Show a round heading only if that round contains at least one match row
- Do not add any extra explanatory text for byes or incomplete later rounds

### Match row layout

Use the same structural layout as the existing pool match list.

Wireframe:

```text
Kvartsfinal

Anna Andersson
Lisa Berg                          3–1

Maria Nilsson
Karin Karlsson                     Ej spelad än
```

With walkover:

```text
Kvartsfinal

Anna Andersson
Lisa Berg                          WO
```

Characteristics:

- Full names only
- No club names in playoff match rows
- Compact right-side status pill or text block
- No centered three-column layout in V1
- Same layout on mobile and desktop

### Minimal state model for match rows

Per match, in evaluation order:

1. `!is_completed` → show `Ej spelad än`
2. `is_completed && parseMatchResult(result).kind === 'walkover'` → show `WO`
3. `is_completed && parseMatchResult(result).kind === 'score'` → show score badge, e.g. `3–1`
4. `is_completed && (result is null or unparseable)` → show the raw `result` string verbatim, trimmed. If `result` is null or blank, fall back to `Ej spelad än`.

Do not add separate `pågår` or `kommande` labels unless the upstream model later provides reliable distinctions.

### Participant names

Render `player_a_name` and `player_b_name` exactly as stored, trimmed. No transformation, no substitution, no detection of bye/placeholder text. The "no fabricated rows" rule applies to row existence; the name columns always show what upstream provided.

### Example: playoff just started with only two quarterfinals

If the snapshot contains only two quarterfinal rows and nothing further yet, the UI should simply show those two rows and stop there:

```text
[Spelare] [Pooler] [Slutspel]

Slutspel

A-slutspel

Kvartsfinal

Anna Andersson
Lisa Berg                          Ej spelad än

Maria Nilsson
Karin Karlsson                     Ej spelad än
```

No inferred semifinal rows.
No bye explanation.
No placeholders.

If later snapshots add semifinal rows with concrete names, they appear naturally underneath the `Semifinal` heading.

---

## Data model for the public view

Add a new public playoff shape alongside the existing class live data in `src/lib/public-competition.ts`.

Suggested types:

```ts
export interface ClassLivePlayoffMatch {
  playerAName: string
  playerBName: string
  winnerName: string | null
  isPlayed: boolean
  isWalkover: boolean
  setScoreA: number | null
  setScoreB: number | null
  rawResult: string | null
}

export interface ClassLivePlayoffRound {
  name: string
  matches: ClassLivePlayoffMatch[]
}

export interface ClassLivePlayoffBracket {
  bracket: 'A' | 'B'
  rounds: ClassLivePlayoffRound[]
}

export interface ClassLivePlayoffData {
  a: ClassLivePlayoffBracket | null
  b: ClassLivePlayoffBracket | null
}

export interface ClassLiveData {
  pools: ClassLivePool[]
  playoff: ClassLivePlayoffData | null
}
```

Notes:

- Keep pool and playoff data together under the existing shared `ClassLiveData` surface so the class page can decide which tabs to show from one payload.
- Do not include any freshness field in the public playoff shape.
- Do not include derived bye counts or source-match references.

### Impact on existing `ClassLiveData` consumers

Extending the shape breaks the current assumption that "`liveData` exists ⇔ pool data exists". Every consumer of `ClassLiveData` must be updated:

- `hasPoolMatchFixtures(liveData)` — already guards on `pools.some(...)`, so it is safe once `pools` can be empty.
- `hasPublishedPoolResults(liveData)` — already guards on `pools.length > 0`, safe.
- `getClassLiveStatus(liveData)` — only reports a pool-centric status today. It must continue to return `'none' | 'pools_available' | 'pool_play_started' | 'pool_play_complete'` regardless of playoff data; playoff status is not surfaced through this function in V1. If playoff exists but pool data does not, `getClassLiveStatus` should return `'none'` (no pool signal) — the class dashboard will keep showing no pool pill, which is correct.
- `PublicClassContentTabs` — the derived `hasPools` flag can no longer be `Boolean(liveData)`. It must become `Boolean(liveData?.pools?.length)` or an equivalent explicit check.

### Behavior when only playoff data exists

`getClassLiveData` currently returns `null` as soon as the pool snapshot lookup fails or the pool list is empty. That early-return must be relaxed: the function should keep probing for playoff data and return a non-null `ClassLiveData` with `pools: []` whenever playoff data is found.

Specifically, replace the current "no pool rows → return null" short-circuit with "no pool rows → set `livePools = []` and continue to the playoff lookup". Only return `null` when **both** `pools` is empty and `playoff` is `null`.

---

## Shared data function

### Extend `getClassLiveData`

File: `src/lib/public-competition.ts`

Extend the existing shared loader so it also fetches playoff data for the current class. The pool-loading behavior must remain functionally identical, but the early-return `null` path must be softened as described in "Behavior when only playoff data exists" above.

Implementation outline:

1. Look up the local class row (`id`, `name`) from `classes` as today.
2. Run the existing pool lookup. Produce `livePools: ClassLivePool[]`, which may be an empty array if no pool snapshot matches.
3. Look up playoff snapshot ids for the class (see "Class mapping" below), producing at most one id per bracket:
   - `snapshotIdA: string | null`
   - `snapshotIdB: string | null`
4. For each non-null snapshot id in order A then B:
   - load `ondata_playoff_snapshot_rounds` ordered by `round_order ASC`
   - load `ondata_playoff_snapshot_matches` ordered by `match_order ASC`, joined back to rounds by `snapshot_round_id`
   - group matches under their rounds
   - apply `labelRound(totalRounds, roundIndex, rawName)` from `playoff-progress-view.ts` to produce the round `name`
   - parse each `result` using `parseMatchResult` from `src/lib/match-result.ts`
   - skip empty rounds (no match rows) entirely
5. Build `ClassLivePlayoffData`:
   - `a: ClassLivePlayoffBracket | null`
   - `b: ClassLivePlayoffBracket | null`
6. If neither A nor B has any round with any match row, `playoff = null`.
7. Return:
   - `null` if `livePools.length === 0` and `playoff === null`
   - otherwise `{ pools: livePools, playoff }`

Important:

- Use only explicit snapshot rows. Do not generate placeholder rounds or placeholder matches.
- Do not attempt to align or join later rounds back to earlier rounds.
- Render `player_a_name` / `player_b_name` verbatim.
- Populate `winnerName` from `winner_name` (non-null only when it matches one of the participant names after trim; otherwise `null`).
- Populate `rawResult` from the original `result` string so the UI can display it verbatim in the unparseable-result case.

### Class mapping

Local `classes` rows do not carry an external key. Mapping from a local class to playoff snapshots goes through **class name**, the same way the admin loader in `src/lib/playoff-progress.ts` does it, and the same way the pool loader in `getClassLiveData` already does for pool snapshots.

Concrete lookup for a given `classId`:

1. Read `classes.name` for the row.
2. Find candidate playoff snapshots: `ondata_playoff_snapshots` where `competition_id = <competitionId>` and `parent_class_name = <classes.name>`. Each row carries `parent_external_class_key` and `playoff_bracket` (`'A' | 'B'`).
3. For each distinct `(parent_external_class_key, playoff_bracket)` pair, read the current snapshot id from `ondata_playoff_status` (primary key `(competition_id, parent_external_class_key, playoff_bracket)`).
4. Only use snapshot ids that are present in **both** step 2 and step 3. This guarantees we render the active snapshot for this class, not any stale one that may still sit in `ondata_playoff_snapshots`.

Equivalent single-query form: join `ondata_playoff_status` to `ondata_playoff_snapshots` on `current_snapshot_id = snapshots.id` and filter by `competition_id` and `parent_class_name`.

A+B classes will produce two active snapshot ids; A-only classes will produce one; classes with no playoff activity will produce none.

---

## Result parsing

Reuse the existing result parsing behavior from `src/lib/match-result.ts`.

Public playoff match rows need the same output states already supported by the pool side:

- parsed set score → `{ kind: 'score', setScoreA, setScoreB }` becomes the score badge, e.g. `3–1`
- walkover → `{ kind: 'walkover' }` becomes `WO`
- unparseable/empty → `parseMatchResult` returns `null`

Do not add a second playoff-specific parsing system.

The edge case `is_completed = true` combined with a `null` or unparseable `result` is handled by rendering the raw `result` verbatim (trimmed), or `Ej spelad än` if `result` is null/blank. See "Minimal state model for match rows".

---

## UI components

### `PublicClassContentTabs`

File: `src/components/PublicClassContentTabs.tsx`

Extend the tab model from:

```ts
type ClassTab = 'players' | 'pools'
```

to:

```ts
type ClassTab = 'players' | 'pools' | 'playoff'
```

Behavior:

- `hasPools` must become `Boolean(liveData?.pools?.length)` — the current `Boolean(liveData)` is no longer sufficient because `liveData` can now be set with `pools: []` when only playoff data exists.
- Add a `hasPlayoff = Boolean(liveData?.playoff)` check.
- Default active tab to:
  - `playoff` when `hasPlayoff`
  - otherwise `pools` when `hasPools`
  - otherwise `players`

Render the `Slutspel` tab button only when `hasPlayoff` is true. Keep the `Pooler` tab's existing disabled-when-empty styling; it should be disabled (not hidden) when `!hasPools`, matching current behavior.

### New playoff display component

Add a dedicated pure display component for playoff content rather than overloading `ClassLiveView`.

Suggested file:

- `src/components/ClassPlayoffView.tsx`

Suggested props:

```ts
type ClassPlayoffViewProps = {
  playoff: ClassLivePlayoffData
}
```

Responsibilities:

- render A and B bracket sections
- render round headings
- render match rows with the proven stacked-name layout
- keep the visual design quiet and consistent with the current public live surfaces

Do not fetch data inside the component.

### Reuse match row styling patterns

The existing pool match rows in `src/components/ClassLiveView.tsx` already solve the width problem. Reuse their structural approach for playoff rows:

- name block on the left
- status pill or status text on the right
- full names

### Winner emphasis

For completed matches with a concrete winner, render the winner's name in bold. The loser's name stays at the default weight. Apply this rule only when:

- `is_completed === true`
- `winner_name` is non-null and non-empty
- `winner_name` matches either `player_a_name` or `player_b_name` exactly (after trim)

In all other states (unplayed, walkover, completed-but-unparseable result without a matching `winner_name`), both names render at default weight. No badges, no color accents, no icons — weight is the only signal.

---

## Copy

Use Swedish copy consistent with the rest of the public UI.

Labels:

- Tab: `Slutspel`
- Bracket headings: `A-slutspel`, `B-slutspel`
- Unplayed match status: `Ej spelad än`
- Walkover badge: `WO`

Do not add copy for:

- freshness
- byes
- inferred winners

---

## E2E coverage

Add public-facing E2E coverage for the new tab.

### Seed helper

There is no existing seed helper for `ondata_playoff_*` in `tests/helpers/db.ts`. Add one that mirrors the style of the pool / pool-result helpers:

- accepts the competition, parent class name, bracket (`'A'` or `'B'`), and an ordered list of rounds where each round is an ordered list of matches
- inserts rows into `ondata_playoff_snapshots`, `ondata_playoff_snapshot_rounds`, `ondata_playoff_snapshot_matches`, and `ondata_playoff_status` (with `current_snapshot_id` pointing at the new snapshot)
- sets `summary_rounds`, `summary_matches`, `summary_completed_matches` consistent with the input
- returns the snapshot id so tests can assert against it if needed

Every test slug must start with the project-appropriate `test-` prefix (`test-player-*` for the public project) so the scoped cleanup still works.

### Cases

At minimum test:

1. No playoff data:
   - `Slutspel` tab is absent
   - existing `Spelare` / `Pooler` behavior is unchanged

2. A-bracket only:
   - `Slutspel` tab is visible
   - page defaults to `Slutspel`
   - round headings and match rows render in order

3. A + B brackets:
   - both sections render
   - A comes before B

4. Mixed played / unplayed rows:
   - completed rows show score
   - unplayed rows show `Ej spelad än`

5. Snapshot with only two opening-round matches:
   - UI renders only those rows
   - no inferred semifinal/final placeholders appear

6. Walkover:
   - `WO` renders correctly when result parsing marks a walkover

Use the public E2E patterns already established for the class page and live data.

---

## Manual test checklist

After implementation, verify manually:

1. Class with no playoff data still behaves exactly as today.
2. Class with playoff data defaults to the `Slutspel` tab.
3. Long full names fit without breaking the layout on mobile.
4. A-only playoff looks balanced without an empty B section.
5. A+B playoff remains readable on both mobile and desktop.
6. Snapshot rows are shown exactly as delivered, with no fabricated future rows.

---

## Decisions

1. **Playoff-without-pool-data is a real state.** Some classes run as pure playoff from the start and never have pool data. The public loader and `PublicClassContentTabs` must handle this: `getClassLiveData` returns `{ pools: [], playoff: ... }`, the `Slutspel` tab renders normally, and the `Pooler` tab is disabled (not hidden) — consistent with today's behavior for any class without pool data.

2. **Completed match with unparseable result.** Render the raw `result` string verbatim (trimmed). If `result` is also null or blank, fall back to `Ej spelad än`. See "Minimal state model for match rows".

3. **Winner emphasis.** Bold the winner's name when `is_completed` and `winner_name` matches one of the two participant names exactly (after trim). No other accent. See "Winner emphasis".

4. **Participant name rendering.** Render `player_a_name` / `player_b_name` verbatim. No attempt to detect placeholder/bye strings. If concrete examples of non-name strings surface in the live OnData feed later, we can add targeted test cases at that time.

## Future follow-ups

Possible later improvements, intentionally excluded from V1:

1. Desktop-specific wider playoff row layout
2. Public bracket tree visualization
3. Slot provenance in the upstream playoff model so the UI can safely show `Vinnare av ...` placeholders
4. Inline playoff content on other public surfaces beyond the dedicated class page

V1 should stay disciplined: a clear third tab, explicit round/match rows only, and no structural guesswork.