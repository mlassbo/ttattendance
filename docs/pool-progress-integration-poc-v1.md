# Pool Progress Integration POC V1

This document defines a proof of concept for the pool progress integration.

The POC is intentionally narrower than the real integration plan.

Its purpose is to validate the highest-risk technical parts first:

- detecting copied Access backup files reliably
- opening and reading backup `.mdb` files safely
- extracting pool progress from the database
- producing stable output from repeated file changes

Instead of sending data to TTAttendance, the POC writes the extracted result to a local file.

## Goal

Build a Windows desktop application that:

- opens a local user interface
- lets the user configure one or more integrations
- monitors configured backup folders for `.mdb` file changes
- reads backup copies of the competition database
- extracts pool-level completed match counts per class
- writes the extracted snapshot to a local output file

The POC should prove that the local Access integration is workable before building the real API-based integration.

## Why This POC Exists

The highest-risk part of the overall project is not the TTAttendance API.

The highest-risk part is the local Windows-side integration with the Access backup files:

- whether backup file changes can be detected reliably
- whether copied files can be read without locking issues
- whether the MDB structure can be interpreted consistently
- whether the extracted data remains stable across repeated runs

This POC isolates those risks and removes the web/API dependency.

## Scope

V1 includes:

- a Windows desktop app, not a Windows service
- a UI for entering and editing integration configs
- support for multiple competition configs
- polling or file watching of configured backup folders
- copying candidate MDB files to a temp working folder before opening them
- extracting `class -> pool -> completed match count`
- writing the latest extracted result to local JSON files
- showing logs and latest status in the UI

V1 does not include:

- posting data to TTAttendance
- authentication with external services
- running in the background as a Windows service
- auto-start on boot
- complex admin/user permission models
- full class workflow derivation
- detailed match export

## Recommended App Shape

Build the POC as a Windows desktop application with a small local data folder.

Chosen tech stack for this POC:

- `.NET 8`
- `WPF`
- `C#`
- `MVVM`
- `System.Text.Json` for config and output serialization
- `Serilog` for file and in-memory logging
- `Microsoft.Extensions.DependencyInjection` for composition
- `Microsoft Access Database Engine` via `OleDb` as the primary MDB access method
- optional `DAO` fallback only if `OleDb` proves unreliable for the needed queries
- `WiX v4` for installer packaging

Reason:

- it is mature and predictable for a Windows-only tool
- it works well for forms, status panels, and log views
- it keeps the app close to the Windows file system and MDB access layer
- it is a pragmatic fit for validating the risky integration parts first

The POC should optimize for reliability and speed of validation rather than UI novelty.

## Concrete Tech Stack

This section fixes the implementation choices so a later agent does not need to make foundational stack decisions.

### Runtime and language

- `.NET 8`
- `C#`

Reason:

- modern long-term supported runtime
- strong Windows integration
- good support for background tasks, file IO, and desktop apps

### Desktop UI

- `WPF`
- `MVVM` presentation pattern

Recommended implementation detail:

- keep view models plain and lightweight
- avoid unnecessary framework-heavy MVVM libraries unless the project needs them

Reason:

- stable Windows desktop stack
- suitable for forms, logs, status views, and config editing
- easy to keep the POC maintainable without overengineering the UI

### Dependency injection and app composition

- `Microsoft.Extensions.DependencyInjection`
- `Microsoft.Extensions.Hosting` only if it simplifies background monitor wiring inside the desktop app

Reason:

- keeps the WPF app structured without adding a large framework
- aligns with modern .NET service composition patterns

### JSON and local persistence

- `System.Text.Json`

Use it for:

- config persistence
- runtime state persistence if needed
- output snapshot files

Reason:

- built into .NET
- sufficient for the POC
- avoids unnecessary dependencies

### Logging

- `Serilog`
- file sink for persistent logs
- in-memory sink or adapter for showing recent log entries in the UI

Reason:

- easy structured logging
- good fit for both diagnostics and UI status feeds
- minimizes custom logging code

### MDB access

- primary: `System.Data.OleDb` with the installed Microsoft Access Database Engine provider
- fallback: `DAO` only if needed for reliability or schema access edge cases

Reason:

- `OleDb` is straightforward for read-only table queries
- the POC should prefer the simplest provider that works against backup copies
- `DAO` is a useful escape hatch, but should not be the first choice if simple queries work through `OleDb`

