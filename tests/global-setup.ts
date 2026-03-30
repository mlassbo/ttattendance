import { config } from 'dotenv'
import { testClient, cleanTestCompetitions } from './helpers/db'

config({ path: '.env.test.local' })

export default async function globalSetup() {
  const supabase = testClient()
  await cleanTestCompetitions(supabase)
}
