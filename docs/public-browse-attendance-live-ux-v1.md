# Public Browse, Attendance, and Live UX Plan V1

## Purpose

This document describes a clean information architecture for TTAttendance that covers three needs in one competition site:

1. Before the competition, players, parents, and clubs need to verify which classes a player is registered in.
2. During check-in, players, parents, and clubs need to report attendance.
3. Once play starts, players, parents, coaches, and audience need a simple public view of competition progress.

This is a product and UX plan only. It does not describe implementation steps.

## Core Product Rules

1. Browsing is public.
2. Writing attendance requires PIN.
3. The PIN is requested only on the first attendance action, in context.
4. Live competition progress is public and read-only.
5. The search page is the main attendance hub during the roster and attendance phase.
6. The class page is the public live hub.
7. Club representatives can report attendance directly from a club list view.
8. Player search results may expand inline to show attendance state and reporting actions.

## Start Page

### Main purpose

The start page should help users orient themselves quickly and move into the right lane without making them think about login first.

### Search field on the start page

Yes, there should be a search field directly on the start page.

It should behave as a shortcut into the public search page, not as an inline search-results experience on the start page itself.

### Start-page search behavior

1. User enters a search term on the start page.
2. On submit, the app navigates to `/{competitionSlug}/search?q=...`.
3. The search page opens with the query prefilled.
4. Results are shown there, not on the start page.
5. The search page should default to a broad public search view so the same query can find players, clubs, and classes.

Reason:

1. The start page stays calm and simple.
2. The search page remains the single place for refining and browsing results.
3. Users do not have to decide in advance whether they are looking for a player, a club, or a class.

### Start-page sections

The start page should use the search field as the primary public entry.

Below the search, it should have two secondary actions:

1. `följa tävlingen live`
2. `Sekretariat`

## Proposed Page Tree

1. `/{competitionSlug}`
Purpose: public competition start page with global search as the main entry and two secondary lanes.

2. `/{competitionSlug}/search?q=...`
Purpose: public search page for players, clubs, and classes.

3. `/{competitionSlug}/players/{playerId}`
Purpose: player page showing registered classes, attendance state, and links to live class progress.

4. `/{competitionSlug}/clubs/{clubKey}`
Purpose: club page showing the club's players and their classes, with direct attendance actions.

5. `/{competitionSlug}/classes`
Purpose: public list of classes, grouped and browsable for live competition following.

6. `/{competitionSlug}/classes/{classId}`
Purpose: public live class page with pools, progress, match results, standings, and playoff information.

7. `/{competitionSlug}/admin`
Purpose: PIN-protected secretariat workflow.

8. Global modal: `PIN-kod`
Purpose: shown only when the user tries to report attendance for the first time.

## Navigation Model

### Public lane 1: Player and club browsing

Used before and during the competition.

Primary jobs:

1. Check registrations.
2. Find a player.
3. Find a club.
4. Report attendance when needed.

### Public lane 2: Live competition following

Used once classes, draws, pools, and results exist.

Primary jobs:

1. Find which class a player is in.
2. See pools and draw.
3. See how many matches have been played.
4. See results and standings.
5. See playoff progress.

### Secretariat lane

Kept separate from the public flows.

## Attendance Gating Rules

1. Search pages are public and read-only.
2. Player pages are public to view.
3. Club pages are public to view.
4. Live class pages are public and read-only.
5. Attendance actions trigger a PIN modal the first time they are used.
6. After successful PIN entry, the session stays unlocked for later attendance actions.
7. Time-window restrictions must be shown directly in the page UI, not hidden behind the PIN modal.

## Reporting Rules By Page

### Search page

The search page should support direct attendance reporting from expandable player result cards.

Reason:

1. Morning attendance reporting needs as few clicks as possible.
2. The player search already acts as the public roster browser.
3. Expansion keeps the default result compact while still exposing actions quickly.

### Player page

The player page may remain as a fallback detail view, but it should no longer be the normal path for attendance reporting.

The common path should be search result -> expand -> report attendance.

### Club page

Attendance reporting should be allowed directly from the club page.

Reason:

1. Club representatives often need to handle several players quickly.
2. Requiring one click into each player page adds unnecessary friction.
3. The club page is the right place for efficient list-based attendance handling.

## Search Page Design

The search page should support a broad public search result first, with simple filters.

Recommended top filters:

1. `Alla`
2. `Spelare`
3. `Klubb`
4. `Klass`

Default behavior when arriving from the start page:

1. Show `Alla`.
2. Group results by type.
3. Let the user narrow the view with the filters if needed.

### Expandable player result cards

Player result cards should remain compact by default, but clearly signal when attendance actions are available.

Collapsed card contents:

1. Player name.
2. Club.
3. Clickable class pills that pivot to class search.
4. Compact attendance state directly in the card, one row per class if needed.
5. An expansion cue at the bottom of the card.

Expansion cue rules:

1. If attendance reporting is open for at least one of the player's classes, show `Anmäl närvaro`.
2. If no class is open yet, show `Närvaroanmälan öppnar {time}` using the earliest class opening time.
3. If there is no upcoming opening time to show, use a neutral fallback such as `Visa klasser`.

Expanded card contents:

1. Full per-class attendance state.
2. Attendance actions.
3. Deadline or not-open messages inline.
4. Any links to later live class pages, when those exist.

### Class search and suggestion pills

Class search should support both free text and clickable pills.

Rules:

1. Suggestion pills should appear only when the `Klass` filter is active.
2. The pills should include all classes in the competition, not just a subset.
3. Pills should behave as shortcuts into class search results.
4. Class pills shown on player result cards should also be clickable and pivot the search into the chosen class.

## Wireframes

### Start page

```text
+--------------------------------------------------+
| Tävlingens namn                                  |
| 12-13 april 2026                                 |
|                                                  |
| [ Sök spelare, klubb eller klass ...        ]    |
| [ Sök ]                                          |
|                                                  |
| +----------------------------------------------+ |
| | följa tävlingen live                          | |
| | Pooler, matcher, resultat och slutspel       | |
| | [ Visa klasser ]                             | |
| +----------------------------------------------+ |
|                                                  |
| +----------------------------------------------+ |
| | Sekretariat                                  | |
| | Arbeta med tävlingen                         | |
| | [ Sekretariat ]                              | |
| +----------------------------------------------+ |
+--------------------------------------------------+
```

Start-page search result behavior:

1. No inline results on the start page.
2. Submit takes the user to the search page.
3. The search page opens with the same query already filled in.

### Search page

```text
+--------------------------------------------------+
| <- Start                       [ följa tävlingen live ]
|                                                  |
| [ Alla ] [ Spelare ] [ Klubb ] [ Klass ]         |
|                                                  |
| [ Skriv minst 2 tecken ...                  ]    |
| [ Flickor 13 ] [ Pojkar 14 ] [ Damjuniorer ]     |
| (visas bara när Klass är vald)                   |
|                                                  |
| Spelare                                           |
| Anna Svensson                                     |
| Halmstad BTK                                      |
| Flickor 13 - Närvaro ej rapporterad              |
| Damjuniorer - Bekräftad 08:12                    |
| Mixeddubbel - Öppnar fredag 20:00                |
| [ Anmäl närvaro ]                                 |
|                                                  |
|                                                  |
| Klubbar                                           |
| IFK Lund Bordtennis                               |
| 12 spelare                                        |
| [ Visa klubb ]                                    |
|                                                  |
| Klasser                                           |
| Pojkar 14                                         |
| Söndag 09:00                                      |
| [ Visa klass ]                                    |
+--------------------------------------------------+
```

Rule:

1. Search results support players, clubs, and classes.
2. Player result cards show attendance state in collapsed form.
3. Player result cards expand inline for attendance actions.
4. Club and class results still link to their dedicated views.

### Player page

The player page is optional fallback UI while the search-based attendance flow is being introduced. It should not be the primary design reference for the morning attendance phase.

```text
+--------------------------------------------------+
| <- Sök                     [ följa tävlingen live ]|
|                                                  |
| Anna Svensson                                    |
| Halmstad BTK                                     |
|                                                  |
| +----------------------------------------------+ |
| | Flickor 13                                   | |
| | Lördag, Pass 1                               | |
| | Start 09:40                                  | |
| | Pool 2 finns publicerad                      | |
| |                                              | |
| | Status: Närvaro öppnar fredag 20:00          | |
| | [ Se pool och resultat ]                     | |
| +----------------------------------------------+ |
|                                                  |
| +----------------------------------------------+ |
| | Damjuniorer                                  | |
| | Lördag, Pass 2                               | |
| | Start 13:10                                  | |
| |                                              | |
| | Status: Närvaro ej rapporterad               | |
| | [ Bekräfta närvaro ]  [ Anmäl frånvaro ]     | |
| | PIN behövs först när du rapporterar.         | |
| +----------------------------------------------+ |
|                                                  |
| +----------------------------------------------+ |
| | Mixeddubbel                                   | |
| | Söndag, Pass 1                               | |
| | Start 10:20                                  | |
| |                                              | |
| | Status: Närvaro bekräftad 08:12              | |
| | [ Se pool och resultat ]                     | |
| +----------------------------------------------+ |
+--------------------------------------------------+
```

### PIN modal

```text
+----------------------------------------------+
| Ange PIN-kod                                 |
|                                              |
| PIN behövs bara för att rapportera närvaro.  |
|                                              |
| [ PIN-kod                               ]    |
|                                              |
| Fel PIN-kod                                  |
|                                              |
| [ Bekräfta närvaro ]   [ Avbryt ]            |
+----------------------------------------------+
```

PIN modal behavior:

1. Open only when the user taps an attendance action.
2. Keep the user on the same page.
3. After success, perform the original action immediately.
4. Do not use the modal for deadline or schedule-state errors.

### Club page

```text
+--------------------------------------------------+
| <- Sök                     [ följa tävlingen live ]|
|                                                  |
| IFK Lund Bordtennis                              |
| 12 spelare                                       |
|                                                  |
| [ Sök bland klubbens spelare ...           ]    |
|                                                  |
| +----------------------------------------------+ |
| | Anna Svensson                                | |
| | 3 klasser                                    | |
| |                                              | |
| | Flickor 13                                   | |
| | Status: Närvaro ej rapporterad               | |
| | [ Bekräfta ] [ Frånvaro ] [ Visa klass ]     | |
| |                                              | |
| | Damjuniorer                                  | |
| | Status: Bekräftad 08:12                      | |
| | [ Visa klass ]                               | |
| |                                              | |
| | [ Visa spelarsida ]                          | |
| +----------------------------------------------+ |
|                                                  |
| +----------------------------------------------+ |
| | Erik Holm                                    | |
| | 2 klasser                                    | |
| | ...                                          | |
| +----------------------------------------------+ |
+--------------------------------------------------+
```

Club-page rules:

1. Club representatives can report attendance directly from this list.
2. The first attendance action triggers the PIN modal.
3. After unlock, attendance can continue from the same club page.
4. Each player still has a link to the player page for more detail.

### Class index page

```text
+--------------------------------------------------+
| <- Start                              [ Sök ]    |
|                                                  |
| följa tävlingen live                              |
|                                                  |
| [ Pågår nu ] [ Lördag ] [ Söndag ]               |
|                                                  |
| Pass 1                                           |
|                                                  |
| +----------------------------------------------+ |
| | Pojkar 14                                    | |
| | Start 09:00                                  | |
| | Poolspel pågår                               | |
| | 10 av 15 matcher registrerade                | |
| | [ Visa klass ]                               | |
| +----------------------------------------------+ |
|                                                  |
| +----------------------------------------------+ |
| | Flickor 13                                   | |
| | Start 09:40                                  | |
| | Slutspel pågår                               | |
| | [ Visa klass ]                               | |
| +----------------------------------------------+ |
+--------------------------------------------------+
```

### Class page

```text
+--------------------------------------------------+
| <- följa tävlingen live              [ Sök ]      |
|                                                  |
| Pojkar 14                                        |
| Lördag 09:00                                     |
| Senast uppdaterad 10:14                          |
|                                                  |
| Status: Poolspel pågår                           |
| 10 av 15 poolmatcher registrerade                |
|                                                  |
| [ Översikt ] [ Pooler ] [ Resultat ] [ Slutspel ]|
|                                                  |
| ÖVERSIKT                                         |
| Pool 1: 4 av 6 matcher                           |
| Pool 2: 6 av 6 matcher                           |
| Pool 3: 0 av 6 matcher                           |
|                                                  |
| [ Visa pool 1 ]                                  |
| [ Visa pool 2 ]                                  |
| [ Visa pool 3 ]                                  |
+--------------------------------------------------+
```

### Class page: pool view

```text
+--------------------------------------------------+
| <- Pojkar 14                                     |
|                                                  |
| Pool 2                                           |
| 6 av 6 matcher registrerade                      |
|                                                  |
| Ställning                                         |
| 1. Erik Holm          3-0   9-2                  |
| 2. Leo Berg           2-1   7-4                  |
| 3. Nils Ek            1-2   4-7                  |
| 4. Adam Sjö           0-3   2-9                  |
|                                                  |
| Matcher                                          |
| Erik Holm - Leo Berg          3-1                |
| Nils Ek - Adam Sjö             3-2               |
| ...                                              |
+--------------------------------------------------+
```

### Class page: playoff view

```text
+--------------------------------------------------+
| <- Pojkar 14                                     |
|                                                  |
| Slutspel                                         |
|                                                  |
| Kvartsfinal                                      |
| Erik Holm        3                               |
| Max Nilsson      1                               |
|                                                  |
| Semifinal                                        |
| Erik Holm        2                               |
| Leo Berg         3                               |
|                                                  |
| Final                                            |
| Leo Berg        vs Arvid Palm                    |
| Ej färdigspelad                                  |
+--------------------------------------------------+
```

## Page Roles Summary

### Start page

Simple orientation and entry.

### Search page

Public discovery page.

### Player page

Personal overview with attendance actions.

### Club page

Efficient list-based view for club representatives, including direct attendance reporting.

### Class page

Public live competition view.

## Final Design Direction

The intended product shape is:

1. One public competition site.
2. Public browsing for players, clubs, and live progress.
3. Attendance protected only when the user actually writes attendance.
4. Player pages optimized for individual use.
5. Club pages optimized for efficient multi-player handling.
6. Class pages optimized for audience-style live following.