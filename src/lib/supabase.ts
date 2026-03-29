import { createClient } from '@supabase/supabase-js'

// Server-only client using the service role key.
// This bypasses RLS — only call from API routes, never from client components.
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
