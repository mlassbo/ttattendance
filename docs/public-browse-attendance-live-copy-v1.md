# Public Browse, Attendance, and Live Copy V1

## Purpose

This file collects suggested Swedish UI copy for the public browse, attendance, and live competition flow.

The goal is to make the texts easy to review and change later.

The `Key` values are only labels for discussion and later implementation. They are not tied to code yet.

## Copy Principles

1. Keep texts short.
2. Prefer clear action words over explanatory paragraphs.
3. Avoid technical wording.
4. Show state directly in the UI instead of hiding it.
5. Keep attendance copy and live-results copy clearly separated.

## Global

| Key | Swedish copy | Notes |
|---|---|---|
| global.search_placeholder | Sök spelare, klubb eller klass | Broad search placeholder used on start and search pages. |
| global.search_button | Sök | Primary search action. |
| global.back_to_start | Till startsidan | Use where a simple back label is better than just an arrow. |
| global.follow_live | följa tävlingen live | Main label for the public live lane. |
| global.latest_update_prefix | Senast uppdaterad | Prefix before time or date-time. |
| global.show_more | Visa mer | Generic expansion label. |
| global.show_player | Visa spelare | Link from search result or club page. |
| global.show_club | Visa klubb | Link from search result. |
| global.show_class | Visa klass | Link from search result or list. |
| global.show_pool_and_results | Se pool och resultat | Link from player page into live class view. |
| global.loading | Laddar... | Generic loading text. |
| global.no_results | Inga träffar | Generic empty search result state. |
| global.network_error | Något gick fel, försök igen. | Generic fetch error. |

## Start Page

| Key | Swedish copy | Notes |
|---|---|---|
| start.hero_supporting_text | Se anmälda klasser, rapportera närvaro och följa tävlingen live. | Short description below competition title. |
| start.search_helper | Sök bland spelare, klubbar och klasser i tävlingen. | Important orientation text. |
| start.card_players_title | Spelare, klubbar och klasser | Main lane for registration overview and attendance. |
| start.card_players_description | Se anmälda klasser och rapportera närvaro. | Keep short. |
| start.card_players_action | Sök spelare, klubb eller klass | CTA to search page. |
| start.card_live_title | följa tävlingen live | Main lane for public competition progress. |
| start.card_live_description | Pooler, matcher, resultat och slutspel. | Keep this compact. |
| start.card_live_action | Visa klasser | CTA to live class index. |
| start.card_admin_action | Sekretariat | Entry to admin flow. |

## Search Page

| Key | Swedish copy | Notes |
|---|---|---|
| search.page_title | Sök | Main page heading if needed. |
| search.filter_all | Alla | Search filter tab. |
| search.filter_players | Spelare | Search filter tab. |
| search.filter_clubs | Klubbar | Search filter tab. |
| search.filter_classes | Klasser | Search filter tab. |
| search.input_placeholder | Skriv minst 2 tecken | Placeholder on search page. |
| search.class_pills_heading | Välj klass | Shown above class suggestion pills when class mode is active. |
| search.section_players | Spelare | Search result group title. |
| search.section_clubs | Klubbar | Search result group title. |
| search.section_classes | Klasser | Search result group title. |
| search.player_result_class_count | klasser | Used after a number, for example `3 klasser`. |
| search.club_result_player_count | spelare | Used after a number, for example `12 spelare`. |
| search.expand_cta_open | Anmäl närvaro | Expansion cue when at least one class is open for attendance. |
| search.expand_cta_opens_at | Närvaroanmälan öppnar {time} | Expansion cue when no class is open yet; use earliest opening time. |
| search.expand_cta_fallback | Visa klasser | Expansion cue fallback when no stronger attendance-specific cue is available. |
| search.player_card_status_pending | Närvaro ej rapporterad | Compact player-card status for an unreported class. |
| search.player_card_status_confirmed | Bekräftad {time} | Compact player-card status for a confirmed class. |
| search.player_card_status_absent | Frånvaro {time} | Compact player-card status for an absent class. |
| search.player_card_status_not_open | Öppnar {time} | Compact player-card status before attendance opens. |
| search.empty | Inga träffar på din sökning. | Empty state after actual search. |
| search.empty_help | Sök på spelare, klubb eller klass. | Optional helper text under empty state. |

