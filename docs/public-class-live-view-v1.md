# Public Class Live View V1

This document is the implementation handoff for the public class live view feature. It gives a new agent enough detail to implement the change without rediscovering the architecture.

---

## Background

Players and audience (parents, coaches) visiting the competition landing page can see classes grouped by session, with registration counts and availability. Once the competition is underway and the draw has been made, staff, players, and audience all want a quick answer to: "what does the draw look like for this class?"

This feature establishes the dedicated class page as the public class surface instead of routing class browsing through the search page.

The "Följ tävlingen live" card on the landing page (`src/app/[slug]/page.tsx:88-104`) is currently a disabled placeholder ("Kommer snart"). This feature delivers the first real content behind that promise.

---

## Scope

V1 includes:

- A dedicated public class page at `/{slug}/classes/{classId}` showing the class draw (pools + players)
- Inline expand on the landing-page class dashboard cards to preview pools without navigating away
- A shared data function and display component used by both surfaces
- A "Lottning klar" status pill on dashboard cards when pool data is available
- An "open in new tab" link on expanded dashboard cards to reach the dedicated class page
- E2E tests covering both the inline expand and the standalone class page

V1 does not include:

- Pool match results or standings
- Playoff draws or results
- Linking snapshot player names to local player records
- Any admin-side changes — status is driven entirely by OnData snapshot data
- Changes to player or club search behavior
- Fallback sections (registered-but-not-in-pool lists, reserve lists) on the class page

---

## Key design decisions

### Status is driven by OnData snapshot data, not workflow steps

The `class_workflow_steps.publish_pools` step is an internal secretariat checklist. The public "Lottning klar" status is derived purely from whether pool data exists in the current OnData snapshot for this class:

```
Current snapshot has pools for this class, with at least one player
  →  "Lottning klar"
Otherwise
  →  card behaves as today (availability pill, links to class page without pool content)
```

This reflects reality: the draw may land in the snapshot before or after the secretariat marks it done, due to latency in the pre-system. The snapshot is the only honest signal.

### One stable URL per class

The dashboard card always links to `/{slug}/classes/{classId}`. The page content adapts to the current state:

| State | Page content |
|---|---|
| No pool data in current snapshot | Registered players list + reserve list (what the class-search-results view shows today) |
| Pool data present | Status pill "Lottning klar" + pool grid with players |

This avoids broken bookmarks and shared links. Parents sharing "Anna spelar här" links in chats get a stable URL that always shows the most relevant view.

### Hybrid: inline expand on dashboard + dedicated class page

The primary browsing flow for parents/coaches on competition day is scanning across multiple classes. The dashboard supports this with inline expand — tap a card, see the pools without navigating away. Tap another card, the previous one collapses.

The dedicated class page exists as a deep-link target for shared/bookmarked URLs. Both render the same component.

### Extensible for future live data

The shared component and data function are designed as a general "class live view", not a pools-only view. When match results, standings, or playoff data arrive in future versions, they slot in as new sections within the same component — no changes to the shells or data loading plumbing.

---

## Data model

### No new tables

All pool data is already stored in the OnData integration snapshot tables:

- `ondata_integration_snapshot_classes` — class name, date, time
- `ondata_integration_snapshot_pools` — pool number, pool order, completed match count
- `ondata_integration_snapshot_players` — player name, club, order within pool
- `ondata_integration_snapshot_matches` — match number, player names, result

The current snapshot is identified via `ondata_integration_status.current_snapshot_id`.

### Class matching

OnData snapshot classes are linked to local `classes` rows by matching `ondata_integration_snapshot_classes.class_name` to `classes.name` within the same competition. Both originate from the same OnData source system (the registration import creates the local classes; the live sync later adds pool data under the same `class_name`).

