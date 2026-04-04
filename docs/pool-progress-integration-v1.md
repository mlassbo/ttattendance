# Pool Progress Integration V1

This document defines the first version of an integration between the local Windows competition system and TTAttendance.

## Goal

Make one narrow piece of competition progress visible in TTAttendance without touching the live competition database:

- for each class
- for each pool in that class
- show how many matches have had their result registered

This is enough to give the secretariat, players, and audience an early hint about class progress and potential delays.

## Scope

V1 includes:

- reading copied `.mdb` backup files from disk
- extracting pool-level match result counts from the backup copy
- sending that data into TTAttendance
- storing the latest imported pool progress per class
- exposing the imported data to TTAttendance pages and APIs
- making it possible to derive delay indicators in TTAttendance later

V1 does not include:

- reading the live `.mdb` file used by the competition application
- changing the existing TTAttendance competition import flow
- changing the current class workflow model
- syncing full draw structure, seedings, or detailed match results
- bi-directional communication back to the competition system
- complex auth flows or user-specific permissions for the integration

## Constraints

- The competition system is an older local Windows application.
- The integration must not risk locking or corrupting the live Access database.
- The secretariat already has a backup function that copies the `.mdb` file to another location.
- One local integration service may handle several competitions.
- Configuration should stay simple enough that an API key can be copied into the service configuration UI per competition.

## High-Level Design

Use a one-way snapshot flow:

1. The competition application writes a backup copy of the `.mdb` file to a configured folder.
2. A local Windows integration service watches or polls that folder.
3. The service copies the backup file into its own temporary working location.
4. The service reads the working copy only.
5. The service derives pool match counts per class.
6. The service posts a normalized JSON payload to TTAttendance.
7. TTAttendance stores the latest imported pool progress and serves it to UI/API consumers.

This keeps the live `.mdb` file outside the integration boundary.

## Why This Shape

This design is intentionally narrow and conservative:

- no direct reads from the live Access file
- no writes to the competition system
- no need to reinterpret the existing TTAttendance workflow model
- easy to reason about operational failures
- easy to replay old snapshots if needed

The only responsibility of the integration is to publish a stable read model: pool progress per class.

## Components

### 1. Local Windows Integration Service

This runs on the same machine as the competition system or another local machine that can access the backup folder.

Responsibilities:

- watch or poll configured backup folders
- detect when a new backup file is complete and stable
- copy the backup file to a service-owned temp folder
- open the temp copy read-only
- extract class and pool progress data
- build a normalized payload
- call TTAttendance with an API key
- log success and failure locally

Recommended implementation options:

- `.NET Worker Service` if this becomes a real Windows service
- PowerShell prototype first, then migrate to `.NET` if needed

Reason:

- MDB access on Windows is best handled with ACE/DAO/OLE DB tooling rather than Node.js

### 2. TTAttendance Integration API

Add a small backend endpoint in TTAttendance for snapshot ingestion.

Responsibilities:

- authenticate requests using a simple per-competition API key
- validate payload shape
- map external classes to existing TTAttendance classes
- persist the import run
- update the latest pool progress per class
- expose freshness metadata for the UI

The endpoint should not update attendance, registrations, or manual workflow steps.

### 3. TTAttendance Read Model

Store imported pool progress separately from the existing workflow tables.

Responsibilities:

- hold the latest imported pool counts per class
- show when data was last refreshed
- allow future delay derivation
- allow future player-facing or audience-facing views

## Existing TTAttendance Areas To Preserve

The current TTAttendance model should remain unchanged in V1:

- competition import remains as it is today
- attendance remains the source of truth for attendance state
- `class_workflow_steps` and `class_workflow_events` remain as they are

The imported pool progress is an additional read model, not a replacement for workflow state.

## Minimal Data Needed From The MDB

V1 should read as little as possible.

Primary tables:

- `Klasser`
- `PoolNummer`
- `Matchtabell`

Optional later:

- `Pooler` if TTAttendance later wants expected match counts per pool

### Intended meaning

- `Klasser` gives the class identity and schedule.
- `PoolNummer` gives the pools that exist within each class.
- `Matchtabell` gives match rows from which completed-result counts can be derived.

## External Class Identity

Match external MDB classes to TTAttendance classes using the same identity concept TTAttendance already uses for imports:

- normalized class name
- class date
- class time

This avoids introducing a second class matching scheme.

Derived external key:

