# Class Dashboard V1

This document is the implementation handoff for the class availability dashboard feature. It gives a new agent enough detail to implement the change without rediscovering the architecture.

---

## Background

Players visiting the competition landing page today see only a search box and a link to the secretariat. They have no way to get an overview of which classes exist, when they start, or whether there is space left.

Secretariat staff face the same gap from the other direction: before promoting a player from the reserve list to registered, they need to know if there is actually room in the class. Currently they must navigate to each class attendance view individually to check counts.

Both needs are served by a class availability dashboard placed prominently on the public competition landing page. No separate admin view is required — the same data answers both questions.

---

## Scope

- Add a `max_players` capacity field to classes, editable in the superadmin class settings UI
- Display a class dashboard section on the public competition landing page showing all classes grouped by session, with start time, registered count vs. capacity, and waiting list depth per class
- Each class row is a link into the existing public search so the user can drill into the roster

**Out of scope:**
- Enforcing capacity limits (blocking registrations when full)
- Automatic notifications when a spot opens
- Player self-service waiting list registration
- Any new admin-only view — the public dashboard is sufficient for the secretariat's admission check

---

## Data Model

### Migration

Create `supabase/migrations/20260412000000_add_class_max_players.sql`:

```sql
ALTER TABLE classes ADD COLUMN max_players INT;
```

`NULL` means no capacity limit has been configured for that class. It is not treated as zero or infinite — the UI shows a dash (`–`) to make clear the value is unset rather than pretending capacity is unlimited.

---

## Superadmin: max_players in class settings

### API changes

#### `GET /api/super/competitions/[competitionId]/classes`

File: `src/app/api/super/competitions/[competitionId]/classes/route.ts`

The existing query at line 40 selects `id, session_id, name, start_time, attendance_deadline`. Add `max_players` to the select.

The existing mapping at line 55 builds the response object. Add `maxPlayers: c.max_players` to each class entry.

Updated response shape per class:

```json
{
  "id": "uuid",
  "name": "Herrar A",
  "startTime": "2025-03-15T09:00:00Z",
  "attendanceDeadline": "2025-03-15T08:15:00Z",
  "maxPlayers": 16
}
```

#### `PATCH /api/super/competitions/[competitionId]/classes/[classId]`

File: `src/app/api/super/competitions/[competitionId]/classes/[classId]/route.ts`

**Request body** — add `maxPlayers` as an optional field alongside the existing `attendanceDeadline` and `sessionId`:

```json
{
  "maxPlayers": 16
}
```

`maxPlayers` may be a positive integer or `null` (clears the limit).

**Validation:**
- If `maxPlayers` is present and not `null`, it must be a positive integer (`Number.isInteger(v) && v > 0`).
- The existing check at line 20 rejects requests with no recognized fields — extend it to also accept `maxPlayers`.

**Update logic:** Add to the `updates` object:
```typescript
if ('maxPlayers' in body) {
  if (body.maxPlayers !== null && (!Number.isInteger(body.maxPlayers) || body.maxPlayers <= 0)) {
    return NextResponse.json({ error: 'Max spelare måste vara ett positivt heltal' }, { status: 400 })
  }
  updates.max_players = body.maxPlayers  // null clears it
}
```

The `updates` object type needs to be widened from `Record<string, string>` to `Record<string, string | number | null>`.

**Response:** Extend the `.select()` at line 85 to include `max_players` and add `maxPlayers: updated.max_players` to the returned object.

### UI changes — ClassSettingsView

File: `src/app/super/competitions/[competitionId]/classes/ClassSettingsView.tsx`

**Type change:** Add `maxPlayers: number | null` to `ClassData` (line 8).

**Table:** Add a fifth column **Max spelare** after the existing four (`Klass`, `Starttid`, `Anmälningsstopp`, `Pass`).

**Inline editing pattern** — same as the deadline column (click to edit, save/cancel):
- Display: show the value as a plain number, or `–` if `null`
- Clicking opens a number `<input>` pre-filled with the current value (or empty if null), with `min="1"` and `step="1"`
- Save / Avbryt buttons next to the input
- Clearing the input and saving sets `maxPlayers: null`
- Client-side validation: reject non-positive values before submitting
- On save: call `PATCH` with `{ maxPlayers: value }`, update local state, close input
- On error: show inline error, keep input open

