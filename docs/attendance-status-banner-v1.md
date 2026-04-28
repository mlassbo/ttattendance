# Attendance Status Banner V1

Implementation handoff for the landing-page and search-page attendance status banner. Following the recent removal of the player PIN, this is the next step in making attendance reporting frictionless: the player should be able to tell at a glance whether reporting is open, and reach the report flow in one tap.

This document is self-contained — a new agent should be able to implement it without re-deriving the design.

---

## Background

Today the public competition landing page at [src/app/[slug]/page.tsx](src/app/[slug]/page.tsx) treats attendance as a side feature. The hero subline says "Se registrerade spelare, klubbar och klasser samt anmäl närvaro.", and the only path to the report flow is to type a name into the search box. There is no signal on the landing page that reporting is currently open, no urgency cue near the deadline, and no routing shortcut to the report screen.

The search page at [src/app/[slug]/search/page.tsx](src/app/[slug]/search/page.tsx) has the same problem: the user has arrived at "search", but the page does not say what to search *for* in the context of attendance reporting.

This change introduces a state-aware status banner that renders on both pages and adapts to the current competition state.

---

## Scope

In scope:

- A new server-side rollup helper that computes the current banner state for a competition based on its classes, deadlines, registrations, attendance records, and live-status map.
- A new server component `AttendanceStatusBanner` rendered on the landing page and the search page.
- Three banner states with distinct treatments: **open**, **opens_soon**, **closed_pending**. A fourth idle state renders nothing.
- Minor hero copy/layout adjustments on the landing page so the banner sits naturally between the hero and the search form.
- Playwright coverage for each state on both pages.

Out of scope (deferred to later MVPs):

- Remembering the last-used player on the device.
- Bulk "Anmäl närvaro för alla klasser" action on the player view.
- Visual redesign of the per-class card on the player view.
- Countdown / clock-time copy ("stänger om 42 min", "stänger 09:15").
- Per-session roll-ups; the banner is competition-wide.
- Listing class names inside the closed-pending banner.

---

## Wireframes

Same layout on mobile and desktop. The banner sits between the hero and the search form on the landing page, and above the existing header card on the search page.

### State A — Open (≥1 class is currently within its attendance window and has not been drawn)

Landing page:

```
┌─────────────────────────────────────────┐
│  LÖR 10 MAJ – SÖN 11 MAJ                │
│  Eskilstuna Open 2026                   │
└─────────────────────────────────────────┘

┌── Närvaroanmälan är öppen ──────────────┐
│                                         │
│  ┌─────────────────────────────────┐    │
│  │   Anmäl närvaro                 │    │   PRIMARY → /{slug}/search
│  └─────────────────────────────────┘    │
│                                         │
└─────────────────────────────────────────┘

  ┌──────────────────────┐ ┌─────┐
  │ Sök spelare, klubb…  │ │ Sök │
  └──────────────────────┘ └─────┘

  …class dashboard…

  …sekretariat card (unchanged)…
```

Search page:

```
┌── Närvaroanmälan är öppen ──────────────┐
│  Sök spelare eller klubb för att        │
│  anmäla närvaro.                        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  ← Till startsidan                      │
│                                         │
│  SÖK                                    │
│  Eskilstuna Open 2026                   │
│                                         │   ← header subline removed
│  [Alla] [Spelare] [Klubbar] [Klasser]   │
│  ┌──────────────────────┐ ┌─────┐       │
│  │ Skriv minst 2 tecken │ │ Sök │       │
│  └──────────────────────┘ └─────┘       │
└─────────────────────────────────────────┘
```

### State B — Opens soon (no class currently in window; soonest opens-at is ≤60 min away)

Landing page only (search page is unchanged from idle):

```
┌── Närvaroanmälan ───────────────────────┐
│  Öppnar kl 20:00                        │
└─────────────────────────────────────────┘
```

Quiet single-line card. No button. Time is the soonest `attendanceOpensAt` across not-yet-open classes.

### State C — Closed, pending attendance (≥1 class has deadline passed, has ≥1 registration without attendance, and has not been drawn)

Landing page only:

```
┌── Närvaroanmälan stängd ────────────────┐
│                                         │
│  Kontakta sekretariatet om du inte      │
│  anmält närvaro.                        │
│                                         │
└─────────────────────────────────────────┘
```

Class names are intentionally not listed.

### State D — Idle (none of the above)

No banner is rendered. The landing and search pages fall through to their existing layout.

---

## Rollup logic

A single server-side helper computes the banner state from competition data. Priority order:

1. If any class satisfies `attendanceOpensAt ≤ now ≤ attendanceDeadline` AND `liveStatus === 'none'` → **`open`**.
2. Else if any class satisfies `now < attendanceOpensAt` AND `attendanceOpensAt - now ≤ 60 min` → **`opens_soon`** with `opensAt` set to the *minimum* such `attendanceOpensAt`.
3. Else if any class satisfies `now > attendanceDeadline` AND `liveStatus === 'none'` AND has ≥1 `registered` registration without an `attendance` row → **`closed_pending`**.
4. Else → **`idle`**.

Notes:

- The "drawn" check uses the existing `getClassDashboardLiveStatus` map. `liveStatus !== 'none'` means the class has progressed to pools or playoff and the attendance phase is no longer relevant.
- `attendanceOpensAt` is computed via the existing `getClassAttendanceOpensAt` from [src/lib/attendance-window.ts](src/lib/attendance-window.ts) (20:00 the night before, Swedish time).
- Classes missing `start_time` or `attendance_deadline` are skipped (`schedule_missing` in player view).
- Only `status === 'registered'` registrations count toward "missing attendance" for state C — reserves are excluded.

---

## Data layer changes

### New types in [src/lib/public-competition.ts](src/lib/public-competition.ts)

Add near the existing `ClassDashboardEntry` type:

```ts
export type AttendanceStatusBannerState =
  | { kind: 'open' }
  | { kind: 'opens_soon'; opensAt: string }   // ISO string
  | { kind: 'closed_pending' }
  | { kind: 'idle' }

export const ATTENDANCE_OPENS_SOON_WINDOW_MS = 60 * 60 * 1000
```

`opensAt` is serialised as an ISO string so the value is safe to pass from a server component to the client banner if it is ever made interactive. For V1 the banner is a pure server component and the value is rendered with `formatSwedishTime`.

### New helper in [src/lib/public-competition.ts](src/lib/public-competition.ts)

```ts
export async function getCompetitionAttendanceBannerState(
  supabase: ServerClient,
  competitionId: string,
  now: Date = new Date(),
): Promise<AttendanceStatusBannerState>
```

Implementation outline:

1. Load all classes for the competition: `id, session_id, name, start_time, attendance_deadline` joined to sessions filtered by `competition_id`. Mirror the join shape used by `getClassDashboardLiveStatus`.
2. Call `getClassDashboardLiveStatus(supabase, competitionId)` to get the per-class status map.
3. For each class with `start_time` and `attendance_deadline`, compute `attendanceOpensAt`. Bucket the class into `open` / `opens_soon` / `closed` based on the rules above.
4. Short-circuit: if any class is `open` and not drawn → return `{ kind: 'open' }`.
5. If any class is `opens_soon` (and no `open` classes exist) → return `{ kind: 'opens_soon', opensAt: minOpensAt.toISOString() }`.
6. Otherwise, for any class that is `closed`-and-not-drawn, query a count of registered registrations without an attendance row:

```sql
-- Pseudocode:
SELECT class_id, COUNT(*) FROM registrations r
LEFT JOIN attendance a ON a.registration_id = r.id
WHERE r.class_id IN (<closed_undrawn_class_ids>)
  AND r.status = 'registered'
  AND a.registration_id IS NULL
GROUP BY class_id
```

Use the same `fetchAllPages` pattern already used by `getClassDashboard`. If any class has count ≥ 1 → return `{ kind: 'closed_pending' }`.

7. Else → return `{ kind: 'idle' }`.

Reuse helpers (`fetchAllPages`, the live-status applier) to keep the new function consistent with sibling functions in the file.

### Caching

