import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'

if (process.env.E2E_TEST_ENV === 'true') {
  loadEnv({ path: '.env.test.local', override: true })
}

// Server-only client using the service role key.
// This bypasses RLS — only call from API routes, never from client components.
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    }
  )
}
