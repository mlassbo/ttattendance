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

The Playwright webServer config starts Next.js automatically if it is not already running. The global setup cleans up any competitions whose slug starts with `test-` before each run.

---

## Project conventions

- **data-testid attributes** are used for all Playwright selectors — never select by Swedish text strings, which are fragile.
- **Test slugs** must start with `test-` so the global setup can clean them up safely.
- **API routes under `/api/super/*`** are protected by middleware checking for `role=superadmin` cookie. The auth route `/api/auth/super` is intentionally not protected.
- **The Supabase client** (`src/lib/supabase.ts`) uses the service role key and must only be called from server-side API routes, never from client components.
- **All UI text is in Swedish.**
- **Migrations** live in `supabase/migrations/` as plain SQL files. Create new ones with a timestamp prefix, e.g. `20240201000000_add_sessions.sql`.

---

## Known issues

- **Analytics container fails on Windows**: Docker Desktop does not expose its daemon on TCP port 2375. Fixed by setting `enabled = false` under `[analytics]` in `supabase/config.toml`. This is already done in this repo.
- **Supabase CLI v2 key names**: The output from `npx supabase start` uses `Publishable` and `Secret` instead of the v1 names `anon key` and `service_role key`. The README mapping table reflects this.
