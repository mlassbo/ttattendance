import { expect, Page, test } from '@playwright/test'
import { config } from 'dotenv'
import {
  cleanTestCompetitions,
  seedAdminPoolProgressCompetition,
  seedClassPoolTables,
  seedOnDataSnapshotForClasses,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const ADMIN_PIN = '8484'

async function loginAsAdmin(page: Page, slug: string, pin: string) {
  await page.goto(`/${slug}/admin`)
  await page.getByTestId('admin-pin-input').fill(pin)
  await page.getByTestId('admin-login-button').click()
  await page.waitForURL(`/${slug}/admin/dashboard`)
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

async function gotoClassDetail(page: Page, slug: string, classId: string) {
  await page.goto(`/${slug}/admin/classes/${classId}#pool-tables`)
  await expect(page.getByTestId('pool-tables-section')).toBeVisible()
}

test.describe('Admin pool tables assignment', () => {
  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, 'test-admin-tables-%')
  })

  test('blocks unauthenticated access to the pool-tables API', async ({ request }) => {
    const slug = 'test-admin-tables-auth'
    const supabase = testClient()

    const seed = await seedAdminPoolProgressCompetition(
      supabase,
      slug,
      [
        {
          name: 'Herrar A',
          startTime: minutesAgo(30),
          phase: 'pool_play_in_progress',
          registeredPlayers: 4,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classId = seed.classes[0].id
    const res = await request.get(`/api/admin/classes/${classId}/pool-tables`, {
      headers: { 'x-competition-slug': slug },
    })
    expect(res.status()).toBe(401)
  })

  test('shows empty state when there is no snapshot yet', async ({ page }) => {
    const slug = 'test-admin-tables-no-snapshot'
    const supabase = testClient()

    const seed = await seedAdminPoolProgressCompetition(
      supabase,
      slug,
      [
        {
          name: 'Herrar B',
          startTime: minutesAgo(5),
          phase: 'awaiting_attendance',
          registeredPlayers: 4,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classId = seed.classes[0].id
    await loginAsAdmin(page, slug, ADMIN_PIN)
    await gotoClassDetail(page, slug, classId)

    await expect(page.getByTestId('pool-tables-empty-state')).toContainText(
      'Pooler dyker upp här när lottningen är synkad från OnData.',
    )
  })

  test('lets admin save table numbers and shows them on the dashboard strip', async ({ page }) => {
    const slug = 'test-admin-tables-save'
    const supabase = testClient()

    const seed = await seedAdminPoolProgressCompetition(
      supabase,
      slug,
      [
        {
          name: 'Herrar C',
          startTime: minutesAgo(10),
          phase: 'pool_play_in_progress',
          registeredPlayers: 8,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt: minutesAgo(1),
      classes: [
        {
          className: classRow.name,
          pools: [
            { poolNumber: 1, playerCount: 4, completedMatchCount: 1 },
            { poolNumber: 2, playerCount: 4, completedMatchCount: 1 },
          ],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    // Dashboard initially has no inline table annotation for either pool.
    await expect(page.getByTestId(`pool-tables-${classRow.id}-1`)).toHaveCount(0)
    await expect(page.getByTestId(`pool-tables-${classRow.id}-2`)).toHaveCount(0)

    await gotoClassDetail(page, slug, classRow.id)

    // Section is in edit mode automatically because no tables are set.
    await page.getByTestId('pool-tables-input-1').fill('1, 2')
    await page.getByTestId('pool-tables-input-2').fill('3,4')
    await page.getByTestId('pool-tables-save-btn').click()

    // After save: read-only view with formatted output.
    await expect(page.getByTestId('pool-tables-row-1')).toContainText('Bord 1, 2')
    await expect(page.getByTestId('pool-tables-row-2')).toContainText('Bord 3, 4')
    await expect(page.getByTestId('pool-tables-edit-btn')).toBeVisible()

    // Back to the dashboard — pool labels now include the inline table annotation.
    await page.goto(`/${slug}/admin/dashboard`)
    await expect(page.getByTestId(`pool-tables-${classRow.id}-1`)).toContainText('(Bord 1, 2)')
    await expect(page.getByTestId(`pool-tables-${classRow.id}-2`)).toContainText('(Bord 3, 4)')
  })

  test('rejects non-numeric input with an inline error per pool', async ({ page }) => {
    const slug = 'test-admin-tables-validate'
    const supabase = testClient()

    const seed = await seedAdminPoolProgressCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer A',
          startTime: minutesAgo(10),
          phase: 'pool_play_in_progress',
          registeredPlayers: 4,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt: minutesAgo(1),
      classes: [
        {
          className: classRow.name,
          pools: [{ poolNumber: 1, playerCount: 4, completedMatchCount: 1 }],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)
    await gotoClassDetail(page, slug, classRow.id)

    await page.getByTestId('pool-tables-input-1').fill('Bord 7')
    await page.getByTestId('pool-tables-save-btn').click()

    await expect(page.getByTestId('pool-tables-error-1')).toContainText('Endast positiva heltal')
  })

  test('admin can edit existing tables and clear them', async ({ page }) => {
    const slug = 'test-admin-tables-edit'
    const supabase = testClient()

    const seed = await seedAdminPoolProgressCompetition(
      supabase,
      slug,
      [
        {
          name: 'Pojkar 11',
          startTime: minutesAgo(10),
          phase: 'pool_play_in_progress',
          registeredPlayers: 8,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt: minutesAgo(1),
      classes: [
        {
          className: classRow.name,
          pools: [
            { poolNumber: 1, playerCount: 4, completedMatchCount: 1 },
            { poolNumber: 2, playerCount: 4, completedMatchCount: 1 },
          ],
        },
      ],
    })
    await seedClassPoolTables(supabase, classRow.id, [
      { poolNumber: 1, tables: [1, 2] },
      { poolNumber: 2, tables: [3, 4] },
    ])

    await loginAsAdmin(page, slug, ADMIN_PIN)
    await gotoClassDetail(page, slug, classRow.id)

    // Read-only view shows current tables.
    await expect(page.getByTestId('pool-tables-row-1')).toContainText('Bord 1, 2')

    await page.getByTestId('pool-tables-edit-btn').click()
    await expect(page.getByTestId('pool-tables-input-1')).toHaveValue('1, 2')

    // Change pool 1 to "5, 6" and clear pool 2.
    await page.getByTestId('pool-tables-input-1').fill('5, 6')
    await page.getByTestId('pool-tables-input-2').fill('')
    await page.getByTestId('pool-tables-save-btn').click()

    await expect(page.getByTestId('pool-tables-row-1')).toContainText('Bord 5, 6')
    await expect(page.getByTestId('pool-tables-row-2')).toContainText('—')
  })
})