`normalized(className) + '::' + classDate + '::' + classTime`

If a class cannot be matched, store that in the sync run result and do not update any TTAttendance class from that row.

## Pool Progress Definition

V1 read model per pool:

- class key
- pool number
- matches with registered result
- imported at timestamp
- source snapshot metadata

### Working rule for "registered result"

The integration should count a match as having a registered result when the `Matchtabell` row shows clear evidence that a result has been entered.

Candidate indicators in `Matchtabell`:

- `Setsiffror` is non-empty
- or `Inmatningstidpunkt` is non-null
- or `MatchKlar` is true

V1 should implement one explicit rule and keep it consistent.

Recommended initial rule:

- count the match as completed if `Setsiffror` is non-empty
- if later testing shows this is too weak or too strong, extend the rule with `MatchKlar` or `Inmatningstidpunkt`

This rule must be validated on at least one real competition backup where pool matches have already been played.

### Working rule for assigning a match to a pool

Use `Matchtabell` pool fields to group matches by pool.

Recommended initial rule:

- if `A_Poolnr` and `B_Poolnr` are both set and equal, treat the row as a pool match for that pool
- group by class plus that pool number

If later evidence shows TT Coordinator stores pool matches differently for some match types, adjust the extractor rule only in the local service.

## TTAttendance Storage Model

Keep this separate from workflow tables.

Suggested tables:

### `competition_pool_sync_configs`

Stores per-competition integration settings.

Suggested fields:

- `competition_id uuid primary key references competitions(id)`
- `enabled boolean not null default false`
- `api_key_hash text not null`
- `stale_after_minutes integer not null default 15`
- `updated_at timestamptz not null default now()`

### `competition_pool_sync_runs`

One row per received snapshot.

Suggested fields:

- `id uuid primary key default gen_random_uuid()`
- `competition_id uuid not null references competitions(id)`
- `received_at timestamptz not null default now()`
- `source_file_name text`
- `source_file_modified_at timestamptz`
- `source_file_hash text`
- `status text not null check (status in ('accepted', 'rejected', 'partial'))`
- `payload_json jsonb not null`
- `summary_json jsonb not null`

### `competition_pool_progress_latest`

One latest row per class and pool.

Suggested fields:

- `competition_id uuid not null references competitions(id)`
- `class_id uuid not null references classes(id) on delete cascade`
- `pool_number integer not null`
- `completed_match_count integer not null`
- `source_run_id uuid not null references competition_pool_sync_runs(id) on delete cascade`
- `source_snapshot_at timestamptz not null`
- `updated_at timestamptz not null default now()`
- `primary key (class_id, pool_number)`

This table is enough for V1.

It intentionally does not try to store full match detail.

## Ingestion Payload

Suggested payload shape:

```json
{
  "competitionSlug": "sundaspelen-2025",
  "source": {
    "fileName": "Sunda2025_backup_2025-05-03_10-15.mdb",
    "fileModifiedAt": "2025-05-03T08:15:12Z",
    "snapshotTakenAt": "2025-05-03T08:16:03Z",
    "fileHash": "sha256:..."
  },
  "classes": [
    {
      "externalClassKey": "max400::2025-05-03::09:00",
      "className": "Max400",
      "classDate": "2025-05-03",
      "classTime": "09:00",
      "pools": [
        { "poolNumber": 1, "completedMatchCount": 2 },
        { "poolNumber": 2, "completedMatchCount": 3 },
        { "poolNumber": 3, "completedMatchCount": 1 }
      ]
    }
  ]
}
```

The payload should be idempotent at the snapshot level.

If the same file hash is posted twice for the same competition, TTAttendance may accept it and no-op, or reject it as already processed.

## API Authentication

Keep this simple.

### Requirements

- one API key per competition
- easy to copy and paste into the Windows service configuration UI
- no user login flow
- no OAuth
- no rotating short-lived tokens in V1

### Recommended approach

For each configured competition:

- TTAttendance stores a generated API key hash
- the Windows service stores the plain API key
- the service sends the key in a header such as `x-integration-api-key`
- TTAttendance looks up the competition by slug and compares the key against the stored hash

This is simple enough operationally and sufficient for the risk level described.

## Local Service Configuration

The service must support multiple competitions.

Minimum per-competition configuration:

- competition slug
- TTAttendance base URL
- API key
- backup folder path
- filename pattern, if needed
- polling interval
- enabled flag