### File hashing

- `SHA256` from `System.Security.Cryptography`

Reason:

- built into .NET
- good enough for duplicate suppression and source identity

### Installer and packaging

- `WiX v4`

Chosen direction:

- use a traditional Windows installer rather than `MSIX`

Reason:

- more predictable for a local utility that depends on Windows-specific providers
- fewer surprises around file system access and machine prerequisites
- easier fit for a classic desktop installation under `Program Files`

### Testing

- `xUnit`

Use it for:

- core extraction rule tests
- polling and stabilization logic tests
- duplicate suppression tests

Reason:

- lightweight and standard in .NET projects
- enough for the small but important unit test coverage needed in the POC

### Optional libraries to avoid unless needed

Avoid introducing these in the first implementation unless there is a concrete problem they solve:

- heavy MVVM frameworks
- local embedded databases
- message buses
- real-time file watcher complexity as the primary detection path
- advanced installer bootstrap logic

The POC should stay intentionally plain.

## High-Level Flow

1. The user opens the desktop app.
2. The user creates one or more competition integration configs.
3. Each config points to a backup folder and file pattern.
4. The app monitors the folder.
5. When a matching `.mdb` file appears or changes, the app waits until the file is stable.
6. The app copies that file to a temp working path.
7. The app opens the temp copy read-only.
8. The app extracts pool progress data.
9. The app writes the extracted result to a local JSON file.
10. The app updates the UI with status, timestamps, and errors.

## POC Success Criteria

The POC is successful if all of the following are true:

- the app detects new or updated backup files reliably
- the app does not need to touch the live MDB file
- the backup copy can be opened repeatedly without corruption or lock issues
- the extracted result file updates when the source backup changes
- repeated processing of the same unchanged file does not produce inconsistent output
- the user can configure multiple competitions without editing files manually

## Minimal Functional Requirements

### Configuration UI

The app must let the user enter at least:

- a display name for the config
- competition slug or identifier
- backup folder path
- file pattern such as `*.mdb`
- poll interval in seconds
- local output folder
- enabled flag

Optional but useful fields:

- debounce or stabilization delay in seconds
- temp working folder override

### Monitoring

The app must support:

- starting monitoring manually from the UI
- stopping monitoring manually from the UI
- showing whether each config is currently running
- showing the latest detected source file
- showing the latest processed timestamp

### Extraction

The app must extract, per class and per pool:

- class name
- class date
- class time
- external class key
- pool number
- completed match count

### Output

The app must write a local JSON file for each config.

The output file should be easy to inspect manually.

## Local Storage Layout

The POC should keep local files in a predictable app-owned folder.

Suggested layout:

```text
%LocalAppData%\TTAttendancePoolProgressPoc\
  config.json
  logs\
  temp\
  output\
```

Suggested use:

- `config.json`: saved competition configs
- `logs\`: rolling log files or daily text logs
- `temp\`: copied MDB working files
- `output\`: extracted JSON snapshots

## Installation, Updates, and Uninstall

The POC app should be easy to deploy on a Windows machine used by the secretariat.

This matters even for a proof of concept because difficult installation or update steps will slow down real-world validation.

### Goals

The app should be:

- easy to install without developer tooling
- easy to update when the extractor logic changes
- easy to remove cleanly if the POC is abandoned or replaced
- predictable about where it stores files

### Recommended packaging approach

Use a standard Windows installer package for the POC.

Recommended direction:

- produce a normal installed desktop application
- install it under `Program Files`
- store mutable app data under `%LocalAppData%`
- create a Start Menu shortcut
- optionally create a desktop shortcut

Chosen tooling:

- `WiX v4`

Reason:

- fits a classic WPF desktop application well
- supports normal install, upgrade, and uninstall flows cleanly
- is a better fit than `MSIX` for a pragmatic Windows utility with local file access and provider dependencies

Pragmatic recommendation for the POC:

- use a straightforward MSI-based install flow
- do not optimize for advanced enterprise deployment features

### Why install instead of xcopy-only

A folder-copy app is tempting for speed, but a real installer is still preferable because it gives:

- a clear install location
- a predictable uninstall path
- a clearer update story
- fewer manual setup mistakes

### Installation requirements

The installer should:

- install the app binaries in a standard location
- create required shortcuts
- detect or clearly document any prerequisites
- not require the user to create app data folders manually
- not require editing config files by hand

Suggested install target:

- `%ProgramFiles%\TTAttendance Pool Progress POC\`

Suggested app data target:

- `%LocalAppData%\TTAttendancePoolProgressPoc\`

### Prerequisites

The install experience should address the actual runtime dependencies.

Expected prerequisites:

- supported Windows version
- `.NET Desktop Runtime` matching the chosen app target
- Microsoft Access database provider if the extractor depends on ACE/OLE DB being present

The app should detect missing prerequisites at startup and show a clear error message.

The installer should either:

- bootstrap missing prerequisites
- or document them clearly and fail early

For the POC, failing clearly is acceptable if bootstrapping adds too much complexity.

### Update strategy

The POC should support simple manual updates.

Recommended update model:

- publish a new installer version
- run the installer again to upgrade in place
- preserve local config, logs, and output files in `%LocalAppData%`

Required update behavior:

- configs remain intact across upgrades
- output folder contents remain intact across upgrades
- logs remain intact across upgrades unless intentionally rotated
- user does not need to re-enter competition configs after each update

The app should keep user-editable or runtime-generated state out of the install directory.

That separation is the key to painless updates.

### Versioning

The app should show its version in the UI.

Recommended locations:

- main window footer or about section
- log startup line

Example:

- `TTAttendance Pool Progress POC v0.1.0`

This is important when validating extractor behavior across multiple builds.

### Uninstall behavior

Uninstall should remove the installed application cleanly.

Recommended uninstall behavior:

- remove app binaries and shortcuts
- leave `%LocalAppData%\TTAttendancePoolProgressPoc\` intact by default
- optionally inform the user where config, logs, temp files, and output files remain

Reason:

- preserving local app data is safer during a POC
- it prevents accidental loss of logs and output snapshots needed for debugging

Optional later enhancement:

- add a separate `Delete local data` checkbox in the installer or uninstall flow

### Portable diagnostics after uninstall

Even after uninstall, it should still be possible to inspect:

- the last config used
- generated output JSON files
- logs showing why a run failed

This is another reason to keep runtime state in `%LocalAppData%` instead of the install directory.

### First-run behavior after install

After installation, the user should be able to:

1. launch the app from the Start Menu or desktop shortcut
2. create a config in the UI
3. run the POC immediately without extra setup steps beyond prerequisites

The app should create any missing local folders automatically on first launch.

### Acceptance criteria for packaging

The POC packaging is good enough when:

- a non-developer can install it from a packaged installer
- the app launches without manual folder preparation
- an update preserves config and output data
- uninstall removes the app binaries cleanly
- logs and generated JSON remain available after uninstall unless explicitly deleted

### Suggested implementation order for packaging

Packaging should come after the core app works locally.

Recommended order:

1. finish the local app and manual validation first
2. separate install-time files from runtime data paths
3. add version display in the UI
4. create the installer project or packaging pipeline
5. test install, upgrade, and uninstall on a clean Windows machine

## Configuration Model

Suggested config shape:

```json
{
  "competitions": [
    {
      "id": "local-guid-or-uuid",
      "name": "Sundaspelen 2025",
      "competitionSlug": "sundaspelen-2025",
      "backupFolder": "C:\\TTCoordinator\\Backups\\Sundaspelen2025",
      "filePattern": "*.mdb",
      "pollIntervalSeconds": 30,
      "stabilizationSeconds": 5,
      "outputFolder": "C:\\Users\\martin.lassbo\\AppData\\Local\\TTAttendancePoolProgressPoc\\output",
      "enabled": true
    }
  ]
}
```

This config is intentionally simpler than the real integration config because there is no API URL or API key yet.

## Detection Strategy

The POC should validate file detection carefully.

Recommended strategy:

- use polling first, not `FileSystemWatcher` as the only mechanism
- optionally add `FileSystemWatcher` later for responsiveness

Reason:

- polling is usually more predictable with copied MDB files on local disk or shared folders
- many problems with file watching come from partially written files or duplicate change events

### Recommended polling algorithm

For each enabled config:

1. List files matching the configured pattern.
2. Pick the newest candidate by modified time.
3. Compare it with the last processed file path, modified time, and size.
4. If it looks new or changed, wait the stabilization delay.
5. Recheck size and modified time.
6. If still stable, copy it to the temp folder.
7. Process the copied file.

This approach is more important to validate than real-time responsiveness.

## MDB Access Rules

The POC must never open the live competition database.

It should only:

- read files from the configured backup folder
- copy them to a temp working location
- open the temp copy read-only

Recommended access methods:

- `Microsoft Access Database Engine` via `OLE DB` or `DAO`

The app should log which provider is actually used on the machine.

## Data Extraction Rules

Use the same narrow extraction target as the main integration plan.

### Required tables

- `Klasser`
- `PoolNummer`
- `Matchtabell`

### Output data per class

- `className`
- `classDate`
- `classTime`
- `externalClassKey`
- `pools[]`

### Output data per pool

- `poolNumber`
- `completedMatchCount`

## Completed Match Rule

The POC must test a concrete definition of "match result registered".

Recommended initial rule:

- count the match as completed if `Setsiffror` is non-empty

Optional fallback if needed after testing:

- also count as completed if `MatchKlar` is true
- or if `Inmatningstidpunkt` is non-null

The POC should make this rule visible in code and easy to change.

## Pool Assignment Rule

Recommended initial rule:

- treat a row in `Matchtabell` as a pool match when `A_Poolnr` and `B_Poolnr` are both present and equal
- assign the match to that pool number within the class

The POC should log counts that are skipped because they do not match this rule.

That will make debugging easier when reviewing real data.

## Output File Format

Write one JSON file per competition config.

Suggested filename:

- `<competition-slug>.latest.json`

Suggested output shape:

```json
{
  "competitionSlug": "sundaspelen-2025",
  "source": {
    "fileName": "Sunda2025_backup_2025-05-03_10-15.mdb",
    "filePath": "C:\\TTCoordinator\\Backups\\Sundaspelen2025\\Sunda2025_backup_2025-05-03_10-15.mdb",
    "fileModifiedAt": "2025-05-03T08:15:12Z",
    "copiedToTempAt": "2025-05-03T08:16:00Z",
    "processedAt": "2025-05-03T08:16:03Z",
    "fileHash": "sha256:..."
  },
  "summary": {
    "classes": 3,
    "pools": 8,
    "completedMatches": 17
  },
  "classes": [
    {
      "externalClassKey": "max400::2025-05-03::09:00",
      "className": "Max400",
      "classDate": "2025-05-03",
      "classTime": "09:00",
      "pools": [
        { "poolNumber": 1, "completedMatchCount": 2 },
        { "poolNumber": 2, "completedMatchCount": 3 }
      ]
    }
  ]
}
```

This should be the same general shape as the later API payload so the POC output can be reused.

## UI Requirements

The desktop UI does not need to be sophisticated.

It should include at least:

### Config list view

- list of all configs
- enabled state
- last processed time
- latest status

### Config edit form

- name
- competition slug
- backup folder
- file pattern
- poll interval
- stabilization delay
- output folder
- enabled

### Run status section

- current state such as `idle`, `watching`, `processing`, `error`
- latest file processed
- latest output file written
- latest error message

### Log view

- recent events in timestamp order

Examples:

- `Detected new backup file`
- `Waiting for file stabilization`
- `Copied backup to temp`
- `Opened MDB successfully`
- `Wrote output JSON`
- `Processing failed`

## Logging Requirements

The POC should log enough information to debug detection and extraction problems.

Minimum log events:

- config loaded
- monitor started or stopped
- candidate file detected
- candidate rejected as unstable
- temp copy created
- MDB provider selected
- extraction started
- extraction finished
- output file written
- error message and stack trace

This log is one of the main outputs of the POC.

## Duplicate Processing Behavior

The POC should avoid unnecessary reprocessing.

Recommended rule:

- keep a small in-memory and persisted record of the last processed file hash per config
- if the newest stable file has the same hash, do not rewrite output unless explicitly requested

This helps confirm whether change detection is behaving correctly.

## Manual Controls

The UI should offer a few explicit actions:

- `Start monitoring`
- `Stop monitoring`
- `Run now`
- `Open output folder`
- `Open log folder`

`Run now` is especially useful for testing.

## Failure Handling

### Expected failure cases

- backup folder not found
- no matching MDB files
- file still being copied
- Access provider missing
- MDB parse error
- unexpected schema differences
- output file write failure

### Required behavior

- show the error in the UI
- keep the app running
- keep previous successful output file intact
- allow retry on next poll or manual run

## Validation Plan

The POC should be tested against a real operational flow.

### Scenario 1: idle backup folder

- app starts
- config loads
- no backup file exists yet
- app stays healthy and shows waiting state

### Scenario 2: first backup appears

- a new MDB backup is copied into the folder
- app detects it
- waits for stability
- reads the copy
- writes output JSON

### Scenario 3: backup updated later

- a newer backup appears
- app processes the new file only once
- output JSON changes accordingly

### Scenario 4: same file seen again

- polling sees the same unchanged file repeatedly
- app does not produce noisy duplicate processing

### Scenario 5: partially copied file

- file appears before copy is complete
- app waits and does not process too early

### Scenario 6: malformed or unreadable MDB

- app records the error cleanly
- app stays usable

## Detailed Implementation Plan

This section turns the POC into an implementation-ready plan without starting development.

### Step 1: Create the desktop solution

Create one Visual Studio solution for the POC.

Recommended solution structure:

```text
TTAttendancePoolProgressPoc.sln
  src/
    TTAttendancePoolProgressPoc.App/
    TTAttendancePoolProgressPoc.Core/
    TTAttendancePoolProgressPoc.Infrastructure/
  tests/
    TTAttendancePoolProgressPoc.Core.Tests/
