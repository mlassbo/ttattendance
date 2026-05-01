# Class Start Readiness V1

This document is the implementation handoff for the **start-readiness strip** — a new section inside each class card on the admin dashboard that helps the secretariat decide whether to start the next class. The system surfaces signals (free tables, players still active in other classes); the secretariat keeps the decision.

It builds on:

- [secretariat-pool-progress-v1.md](./secretariat-pool-progress-v1.md) — the existing pool-play strip and the staleness-handling pattern this strip mirrors
- [secretariat-playoff-progress-v1.md](./secretariat-playoff-progress-v1.md) — the playoff progress strip and OnData-snapshot model for playoff matches
- [class-seeding-v1.md](./class-seeding-v1.md) — the `players_per_pool` setting that drives the table-demand estimate
- [class-dashboard-v1.md](./class-dashboard-v1.md) — the existing secretariat dashboard surface

Read those first for the surrounding architecture.

---

## Background

In session 1 the morning is empty: every class can start as soon as attendance is in. From session 2 onwards the venue is in motion — earlier classes may still be in pool play or playoffs and are competing for the same tables and the same players. A delayed final round of an earlier class can block the next class even though attendance is complete.

Today the admin dashboard answers "is this class's attendance complete?" but not "can we actually start it?". The decision is made by walking the hall and remembering who plays in what.

The data needed to make this decision is already in the system: pool tables are assigned per pool ([class_pool_tables](../supabase/migrations/20260429120000_add_class_pool_tables.sql)), pool match progress is in OnData snapshots, playoff pending-match counts are in `ondata_playoff_snapshot_matches`, and player registrations connect every player to every class they are in. The missing piece is the **venue capacity** — the total number of tables in the hall — and a UI surface that combines these into a single decision aid.

---

## Scope

V1 includes:

- A new `venue_table_count` column on `competitions`, editable from the super admin competition settings
- Making `players_per_pool` available (and required by the readiness strip) for **every** class, not only seeded classes
- A new "Redo att starta?" strip inside each class card on the admin dashboard, shown when the class is approaching its start time
- Two readiness signals on the strip:
  - tables required vs. free tables in the venue right now
  - players in this class who are still active in other running classes
- Reuse of the existing OnData-staleness pattern (soft 5–15 min caption, hard >15 min warning)
- E2E coverage for the main states (clear, table-constrained, player-overlap, stale-sync)

V1 does not include:

- Any new button or auto-decision. The strip is information-only; the existing workflow buttons stay unchanged.
- Per-session or per-venue capacity. One competition = one venue capacity number.
- A dashboard-level "tables in use" header. That was sketched (variant A in the design discussion) but is deferred to v2; v1 keeps everything in the class card.
- Per-match table assignment for playoff matches. Playoff demand is estimated from pending playoff matches (one match = one table).
- A visual table-grid view of the venue.
- Any alerting or push notification.

---

## Key design decisions

### The strip lives inside the class card, not as a top banner

Same reasoning as pool-progress v1: each class belongs in exactly one place on the dashboard. The readiness strip slots into the same vertical region as the pool-progress strip — between the card header and the workflow panel — and the two strips never appear at the same time (one shows during `attendance_complete..pool_draw_in_progress`, the other during `pool_play_in_progress..pool_play_complete`).

### Visibility window: T-30 min through pool draw, never during pool play

The strip is shown when **all** of the following hold:

- the class's attendance state is `attendance_complete` (no `awaiting_attendance` or `callout_needed`)
- the class's phase is one of `attendance_complete`, `seeding_in_progress`, or `pool_draw_in_progress`
- `now >= startTime - 30 min`

Once `publish_pools` is marked done the phase transitions to `pool_play_in_progress` and the pool-progress strip takes over. The readiness strip disappears.

The strip **does not** disappear when a class is late. If the start time has passed but `publish_pools` is still not done, the strip stays — that is exactly when the secretariat is most likely to look at it.

If attendance is not yet complete, the strip is not shown at all. The card shows attendance counts and the existing "ropa upp" workflow as today.

### Information only — no decision automation

The system never auto-starts a class. The Klar / Skippa buttons in the workflow panel are unchanged. The strip's job is to present the two gates (tables, player overlap) so the secretariat can decide in 5 seconds without walking the hall.