Suggested config shape:

```json
{
  "competitions": [
    {
      "competitionSlug": "sundaspelen-2025",
      "apiBaseUrl": "https://ttattendance.example.com",
      "apiKey": "paste-the-key-here",
      "backupFolder": "C:\\TTCoordinator\\Backups\\Sundaspelen2025",
      "filePattern": "*.mdb",
      "pollIntervalSeconds": 30,
      "enabled": true
    }
  ]
}
```

If the service later gets a UI, this same model can be edited in a simple form.

## Snapshot Processing Rules

The local service should follow these rules:

1. Only read files from the configured backup location.
2. Ignore files that are still changing size or modified timestamp.
3. Copy the file to a temp working path before opening it.
4. Open the temp copy read-only.
5. If parsing fails, keep the error local and do not post a partial payload unless explicitly supported.
6. Post one complete snapshot per competition.
7. If the post succeeds, mark that file hash as processed locally.

This keeps the process predictable and avoids repeated processing loops.

## TTAttendance Read API

TTAttendance should expose a small read API for the latest pool progress by class.

Suggested response shape:

```json
{
  "classId": "...",
  "className": "Max400",
  "lastImportedAt": "2025-05-03T08:16:03Z",
  "isStale": false,
  "pools": [
    { "poolNumber": 1, "completedMatchCount": 2 },
    { "poolNumber": 2, "completedMatchCount": 3 }
  ]
}
```

V1 can keep this admin-only if needed.

Later it can be reused for player-facing and audience-facing pages.

## How TTAttendance Should Use The Data

V1 should treat imported pool progress as observational data.

It should not:

- mark workflow steps as done automatically
- overwrite manual checklist state
- alter attendance state

It should:

- show the last imported timestamp
- show pool counts per class
- allow future derivation of "possibly delayed" indicators

## Delay Derivation

Delay logic should stay in TTAttendance, not in the Windows service.

Reason:

- the Windows service should only extract facts from the MDB backup
- business interpretation belongs in the web app

V1 may start with very simple delay hints, for example:

- if class start time has passed by a configured threshold and all pool counts are still zero, mark the class as `at_risk`
- if pool counts are increasing, mark the class as `in_progress`
- if data is older than `stale_after_minutes`, mark it as `stale`

This can evolve later without changing the local service.

## Failure Handling

### Local service failures

Examples:

- backup file missing
- file still being written
- MDB parse error
- network error posting to TTAttendance

Behavior:

- log locally
- retry on next poll
- do not touch TTAttendance state until a complete snapshot is posted

### TTAttendance ingestion failures

Examples:

- bad API key
- payload schema error
- unmatched classes

Behavior:

- return a clear 4xx or 5xx response
- record the rejected run when possible
- keep the previous `competition_pool_progress_latest` rows untouched

## Implementation Phases

### Phase 1

Build the end-to-end pipeline with one narrow output:

- create integration tables and API
- build local snapshot reader
- extract `class -> pool -> completed match count`
- store latest progress in TTAttendance
- expose a basic admin read API

### Phase 2

Show the imported data in TTAttendance admin views:

- class detail page
- dashboard summary
- freshness badge

### Phase 3

Add public visibility:

- player-facing class progress
- audience-facing board or simple public page

## Recommended First Implementation Choices

To keep V1 small and safe:

- use the backup copy only
- build the local component as a simple polling service
- use one API key per competition
- store only latest pool counts, not full match detail
- keep delay derivation in TTAttendance
- do not couple imported pool progress to existing workflow mutations

## Open Questions To Validate Early

Before implementation is finalized, validate these against one real backup after pool matches have started:

- which exact `Matchtabell` fields are the most reliable signal for a registered result
- whether pool matches are always identifiable by `A_Poolnr` and `B_Poolnr`
- whether pool numbers are always numeric and stable
- whether TTAttendance class times always match MDB class times closely enough for identity matching

These are integration-detail questions, not reasons to broaden the scope.

## Suggested Work Breakdown For A Future Agent

1. Add Supabase tables and server-side integration auth.
2. Add TTAttendance ingestion endpoint for pool progress snapshots.
3. Add TTAttendance read API for latest pool progress by class.
4. Build a Windows-side extractor that reads backup `.mdb` copies.
5. Validate the match completion rule on a real in-progress backup.
6. Add admin UI to show per-pool completed match counts and freshness.
