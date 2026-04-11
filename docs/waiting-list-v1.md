# Waiting List (Reservlista) — Implementation Plan V1

This document is the implementation handoff for the waiting list feature. The intent is to give a new agent enough detail to implement the change without having to rediscover the architecture from scratch.

---

## Background

Players who want to enter a full class contact the organizer by email. The organizer tracks the waiting list in Excel. Players and clubs have no way to check their position without emailing in again.

This feature replaces the Excel with a waiting list managed inside TTAttendance. The secretariat manages the list on-site. Players and clubs can look up their position in the public search.

---

## Scope

**In scope:**
- Secretariat (admin) can add a player to the waiting list for a class
- Secretariat can remove a player from the waiting list
- Players and clubs see their waiting list position in the public search results
- Secretariat sees the waiting list alongside the class roster in the class attendance view
- OnData import auto-promotes a reserve player to registered when the player appears in the import

**Out of scope (explicitly excluded):**
- Players self-registering for a waiting list
- Automatic promotion notifications (email/SMS)
- Superadmin waiting list management (kept in admin only to reduce superadmin UI clutter)
- Moving a fully registered player to reserve status — not needed for the current workflow
- Enforcing class capacity limits

---

## Real-World Workflow

Understanding this flow is critical for getting the import behavior right:

1. A player contacts the organizer and is added to the waiting list in TTAttendance.
2. A spot opens in the class (e.g., someone withdraws).
3. The organizer removes the player from the waiting list in TTAttendance.
4. The organizer adds the player to the class in the external competition system (OnData).
5. The next OnData registration import runs and brings the player in as a regular `registered` entry.

The system must handle step 5 gracefully — see **Import Behavior** below.

---

## Data Model

### Migration

Create `supabase/migrations/20260411000000_add_reserve_status.sql`:

```sql
ALTER TABLE registrations
  ADD COLUMN status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'reserve')),
  ADD COLUMN reserve_joined_at TIMESTAMPTZ;
```

**Notes:**
- The `DEFAULT 'registered'` means all existing registrations are unaffected.
- The unique constraint on `(player_id, class_id)` is unchanged — a player can have at most one entry per class, in either state.
- Waiting list position is derived dynamically by ordering `reserve_joined_at` among all `reserve` rows for a class. No stored integer needed.
- A player may be on the waiting list for a class in one session while fully registered in a class in a different session (or even the same session). No conflict rules are enforced.

---

## Import Behavior (OnData)

The registration write happens entirely inside TTAttendance — **no changes to TTAttendanceIntegrations are needed**. The integrations repo sends data to TTAttendance via API, TTAttendance stores a snapshot, and the superadmin applies it. The actual INSERT into `registrations` is in the Postgres function `apply_competition_import_plan`, defined in `supabase/migrations/20260402101500_add_competition_import_functions.sql` at the line:

```sql
insert into registrations (player_id, class_id)
  ...
on conflict (player_id, class_id) do nothing
```

Change that conflict clause to:

```sql
on conflict (player_id, class_id) do update
  set status = 'registered', reserve_joined_at = null
```

This is a one-line change to the migration file and requires a new migration that replaces the function (use `CREATE OR REPLACE FUNCTION apply_competition_import_plan`).

When the import applies:
- If no existing registration: insert with `status = 'registered'`, `reserve_joined_at = NULL` (normal case — unchanged behavior).
- If an existing `reserve` registration exists: update to `status = 'registered'`, `reserve_joined_at = NULL`. This is the automatic promotion path.
- If an existing `registered` registration exists: the DO UPDATE runs but the values are unchanged — idempotent.

---

## API Endpoints

All new endpoints are under `/api/admin/` — protected by the admin PIN cookie (same auth as existing admin routes). No superadmin endpoints are added.

### Player autocomplete search (for the add-to-waiting-list form)

```
GET /api/admin/players/search?q=<query>&competitionId=<id>
```

- Searches the `players` table scoped to the competition.
- Returns up to 10 matches: `[{ id, name, club, classNames: string[] }]`
- `classNames` shows which classes the player is already in (for display in suggestions).
- Use the existing `idx_players_competition_lower_name` index for performance.
- The competition ID is resolved from the slug in the admin session cookie.