`export const dynamic = 'force-dynamic'` is already set on both pages. The banner state is computed per request. No additional caching is needed for V1.

---

## UI changes

### New component: `src/components/AttendanceStatusBanner.tsx`

Server component (no `'use client'`).

Props:

```ts
type AttendanceStatusBannerProps = {
  state: AttendanceStatusBannerState
  variant: 'landing' | 'search'
  slug: string
}
```

Behaviour:

- `state.kind === 'idle'`: returns `null`.
- `state.kind === 'open'`:
  - `variant === 'landing'`: card with heading **"Närvaroanmälan är öppen"** and a primary button **"Anmäl närvaro"** linking to `/{slug}/search`. No subtitle.
  - `variant === 'search'`: card with heading **"Närvaroanmälan är öppen"** and subtitle **"Sök spelare eller klubb för att anmäla närvaro."**. No button.
- `state.kind === 'opens_soon'`:
  - `variant === 'landing'`: card with heading **"Närvaroanmälan"** and body **"Öppnar kl HH:MM"** using `formatSwedishTime(state.opensAt)`. No button.
  - `variant === 'search'`: returns `null` (out of scope per discussion).
- `state.kind === 'closed_pending'`:
  - `variant === 'landing'`: card with heading **"Närvaroanmälan stängd"** and body **"Kontakta sekretariatet om du inte anmält närvaro."**. No button.
  - `variant === 'search'`: returns `null`.

Visual treatment:

- Reuse the existing `app-card` look as the base container. Recommended Tailwind class set per state, matching the existing palette in [src/app/globals.css](src/app/globals.css):
  - `open`: `app-banner-success`-style emphasis. Use a slightly stronger card (`rounded-3xl border border-green-200 bg-green-50/70 p-5 sm:p-6`). The button inside is `app-button-primary`.
  - `opens_soon`: muted info card (`rounded-3xl border border-line/80 bg-surface/85 p-4 sm:p-5`). Body text uses `text-sm text-muted`.
  - `closed_pending`: warning card (`rounded-3xl border border-amber-200 bg-amber-50/70 p-5 sm:p-6`). Body text uses `text-sm text-amber-900`.
- Heading typography: `text-base font-semibold tracking-tight text-ink` (consistent with section headings). Subtitle/body: `text-sm leading-6 text-muted` (or amber-900 for closed_pending).
- The button (open + landing) is full-width on mobile, content-width on desktop: `w-full sm:w-auto`. Min height 12 (already in `app-button-primary`).

Add stable `data-testid` hooks:

- Container: `attendance-status-banner-{kind}` (one of `open`, `opens-soon`, `closed-pending`).
- Primary button (open + landing): `attendance-status-banner-cta`.
- Time text (opens_soon): `attendance-status-banner-opens-at`.

### Landing page: [src/app/[slug]/page.tsx](src/app/[slug]/page.tsx)

Edits:

1. Add the rollup call to the existing `Promise.all` block:

   ```ts
   const [
     competitionDateRange,
     dashboardSessions,
     dashboardLiveStatus,
     attendanceBannerState,
   ] = await Promise.all([
     getCompetitionDateRange(supabase, competition.id),
     getClassDashboard(supabase, competition.id),
     getClassDashboardLiveStatus(supabase, competition.id),
     getCompetitionAttendanceBannerState(supabase, competition.id),
   ])
   ```

