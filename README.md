# TTAttendance

Web-based attendance reporting system for table tennis competitions.

## Getting started

If you have [Claude Code](https://claude.ai/code) installed, you don't need to follow the setup steps manually. Just open the project and prompt:

> "Set up the project so I can start developing"

Claude will work through the setup automatically, and let you know if anything requires manual action (such as installing Node.js or starting Docker Desktop).

---

## Prerequisites

The following tools must be installed before you can start development.

### Required

| Tool | Version | Install |
|---|---|---|
| **Node.js** | 20+ | https://nodejs.org |
| **Docker Desktop** | Latest | https://www.docker.com/products/docker-desktop |

The Supabase CLI is installed automatically as part of `npm install` (it is a dev dependency). No separate global install needed.

Docker Desktop must be **running** before you start the local development stack.

### Verify your installation

```bash
node --version     # should print v20 or higher
docker --version   # should print a version number
```

---

## First-time setup

Run these steps once after cloning the repository.

### 1. Install dependencies

```bash
npm install
```

### 2. Install Playwright browsers

```bash
npx playwright install chromium webkit
```

### 3. Start the local Supabase stack

```bash
npx supabase start
```

This pulls and starts local Docker containers for PostgreSQL and the Supabase API layer. The first run takes a few minutes to download images. Subsequent starts are fast.

When it completes, the command prints a block of local credentials — copy the values you need for the next step:

```
API URL:          http://localhost:54321
anon key:         <your-local-anon-key>
service_role key: <your-local-service-role-key>
Studio URL:       http://localhost:54323
```

### 4. Configure environment variables

Copy the example env file and fill in the values printed by `npx supabase start`:

```bash
cp .env.local.example .env.local
```

Get the correct key values by running:

```bash
npx supabase status --output env
```

The mapping to `.env.local` variables is:

| `.env.local` variable | `supabase status --output env` field |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `API_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` |

> **Note:** The CLI v2 pretty-printed output shows `Publishable` and `Secret` keys in a new format — these are **not** valid for `@supabase/supabase-js`. Always use `--output env` to get the correct JWT values.

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Publishable key from supabase start>
SUPABASE_SERVICE_ROLE_KEY=<Secret key from supabase start>
SUPERADMIN_PIN_HASH=<run: npm run hash-pin -- yourpin, then replace every $ with \$>
COOKIE_SECRET=<run: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
```

> **Important:** bcrypt hashes contain `$` which Next.js (`dotenv-expand`) treats as variable references. Escape every `$` in the hash with `\$` when writing it to the env file. Single quotes do not prevent expansion in Next.js.

For local development, use simple PINs and generate their hashes with:

```bash
npm run hash-pin -- 1234    # player
npm run hash-pin -- 0000    # admin
npm run hash-pin -- 9999    # super admin
```

Copy the `.env.local` file to `.env.test.local` and add the plain-text PINs used by the test suite:

```bash
cp .env.local .env.test.local
```

Add these lines to `.env.test.local`:

```env
PLAYER_PIN=1234
ADMIN_PIN=0000
SUPERADMIN_PIN=9999
```

#### Agent tooling secrets (`.env.agent.local`)

If you use Claude Code, create a separate file for agent tooling secrets (Vercel tokens, etc.). This file is gitignored and is **not** loaded by Next.js — Claude reads it directly.

```bash
cp .env.agent.local.example .env.agent.local
```

Then fill in the values. See `.env.agent.local.example` for the list of supported variables.

### 5. Seed the database with test data

```bash
npm run db:seed
```

This inserts a test competition with sessions, classes, and players so you can use the app immediately.

For manual testing, keep your own competitions on non-`test-*` slugs. Playwright intentionally deletes `test-*` competitions before test runs.

Quick manual seed:

```bash
npm run db:seed:manual
```

This ensures `manual-2026` exists, then imports classes and registrations from `competition_registrations.txt` with player PIN `1111` and admin PIN `2222`.

Custom manual seed:

```bash
npm run db:seed -- --slug manual-2026 --name "Manuell testtävling"
```

---

## Running locally

### Start the development server

```bash
npx supabase start    # skip if already running
npm run dev
```

The app is available at [http://localhost:3000](http://localhost:3000).

Before Next.js starts, `npm run dev` now tries to make sure `manual-2026` exists and is synced from [competition_registrations.txt](competition_registrations.txt). If `.env.local`, Supabase, or the import source is not ready yet, Next.js still starts and the prepare step prints a warning instead of blocking local development. To run the sync as a required step, use `npm run dev:prepare`.

The Supabase Studio (database admin UI) is available at [http://localhost:54323](http://localhost:54323).

### Stop the local stack

```bash
npx supabase stop
```

---

## Database

### Apply new migrations

Migrations are applied automatically when `npx supabase start` runs. To apply new migrations to an already-running local stack:

```bash
npm run db:reset
```

### Reset the database (wipe and reseed)

```bash
npm run db:reset
```

This drops all data, re-applies migrations from scratch, and runs the seed script.

---

## Running tests

The test suite requires the local Supabase stack to be running. The Next.js dev server is started automatically by Playwright if not already running.

```bash
npx supabase start    # skip if already running
```

### Run all tests (headless)

```bash
npm run test:e2e
```

This cleanup removes competitions whose slug starts with `test-`. Avoid using that prefix for manual testing data.

### Run with the Playwright visual UI (recommended for development)

```bash
npm run test:e2e:ui
```

### Run a single test file

```bash
npx playwright test tests/e2e/player/attendance.spec.ts
```

### Debug a failing test step by step

```bash
npm run test:e2e:debug
```

### Generate a new test by clicking through the app

```bash
npx playwright codegen localhost:3000
```

### View the last test report

```bash
npx playwright show-report
```

---

## Project structure

```
supabase/
  migrations/           # SQL migration files, applied in filename order
src/
  app/
    api/
      auth/super/       # POST — super admin PIN login
      super/competitions/ # GET + POST competitions
    super/              # /super login page
      competitions/     # /super/competitions list + create form
    globals.css
    layout.tsx
  lib/
    supabase.ts         # server-only Supabase client (service role key)
scripts/
  hash-pin.ts           # utility: bcrypt-hash a PIN for use in .env
  seed.ts               # seed test data (extend as project grows)
tests/
  e2e/
    superadmin/         # competition management flows, desktop viewport
  global-setup.ts       # cleans up test data before each full test run
middleware.ts           # protects /super/* and /api/super/* routes
playwright.config.ts
```