## Player Page

The player page is now fallback-oriented. The main attendance flow should be search-first.

| Key | Swedish copy | Notes |
|---|---|---|
| player.page_title_fallback | Spelare | Fallback title if needed. |
| player.attendance_status_confirmed | Närvaro bekräftad | Confirmed status label. |
| player.attendance_status_absent | Frånvaro anmäld | Absent status label. |
| player.attendance_confirm_action | Bekräfta närvaro | Primary action. |
| player.attendance_absent_action | Anmäl frånvaro | Secondary action. |
| player.attendance_reset_action | Återställ närvaro | Optional if reset remains allowed. |
| player.attendance_opens_prefix | Närvaroanmälan öppnar | Prefix before time. |
| player.attendance_deadline_prefix | Anmäl senast | Prefix before deadline. |
| player.attendance_missing_after_deadline | Ingen närvaro registrerad | Missing state after deadline. |
| player.attendance_missing_after_deadline_help | Kontakta sekretariatet. | Inline help after deadline. |
| player.live_link_action | Se pool och resultat | Link into public class live view. |

## Club Page

| Key | Swedish copy | Notes |
|---|---|---|
| club.page_title_fallback | Klubb | Fallback title if needed. |
| club.player_search_placeholder | Sök bland klubbens spelare | Local filter input. |
| club.player_class_count | klasser | Used after a number. |
| club.open_player_action | Visa spelare | Link into detailed player page. |
| club.attendance_confirm_short | Bekräfta närvaro | Short action for dense list layouts. |
| club.attendance_absent_short | Anmäl frånvaro | Short action for dense list layouts. |
| club.no_players_found | Inga spelare matchar sökningen. | Empty local filter state. |

## PIN Modal

| Key | Swedish copy | Notes |
|---|---|---|
| pin_modal.title | Ange PIN-kod | Modal title. |
| pin_modal.input_placeholder | PIN-kod | Input placeholder. |
| pin_modal.submit_confirm | Bekräfta närvaro | Submit label when opened from confirm action. |
| pin_modal.submit_absent | Anmäl frånvaro | Submit label when opened from absent action. |
| pin_modal.cancel | Avbryt | Secondary action. |
| pin_modal.error_invalid_pin | Fel PIN-kod | Inline validation error. |
| pin_modal.error_generic | Något gick fel. Försök igen. | Generic submit error. |

## Attendance State Messages

| Key | Swedish copy | Notes |
|---|---|---|
| attendance.state_not_open | Närvarorapporteringen har inte öppnat än. | Generic state message. |
| attendance.state_not_open_with_time | Närvarorapporteringen öppnar {time}. | Prefer this where the time is known. |
| attendance.state_deadline_passed | Anmälningstiden har gått ut. Kontakta sekretariatet. | Deadline passed message. |
| attendance.state_schedule_missing | Tävlingsschemat är inte importerat än. | Existing system concept. |
| attendance.state_confirmed_at | Närvaro bekräftad {time} | Compact status copy. |
| attendance.state_absent_at | Frånvaro anmäld {time} | Compact status copy. |
| attendance.action_success_confirmed | Närvaro registrerad. | Optional toast or inline success. |
| attendance.action_success_absent | Frånvaro registrerad. | Optional toast or inline success. |

## Live Competition Overview