2. Restructure the hero section. Remove the existing subline (`<p class="max-w-2xl text-sm leading-6 text-muted ...">Se registrerade spelare...</p>`) and move the search form *out* of the hero card and into a sibling section below the banner.

   Resulting JSX shape (illustrative):

   ```tsx
   <main data-testid="public-start-page" className="app-shell">
     <div className="mx-auto max-w-5xl space-y-6 sm:space-y-8">

       {/* Hero — date range + competition name only */}
       <section className="app-card relative overflow-hidden">
         <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-brand/10 blur-3xl" />
         <div className="relative space-y-3">
           <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">
             {formatCompetitionDateRange(...)}
           </p>
           <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-5xl">
             {competition.name}
           </h1>
         </div>
       </section>

       <AttendanceStatusBanner
         state={attendanceBannerState}
         variant="landing"
         slug={slug}
       />

       {/* Search form moved out of the hero */}
       <section>
         <form data-testid="public-start-search-form" action={`/${slug}/search`}
               className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
           <input data-testid="public-start-search-input" name="q" type="search"
                  placeholder="Sök spelare, klubb eller klass" className="app-input" />
           <button data-testid="public-start-search-button" type="submit"
                   className="app-button-primary">Sök</button>
         </form>
       </section>

       {dashboardSessions.length > 0 && (
         <ClassDashboard sessions={dashboardSessions} slug={slug} liveStatus={dashboardLiveStatus} />
       )}

       {/* sekretariat card unchanged */}
       <section className="mt-4 border-t border-line/70 pt-6 sm:pt-8">
         …existing markup…
       </section>
     </div>
   </main>
   ```

3. Keep all existing `data-testid` attributes (`public-start-page`, `public-start-search-form`, `public-start-search-input`, `public-start-search-button`, `public-start-admin-card`, `public-start-admin-link`) so existing tests continue to pass.

### Search page: [src/app/[slug]/search/page.tsx](src/app/[slug]/search/page.tsx)

Edits:

1. After `competition` is resolved successfully, call:

   ```ts
   const attendanceBannerState = await getCompetitionAttendanceBannerState(supabase, competition.id)
   ```

   Add this to the existing `Promise.all` block alongside `searchPublicCompetition` and `getPublicCompetitionClassSuggestions` rather than serially.

2. Render the banner as the first child of the page wrapper, *above* the existing header card:

   ```tsx
   <main data-testid="public-search-page" className="app-shell">
     <div className="mx-auto max-w-4xl space-y-4 sm:space-y-6">
       <AttendanceStatusBanner
         state={attendanceBannerState}
         variant="search"
         slug={slug}
       />

       <section className="app-card space-y-5">
         …existing header card…
       </section>
       …
     </div>
   </main>
   ```

3. Inside the existing header card, conditionally hide the subline `Sök på spelare, klubb eller klass.` *only when the banner is rendering its open-state copy*, since the banner already provides the search instruction:

   ```tsx
   {attendanceBannerState.kind !== 'open' ? (
     <p className="text-sm leading-6 text-muted">Sök på spelare, klubb eller klass.</p>
   ) : null}
   ```

   The class-search-mode pills body text (`<p>Välj klass.</p>`) and the empty-state copy stay as they are.

4. The `try { ... } catch` error fallback paths in the search page must not crash if the banner fetch throws — wrap the banner call in its own try/catch and treat errors as `{ kind: 'idle' }`. Failing the whole search page because the banner state failed to load is the wrong tradeoff.

---

## Tests

All new tests live under `tests/e2e/player/`. Existing tests must continue to pass — the structural change to the landing page (hero → banner → search form) preserves all current test IDs.

### Helper additions in `tests/helpers/db.ts`

Add a single seeding helper that lets a test set up the four scenarios deterministically. Suggested signature:

```ts
export type AttendanceBannerScenario =
  | 'open'
  | 'opens_soon'
  | 'closed_pending'
  | 'idle'

export async function seedAttendanceBannerScenario(
  supabase: SupabaseClient,
  slug: string,
  scenario: AttendanceBannerScenario,
): Promise<{ competitionId: string; classId: string }>
```

Each scenario seeds:

- `open`: one class with `start_time` set so that `now` is between `attendanceOpensAt` and `attendance_deadline`. One `registered` registration with no attendance row. No pool/playoff seeded → live status is `none`.
- `opens_soon`: one class with `start_time` set so that `attendanceOpensAt` is 30 minutes in the future. No registrations needed.
- `closed_pending`: one class with `attendance_deadline` 1 hour in the past, one `registered` registration with no attendance row, no pools/playoff.
- `idle`: one class with `attendance_deadline` in the past, all registrations have attendance reported → no missing attendance, no banner.