### Add player to waiting list

```
POST /api/admin/classes/[classId]/reserve
```

Request body:

```json
{
  "playerId": "uuid | null",
  "name": "string",
  "club": "string"
}
```

- If `playerId` is provided: player already exists in the competition — create a `registrations` row with `status = 'reserve'`, `reserve_joined_at = now()`.
- If `playerId` is null: `name` and `club` are required — insert into `players` first, then create the `registrations` row.
- Return 409 if the player already has any registration (reserved or registered) for this class.

### Remove player from waiting list

```
DELETE /api/admin/classes/[classId]/reserve/[registrationId]
```

- Deletes the registration row.
- Returns 404 if not found, 400 if the registration has `status = 'registered'` (guards against accidentally deleting real registrations).
- Operational note: if the player has no remaining registrations in the competition after the reserve row is removed, the player row may also be deleted. This is acceptable for the current workflow because the next OnData import recreates the player if they later receive a real registration.

### Extend existing read endpoints

These endpoints already exist. Extend their responses to include reserve data:

**`GET /api/admin/classes/[classId]/attendance`**
Add a `reserveList` field to the response:
```json
{
  "players": [...],
  "reserveList": [
    { "registrationId": "uuid", "position": 1, "name": "...", "club": "...", "joinedAt": "..." }
  ]
}
```