This matches the project principle from [CLAUDE.md](../CLAUDE.md): the system makes constraints visible, the human makes the call. It is also defensive: OnData snapshots can be stale, and the on-floor staff may have information the system does not.

### Tables required = `ceil(confirmed_players / players_per_pool)`

Per the user-confirmed rule. This is the same formula already used by [getEstimatedPoolCount()](../src/lib/class-seeding.ts) (one table per pool is the design assumption — `planned_tables_per_pool` is about pace inside an already-running pool, not parallelism at start time).

If `players_per_pool` is null, the "Kräver" line is hidden and a small "(antal spelare per pool saknas)" caption is shown instead. The free-tables line and player-overlap line still render normally so the strip remains useful.

V1 makes the super admin class settings UI show the `players_per_pool` field for **every** class (currently it is only meaningful for seeded classes). The DB column stays nullable so the migration is non-breaking; the change is purely UI + helper-text wording.

### Free tables = `venue_table_count − tables_in_use_across_running_classes`

`tables_in_use` is summed across all classes whose phase is "in motion" (see player-overlap section below for the exact phase set). For each such class:

- **Pool play in progress** (`pool_play_in_progress`): for each pool where `completed_match_count < total_matches`, count `class.planned_tables_per_pool` tables. Pools that are complete free their tables.
- **Pool draw / seeding** (`seeding_in_progress`, `pool_draw_in_progress`, `pool_play_complete`): tables are not yet held (or have just been released). Count zero.
- **Playoffs** (`a_playoff_in_progress`, `b_playoff_in_progress`, `playoffs_in_progress`): count `pending_playoff_matches` (matches in `ondata_playoff_snapshot_matches` for this class's current snapshot where `is_completed=false`). One table per pending match.
- **Other phases**: `publishing_pool_results`, `playoffs_complete`, `prize_ceremony_in_progress` — count zero.

If `venue_table_count` is null (not yet configured), the strip shows the **demand** ("Kräver 6 bord") and the **player-overlap** line, but suppresses the free-tables line and adds a single muted hint: `Sätt antal bord på tävlingen i superadmin för att se lediga bord.`

If OnData has never produced a snapshot for the competition (`lastSyncAt` is null), the free-tables number renders as `Lediga bord just nu: ?` with the soft staleness caption.

### Tables required is a planning estimate, not a hard cap

The strip never blocks. It just shows the numbers. If `Kräver 6` and `Lediga 4`, the strip shows the gap with a warning chip — but Klar is still clickable. The secretariat may know more than the system (e.g. one of the running pools is finishing in 30 seconds).

### Player overlap: phase-aware definition of "still active"

Whether a player is still active in another class depends on which phase that other class is in. The system already has the data to be precise about this once playoffs are drawn, so we should be:

| Phase of the other class | Which confirmed players are flagged as still active |
|---|---|
| `seeding_in_progress` | all confirmed |
| `pool_draw_in_progress` | all confirmed |
| `pool_play_in_progress` | all confirmed |
| `pool_play_complete` | all confirmed (playoffs are about to be drawn — anyone could still be in) |
| `publishing_pool_results` | all confirmed (same reason) |
| `a_playoff_in_progress` | only players whose name appears as `player_a_name` or `player_b_name` in any match in that class's current playoff snapshot where `is_completed = false` |
| `b_playoff_in_progress` | same rule, restricted to the B-bracket snapshot |
| `playoffs_in_progress` | union of the A and B rules above |
| `playoffs_complete`, `prize_ceremony_in_progress`, `finished` | nobody — class is winding down |

The phase-aware rule is the user-confirmed refinement: once playoffs are drawn, players who didn't qualify for either bracket (or who have lost out and have no pending matches) are free to start the next class. Before the draw, we have to assume anyone might still be playing.

Implementation note on snapshot matching: the playoff snapshot stores player names as text (`player_a_name`, `player_b_name`), not registration IDs. Matching to confirmed registrations is therefore name-based — same approach the existing public class live view already uses (see [public-competition.ts:818-904](../src/lib/public-competition.ts#L818-L904) for the established pattern). Trim and case-insensitively compare names; this is good enough for the secretariat-facing signal.

For each blocking player, show: name, club (if available), other class name, and that other class's phase label (e.g. "Slutspel pågår", "Poolspel pågår"). The phase label is high-signal because it tells the secretariat whether the wait is short — a class in `a_playoff_in_progress` could still take an hour, while one in `pool_play_complete` may release the player in a few minutes.

Sort blocking players alphabetically by name. If the list exceeds 8 players, show the first 8 and a "+N fler" caption.

When there are zero overlapping players, render `✓ Inga spelare aktiva i andra klasser` as a positive confirmation. Unlike the variant 2 sketch in the design discussion, the readiness strip always shows both lines (tables + overlap) because they are the actual gates — leaving them invisible on the happy path makes the strip jump in shape between classes.

### Staleness handling reuses the existing pattern

Same thresholds as pool-progress v1, applied to the same `last_sync_at` source (`ondata_integration_status.last_received_at`):

- < 5 min: nothing extra
- 5–15 min (soft): muted caption `Synkat från ondata HH:MM` at the bottom of the strip; the table number is prefixed with `ca`
- &gt; 15 min (hard): inline warning `OnData-sync har inte gått sedan HH:MM — antal lediga bord kan vara inaktuellt.` and the table number renders as `ca ?`

The `ca` prefix is always present on the table number (even when fresh) because `tables_in_use` is computed from snapshots that are at most one sync interval old by definition. This is honest about the precision of the number and was a deliberate choice in the design discussion.

### Class-level data is enough; no per-pool readiness signal

Pools are an internal detail of a running class; the readiness strip only cares about aggregates (tables held by class X, players still active in class X). There is no per-pool row inside the readiness strip.

---

## UX

### Class card — clear case

```
┌──────────────────────────────────────────────┐
│ [Närvaro klar]              Visa detaljer ▸  │
│ Damer B · Start 11:00                        │
│                                              │
│ ┌─ Redo att starta? ──────────────────────┐  │
│ │  Kräver 4 bord                          │  │
│ │  Lediga bord just nu: ca 8 st           │  │
│ │                                         │  │
│ │  ✓ Inga spelare aktiva i andra klasser  │  │
│ └─────────────────────────────────────────┘  │
│                                              │
│ ┌─ Sekretariat ──────────────────────────┐   │
│ │  Seeda klass                           │   │
│ │  [ Klar ]  [ Skippa ]                  │   │
│ └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### Class card — blocked case

```
┌──────────────────────────────────────────────┐
│ [Närvaro klar]              Visa detaljer ▸  │
│ Herrar B · Start 11:00                       │
│                                              │
│ ┌─ Redo att starta? ──────────────────────┐  │
│ │  Kräver 6 bord                          │  │
│ │  Lediga bord just nu: ca 4 st           │  │
│ │                                         │  │
│ │  ⚠ 2 spelare aktiva i andra klasser:    │  │
│ │     · Erik Svensson (Max 750)           │  │
│ │       — Herrar A, slutspel pågår        │  │
│ │     · Anna Berg (BTK Centrum)           │  │
│ │       — Herrar A, slutspel pågår        │  │
│ └─────────────────────────────────────────┘  │
│                                              │
│ ┌─ Sekretariat ──────────────────────────┐   │
│ │  Seeda klass                           │   │
│ │  [ Klar ]  [ Skippa ]                  │   │
│ └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### Class card — soft staleness

```
│ ┌─ Redo att starta? ──────────────────────┐  │
│ │  Kräver 6 bord                          │  │
│ │  Lediga bord just nu: ca 8 st           │  │
│ │                                         │  │
│ │  ✓ Inga spelare aktiva i andra klasser  │  │
│ │                                         │  │
│ │  Synkat från ondata 09:38               │  │
│ └─────────────────────────────────────────┘  │
```

### Class card — hard staleness

```
│ ┌─ Redo att starta? ──────────────────────┐  │
│ │  Kräver 6 bord                          │  │
│ │  Lediga bord just nu: ca ?              │  │
│ │                                         │  │
│ │  ✓ Inga spelare aktiva i andra klasser  │  │
│ │                                         │  │
│ │  ⚠ OnData-sync har inte gått sedan      │  │
│ │     09:18 — antal lediga bord kan vara  │  │
│ │     inaktuellt.                         │  │
│ └─────────────────────────────────────────┘  │
```

### Class card — no `venue_table_count` configured

```
│ ┌─ Redo att starta? ──────────────────────┐  │
│ │  Kräver 6 bord                          │  │
│ │  Sätt antal bord på tävlingen i         │  │
│ │  superadmin för att se lediga bord.     │  │
│ │                                         │  │
│ │  ⚠ 2 spelare aktiva i andra klasser:    │  │
│ │     · Erik Svensson — Herrar A,         │  │
│ │       slutspel pågår                    │  │
│ │     ...                                 │  │
│ └─────────────────────────────────────────┘  │
```

### Class card — `players_per_pool` not set

The "Kräver X bord" line is replaced with `(antal spelare per pool saknas)`. Free tables and player overlap render normally.

### Other phases

When the class is in `awaiting_attendance`, `callout_needed`, `pool_play_in_progress`, or any later phase, the readiness strip is not rendered. Cards in those phases keep their existing behavior (attendance counts, pool-progress strip, etc.).

### Auto-refresh

No changes. The dashboard's existing 30 s interval picks up new snapshots and re-renders the strip. Time-based gating (the T-30 min visibility check) re-evaluates on every render, so a strip that was hidden becomes visible automatically as the start time approaches.

---

## Algorithm

```
Constants:
  EARLY_WINDOW_MIN  = 30   // strip becomes visible at T-30 min
  SYNC_SOFT_MIN     = 5
  SYNC_HARD_MIN     = 15
  OVERLAP_LIST_LIMIT = 8

Inputs at the dashboard level (per render):
  competition.venue_table_count            (int | null)
  classes[]    with phase, startTime, plannedTablesPerPool, confirmed players, registrations
  pool_progress per class (existing)
  playoff_progress per class (existing) — pending matches per bracket
  last_sync_at (existing, from ondata_integration_status)
  now

Visibility (per class):
  visible = attendance_state == 'attendance_complete'
         && phase ∈ {'attendance_complete', 'seeding_in_progress', 'pool_draw_in_progress'}
         && now >= startTime - EARLY_WINDOW_MIN

Tables required (per class):
  if class.players_per_pool is null:
    tables_required = null
  else:
    tables_required = ceil(class.confirmed / class.players_per_pool)

Tables in use across the venue:
  // Phases in which a class can hold tables. Ceremony / playoffs-complete are excluded
  // because the class is winding down and holds nothing.
  table_holding_phases = {
    'seeding_in_progress',     // 0 tables
    'pool_draw_in_progress',   // 0 tables
    'pool_play_in_progress',   // sum of planned_tables_per_pool over incomplete pools
    'pool_play_complete',      // 0 tables (transient gap before playoffs)
    'publishing_pool_results', // 0 tables
    'a_playoff_in_progress',   // 1 per pending playoff match (A bracket)
    'b_playoff_in_progress',   // 1 per pending playoff match (B bracket)
    'playoffs_in_progress'     // 1 per pending playoff match (sum across A+B)
  }

  tables_in_use = 0
  for each class c with phase ∈ table_holding_phases:
    if c.phase == 'pool_play_in_progress':
      for pool in c.pool_progress.pools:
        if pool.completedMatchCount < pool.totalMatches:
          tables_in_use += c.plannedTablesPerPool
    elif c.phase ∈ {'a_playoff_in_progress', 'b_playoff_in_progress', 'playoffs_in_progress'}:
      tables_in_use += pending_playoff_matches(c)   // count of matches with is_completed=false in current snapshot

Free tables:
  if competition.venue_table_count is null:
    free_tables = null
  else:
    free_tables = max(0, competition.venue_table_count - tables_in_use)

Player overlap (per upcoming class u):
  u_confirmed_names = { normalize(reg.player.name) for reg in u.registrations
                        where attendance == 'confirmed' }

  // Phase → which players in the other class count as "still active"
  function active_player_names_in(other_class o):
    if o.phase ∈ {'seeding_in_progress', 'pool_draw_in_progress',
                  'pool_play_in_progress', 'pool_play_complete',
                  'publishing_pool_results'}:
      // pre-playoff or pool play: every confirmed player is potentially busy
      return { normalize(reg.player.name) for reg in o.registrations
               where attendance == 'confirmed' }

    if o.phase ∈ {'a_playoff_in_progress', 'b_playoff_in_progress',
                  'playoffs_in_progress'}:
      // playoffs drawn: only players in pending playoff matches are busy
      pending = ondata_playoff_snapshot_matches for o.current_snapshot
                where is_completed = false
      // Restrict to A-only or B-only when the phase is bracket-specific.
      // If the phase is generic 'playoffs_in_progress', include both brackets.
      return { normalize(m.player_a_name), normalize(m.player_b_name)
               for m in pending }

    // playoffs_complete, prize_ceremony_in_progress, finished, attendance_*:
    // class is not constraining anyone
    return ∅

  blocking = []
  for each other class o where o.id != u.id:
    active_names = active_player_names_in(o)
    overlap = u_confirmed_names ∩ active_names
    for name in overlap:
      blocking.append({
        playerName, playerClub,         // from u's registration row (we already have the club)
        otherClassId, otherClassName,
        otherPhaseKey, otherPhaseLabel
      })

  // De-dup by player name; if a player is "still active" in multiple other classes,
  // surface the one with the earliest phase (worst case for the secretariat).

  blocking.sort(by player name)

Sync staleness (existing pattern; reused as-is):
  age_min = (now - last_sync_at) / 60_000
  level = age_min < SYNC_SOFT_MIN  ? 'fresh'
        : age_min < SYNC_HARD_MIN  ? 'soft'
        :                            'hard'
```

Notes:

- All computation runs on the client per render, mirroring the pool-progress and playoff-progress pattern. The API just supplies the raw inputs (existing `poolProgress`, existing `playoffProgress`, plus a new top-level `venueTableCount`).
- Player overlap needs `player_id` per registration — the existing `/api/admin/sessions` route returns `players(name, club)` but not the player ID. The route needs to be extended (see implementation plan).
- Pending playoff matches per class are already computed for the playoff progress strip; the same payload (`totalMatches - completedMatches` summed across A and B) gives the "tables in use" estimate for that class.

---

## Implementation plan

Work proceeds in seven stages. Each stage should leave the dashboard usable.

### Stage 1 — DB migration

**Files:** new `supabase/migrations/<timestamp>_add_competition_venue_table_count.sql`.

```sql
alter table competitions
  add column venue_table_count int;

alter table competitions
  add constraint competitions_venue_table_count_positive
  check (venue_table_count is null or venue_table_count >= 1);
```

No backfill. Existing competitions have `null` until configured. The strip degrades gracefully (see UX).

No change to `players_per_pool` schema. The column already exists and is nullable; v1 only changes the super admin UI to expose it for non-seeded classes too.

### Stage 2 — Super admin: venue capacity field

There is no general competition-level settings page today. The per-competition surface only has two tabs (`Integration` and `Klasser` — see [CompetitionSettingsTabs.tsx](../src/app/super/competitions/%5BcompetitionId%5D/CompetitionSettingsTabs.tsx)). The venue capacity field is the first competition-level setting that needs its own home, so v1 introduces a new tab.

**Files:**

- [src/app/super/competitions/[competitionId]/CompetitionSettingsTabs.tsx](../src/app/super/competitions/%5BcompetitionId%5D/CompetitionSettingsTabs.tsx) — add a new `Tävling` tab as the first entry in the `tabs` array, segment `'venue'` (or `'settings'` if a more generic name is preferred for future use).
- New `src/app/super/competitions/[competitionId]/venue/page.tsx` — a server component that loads the competition row (id, venue_table_count) and renders a small client form for editing venue capacity. Follow the layout patterns used by the existing `integration/page.tsx` and `classes/page.tsx`.
- New client component, e.g. `src/app/super/competitions/[competitionId]/venue/VenueSettingsView.tsx` — single numeric field with the same inline-save / debounced-save pattern used by `Antal bord per pool` and `Max spelare` in [ClassSettingsView.tsx](../src/app/super/competitions/%5BcompetitionId%5D/classes/ClassSettingsView.tsx). Save on blur or after a 450 ms idle (match the existing constant).
- [src/app/super/competitions/[competitionId]/layout.tsx](../src/app/super/competitions/%5BcompetitionId%5D/layout.tsx) — the layout's `competitions` select currently reads only `id, name, slug`. No change needed here unless a child page wants a shared loader.
- [src/app/api/super/competitions/[competitionId]/route.ts](../src/app/api/super/competitions/%5BcompetitionId%5D/route.ts) — extend the existing PATCH route. Today it accepts only `showOnLandingPage`. Update it to:
  - parse the body once, extract both `showOnLandingPage` and `venueTableCount`,
  - validate each independently (`showOnLandingPage`: boolean if present; `venueTableCount`: `null` or positive integer if present),
  - require at least one recognized field,
  - update only the fields that were provided,
  - return the updated row including the new field.
- A new `GET` handler may be added to the same route to fetch the current `venue_table_count` for the venue page, or the page can read directly via the server Supabase client (preferred — matches how `integration/page.tsx` already loads data).

Field label: `Antal bord i hallen` (placeholder: `T.ex. 22`). Helper caption under the field: `Används av sekretariatet för att se hur många bord som är lediga inför att en klass startas.`

Validation: positive integer, or empty (clears to `null`).

E2E coverage for stage 2 — see Stage 7 below; add to a new file under `tests/e2e/superadmin/`.

Routing note: when adding a new tab, double-check the `isActive` check in `CompetitionSettingsTabs` (`pathname.endsWith(`/${tab.segment}`)`). The new tab segment must not collide with any existing route segment under `[competitionId]/`.

### Stage 3 — Super admin: expose `players_per_pool` for non-seeded classes

**Files:**

- [src/app/super/competitions/[competitionId]/classes/ClassSettingsView.tsx](../src/app/super/competitions/%5BcompetitionId%5D/classes/ClassSettingsView.tsx)

Change: render the `Antal spelare per pool` field unconditionally, not only when `Seedning` is on. When seeding is off, the field still saves to the same `players_per_pool` column.

The existing `ClassWorkflowConfig.playersPerPool` flow already passes the value through; nothing else needs to change.

Copy: keep the existing label `Antal spelare per pool`. Optionally add a small caption when `Seedning` is off: `Används också för att uppskatta antal bord som klassen behöver vid start.`

### Stage 4 — Backend: readiness computation utility

**Files:** new `src/lib/start-readiness.ts`.

Pure functions, no React, server-safe:

- `computeStartReadinessVisibility({ phase, attendanceState, startTime, now }) → boolean`
- `computeTablesRequired({ confirmed, playersPerPool }) → number | null`
- `computeTablesInUse({ classes, poolProgressByClassId, playoffProgressByClassId }) → number` — sums across all `in_motion_phases` per the algorithm above
- `computePlayerOverlap({ upcomingClass, otherClasses, registrationsByClassId }) → Array<{ playerName, playerClub, otherClassId, otherClassName, otherPhaseKey, otherPhaseLabel }>`
- `computeStartReadiness({ class, confirmedRegistrations, allClasses, venueTableCount, lastSyncAt, now }) → ClassStartReadiness`

The `ClassStartReadiness` type is the strip's render input:

```ts
type ClassStartReadiness = {
  visible: boolean
  tablesRequired: number | null  // null when players_per_pool missing
  tablesInUse: number            // for the venue
  freeTables: number | null      // null when venue_table_count missing
  syncLevel: 'fresh' | 'soft' | 'hard' | 'awaiting_data'
  syncLastAt: string | null
  blockingPlayers: Array<{
    playerName: string
    playerClub: string | null
    otherClassId: string
    otherClassName: string
    otherPhaseKey: ClassWorkflowPhaseKey
    otherPhaseLabel: string
  }>
  blockingPlayersTruncated: number  // 0 unless >OVERLAP_LIST_LIMIT
}
```

Unit-testable in isolation. Mirror the structure of [src/lib/pool-delay.ts](../src/lib/pool-delay.ts).

### Stage 5 — API: extend `/api/admin/sessions`

**Files:** [src/app/api/admin/sessions/route.ts](../src/app/api/admin/sessions/route.ts).

Changes:

1. Read `venue_table_count` on the competitions select (already loaded indirectly via `auth.competitionId`; add a small `.from('competitions').select('venue_table_count').eq('id', auth.competitionId).single()` query, or extend an existing competitions read if there is one).
2. Include `players(id, name, club)` in the registrations select instead of just `players(name, club)` so overlap detection can de-dup by `player_id`.
3. Add to the top-level response: `venueTableCount: number | null`.
4. Compute readiness server-side (preferred) so the API response is the single source of truth, OR pass enough raw data for the client to compute. **Recommendation: compute server-side**, because the input data (cross-class registrations, pool progress, playoff progress) is already assembled there and computing on the server avoids shipping cross-class registration lists down to the client.
5. Add per class: `startReadiness: ClassStartReadiness | null`. `null` when the strip should not be rendered (visibility = false). When `visible=true` but data is missing, return the structure with `tablesRequired=null` etc. so the client can render the degraded variants.

Implementation note: visibility depends on `now`, which the server already passes to `getClassWorkflowSummaryMap`. Keep visibility server-side as well so the UI does not have to re-derive phase-based gating.

### Stage 6 — UI: `StartReadinessStrip` component

**Files:** new `src/app/[slug]/admin/dashboard/StartReadinessStrip.tsx`, plus changes to [AdminDashboard.tsx](../src/app/%5Bslug%5D/admin/dashboard/AdminDashboard.tsx).

In `AdminDashboard.tsx`:

- Extend `ClassSummary` with `startReadiness: ClassStartReadiness | null`.
- Render `<StartReadinessStrip />` between the header and the workflow panel, gated on `cls.startReadiness && cls.startReadiness.visible`.
- It must NOT render at the same time as `<PoolProgressStrip />` or `<PlayoffProgressStrip />`. The phase-based visibility gates already make this true; verify.

In `StartReadinessStrip.tsx`:

- Reuse Tailwind tokens from the existing strips (`app-pill-warning`, `app-banner-warning`, etc.) — no new design primitives.
- Render the four UI variants (clear / blocked / soft-stale / hard-stale / no-venue-cap / no-players-per-pool) per the wireframes above.
- All copy in Swedish.
- `data-testid` hooks:
  - `start-readiness-strip-{classId}` on the root container
  - `start-readiness-tables-required-{classId}` on the "Kräver" line
  - `start-readiness-tables-free-{classId}` on the "Lediga" line
  - `start-readiness-overlap-summary-{classId}` on the overlap header line (✓ or ⚠)
  - `start-readiness-overlap-player-{classId}-{index}` on each blocking-player row
  - `start-readiness-overlap-truncated-{classId}` on the "+N fler" caption
  - `start-readiness-sync-soft-{classId}` and `start-readiness-sync-hard-{classId}`
  - `start-readiness-no-venue-cap-{classId}` on the venue-capacity hint
  - `start-readiness-no-players-per-pool-{classId}` on the missing-config caption

### Stage 7 — E2E tests

**Files:** new `tests/e2e/admin/start-readiness.spec.ts` under the admin project (slug prefix `test-admin-readiness-`).

Seed helper additions in [tests/helpers/db.ts](../tests/helpers/db.ts):

- Extend the existing `seedCompetition*` helper to accept `venueTableCount`.
- Extend (or add a new) class seed that lets a test set `players_per_pool` independently of `has_seeding`.
- Add `seedClassWorkflowState({ classId, phase })` if one does not already exist, so a test can put a class in any of the in-motion phases without driving the workflow API end-to-end. Mark workflow steps directly: `publish_pools=done` for `pool_play_in_progress`, etc.

Test scenarios:

1. **Strip is hidden when attendance is not complete** — class with `noResponse > 0`, no strip rendered.
2. **Strip is hidden before T-30 min** — class with `attendance_complete` but `startTime` 45 min away. No strip.
3. **Strip is shown at T-30 min** — class with `attendance_complete`, `startTime` 25 min away. Strip rendered.
4. **Strip stays after late start** — class start time 15 min in the past, still in `pool_draw_in_progress`. Strip rendered.
5. **Strip disappears after pool draw published** — `publish_pools` done, phase = `pool_play_in_progress`. No readiness strip; pool progress strip is rendered instead.
6. **Clear case** — venue 22 tables, no other classes in motion. `Kräver X bord` shown, `Lediga bord just nu: ca 22 st`, `✓ Inga spelare aktiva i andra klasser`.
7. **Tables held by a running pool** — another class in `pool_play_in_progress` with one incomplete pool of `planned_tables_per_pool=2`. The upcoming class shows `Lediga bord just nu: ca 20 st`.
8. **Tables held by playoffs** — another class in `a_playoff_in_progress` with 3 pending playoff matches. Upcoming class shows free = venue − 3.
9. **Player overlap — pool play** — a confirmed player in the upcoming class is also confirmed in another class that is in `pool_play_in_progress`. Strip shows ⚠ with name + other class + phase label. Verify alphabetical order with multiple overlaps.
10. **Player overlap — playoff drawn, player still in** — another class in `a_playoff_in_progress`. The shared player's name appears in a pending playoff match (`is_completed = false`) in that class's snapshot. Strip flags them.
11. **Player overlap — playoff drawn, player out** — another class in `a_playoff_in_progress`, but the shared player did NOT qualify for the bracket (their name is not in any playoff snapshot match). Strip shows ✓ — the player is free.
12. **Player overlap — playoff drawn, player eliminated** — another class in `a_playoff_in_progress`, the shared player was in the snapshot but their only match has `is_completed = true` (they lost). Strip shows ✓ — they have no pending matches.
13. **Player overlap — class winding down** — another class in `playoffs_complete` or `prize_ceremony_in_progress`. Even though the shared player was in playoffs, the strip shows ✓ — that class is no longer constraining anyone.
14. **Player overlap truncation** — 10 overlapping players. First 8 listed, "+2 fler" caption.
15. **No venue capacity configured** — strip shows the demand and the `Sätt antal bord…` hint instead of free tables.
16. **No players_per_pool** — strip shows `(antal spelare per pool saknas)` instead of demand. Free tables and overlap render normally.
17. **Soft sync staleness (8 min)** — `Synkat från ondata HH:MM` caption present. `ca` prefix.
18. **Hard sync staleness (20 min)** — strong inline warning, `Lediga bord just nu: ca ?`.
19. **Auth gate** — unauthenticated request to dashboard is redirected per the existing pattern. (Already covered for the dashboard generally; just confirm the new strip does not weaken any check.)

Add separately to `tests/e2e/superadmin/competition-venue-settings.spec.ts`:

20. **Auth gate** for the new `Tävling` tab.
21. **Venue capacity persists** — set 22, reload, value still shown.
22. **Clearing venue capacity** — empty input clears back to null.
23. **Validation** — non-numeric or zero/negative input is rejected with an inline error.

Use `npm run test:e2e:agent` for agent-driven runs.

### Stage 8 — Manual dev seed data

**Files:** [scripts/prepare-dev-competition.ts](../scripts/prepare-dev-competition.ts), [scripts/fixtures/manual-competition.json](../scripts/fixtures/manual-competition.json).

Extend the manual fixture so the dashboard renders at least:

- one class in the `T-30 → start` window with the clear case
- one class in the same window with a player-overlap warning (i.e. seed a running class that shares at least one confirmed player)
- one class in the same window where venue capacity is intentionally tight (e.g. set venue to a low number so `Lediga` < `Kräver`)

Set `venue_table_count` on the manual fixture competition so the configured-capacity path is the default. The no-venue-cap and no-players-per-pool paths can stay E2E-only.

---

## Data & schema impact

New schema:

- `competitions.venue_table_count int null` (with positive-int check)

No other schema changes. V1 reads from existing tables:

- `class_pool_tables` for per-pool table assignments (already used by the dashboard)
- `ondata_integration_snapshot_pools.completed_match_count` and `..._players` for pool match progress (already used)
- `ondata_playoff_snapshot_matches.is_completed` for playoff pending counts (already used by [playoff progress](./secretariat-playoff-progress-v1.md))
- `registrations` + `attendance` + `players` for confirmed-players-per-class (already used)
- `class_workflow_steps` (already used by `class-workflow.ts`)

If later we want to persist a derived "free tables" history for post-event reporting, that is a v2 concern.

---

## Open questions for v2

- **Dashboard-level "tables in use" header.** Variant A from the design discussion (always-visible top strip) was deferred. If the secretariat asks for an at-a-glance view that does not require opening every upcoming class, this is the natural next step. The data is identical; only the surface is different.
- **Per-session venue capacity.** If a competition uses different halls on different days, `venue_table_count` would need to live on `sessions` instead of `competitions`. Defer until a real case appears.
- **Recovering / forecasting.** The strip says "you may have to wait" but does not estimate how long. Pairing with the existing pool-progress delay-min could give a "ETA: ~10 min" hint. Out of scope for v1.
- **Per-match table assignment for playoffs.** Today playoff matches are not assigned to specific tables. If they were, the strip could be exact about which tables are held and which are free. The current "1 pending match = 1 table" estimate is conservative and adequate.
- **Notify the secretariat when a blocking class transitions to finished.** A push-style hint ("Herrar A har nu klarat slutspelet — Herrar B kan startas") would close the loop, but the existing 30 s auto-refresh probably catches it without ceremony. Revisit if real feedback says otherwise.
