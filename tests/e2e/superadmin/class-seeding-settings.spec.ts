import { expect, test, Page } from '@playwright/test'
import { config } from 'dotenv'
import { signCookie } from '@/lib/cookie-signing'
import {
  cleanTestCompetitions,
  seedClassSettingsCompetition,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const TEST_PREFIX = 'test-sm-seed-'

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

test('auth gate — visiting classes page without cookie redirects', async ({ page }) => {
  await page.goto('/super/competitions/00000000-0000-0000-0000-000000000000/classes')
  await page.waitForURL(/\/super$/)
})

test('seeding controls are shown for each class', async ({ page }) => {
  const supabase = testClient()
  const slug = `${TEST_PREFIX}render`
  const { competitionId, sessions } = await seedClassSettingsCompetition(supabase, slug)

  await loginAsSuperadmin(page)
  await page.goto(`/super/competitions/${competitionId}/classes`)

  for (const session of sessions) {
    for (const cls of session.classes) {
      await expect(page.getByTestId(`has-seeding-checkbox-${cls.id}`)).toBeVisible()
      await expect(page.getByTestId(`has-seeding-checkbox-${cls.id}`)).toBeChecked()
      await expect(page.getByTestId(`players-per-pool-input-${cls.id}`)).toBeVisible()
      await expect(page.getByTestId(`players-per-pool-input-${cls.id}`)).toHaveValue(
        String(cls.playersPerPool),
      )
    }
  }
})

test('turning seeding off persists and survives reload', async ({ page }) => {
  const supabase = testClient()
  const slug = `${TEST_PREFIX}toggle-off`
  const { competitionId, sessions } = await seedClassSettingsCompetition(supabase, slug)
  const cls = sessions[0].classes[0]

  await loginAsSuperadmin(page)
  await page.goto(`/super/competitions/${competitionId}/classes`)

  await page.getByTestId(`has-seeding-checkbox-${cls.id}`).uncheck()

  await expect.poll(async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('has_seeding')
      .eq('id', cls.id)
      .single()

    expect(error).toBeNull()
    return data?.has_seeding
  }).toBe(false)

  await page.reload()
  await expect(page.getByTestId(`has-seeding-checkbox-${cls.id}`)).not.toBeChecked()
  await expect(page.getByTestId(`players-per-pool-input-${cls.id}`)).toBeDisabled()
})

test('setting players per pool persists and survives reload', async ({ page }) => {
  const supabase = testClient()
  const slug = `${TEST_PREFIX}players`
  const { competitionId, sessions } = await seedClassSettingsCompetition(supabase, slug)
  const cls = sessions[0].classes[0]

  await loginAsSuperadmin(page)
  await page.goto(`/super/competitions/${competitionId}/classes`)

  await page.getByTestId(`players-per-pool-input-${cls.id}`).fill('5')
  await page.getByTestId(`players-per-pool-input-${cls.id}`).press('Tab')

  await expect.poll(async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('players_per_pool')
      .eq('id', cls.id)
      .single()

    expect(error).toBeNull()
    return data?.players_per_pool ?? null
  }).toBe(5)

  await page.reload()
  await expect(page.getByTestId(`players-per-pool-input-${cls.id}`)).toHaveValue('5')
})

test('invalid players-per-pool input shows inline error', async ({ page }) => {
  const supabase = testClient()
  const slug = `${TEST_PREFIX}invalid`
  const { competitionId, sessions } = await seedClassSettingsCompetition(supabase, slug)
  const cls = sessions[0].classes[0]

  await loginAsSuperadmin(page)
  await page.goto(`/super/competitions/${competitionId}/classes`)

  await page.getByTestId(`players-per-pool-input-${cls.id}`).fill('0')
  await page.getByTestId(`players-per-pool-input-${cls.id}`).press('Tab')

  await expect(page.getByTestId(`players-per-pool-error-${cls.id}`)).toBeVisible()
  await expect(page.getByTestId(`players-per-pool-error-${cls.id}`)).toContainText(
    'positivt heltal',
  )
})