| Key | Swedish copy | Notes |
|---|---|---|
| live.page_title | följa tävlingen live | Main title on live class index. |
| live.filter_now | Pågår nu | Quick filter chip. |
| live.filter_day_one | Lördag | Example day filter. Replace dynamically if needed. |
| live.filter_day_two | Söndag | Example day filter. Replace dynamically if needed. |
| live.phase_pools_in_progress | Poolspel pågår | High-level class state. |
| live.phase_playoff_in_progress | Slutspel pågår | High-level class state. |
| live.phase_completed | Klassen är färdigspelad | Completed state. |
| live.matches_progress | {completed} av {total} matcher registrerade | Generic progress copy. |
| live.pool_matches_progress | {completed} av {total} poolmatcher registrerade | Slightly more specific variant. |
| live.open_class_action | Visa klass | CTA into class page. |

## Class Page

| Key | Swedish copy | Notes |
|---|---|---|
| class.page_title_fallback | Klass | Fallback title. |
| class.status_prefix | Status | Prefix before phase text. |
| class.tab_overview | Översikt | Tab label. |
| class.tab_pools | Pooler | Tab label. |
| class.tab_results | Resultat | Tab label. |
| class.tab_playoff | Slutspel | Tab label. |
| class.overview_heading | Översikt | Section heading. |
| class.pool_heading_prefix | Pool | Prefix before number. |
| class.open_pool_action | Visa pool | CTA into pool details. |
| class.no_pool_data | Ingen poolinformation är tillgänglig än. | Empty state before draw is available. |
| class.no_playoff_data | Ingen slutspelsinformation är tillgänglig än. | Empty state before playoff is available. |
| class.no_results_data | Inga resultat är registrerade än. | Empty results state. |

## Pool View

| Key | Swedish copy | Notes |
|---|---|---|
| pool.standings_heading | Ställning | Section heading. |
| pool.matches_heading | Matcher | Section heading. |
| pool.players_heading | Spelare | Optional section heading if players are listed separately. |
| pool.progress_prefix | matcher registrerade | Used in compact pool summary copy. |
| pool.no_matches | Inga matcher är registrerade än. | Empty pool state. |

## Playoff View

| Key | Swedish copy | Notes |
|---|---|---|
| playoff.heading | Slutspel | Main section heading. |
| playoff.round_of_16 | Sextondelsfinal | Round label if needed. |
| playoff.quarterfinal | Kvartsfinal | Round label. |
| playoff.semifinal | Semifinal | Round label. |
| playoff.final | Final | Round label. |
| playoff.third_place | Bronsmatch | Optional round label. |
| playoff.not_finished | Ej färdigspelad | Match state label. |
| playoff.no_data | Ingen slutspelsinformation är tillgänglig än. | Empty state. |

## Secretariat Entry

| Key | Swedish copy | Notes |
|---|---|---|
| admin.entry_title | Sekretariat | Start-page entry label. |
| admin.entry_description | Logga in för att arbeta med tävlingen. | Optional supporting text. |
| admin.pin_input_placeholder | PIN-kod | Reuse if the admin entry keeps a simple pin form. |

## Suggested Short Alternatives

These are optional shorter variants if the UI feels text-heavy.

| Longer text | Shorter alternative |
|---|---|
| Se anmälda klasser och rapportera närvaro. | Se klasser och rapportera närvaro. |
| Pooler, matcher, resultat och slutspel. | Följ matcher och resultat. |
| PIN behövs först när du rapporterar närvaro. | PIN krävs först vid rapportering. |
| Ingen närvaro registrerad | Ingen närvaro rapporterad |
| Kontakta sekretariatet. | Kontakta sekretariatet vid ändring. |

## Open Wording Decisions

These are likely worth deciding before implementation.

1. Should the product use `närvaro`, `incheckning`, or both?
2. Should `frånvaro` be phrased as `Anmäl frånvaro` or `Kan inte komma` in player-facing UI?
3. Should `följa tävlingen live` stay as the main public-results label, or be shortened later?
4. Should club-facing buttons use the short labels `Bekräfta` and `Frånvaro`, or the longer explicit labels?
5. Should player pages say `Se pool och resultat` or `Se klassens live-läge`?