```

Recommended project responsibilities:

- `TTAttendancePoolProgressPoc.App`
  WPF application, windows, view models, commands, startup wiring

- `TTAttendancePoolProgressPoc.Core`
  domain models, extraction rules, polling logic contracts, pure business logic

- `TTAttendancePoolProgressPoc.Infrastructure`
  file system access, config persistence, logging, hashing, MDB access, JSON output writing

- `TTAttendancePoolProgressPoc.Core.Tests`
  unit tests for polling decisions, extraction mapping rules, file identity logic, output shaping

Reason:

- the risky parts can be tested separately from the UI
- MDB access and file IO stay isolated from the desktop layer
- the later production implementation can reuse much of the same extractor code

### Step 2: Define the core domain model

Create the basic domain types first so the rest of the app is shaped around stable contracts.

Recommended core models:

- `CompetitionMonitorConfig`
- `CompetitionMonitorState`
- `DetectedBackupFile`
- `StableBackupCandidate`
- `ProcessedSnapshotIdentity`
- `PoolProgressSnapshot`
- `PoolProgressClass`
- `PoolProgressPool`
- `ExtractionResult`
- `AppLogEntry`

Suggested fields:

`CompetitionMonitorConfig`

- `Id`
- `Name`
- `CompetitionSlug`
- `BackupFolder`
- `FilePattern`
- `PollIntervalSeconds`
- `StabilizationSeconds`
- `OutputFolder`
- `Enabled`

`CompetitionMonitorState`

- `ConfigId`
- `Status`
- `LatestDetectedFile`
- `LatestProcessedFile`
- `LatestProcessedAt`
- `LatestOutputFile`
- `LatestError`
- `LastProcessedHash`

`PoolProgressSnapshot`

- `CompetitionSlug`
- `Source`
- `Summary`
- `Classes`

This model should be finalized before UI and infrastructure code spread assumptions across the app.

### Step 3: Define service interfaces

Before implementing file access or MDB reading, define clear interfaces.

Recommended interfaces:

- `IConfigStore`
- `ILogStore`
- `IOutputWriter`
- `IFileHashService`
- `IBackupFileDetector`
- `IBackupStabilizer`
- `IWorkingCopyService`
- `IMdbPoolProgressExtractor`
- `ICompetitionMonitorRunner`
- `IClock`

Responsibilities:

- `IConfigStore`: load and save app config
- `ILogStore`: append and query local log entries
- `IOutputWriter`: write the latest snapshot JSON
- `IFileHashService`: compute file hash for duplicate detection
- `IBackupFileDetector`: choose the best candidate file from a folder
- `IBackupStabilizer`: confirm that a candidate file is stable before processing
- `IWorkingCopyService`: create temp copies and clean them up
- `IMdbPoolProgressExtractor`: open MDB and return extracted pool progress
- `ICompetitionMonitorRunner`: orchestrate one config’s polling lifecycle
- `IClock`: make timing and tests deterministic

These interfaces should be kept simple because the POC does not need framework-heavy abstractions.

### Step 4: Implement local persistence and folders

Implement the app-owned local storage first.

Required behavior:

- create the base app folder under `%LocalAppData%`
- create `logs`, `temp`, and `output` folders on startup
- load `config.json` if present
- create a default empty config file if missing

Implementation details:

- use `System.Text.Json`
- save config atomically by writing a temp file and replacing the old file
- do not block the UI thread while reading or writing files

Acceptance criteria:

- app can start from a clean machine profile
- app can restart and retain configs
- corrupted config file yields a visible error and safe fallback behavior

### Step 5: Build the WPF shell and screens

Build the minimum UI needed for testing the risky integration parts.

Recommended screens and layout:

#### Main window

- left panel: list of configured competitions
- center panel: selected config details and status
- bottom or right panel: recent log events

#### Config editor dialog or panel

- text fields for `Name`, `CompetitionSlug`, `BackupFolder`, `FilePattern`, `OutputFolder`
- numeric inputs for `PollIntervalSeconds`, `StabilizationSeconds`
- checkbox for `Enabled`
- buttons for `Save`, `Cancel`, and folder browse actions

#### Status section

- current runtime state: `Idle`, `Watching`, `Processing`, `Success`, `Error`
- latest detected source file
- latest processed file
- latest output file
- latest successful run time
- latest error

#### Commands

- `Add config`
- `Edit config`
- `Delete config`
- `Start monitoring`
- `Stop monitoring`
- `Run now`
- `Open output folder`
- `Open log folder`

Implementation approach:

- use MVVM
- keep one main window for the POC
- avoid complex navigation or multiple windows unless needed

### Step 6: Implement polling and file stabilization

This is one of the two highest-risk areas and should be implemented early.

Recommended behavior for one config cycle:

1. Find all matching files in the backup folder.
2. Select the newest candidate.
3. Read candidate path, size, and modified time.
4. If it is unchanged from the last processed identity, skip.
5. Wait `StabilizationSeconds`.
6. Re-read size and modified time.
7. If either changed, log `candidate unstable` and wait for next cycle.
8. If stable, compute hash.
9. If hash matches the last processed hash, skip.
10. If not, create a temp working copy and process it.

Implementation notes:

- prefer one background loop per enabled config
- use `CancellationToken` for stop behavior
- prevent overlapping runs for the same config
- do not use `FileSystemWatcher` as the primary trigger in the first implementation

Acceptance criteria:

- partially copied files are not processed prematurely
- unchanged files are not reprocessed endlessly
- stopping monitoring halts new work cleanly

### Step 7: Implement working copy creation

This is the safety boundary around MDB access.

Required behavior:

- copy the source backup file to a unique temp filename
- keep the original file untouched
- open only the copied file
- delete or rotate old temp files safely

Recommended temp naming:

- `<competition-slug>-<yyyyMMdd-HHmmss>-<shorthash>.mdb`

Implementation notes:

- create a new temp file for each processed candidate
- avoid reusing the same temp filename
- if cleanup fails because a provider still holds a handle, log it and retry later

Acceptance criteria:

- no processing step opens the source backup path directly
- temp files can be inspected during debugging if needed

### Step 8: Implement MDB connectivity and extraction

This is the other highest-risk area and should be built as a dedicated infrastructure service.

Recommended extractor responsibilities:

- open the temp MDB copy read-only
- read only the tables required for V1
- normalize raw database rows into simple extractor records
- apply the completed-match and pool-assignment rules
- return a `PoolProgressSnapshot`

Suggested internal extraction steps:

1. Read class metadata from `Klasser`.
2. Read available pool numbers from `PoolNummer`.
3. Read match rows from `Matchtabell`.
4. Filter rows that represent pool matches.
5. Count completed matches per class and pool.
6. Build normalized class keys from class name, date, and time.
7. Produce a snapshot object with source metadata and summary counts.

Recommended implementation detail:

- keep SQL or recordset access in the infrastructure layer
- keep match classification and counting logic in the core layer

Acceptance criteria:

- extractor can process the provided sample MDB backup
- output is deterministic across repeated runs of the same file
- skipped match rows are visible in logs for debugging

### Step 9: Implement JSON output writing

Once extraction succeeds, write the result to a predictable local file.

Required behavior:

- write one latest snapshot file per config
- write pretty-printed JSON for manual inspection
- write atomically to avoid half-written output files

Recommended implementation:

- write to `<slug>.latest.json.tmp`
- replace `<slug>.latest.json` after the temp write succeeds

Optional enhancement:

- also keep timestamped historical snapshots for debugging

Suggested historical filename:

- `<slug>.<yyyyMMdd-HHmmss>.json`

Acceptance criteria:

- latest output file is always valid JSON
- a failed write does not destroy the previous successful output

### Step 10: Add runtime logging and diagnostics

The app must make failures explainable.

Implement logging in two places:

- in-memory log feed for the UI
- file log on disk for later inspection

Recommended log fields:

- timestamp
- config id or competition slug
- level: `Info`, `Warning`, `Error`
- event name
- message
- exception details if present

Recommended first event names:

- `config_loaded`
- `monitor_started`
- `monitor_stopped`
- `candidate_found`
- `candidate_unstable`
- `candidate_skipped_same_hash`
- `working_copy_created`
- `mdb_opened`
- `extraction_completed`
- `output_written`
- `processing_failed`

Acceptance criteria:

- a failed run can be diagnosed from logs without attaching a debugger

### Step 11: Add duplicate suppression and last-run tracking

The POC should prove that file detection is stable, so duplicate behavior matters.

Persist, per config:

- last processed source path
- last processed modified time
- last processed file size
- last processed hash
- last success timestamp

Use these values to:

- avoid noisy reprocessing
- show state in the UI
- confirm whether the monitor reacts only to meaningful changes

Implementation note:

- store this runtime state separately from user-editable config if that keeps the config file cleaner

### Step 12: Add unit tests for the risky logic

The POC should not be test-heavy everywhere, but a few targeted tests are worth it.

Highest-value unit tests:

- candidate file selection chooses the newest matching file
- stabilization logic rejects changing files
- duplicate suppression skips identical hashes
- external class key generation is stable
- completed-match rule counts only intended rows
- pool-assignment rule groups only valid pool matches
- JSON output shape matches the documented contract

These tests should live in `TTAttendancePoolProgressPoc.Core.Tests`.

### Step 13: Run a manual end-to-end validation pass

Before considering the POC done, validate it manually against real file operations.

Manual validation checklist:

- create one config and save it
- point it at a folder with no MDB files
- copy in a valid MDB backup and confirm one successful output write
- replace it with a newer backup and confirm a second output update
- repeat polling without changing the file and confirm no duplicate processing
- test a partially copied file if feasible
- test an invalid or locked MDB and confirm graceful failure

## Implementation Milestones

Use these milestones to keep the work sequential and measurable.

### Milestone 1: Desktop shell

Done when:

- WPF app starts
- config list UI exists
- configs can be created, edited, deleted, and saved

### Milestone 2: Manual processing

Done when:

- `Run now` processes one config
- temp copy is created
- extractor reads MDB
- latest JSON output file is written

### Milestone 3: Monitoring loop

Done when:

- enabled configs poll automatically
- stable file detection works
- duplicate processing is suppressed

### Milestone 4: Diagnostics

Done when:

- UI shows logs and latest status
- failures remain visible and actionable

### Milestone 5: Real backup validation

Done when:

- the app is exercised against real competition backups
- the completed-match rule and pool grouping rule are confirmed or adjusted

## Recommended Build Order

1. Create the solution and the WPF app shell.
2. Add config persistence and the config editing UI.
3. Define core models and service interfaces.
4. Implement manual `Run now` for one config.
5. Implement temp-copy creation and MDB extraction.
6. Write latest snapshot JSON to the output folder.
7. Add polling and stabilization logic.
8. Add runtime logs and UI status reporting.
9. Add duplicate suppression and persisted last-run metadata.
10. Validate against real backup files and refine the extraction rules.

## Deliverables

The POC should produce:

- a working Windows desktop app
- saved local integration configs
- local logs
- one JSON output file per competition config
- confidence that MDB backup detection and extraction are viable

## What A Future Agent Should Build From This

After the POC succeeds, the next implementation can replace the local JSON writer with a TTAttendance API client.

That later step should reuse:

- the same config model, adding API URL and API key
- the same MDB extraction logic
- the same output payload shape
- the same file stabilization and temp-copy rules

The POC should therefore be treated as a production-shape extractor with a local-file sink.
