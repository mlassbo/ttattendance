import { expect, test, Page } from '@playwright/test'
import { config } from 'dotenv'
import { signCookie } from '@/lib/cookie-signing'
import {
  cleanTestCompetitions,
  seedClassSettingsCompetition,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const TEST_PREFIX = 'test-sm-venue-'

async function loginAsSuperadmin(page: Page) {
  const secret = process.env.COOKIE_SECRET
  if (!secret) {
    throw new Error('COOKIE_SECRET is required for superadmin E2E tests')
  }

  const signedRole = await signCookie('superadmin', secret)

  await page.context().addCookies([
    {
      name: 'role',
      value: signedRole,
      url: 'http://127.0.0.1:3001',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])
}

test.beforeEach(async () => {
  const supabase = testClient()
  await cleanTestCompetitions(supabase, `${TEST_PREFIX}%`)
})

test('auth gate — visiting venue tab without cookie redirects', async ({ page }) => {
  await page.goto('/super/competitions/00000000-0000-0000-0000-000000000000/venue')
  await page.waitForURL(/\/super$/)
})

test('venue capacity persists across reloads', async ({ page }) => {
  const supabase = testClient()
  const slug = `${TEST_PREFIX}persist`
  const { competitionId } = await seedClassSettingsCompetition(supabase, slug)

  await loginAsSuperadmin(page)
  await page.goto(`/super/competitions/${competitionId}/venue`)

  const input = page.getByTestId('venue-table-count-input')
  await expect(input).toBeVisible()
  await input.fill('22')
  await input.blur()

  await page.waitForResponse(response =>
    response.url().endsWith(`/api/super/competitions/${competitionId}`)
    && response.request().method() === 'PATCH',
  )

  await page.reload()
  await expect(page.getByTestId('venue-table-count-input')).toHaveValue('22')
})

test('clearing the venue capacity resets it to null', async ({ page }) => {
  const supabase = testClient()
  const slug = `${TEST_PREFIX}clear`
  const { competitionId } = await seedClassSettingsCompetition(supabase, slug)

  // Pre-set a value via the API.
  await supabase
    .from('competitions')
    .update({ venue_table_count: 14 })
    .eq('id', competitionId)

  await loginAsSuperadmin(page)
  await page.goto(`/super/competitions/${competitionId}/venue`)

  const input = page.getByTestId('venue-table-count-input')
  await expect(input).toHaveValue('14')

  await input.fill('')
  await input.blur()

  await page.waitForResponse(response =>
    response.url().endsWith(`/api/super/competitions/${competitionId}`)
    && response.request().method() === 'PATCH',
  )

  await page.reload()
  await expect(page.getByTestId('venue-table-count-input')).toHaveValue('')
})

test('zero or negative input is rejected', async ({ page }) => {
  const supabase = testClient()
  const slug = `${TEST_PREFIX}invalid`
  const { competitionId } = await seedClassSettingsCompetition(supabase, slug)

  await loginAsSuperadmin(page)
  await page.goto(`/super/competitions/${competitionId}/venue`)

  const input = page.getByTestId('venue-table-count-input')
  await input.fill('0')
  await input.blur()

  await expect(page.getByTestId('venue-table-count-error')).toContainText(
    'positivt heltal',
  )
})
