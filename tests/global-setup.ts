import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.test.local' })

export default async function globalSetup() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Wipe all data so tests never see leftover dev data.
  await supabase.from('competitions').delete().not('id', 'is', null)
}
