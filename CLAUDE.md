# TTAttendance — Claude Instructions

This file instructs Claude on how to help developers set up and work with this project.

---

## When asked to set up the project

Work through the steps below in order. Do as much as possible automatically. Where manual action is required, clearly tell the developer what to do and wait for confirmation before continuing.

### Step 1 — Check Node.js

Run:
```bash
node --version
```
If the version is below 20, stop and tell the developer to install Node.js 20+ from https://nodejs.org before continuing.

### Step 2 — Check Docker Desktop is running

Run:
```bash
docker info
```
If it fails, Docker Desktop is not running. Tell the developer to start Docker Desktop and confirm when it is ready. Do not continue until `docker info` succeeds.

### Step 3 — Install dependencies

Run:
```bash
npm install
```

### Step 4 — Install Playwright browsers

Run:
```bash
npx playwright install chromium webkit
```

### Step 5 — Start the local Supabase stack

Run:
```bash
npx supabase start
```

This may take several minutes on first run while Docker pulls images. If it fails with an error about `supabase_vector` being unhealthy, the fix is to set `enabled = false` under `[analytics]` in `supabase/config.toml`, then run `npx supabase stop --no-backup` followed by `npx supabase start` again. This happens on Windows because Docker Desktop does not expose the daemon on TCP port 2375 by default.

If it fails with a container name conflict, run `npx supabase stop --no-backup` first, then retry.

When the command succeeds, retrieve the correct key values with:

```bash
npx supabase status --output env
```

The CLI v2 pretty-printed output shows `Publishable` and `Secret` keys in a new format — these are **not** valid JWT tokens and will cause a `JWSError` in `@supabase/supabase-js`. Always use `--output env` to get the correct values.

| Needed for | Field in `--output env` |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `API_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` |

### Step 6 — Create the env files

Generate a bcrypt hash for the super admin PIN. For local development use `0000`:
```bash
npm run hash-pin -- 0000
```

Generate a cookie secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Create `.env.local` using the values collected above:
```
NEXT_PUBLIC_SUPABASE_URL=<Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Publishable key>
SUPABASE_SERVICE_ROLE_KEY=<Secret key>
SUPERADMIN_PIN_HASH=<hash from npm run hash-pin, with every $ replaced by \$>
COOKIE_SECRET=<generated hex string>
```

**Important:** bcrypt hashes contain `$` which Next.js (`dotenv-expand`) treats as variable references, expanding them to empty strings. Escape every `$` in the hash with `\$` when writing to the env file. Single quotes do NOT prevent this — only `\$` works.

Create `.env.test.local` with the same values, plus the plain-text PIN for the test suite:
```
SUPERADMIN_PIN=0000
```

Both files are gitignored. Never commit them.

### Step 7 — Verify the setup

Run the dev server:
```bash
npm run dev
```

Tell the developer to open http://localhost:3000/super in a browser, enter PIN `0000`, and confirm they can reach the competitions page. Once confirmed, the setup is complete.

---

## When asked to run the tests

Ensure Supabase is running first:
```bash
npx supabase start
```
Then:
```bash
npm run test:e2e
```

### Important for agent-driven Playwright runs

Do **not** use a Playwright invocation that auto-opens the HTML report from the agent, because that leaves the process waiting for `Ctrl+C` and makes the agent appear hung.

For agent-driven runs, prefer:
```bash
npm run test:e2e:agent
```

If you need an ad hoc Playwright command, use a non-blocking reporter such as:
```bash
npx playwright test --reporter=line
```

Only use the HTML report interactively when a developer explicitly wants it.

The Playwright webServer config starts Next.js automatically if it is not already running. The global setup cleans up any competitions whose slug starts with `test-` before each run.

---

## When building new features

Every new user-facing feature must include Playwright E2E tests before the work is considered done. This is non-negotiable — tests are not optional follow-up work.

### Test file location
| Feature area | Test directory |
|---|---|
| Super admin | `tests/e2e/superadmin/` |
| Admin / secretariat | `tests/e2e/admin/` |
| Player | `tests/e2e/player/` |

### What to cover
At minimum, test:
1. **Auth gate** — unauthenticated access is blocked (redirect or 401)
2. **Happy path** — the primary user action works end-to-end
3. **Error/edge cases** — wrong PIN, deadline enforcement, empty states

### Seed helpers
Add any new seed function to `tests/helpers/db.ts`. Follow the existing patterns:
- Accept a `slug` and any relevant PINs as parameters
- Use bcrypt cost 4 (`bcrypt.hash(pin, 4)`) for speed
- Return IDs needed for test assertions (registration IDs, class IDs, etc.)
- Slugs must start with `test-` so global setup can clean them up

### Scoped cleanup (important for parallel projects)
Test projects run in parallel. Each `beforeEach` must only clean its own slugs — never all `test-*` slugs — otherwise projects stomp on each other's data.