**State additions** (follow the `editingDeadline` pattern):
```typescript
type EditingMaxPlayers = { classId: string; value: string }
const [editingMaxPlayers, setEditingMaxPlayers] = useState<EditingMaxPlayers | null>(null)
const [maxPlayersError, setMaxPlayersError] = useState('')
const [savingMaxPlayers, setSavingMaxPlayers] = useState(false)
```

---

## Public data query

Add a new exported function to `src/lib/public-competition.ts`:

```typescript
export interface ClassDashboardSession {
  id: string
  name: string
  date: string
  sessionOrder: number
  classes: ClassDashboardEntry[]
}

export interface ClassDashboardEntry {
  id: string
  name: string
  startTime: string
  maxPlayers: number | null
  registeredCount: number
  reserveCount: number
}

export async function getClassDashboard(
  supabase: ServerClient,
  competitionId: string,
): Promise<ClassDashboardSession[]>
```

**Query strategy:** Fetch sessions, then fetch classes with `max_players`, then fetch registration counts grouped by class ID in two passes (one for `status = 'registered'`, one for `status = 'reserve'`). Aggregate in TypeScript — avoids a raw SQL RPC and stays consistent with the existing query patterns in the file.

Alternatively, fetch all registrations for the competition and count in memory — the number of registrations across all classes for one competition is small enough that this is fine.

**Ordering:** sessions by `date` then `session_order`; classes within a session by `start_time`.

---

## ClassDashboard component

New file: `src/components/ClassDashboard.tsx`

Server component (no `'use client'`). Receives `sessions: ClassDashboardSession[]` and `slug: string` as props.

### Session heading format

Use the same `formatSessionHeading(date, name)` logic already in `ClassSettingsView.tsx` (line 49):

