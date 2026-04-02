# Competition Import V1

This document specifies the first version of competition registration import for TTAttendance.

## Purpose

The system must allow a superadmin to:

- create a competition before any start list file is available
- import a competition start list later by pasting text copied from a TT Coordinator PDF
- re-import the same competition to sync registrations when players are added or withdrawn

V1 deliberately keeps the behavior narrow and predictable.

## Decisions

- Competition creation is separate from import.
- Import uses pasted text, not direct PDF upload.
- Re-import syncs registrations only.
- Re-import adds new registrations and removes registrations missing from the new import.
- Removed registrations are hard-deleted in V1.
- Preview is mandatory before apply.
- If any registrations to be removed already have attendance, the user must explicitly confirm that destructive removal.

## Non-Goals

- No withdrawn status on registrations.
- No general player/profile sync.
- No direct PDF parser in V1.
- No fuzzy matching.
- No import history or audit log in V1.
- No class deletion in V1.

## Source Format

The pasted input is TT Coordinator text with this repeating structure:

1. Optional document header noise.
2. Class name on its own line.
3. Schedule/count line on the next line.
4. One registration per following line until the next class block.

### Header/footer noise to ignore

These lines may appear anywhere because of page breaks and must be ignored:

- `Deltagarlista`
- `Alla klasser`
- `<competition name>`
- `Tävlingen genomförs med hjälp av programmet TT Coordinator - http://ttcoordinator.com`
- `Denna programlicens får endast användas vid tävlingar arrangerade av ...`

### Class block

Example:

```text
Max400
2025-05-03 09:00    (31 anmälda)
Alfredsson Alva, BTK Dalen
Dahl August, Grästorps BTK
...
```

### Supported class name examples

- `Max400`
- `PF11`
- `Öppen`
- `Dubbel <2000p`
- `Dubbel >2000p`

### Schedule/count line format

```text
YYYY-MM-DD HH:mm    (N anmälda)
```

Regex:

```text
^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+\(\d+\s+anmälda\)$
```

### Registration row format

```text
<player name>, <club>
```

Regex:

```text
^(.+),\s+(.+)$
```

Split on the first comma only.

## Parser Rules

The parser should be implemented as a simple state machine.

### Line normalization

- trim leading and trailing whitespace
- drop blank lines
- preserve Unicode characters such as `Å`, `Ä`, `Ö`, `é`, `ø`
- collapse repeated internal whitespace for matching, but preserve original display text for preview

### Parsing algorithm

1. Read normalized lines in order.
2. Ignore known header/footer noise lines.
3. Treat a line as a class name only if the following non-noise line matches the schedule/count regex.
4. Start a new class block from that pair.
5. Parse subsequent non-noise lines as registration rows until another class-name-plus-schedule pair is found.
6. Page-break noise inside a class must not end the class block.

### Parse output

The parser should return:

- `competitionTitleFromSource` if present
- `classes[]`

Each parsed class should contain:

- `className`
- `startAt` as ISO timestamp
- `declaredCount`
- `registrations[]`

Each parsed registration should contain:

- `playerName`
- `clubName`

## Validation Rules

The parser must produce blocking errors for:

- no classes found
- no registrations found
- a registration row that cannot be parsed as `name, club`
- duplicate imported registration within the same class
- declared count not matching parsed count for a class

The declared count check is important because page-break noise can otherwise silently drop rows.

## Matching Rules

V1 should avoid guesswork.

### Player identity

Within one competition, match an existing player by:

- normalized player name
- normalized club name

If both match, it is the same player.

If the import contains the same player name with different clubs, they are distinct players.

### Class identity

Within one competition, match an existing class by:

- normalized class name
- imported date
- imported start time

This avoids collisions between similarly named classes on different times or dates.

### Registration identity

One registration is uniquely identified by:

- player
- class

## Database Mapping

V1 does not require schema changes.

### Competition

- The competition already exists before import.
- The repeated competition title in the pasted text is informational only.

### Sessions

Create or reuse one session per imported date.

Recommended mapping:

- `name`: Swedish weekday name, for example `Lördag` or `Söndag`
- `date`: imported class date
- `session_order`: ascending by date within the competition

### Classes

Create missing classes from parsed blocks.

Mapping:

- `name`: parsed class name
- `start_time`: parsed date and time
- `attendance_deadline`: `start_time - 45 minutes` in V1

Classes are reused on re-import if class identity matches.

### Players

Create missing players from parsed registrations.

Mapping:

- `name`: parsed player name
- `club`: parsed club name

Players are reused on re-import if player identity matches.

### Registrations

For each parsed registration:

- resolve the class
- resolve the player
- create the registration if it does not already exist

## Re-Import Behavior

Re-import computes a diff against the current registrations in the selected competition.

### Additions

Add a registration when:

- it exists in the imported source
- it does not exist in the current database state

### Removals

Remove a registration when:

- it exists in the current database state
- it is not present in the imported source