| Project | Slug prefix | beforeEach pattern |
|---|---|---|
| superadmin | `test-sm-*` | `cleanTestCompetitions(supabase, 'test-sm-%')` |
| player | `test-player-*` | `cleanTestCompetitions(supabase, 'test-player-%')` |
| admin | `test-admin-*` | `cleanTestCompetitions(supabase, 'test-admin-%')` |

The global setup (`tests/global-setup.ts`) uses the default `'test-%'` pattern to clean everything once before the full run.

### Selectors
Always use `data-testid` attributes — never select by Swedish text, which is fragile. Add `data-testid` to any new interactive or verifiable element.

### After writing tests
Run `npm run test:e2e:agent` when the agent is executing the suite itself, and fix any failures before finishing the task. If a developer explicitly wants the default Playwright report behavior, they can still run `npm run test:e2e` manually. If Supabase is not running, start it first with `npx supabase start`.

---

## Agent tooling secrets

Secrets used by Claude for operational tasks (deployment checks, external API calls) live in `.env.agent.local`. This file is gitignored (matches `.env*.local`) and is separate from `.env.local`, which holds Next.js app variables.

Create it by copying the example:
```bash
cp .env.agent.local.example .env.agent.local
```

Then fill in the values. The file is never loaded by Next.js — Claude reads it directly when needed.

### Reading secrets from .env.agent.local

To use a value from the file in a Bash command:
```bash
VERCEL_TOKEN=$(grep '^VERCEL_TOKEN=' .env.agent.local 2>/dev/null | cut -d '=' -f2-)
```

If the file is missing or the value is empty, tell the developer to create `.env.agent.local` from `.env.agent.local.example` and fill in the required token.

### Checking Vercel deployment status

```bash
VERCEL_TOKEN=$(grep '^VERCEL_TOKEN=' .env.agent.local 2>/dev/null | cut -d '=' -f2-)
curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
  "https://api.vercel.com/v6/deployments?limit=5" \
  | jq '.deployments[] | {uid, url, state, created}'
```

---

## Project conventions

- **data-testid attributes** are used for all Playwright selectors — never select by Swedish text strings, which are fragile.
- **Test slugs** must start with `test-` so the global setup can clean them up safely.
- **API routes under `/api/super/*`** are protected by middleware checking for `role=superadmin` cookie. The auth route `/api/auth/super` is intentionally not protected.
- **The Supabase client** (`src/lib/supabase.ts`) uses the service role key and must only be called from server-side API routes, never from client components.
- **All UI text is in Swedish.**
- **Migrations** live in `supabase/migrations/` as plain SQL files. Create new ones with a timestamp prefix, e.g. `20240201000000_add_sessions.sql`.

### Reliability Strategy (Critical)
This system must work during live events.

Address:
- Handling many simultaneous users (e.g. morning rush)
- Network instability (retry, idempotency, offline tolerance if applicable)
- Preventing duplicate submissions
- Preventing data loss
- Simple fallback plan if system fails

Favor simple, proven approaches over complex distributed systems.

### Architecture Constraints

- Prioritize simplicity and robustness over flexibility
- Avoid overengineering
- Prefer a monolith over microservices unless clearly justified
- Assume a single developer will build and maintain this
- This is a real system used under time pressure — reliability > elegance

### Security
It is ok that one player can see and accidentally report attendance for another players registrations. It is a trade-off with the simple pin-based login system so that we do not have to distribute personal authorization details to all players.

---

## Known issues

- **Analytics container fails on Windows**: Docker Desktop does not expose its daemon on TCP port 2375. Fixed by setting `enabled = false` under `[analytics]` in `supabase/config.toml`. This is already done in this repo.
- **Supabase CLI v2 key names**: The output from `npx supabase start` uses `Publishable` and `Secret` instead of the v1 names `anon key` and `service_role key`. The README mapping table reflects this.

---

## Project background
### Goals
- Replace a manual, paper-based attendance system
- Reduce queues and manual work
- Improve communication between check-in staff and competition secretariat
- Work reliably under real-world conditions (many users, unstable WiFi, shared devices)

---

### Domain Description

A competition:
- Runs over 2 days (Saturday–Sunday)
- Divided into sessions (2–3 per day)
- Each session contains multiple classes

A class:
- Has a start time
- Has an attendance deadline (typically 45–60 minutes before start)

A player:
- Can be registered in multiple classes
- Must report attendance per class
- Can:
  - Confirm attendance
  - Report absence
  - (Future) register interest in a class they are not registered for (reserve handling — design placeholder only)

---

### Current Problems (Important Context)

- Long queues in the morning
- Hard to find players across paper lists
- No structured reserve handling
- Poor communication between check-in and secretariat
- Requires continuous staffing