```typescript
function formatSessionHeading(date: string, sessionName: string): string {
  const weekday = format(fromDateString(date), 'EEE', { locale: sv })
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} - ${sessionName}`
}
```

This produces "Lör - Pass 1", "Sön - Pass 2", etc.

### Layout

One `app-card-soft` wrapping all sessions, with a divider between sessions. Each class is a single row.

```tsx
<section className="app-card-soft">
  {sessions.map((session, i) => (
    <div key={session.id}>
      {i > 0 && <hr className="border-line/60" />}
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted pt-4 pb-2 first:pt-0">
        {formatSessionHeading(session.date, session.name)}
      </p>
      <ul className="space-y-0">
        {session.classes.map(cls => (
          <li key={cls.id}>
            <a
              href={`/${slug}/search?q=${encodeURIComponent(cls.name)}`}
              className="flex items-center justify-between gap-4 rounded-xl px-2 py-2 hover:bg-brand-soft/40 transition-colors"
            >
              <div className="flex items-baseline gap-3 min-w-0">
                <span className="font-medium text-ink truncate">{cls.name}</span>
                <span className="text-xs text-muted tabular-nums shrink-0">
                  {formatTime(cls.startTime)}
                </span>
              </div>
              <AvailabilityIndicator entry={cls} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  ))}
</section>
```

### AvailabilityIndicator

A small inline component (can live in the same file) that renders the right-aligned status for a class:

| Condition | Rendered output |
|---|---|
| `maxPlayers` is null | `<span class="text-xs text-muted">–</span>` |
| `registeredCount < maxPlayers` and `spotsLeft > 2` | `<span class="text-xs text-muted">{spotsLeft} platser kvar</span>` |
| `registeredCount < maxPlayers` and `spotsLeft = 1` | `<span class="app-pill-warning">1 plats kvar</span>` |
| `registeredCount < maxPlayers` and `spotsLeft = 2` | `<span class="app-pill-warning">2 platser kvar</span>` |
| `registeredCount >= maxPlayers` and `reserveCount = 0` | `<span class="app-pill-muted">Fullbokat</span>` |
| `registeredCount >= maxPlayers` and `reserveCount > 0` | `<span class="app-pill-muted">Fullbokat</span><span class="text-xs text-muted ml-2">· {reserveCount} på lista</span>` |

`spotsLeft = maxPlayers - registeredCount`

### Time format helper

Format `startTime` (ISO string) as a short time in Europe/Stockholm:

```typescript
function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Stockholm',
  }).format(new Date(iso))
}
```

---

## Landing page integration

File: `src/app/[slug]/page.tsx`

**Data fetching:** After the existing competition and date-range fetches, add:

```typescript
const dashboardSessions = await getClassDashboard(supabase, competition.id)
```

**Placement:** Between the hero search card (`<section className="app-card ...">`) and the existing two soft cards (`<section className="grid gap-4 ...">` at line 78). Only render the dashboard if `dashboardSessions` is non-empty and at least one class has been imported.

```tsx
{dashboardSessions.length > 0 && (
  <ClassDashboard sessions={dashboardSessions} slug={slug} />
)}
```

The page already has `export const dynamic = 'force-dynamic'` so fresh counts are served on every request — no caching concern.

---

## E2E test

Test file: `tests/e2e/player/class-dashboard.spec.ts`

Slug prefix: `test-player-*`, cleaned per `beforeEach` with `cleanTestCompetitions(supabase, 'test-player-%')`.

### Seed helper

Add to `tests/helpers/db.ts`:

```typescript
// seedClassDashboard(supabase, slug, adminPin)
// Creates a competition with one session and three classes:
//   - "H-klass A": max_players=16, 14 registered, 0 reserve  → 2 platser kvar
//   - "D-klass A": max_players=8,  8 registered, 3 reserve   → Fullbokat · 3 på lista
//   - "Mixed":     max_players=null, 5 registered, 0 reserve  → –
// Returns { competitionId, slug }
```

Registration rows only need `player_id` and `class_id` with `status = 'registered'` or `status = 'reserve'`. Players can be minimal (name only, no club needed).

### Test cases

**Dashboard renders on landing page**
- Seed `seedClassDashboard`
- Navigate to `/{slug}`
- Assert the dashboard section is visible (`data-testid="class-dashboard"`)
- Assert "H-klass A" row shows "2 platser kvar"
- Assert "D-klass A" row shows "Fullbokat" and "3 på lista"
- Assert "Mixed" row shows "–"

**Session heading format**
- Assert the session heading matches the pattern "Lör - Pass 1" (or the seeded session day/name)

**Class row is a link**
- Click the "H-klass A" row
- Assert navigation to `/{slug}/search?q=H-klass+A` (or URL-encoded equivalent)

---

## Files to create or modify

| File | Change |
|---|---|
| `supabase/migrations/20260412000000_add_class_max_players.sql` | New migration — add `max_players INT` to `classes` |
| `src/app/api/super/competitions/[competitionId]/classes/route.ts` | Add `max_players` to select and response |
| `src/app/api/super/competitions/[competitionId]/classes/[classId]/route.ts` | Accept and validate `maxPlayers` in PATCH body |
| `src/app/super/competitions/[competitionId]/classes/ClassSettingsView.tsx` | Add `maxPlayers` to `ClassData` type + inline-editable column |
| `src/lib/public-competition.ts` | Add `ClassDashboardSession`, `ClassDashboardEntry` types and `getClassDashboard` function |
| `src/components/ClassDashboard.tsx` | New server component |
| `src/app/[slug]/page.tsx` | Fetch dashboard data and render `<ClassDashboard>` between hero and bottom cards |
| `tests/helpers/db.ts` | Add `seedClassDashboard` helper |
| `tests/e2e/player/class-dashboard.spec.ts` | New test file |

---

## Implementation order

Work through these in order. Each step is independently verifiable before moving on.

1. **Migration** — create and apply `20260412000000_add_class_max_players.sql`
2. **Extend superadmin GET** — add `max_players` to the classes read endpoint and verify with curl
3. **Extend superadmin PATCH** — accept `maxPlayers`, validate, persist; verify with curl
4. **ClassSettingsView** — add the Max spelare column with inline editing
5. **`getClassDashboard`** — add query + types to `public-competition.ts`; verify by calling directly in a test script or curl
6. **`ClassDashboard` component** — build component, wire into landing page
7. **E2E tests** — seed helper + test cases; run `npm run test:e2e:agent` and fix any failures

Steps 2 and 3 can be done in parallel. Step 4 depends on steps 2–3. Steps 5 and 6 can be done in parallel with steps 2–4.