### Orphaned players

After removals, delete any player that has no registrations left in that competition.

### Classes after re-import

Do not delete empty classes in V1.

This keeps destructive behavior narrow and easier to reason about.

## Attendance Safety Rail

Because registrations are hard-deleted in V1, removing a registration can also remove its attendance.

Preview must always show:

- registrations to add
- registrations to remove
- registrations to remove that already have attendance

If at least one removal already has attendance:

- show a destructive warning
- require an extra confirmation before apply

Suggested warning copy:

- `X anmälningar kommer att tas bort.`
- `Y av dessa har redan närvarostatus och den informationen kommer också att tas bort.`

## Preview Contract

Preview is required before apply.

The preview response should include:

- parsed class count
- parsed player count
- parsed registration count
- registrations to add
- registrations to remove
- removals with attendance
- warnings
- blocking errors

Each diff row should include:

- class name
- class date/time
- player name
- club

For removals with attendance, include the current attendance status.

## API Design

Recommended endpoints:

- `POST /api/super/competitions/[competitionId]/import/preview`
- `POST /api/super/competitions/[competitionId]/import/apply`

Request body:

```json
{
  "sourceText": "...",
  "confirmRemovalWithAttendance": false
}
```

### Preview response

```json
{
  "summary": {
    "classesParsed": 14,
    "playersParsed": 180,
    "registrationsParsed": 353,
    "registrationsToAdd": 12,
    "registrationsToRemove": 5,
    "registrationsToRemoveWithAttendance": 1
  },
  "warnings": [],
  "errors": [],
  "toAdd": [],
  "toRemove": []
}
```

### Apply rules

- Reject apply if preview-equivalent validation fails.
- Reject apply if `registrationsToRemoveWithAttendance > 0` and `confirmRemovalWithAttendance` is not `true`.
- Apply should re-run the parse and diff on the server, unless the implementation introduces a signed preview token.

### Apply response

```json
{
  "summary": {
    "registrationsAdded": 12,
    "registrationsRemoved": 5,
    "playersCreated": 3,
    "playersDeleted": 2,
    "classesCreated": 1
  }
}
```

## UI Design

### Competition list

The superadmin must be able to create a competition without importing anything.

Each competition should show one of:

- `Ingen startlista importerad`
- `Startlista importerad`

Action button:

- `Importera startlista` before first import
- `Synka anmälningar igen` after first import

### Import screen

The import screen should include:

- a large textarea for pasted text
- a preview action
- a summary panel
- an additions list
- a removals list
- a destructive warning section when removals with attendance exist
- an apply action disabled until preview succeeds

## Suggested File Layout

The implementation should stay close to the current app structure.

### Parser and diff logic

- `src/lib/import/competition-import.ts`
- `src/lib/import/competition-import.test-data.ts` if useful for fixtures

Responsibilities:

- normalize and parse pasted TT Coordinator text
- validate class counts and row format
- compute import diff against database state
- return preview/apply summaries

### API routes

- `src/app/api/super/competitions/[competitionId]/import/preview/route.ts`
- `src/app/api/super/competitions/[competitionId]/import/apply/route.ts`

Responsibilities:

- authorize as superadmin
- validate request payload
- call parser/diff logic
- enforce destructive confirmation rule
- execute transactional apply logic

### Superadmin UI

- `src/app/super/competitions/[competitionId]/import/page.tsx`
- update `src/app/super/competitions/page.tsx` to surface import actions and state

Responsibilities:

- paste text
- request preview
- display diff
- require destructive confirmation when needed
- apply import

## Suggested Apply Order

When applying the import:

1. Parse and validate source text.
2. Resolve or create sessions by date.
3. Resolve or create classes.
4. Resolve or create players.
5. Create registrations to add.
6. Remove registrations to delete.
7. Delete orphaned players.
8. Return summary.

The implementation should avoid deleting any class in V1.

## Test Plan

This is a user-facing feature and must ship with Playwright coverage.

Recommended E2E test cases under `tests/e2e/superadmin/`:

1. Competition can be created without import.
2. Initial import from pasted TT Coordinator text creates sessions, classes, players, and registrations.
3. Re-import adds new registrations and removes missing registrations.
4. Re-import preview shows removals with attendance.
5. Apply is blocked unless the destructive confirmation is given when removals with attendance exist.
6. Page-break boilerplate inside a class block is ignored correctly.
7. Import fails when declared class count does not match parsed registrations.

Recommended helper additions:

- add a seed/setup helper for a superadmin import scenario in `tests/helpers/db.ts`
- add a reusable pasted text fixture based on the TT Coordinator format

## Open Questions For Later Versions

- Should the competition record store whether an import has ever been completed?
- Should attendance deadlines become configurable per class instead of always using `start_time - 45 minutes`?
- Should empty classes eventually be removed on re-import?
- Should removals become soft-withdrawn instead of hard delete?
- Should direct PDF upload reuse the same parser pipeline after text extraction?