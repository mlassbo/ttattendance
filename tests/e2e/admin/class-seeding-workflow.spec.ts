import { expect, Page, test } from '@playwright/test'
import { config } from 'dotenv'
import {
  cleanTestCompetitions,
  seedAdminClassSeedingCompetition,
  type SeededAdminClassSeedingCompetition,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const ADMIN_PIN = '7171'
const TEST_PREFIX = 'test-admin-seed-%'

async function loginAsAdmin(page: Page, slug: string, pin: string) {
  await page.goto(`/${slug}/admin`)
  await page.getByTestId('admin-pin-input').fill(pin)
  await page.getByTestId('admin-login-button').click()
  await page.waitForURL(`/${slug}/admin/dashboard`)
}

function getSeededClass(seed: SeededAdminClassSeedingCompetition, name: string) {
  const classRow = seed.classes.find(row => row.name === name)
  if (!classRow) {
    throw new Error(`Seeded class not found: ${name}`)
  }

  return classRow
}

test.describe('Class seeding workflow', () => {
  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, TEST_PREFIX)
  })

  test('class with hasSeeding = false hides the seed_class step', async ({ page }) => {
    const slug = 'test-admin-seed-hidden'
    const supabase = testClient()
    const seed = await seedAdminClassSeedingCompetition(
      supabase,
      slug,
      [
        {
          name: 'Klass utan seedning',
          hasSeeding: false,
          playersPerPool: 4,
          registeredPlayers: 4,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = getSeededClass(seed, 'Klass utan seedning')
    await loginAsAdmin(page, slug, ADMIN_PIN)
    await page.goto(`/${slug}/admin/classes/${classRow.id}`)

    await expect(page.getByTestId('workflow-step-seed_class')).toHaveCount(0)
    await expect(page.getByTestId('workflow-step-focus-publish_pools')).toContainText('Nästa steg')
  })

  test('valid seeding config shows the computed helper text', async ({ page }) => {
    const slug = 'test-admin-seed-helper'
    const supabase = testClient()
    const seed = await seedAdminClassSeedingCompetition(
      supabase,
      slug,
      [
        {
          name: 'Klass med seedning',
          hasSeeding: true,
          playersPerPool: 4,
          registeredPlayers: 9,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = getSeededClass(seed, 'Klass med seedning')
    await loginAsAdmin(page, slug, ADMIN_PIN)
    await page.goto(`/${slug}/admin/classes/${classRow.id}`)

    const step = page.getByTestId('workflow-step-seed_class')
    await expect(step).toBeVisible()
    await expect(step).toContainText('2 spelare ska seedas')
    await expect(step).toContainText('beräknat antal pooler: 3')
  })

  test('helper text uses confirmed attendance, not total registrations', async ({ page }) => {
    const slug = 'test-admin-seed-confirmed'
    const supabase = testClient()
    const seed = await seedAdminClassSeedingCompetition(
      supabase,
      slug,
      [
        {
          name: 'Klass med frånvarande',
          hasSeeding: true,
          playersPerPool: 4,
          registeredPlayers: 6,
          confirmedPlayers: 4,
          absentPlayers: 2,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = getSeededClass(seed, 'Klass med frånvarande')
    await loginAsAdmin(page, slug, ADMIN_PIN)
    await page.goto(`/${slug}/admin/classes/${classRow.id}`)

    const step = page.getByTestId('workflow-step-seed_class')
    await expect(step).toContainText('Ingen seedning behövs just nu')
    await expect(step).toContainText('beräknat antal pooler: 1')
    await expect(step).not.toContainText('2 spelare ska seedas')
  })

  test('helper text updates when attendance changes enough to change estimated pool count', async ({ page }) => {
    const slug = 'test-admin-seed-update'
    const supabase = testClient()
    const seed = await seedAdminClassSeedingCompetition(
      supabase,
      slug,
      [
        {
          name: 'Klass som fylls upp',
          hasSeeding: true,
          playersPerPool: 4,
          registeredPlayers: 5,
          confirmedPlayers: 4,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = getSeededClass(seed, 'Klass som fylls upp')
    const pendingRegistration = classRow.registrations.find(reg => reg.attendanceStatus === null)
    if (!pendingRegistration) {
      throw new Error('Expected a pending registration in the seeded class')
    }

    await loginAsAdmin(page, slug, ADMIN_PIN)
    await page.goto(`/${slug}/admin/classes/${classRow.id}`)

    const step = page.getByTestId('workflow-step-seed_class')
    await expect(step).toContainText('Ingen seedning behövs just nu')
    await expect(step).toContainText('beräknat antal pooler: 1')

    await page.getByTestId(`confirm-btn-${pendingRegistration.id}`).click()

    await expect(step).toContainText('2 spelare ska seedas')
    await expect(step).toContainText('beräknat antal pooler: 2')
  })

  test('missing playersPerPool shows a configuration warning helper', async ({ page }) => {
    const slug = 'test-admin-seed-missing-config'
    const supabase = testClient()
    const seed = await seedAdminClassSeedingCompetition(
      supabase,
      slug,
      [
        {
          name: 'Klass utan poolstorlek',
          hasSeeding: true,
          playersPerPool: null,
          registeredPlayers: 4,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = getSeededClass(seed, 'Klass utan poolstorlek')
    await loginAsAdmin(page, slug, ADMIN_PIN)
    await page.goto(`/${slug}/admin/classes/${classRow.id}`)

    await expect(page.getByTestId('workflow-step-seed_class')).toContainText(
      'Seedning är aktiverad men antal spelare per pool saknas.',
    )
  })
})