**`GET /api/players/[playerId]/classes`**
Each registration already returns class info. Add `status` and `reservePosition` (the player's position among all `reserve` entries for that class, 1-indexed, null if `status = 'registered'`).

**`GET /api/players/search`** (public search)
The existing query joins registrations. Add `status` and `reservePosition` to each registration in the result.

---

## Admin UI — Class Attendance View

File: `src/app/[slug]/admin/classes/[classId]/ClassAttendanceView.tsx`

Add a **Reservlista** section below the main player roster. It is always visible (not collapsed) so secretariat staff can see it at a glance.

Each row shows:
- Position number (1, 2, 3…)
- Player name
- Club
- Time added to the list (`reserve_joined_at`, formatted as a short datetime)
- **Ta bort** button — removes the player from the waiting list (calls the DELETE endpoint).
- Workflow note: no extra confirmation dialog is required before removing a reserve entry. This is an intentional speed trade-off for desk workflow.

Above the list, a **"Lägg till på reservlistan"** button opens a form (inline or modal — keep it simple):

**The add-to-waiting-list form:**

1. A text input for player name with autocomplete suggestions. As the user types (after 2 characters), fetch suggestions from `GET /api/admin/players/search`. Each suggestion shows: name, club, and a small note of which classes they're already in (e.g. "H-klass A, D-klass B"). Keyboard-navigable dropdown.

2. If a suggestion is selected: the club field auto-fills and the reserve entry is submitted immediately. No extra confirm step is required for existing players.

3. If no suggestion matches and the user types a full name and presses a **"Lägg till ny spelare"** option (always shown as the last item in the dropdown): the club field becomes an editable free-text input. Both name and club are required to submit.

4. On submit: call `POST /api/admin/classes/[classId]/reserve`. On success, append the new entry to the list. On 409: show an inline error "Spelaren är redan på listan eller är fullt registrerad i denna klass."

---

## Public Search — What Changes

File: `src/components/PublicSearchResults.tsx`

### Player search results

For registrations where `status = 'reserve'`:
- The class pill shows **"Reserv #2"** (or whichever position) instead of the class name alone.
- Use a visually distinct style: outlined/gray rather than the filled brand color.
- No attendance buttons are shown for reserve registrations — the player cannot report attendance for a class they are waiting for.
- In the expanded per-class detail, show: **"Du är på plats #2 på reservlistan för denna klass."**

For registrations where `status = 'registered'`: no change.

### Class search results

Below the existing registered player roster, add a **Reservlista** section:
- Ordered list: position number, player name, club.
- Only shown if the waiting list is non-empty.

### Club search results

In the per-player class list within a club's player list, distinguish reserve entries from registered ones (e.g., show "Reserv #2" instead of just the class name).

---

## E2E Tests

Test files go in `tests/e2e/admin/` (secretariat-facing) and `tests/e2e/player/` (public search).

Use slug prefix `test-admin-` for admin tests and `test-player-` for player tests. Clean up in `beforeEach` using the scoped pattern from `CLAUDE.md`.

Add any new seed helpers to `tests/helpers/db.ts`. A `seedWaitingList` helper should:
- Accept competition slug, class ID, player name, club
- Insert into `players` if needed, then insert a `reserve` registration
- Return the `registrationId`

### Minimum test coverage

**Auth gate:**
- Unauthenticated access to add/remove waiting list endpoints returns 401.

**Add to waiting list — existing player:**
- Secretariat opens a class, adds a player already in the competition to the waiting list. The player appears in the list at position 1 with correct name and club.

**Add to waiting list — new player:**
- Secretariat adds a player not yet in the system. The player is created and appears on the waiting list.

**Remove from waiting list:**
- Secretariat removes a player. They disappear from the list. The remaining players renumber correctly.

**Duplicate guard:**
- Adding a player who is already on the waiting list for that class returns an error.

**Public player search — reserve display:**
- A player on a waiting list sees "Reserv #1" pill for that class. No attendance buttons shown for the reserve class.

**Public class search — reserve list:**
- The class search result shows a Reservlista section with the correct players in order.

**Import promotion:**
- A player with `status = 'reserve'` for a class, when the OnData import processes them for that same class, ends up with `status = 'registered'` and `reserve_joined_at = NULL`.

---

## Files to Create or Modify

| File | Change |
|---|---|
| `supabase/migrations/20260411000000_add_reserve_status.sql` | New migration (schema change) |
| `supabase/migrations/20260411000001_fix_import_upsert.sql` | New migration — `CREATE OR REPLACE FUNCTION apply_competition_import_plan` with updated conflict clause |
| `src/app/api/admin/players/search/route.ts` | New endpoint |
| `src/app/api/admin/classes/[classId]/reserve/route.ts` | New endpoint (POST) |
| `src/app/api/admin/classes/[classId]/reserve/[registrationId]/route.ts` | New endpoint (DELETE) |
| `src/app/api/admin/classes/[classId]/attendance/route.ts` | Extend response with `reserveList` |
| `src/app/api/players/[playerId]/classes/route.ts` | Extend with `status`, `reservePosition` |
| `src/app/api/players/search/route.ts` | Extend with `status`, `reservePosition` |
| `src/app/[slug]/admin/classes/[classId]/ClassAttendanceView.tsx` | Add Reservlista section + add form |
| `src/components/PublicSearchResults.tsx` | Show reserve status and position |
| `src/lib/public-competition.ts` | Extend types with `status`, `reservePosition` |
| `tests/helpers/db.ts` | Add `seedWaitingList` helper |
| `tests/e2e/admin/waiting-list.spec.ts` | New test file |
| `tests/e2e/player/waiting-list.spec.ts` | New test file |

---

## Implementation Order

Work through these in order. Each step is independently verifiable before moving on.

1. **Migration** — run `npx supabase migration new add_reserve_status`, write the SQL, apply with `npx supabase db reset` or `npx supabase migration up`.
2. **Extend read APIs** — add `status` and `reservePosition` to the player search and class attendance responses. Verify with curl.
3. **New admin API endpoints** — player autocomplete search, add reserve (POST), remove reserve (DELETE). Test with curl before touching the UI.
4. **Update import function** — add a second migration that recreates `apply_competition_import_plan` with the updated conflict clause (`DO UPDATE SET status = 'registered', reserve_joined_at = NULL` instead of `DO NOTHING`). No changes to TTAttendanceIntegrations. Write the import promotion E2E test first to verify.
5. **Admin UI** — Reservlista section + add-to-waiting-list form in `ClassAttendanceView.tsx`.
6. **Public search** — reserve pill display and class reserve list in `PublicSearchResults.tsx`.
7. **E2E tests** — write and run `npm run test:e2e:agent`. Fix any failures before finishing.