The data function must join through: `ondata_integration_status` → `ondata_integration_snapshots` → `ondata_integration_snapshot_classes` (matched by `class_name` to the local class's `name`) → pools → players.

---

## Shared data function

### `getClassLiveData`

File: `src/lib/public-competition.ts` (add to the existing file alongside the other public data functions)

Signature:

```typescript
export interface ClassLivePool {
  poolNumber: number
  players: Array<{ name: string; club: string | null }>
}

export interface ClassLiveData {
  pools: ClassLivePool[]
}

export async function getClassLiveData(
  supabase: ServerClient,
  competitionId: string,
  classId: string,
): Promise<ClassLiveData | null>
```

Returns `null` when the competition has no current snapshot or the snapshot has no class matching this class's name.

Implementation:

1. Look up the class name from `classes` where `id = classId`.
2. Get `current_snapshot_id` from `ondata_integration_status` where `competition_id = competitionId`. If no row or `current_snapshot_id` is null, return `null`.
3. Find the `ondata_integration_snapshot_classes` row where `snapshot_id = current_snapshot_id` and `class_name = <class name from step 1>`. If not found, return `null`.
4. Query `ondata_integration_snapshot_pools` for this snapshot class, ordered by `pool_order`.
5. For each pool, query `ondata_integration_snapshot_players` ordered by `player_order`.
6. If there are zero pools or all pools have zero players, return `null`.
7. Return `{ pools: [...] }`.

Steps 4 and 5 can be combined into a single query with a join, or use Supabase's relation syntax if the FK relationships allow it.

### `getClassDashboardLiveStatus`

File: `src/lib/public-competition.ts`

This is a batch function for the dashboard — it needs to know which classes have pool data without loading full pool details for every class.

```typescript
export type ClassLiveStatus = 'none' | 'pools_available'

export async function getClassDashboardLiveStatus(
  supabase: ServerClient,
  competitionId: string,
): Promise<Map<string, ClassLiveStatus>>
```

Returns a map of `classId → status` for all classes in the competition.

Implementation:

1. Get `current_snapshot_id` from `ondata_integration_status`. If none, return empty map.
2. Query all `ondata_integration_snapshot_classes` for this snapshot. Get their `class_name` values.
3. For each snapshot class, check if it has at least one pool with at least one player. This can be done with a single query joining pools → players and grouping by snapshot class.
4. Load all local `classes` for this competition (via sessions). Match by `class_name`.
5. Build the map: classes with matching snapshot data that has pools+players → `'pools_available'`, all others → `'none'`.

This function is called once per dashboard render, alongside the existing `getClassDashboard()`.

---

## API route for lazy loading

### `GET /api/public/classes/[classId]/live`

File: `src/app/api/public/classes/[classId]/live/route.ts`

This is a public (unauthenticated) API route used by the dashboard's client-side expand.

Implementation:

1. Look up the class by `classId`. Join through `sessions` to get the `competition_id`. If the class doesn't exist or the competition is deleted, return 404.
2. Call `getClassLiveData(supabase, competitionId, classId)`.
3. If `null`, return `{ status: 'none', data: null }`.
4. Return `{ status: 'pools_available', data: { pools: [...] } }`.

Response shape:

```json
{
  "status": "pools_available",
  "data": {
    "pools": [
      {
        "poolNumber": 1,
        "players": [
          { "name": "Anna Andersson", "club": "BTK Mansen" },
          { "name": "Björn Berg", "club": "IFK Umeå" }
        ]
      }
    ]
  }
}
```

---

## Shared display component

### `ClassLiveView`

File: `src/components/ClassLiveView.tsx`

A pure display component. Takes pool data as props, renders the pool grid. No data fetching, no page or layout awareness.

```typescript
type ClassLiveViewProps = {
  pools: ClassLivePool[]
}
```

Layout:

- A grid of pool cards. On mobile: 1 column. On `sm`: 2 columns. On `lg`+: 3 columns (or 2 if pools are few — use `auto-fill` with `minmax`).
- Each pool card:
  - Heading: `Pool {poolNumber}`
  - Numbered player list: `1. Anna Andersson · BTK Mansen`
  - If `club` is null, show just the name without the dot separator.
- Style the cards consistently with the existing `app-card` / `app-card-soft` classes used elsewhere in the project.
- Keep it minimal — no extra badges, icons, or decorative elements. Follow the project convention: "UI should stay clean and simple."

This component renders pool sections today. Future versions will add sibling sections (match results, standings, playoffs) as new sub-components composed inside `ClassLiveView` — or the parent can compose them. The key constraint is that `ClassLiveView` receives typed data props and does no fetching.

---

## Dashboard changes

### File: `src/components/ClassDashboard.tsx`

The dashboard needs three changes:

#### 1. Accept live status data

The parent page (`src/app/[slug]/page.tsx`) calls `getClassDashboardLiveStatus()` alongside the existing `getClassDashboard()` and passes the status map as a new prop to `ClassDashboard`.

Add a new prop:

```typescript
type ClassDashboardProps = {
  sessions: ClassDashboardSession[]
  slug: string
  liveStatus: Map<string, ClassLiveStatus>  // classId → status
}
```

#### 2. Show "Lottning klar" status pill

In each class card, when `liveStatus.get(classEntry.id) === 'pools_available'`:

- Replace the `AvailabilityIndicator` with a "Lottning klar" pill (use a green-tinted variant of the existing pill styles, e.g. `app-pill-success` or a new small utility class).
- The card still links to `/{slug}/classes/{classId}`.

When the class has no live pool data, keep the existing availability indicator behavior unchanged.

#### 3. Inline expand with lazy-loaded pool view

Make each card expandable:

- On click, instead of navigating away, toggle an expand/collapse state for that card.
- When expanding, fetch `GET /api/public/classes/{classId}/live` client-side.
- While loading, show a small spinner or "Laddar..." text.
- Once loaded, render `ClassLiveView` inline below the card header.
- Show a small "open in new tab" link (use a small external-link icon or text like "Öppna") that opens `/{slug}/classes/{classId}` in a new tab (`target="_blank" rel="noopener"`).
- Only one card is expanded at a time — expanding a new card collapses the previous one (accordion behavior).
- If the API returns `status: 'none'`, show "Ingen lottning ännu" in a muted style.

This requires converting the card portion of `ClassDashboard` to a client component. Options:

**Option A (recommended):** Extract the card list into a new client component `ClassDashboardCards` that handles expand state and fetching. The session headings can stay in the server component parent, or the whole thing becomes a client component since it's small.

**Option B:** Keep the dashboard as a server component and add a separate client component `ClassDashboardCardExpander` that wraps each card and handles the expand.

Go with whichever feels simpler during implementation. The key constraint is: the initial render must be a server component (fast, no client JS for the initial class list), but the expand interaction needs client-side state.

#### 4. Update the card interaction

The dashboard card no longer routes through search. Its primary action is expand/collapse, and the navigation to `/{slug}/classes/{classId}` happens via the "open in new tab" link inside the expanded area.

So the card changes from a `<Link>` to a `<button>` (or clickable div) that toggles expand. The `<Link>` to the class page moves inside the expanded content.

---

## Dedicated class page

### Route: `/{slug}/classes/[classId]/page.tsx`

File: `src/app/[slug]/classes/[classId]/page.tsx`

A server component page.

Implementation:

1. Look up the competition by slug (reuse `getPublicCompetitionBySlug`).
2. Look up the class by `classId`. Join through sessions to verify it belongs to this competition. Also fetch session info (name, date) for the header.
3. If competition or class not found, show a not-found state.
4. Call `getClassLiveData(supabase, competitionId, classId)`.
5. Render:

```
┌──────────────────────────────────────────┐
│  ← Back to {competition name}            │  (link to /{slug})
│                                          │
│  {class name}                            │  (h1)
│  {session name} · {formatted start time} │  (muted subheading)
│                                          │
│  ┌──────────────────────────────────┐    │
│  │  [Lottning klar] pill            │    │  (only when pools present)
│  │                                  │    │
│  │  ClassLiveView (pool grid)       │    │
│  └──────────────────────────────────┘    │
│                                          │
│  OR if no live data:                     │
│                                          │
│  Registered players list + reserve list  │
│  (reuse existing PublicSearchClass       │
│   rendering logic — the player list      │
│   and reserve list from search results)  │
│                                          │
└──────────────────────────────────────────┘
```

For the "no live data" state: reuse the data loading from `searchClasses` in `src/lib/public-competition.ts` but refactored into a standalone function (e.g., `getPublicClassDetails(supabase, competitionId, classId)`). This avoids the text-search dependency. The rendering can reuse or adapt the class section from `PublicSearchResults.tsx`.

Use `app-shell` and `app-card` wrapper consistent with other public pages.

---

## Landing page changes

### File: `src/app/[slug]/page.tsx`

1. Import and call `getClassDashboardLiveStatus(supabase, competition.id)` alongside the existing `getClassDashboard` in the parallel `Promise.all`.
2. Pass the resulting map to `ClassDashboard` as a new `liveStatus` prop.
3. The "Följ tävlingen live" disabled placeholder card (lines 88-104) can remain for now — it refers to a broader live-following experience. Alternatively, remove it since class cards now link to live data directly. Use your judgment during implementation; either is acceptable.

---

## Swedish copy

| Key | Swedish |
|---|---|
| Status pill: draw available | Lottning klar |
| No draw yet (expanded card) | Ingen lottning ännu |
| Pool heading | Pool {number} |
| Open in new tab link | Öppna i ny flik |
| Back link on class page | Tillbaka till {competition name} |
| Loading state | Laddar... |
| Class not found | Klassen hittades inte |

---

## Test plan

### Test file: `tests/e2e/player/class-live-view.spec.ts`

Use slug prefix `test-player-clv-` for scoped cleanup.

### Seed helper

Add to `tests/helpers/db.ts`:

```typescript
async function seedCompetitionWithPools(supabase, slug, options): Promise<{
  competitionId: string
  classId: string
  classWithoutPoolsId: string
  // ... other IDs as needed
}>
```

This function must:

1. Create a competition, session, and two classes (one that will have pool data, one that won't).
2. Create an OnData integration snapshot for the competition.
3. Insert snapshot classes, pools, and players that match one of the local class names.
4. Set the snapshot as the current one in `ondata_integration_status`.

Use bcrypt cost 4 for speed. Slugs must start with `test-player-clv-`.

### Test cases

1. **Dashboard card shows "Lottning klar" pill** when class has pool data in the current snapshot.
2. **Dashboard card shows normal availability** when class has no pool data.
3. **Dashboard card expand shows pool grid** — click card, verify pool headings and player names appear inline.
4. **Dashboard card expand accordion** — expand one card, expand another, verify the first collapses.
5. **"Open in new tab" link** — verify the link exists, points to `/{slug}/classes/{classId}`, and has `target="_blank"`.
6. **Class page renders pool grid** — navigate directly to `/{slug}/classes/{classId}`, verify pool headings and player names.
7. **Class page without pool data** — navigate to the class that has no pools, verify it shows the registered players list instead.
8. **Class page not found** — navigate to a non-existent class ID, verify not-found state.

### Important: data-testid attributes

Add `data-testid` attributes for all test-relevant elements:

- `class-live-pill-{classId}` — the "Lottning klar" pill on dashboard cards
- `class-card-expand-{classId}` — the expandable card trigger
- `class-live-view` — the shared pool grid wrapper
- `class-live-pool-{poolNumber}` — individual pool card
- `class-live-open-tab` — the "open in new tab" link
- `class-page-header` — the class page header section
- `class-page-back-link` — the back navigation link

---

## Implementation order

1. **`getClassLiveData` + `getClassDashboardLiveStatus`** — shared data functions in `src/lib/public-competition.ts`. Test manually by checking the return values with a seeded snapshot.
2. **`ClassLiveView` component** — pure display, can be developed with hardcoded props.
3. **`/{slug}/classes/[classId]` page** — server component, uses `getClassLiveData` and renders `ClassLiveView`. Also handles the no-pool-data state with registered players.
4. **API route `/api/public/classes/[classId]/live`** — thin wrapper around `getClassLiveData`.
5. **Dashboard changes** — status pill, card link target change, inline expand with lazy loading.
6. **Landing page data loading** — add `getClassDashboardLiveStatus` call to `page.tsx`, pass to dashboard.
7. **E2E tests** — seed helper, all test cases.
8. **Build check** — run `npm run build` and fix any type errors before considering the work done.

---

## Files to create

| File | Purpose |
|---|---|
| `src/app/[slug]/classes/[classId]/page.tsx` | Dedicated public class page |
| `src/app/api/public/classes/[classId]/live/route.ts` | API for lazy-loading live data |
| `src/components/ClassLiveView.tsx` | Shared pool grid display component |
| `tests/e2e/player/class-live-view.spec.ts` | E2E tests |

## Files to modify

| File | Change |
|---|---|
| `src/lib/public-competition.ts` | Add `getClassLiveData`, `getClassDashboardLiveStatus`, `getPublicClassDetails` |
| `src/components/ClassDashboard.tsx` | Status pill, expand behavior, card link target |
| `src/app/[slug]/page.tsx` | Load live status, pass to dashboard |
| `tests/helpers/db.ts` | Add seed helper for competition with OnData pool data |