For `start_time` math, mirror the inverse of `getCompetitionAttendanceOpensAt` (which is 20:00 the day before in Swedish time): set `start_time` to a date such that "yesterday at 20:00 Swedish time" relative to `now` lands in or out of the desired window. Existing `seedPlayerWindowTestCompetition` ([tests/helpers/db.ts:355](tests/helpers/db.ts#L355)) already exercises this kind of time math and is a good reference.

Slug prefix: use `test-player-banner-*` to align with the existing `'test-player-%'` cleanup pattern.

### New test file: `tests/e2e/player/attendance-status-banner.spec.ts`

Cover:

1. **Landing — open**: visits `/{SLUG}` after seeding `open` scenario. Expects `attendance-status-banner-open` visible, `attendance-status-banner-cta` clickable, navigates to `/{SLUG}/search` on click.
2. **Landing — opens_soon**: visits `/{SLUG}` after seeding `opens_soon`. Expects `attendance-status-banner-opens-soon` visible. Asserts `attendance-status-banner-opens-at` contains a `HH:MM` string.
3. **Landing — closed_pending**: visits `/{SLUG}` after seeding `closed_pending`. Expects `attendance-status-banner-closed-pending` visible with the contact-sekretariat copy.
4. **Landing — idle**: visits `/{SLUG}` after seeding `idle`. Expects no `attendance-status-banner-*` to be present.
5. **Search — open**: visits `/{SLUG}/search` after seeding `open`. Expects `attendance-status-banner-open` visible with the "Sök spelare eller klubb..." subtitle. Expects the original search-page subline ("Sök på spelare, klubb eller klass.") to NOT be present.
6. **Search — opens_soon**: visits `/{SLUG}/search` after seeding `opens_soon`. Expects no banner. Expects the original search-page subline to be present.
7. **Search — closed_pending**: same as 6, but seeded `closed_pending`.

Each test runs `cleanTestCompetitions(supabase, 'test-player-banner-%')` in `beforeEach`, per the parallel-projects discipline in CLAUDE.md.

### Existing tests to verify

Run the full `tests/e2e/player/` suite with `npm run test:e2e:agent` and confirm:

- `attendance.spec.ts` — landing-page and search-page tests still pass after the hero restructure.
- `class-dashboard.spec.ts` — dashboard still renders below the banner area.
- `public-browse.spec.ts` — search flow unaffected.

---

## Decisions locked in (from design review)

- Mobile and desktop share the same banner layout — no split layouts.
- Banner is competition-wide, not per-session. Attendance deadlines vary within a session, so a per-session rollup is misleading.
- Open-state banner does **not** include exact close times or countdowns.
- Opens-soon threshold is **60 minutes**. Outside that window the banner is silent.
- Closed-pending banner does **not** list class names.
- Closed-pending banner only renders when there is *something the secretariat is still chasing* — it disappears once attendance is complete or the class is drawn.
- Search page renders the banner only in the **open** state. Opens-soon and closed-pending are landing-only.
- Landing-page CTA destination is `/{slug}/search` plain, no autofocus query param. (Open to revisit if the dev wants to also focus the input on arrival; out of scope for V1.)
- Sekretariat login card is unchanged.

---

## Smoke tests for the dev to run after implementation

- Visit `/{slug}` for a competition where attendance is currently open — confirm the green banner shows with the "Anmäl närvaro" button, and clicking the button lands on `/{slug}/search`.
- Visit `/{slug}/search` for the same competition — confirm the green banner shows with the "Sök spelare eller klubb för att anmäla närvaro." subtitle, and the original "Sök på spelare, klubb eller klass." subline is gone.
- Visit `/{slug}` for a competition that opens within an hour — confirm the muted "Närvaroanmälan · Öppnar kl HH:MM" banner shows, no button.
- Visit `/{slug}` for a competition with deadlines just passed and no attendance reported on at least one undrawn class — confirm the amber "Kontakta sekretariatet" banner shows.
- Visit `/{slug}` for a competition that is two days away — confirm no banner shows and the page renders the search form, dashboard, and sekretariat card cleanly.
- Visit `/{slug}/admin` and confirm the secretariat login flow is unchanged.
- Resize the landing page from mobile to desktop — confirm the banner stays single-column and the button is full-width on mobile, content-width on desktop.
