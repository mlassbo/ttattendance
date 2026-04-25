import { expect, Page, test } from '@playwright/test'
import { config } from 'dotenv'
import {
  cleanTestCompetitions,
  seedAdminPoolProgressCompetition,
  seedOnDataSnapshotForClasses,
  SeededAdminPoolProgressCompetition,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const ADMIN_PIN = '8181'

async function loginAsAdmin(page: Page, slug: string, pin: string) {
  await page.goto(`/${slug}/admin`)
  await page.getByTestId('admin-pin-input').fill(pin)
  await page.getByTestId('admin-login-button').click()
  await page.waitForURL(`/${slug}/admin/dashboard`)
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

test.describe('Admin pool progress strip', () => {
  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, 'test-admin-pool-%')
  })

  test('renders "Inväntar data" when no snapshot exists yet', async ({ page }) => {
    const slug = 'test-admin-pool-no-data'
    const supabase = testClient()

    const seed: SeededAdminPoolProgressCompetition = await seedAdminPoolProgressCompetition(
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

    const classRow = seed.classes[0]
    await loginAsAdmin(page, slug, ADMIN_PIN)

    const strip = page.getByTestId(`pool-progress-strip-${classRow.id}`)
    await expect(strip).toBeVisible()
    await expect(page.getByTestId(`pool-delay-chip-${classRow.id}`)).toContainText('Inväntar data')
    await expect(page.getByTestId(`pool-sync-stale-${classRow.id}`)).toHaveCount(0)
    await expect(page.getByTestId(`pool-sync-soft-${classRow.id}`)).toHaveCount(0)
  })

  test('on-schedule class shows no delay chip and neutral pool dots', async ({ page }) => {
    const slug = 'test-admin-pool-on-schedule'
    const supabase = testClient()

    const seed = await seedAdminPoolProgressCompetition(
      supabase,
      slug,
      [
        {
          name: 'Herrar B',
          startTime: minutesAgo(25),
          phase: 'pool_play_in_progress',
          registeredPlayers: 8,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    const receivedAt = minutesAgo(1)

    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt,
      classes: [
        {
          className: classRow.name,
          pools: [
            { poolNumber: 1, playerCount: 4, completedMatchCount: 2 },
            { poolNumber: 2, playerCount: 4, completedMatchCount: 2 },
          ],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`pool-progress-strip-${classRow.id}`)).toBeVisible()
    await expect(page.getByTestId(`pool-delay-chip-${classRow.id}`)).toContainText('På schema')
    const poolOne = page.getByTestId(`pool-dot-${classRow.id}-1`)
    await expect(poolOne).toContainText('Pool 1')
    await expect(poolOne).toContainText('2/6')
    const poolTwo = page.getByTestId(`pool-dot-${classRow.id}-2`)
    await expect(poolTwo).toContainText('Pool 2')
    await expect(poolTwo).toContainText('2/6')
    await expect(page.getByTestId(`pool-sync-stale-${classRow.id}`)).toHaveCount(0)
    await expect(page.getByTestId(`pool-sync-soft-${classRow.id}`)).toHaveCount(0)
  })

  test('one delayed pool drives a red class-level delay chip', async ({ page }) => {
    const slug = 'test-admin-pool-delayed'
    const supabase = testClient()

    const seed = await seedAdminPoolProgressCompetition(
      supabase,
      slug,
      [
        {
          name: 'Herrar C',
          startTime: minutesAgo(60),
          phase: 'pool_play_in_progress',
          registeredPlayers: 16,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    const receivedAt = minutesAgo(1)

    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt,
      classes: [
        {
          className: classRow.name,
          pools: [
            { poolNumber: 1, playerCount: 4, completedMatchCount: 6 },
            { poolNumber: 2, playerCount: 4, completedMatchCount: 6 },
            { poolNumber: 3, playerCount: 4, completedMatchCount: 6 },
            { poolNumber: 4, playerCount: 4, completedMatchCount: 1 },
          ],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    const delayChip = page.getByTestId(`pool-delay-chip-${classRow.id}`)
    await expect(delayChip).toContainText('+')
    await expect(delayChip).toContainText('min')

    const completedPool = page.getByTestId(`pool-dot-${classRow.id}-1`)
    await expect(completedPool).toContainText('Pool 1')
    await expect(completedPool).toContainText('6/6')
    const delayedPool = page.getByTestId(`pool-dot-${classRow.id}-4`)
    await expect(delayedPool).toContainText('Pool 4')
    await expect(delayedPool).toContainText('1/6')
    await expect(delayedPool).toContainText('min')

    await expect(page.getByTestId(`pool-sync-stale-${classRow.id}`)).toHaveCount(0)
  })

  test('soft-stale sync surfaces a "Data från" caption', async ({ page }) => {
    const slug = 'test-admin-pool-soft-stale'
    const supabase = testClient()

    const seed = await seedAdminPoolProgressCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer A',
          startTime: minutesAgo(30),
          phase: 'pool_play_in_progress',
          registeredPlayers: 4,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    const receivedAt = minutesAgo(8)

    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt,
      classes: [
        {
          className: classRow.name,
          pools: [{ poolNumber: 1, playerCount: 4, completedMatchCount: 2 }],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`pool-sync-soft-${classRow.id}`)).toContainText('Synkat från ondata')
    await expect(page.getByTestId(`pool-sync-stale-${classRow.id}`)).toHaveCount(0)
  })

  test('hard-stale sync surfaces a strong warning on the card', async ({ page }) => {
    const slug = 'test-admin-pool-hard-stale'
    const supabase = testClient()

    const seed = await seedAdminPoolProgressCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer B',
          startTime: minutesAgo(60),
          phase: 'pool_play_in_progress',
          registeredPlayers: 4,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    const receivedAt = minutesAgo(20)

    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt,
      classes: [
        {
          className: classRow.name,
          pools: [{ poolNumber: 1, playerCount: 4, completedMatchCount: 2 }],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`pool-sync-stale-${classRow.id}`)).toContainText('OnData-sync har inte gått')
  })

  test('planned tables per pool changes the expected delay pace', async ({ page }) => {
    const slug = 'test-admin-pool-two-tables'
    const supabase = testClient()

    const seed = await seedAdminPoolProgressCompetition(
      supabase,
      slug,
      [
        {
          name: 'Pojkar 13',
          startTime: minutesAgo(125),
          phase: 'pool_play_in_progress',
          registeredPlayers: 6,
          plannedTablesPerPool: 2,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    const receivedAt = minutesAgo(1)

    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt,
      classes: [
        {
          className: classRow.name,
          pools: [{ poolNumber: 1, playerCount: 6, completedMatchCount: 10 }],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`pool-delay-chip-${classRow.id}`)).toContainText('+20 min')
    await expect(page.getByTestId(`pool-dot-${classRow.id}-1`)).toContainText('10/15')
  })

  test('unfinished pool keeps accumulating delay after expected finish time', async ({ page }) => {
    const slug = 'test-admin-pool-overrun'
    const supabase = testClient()

    const seed = await seedAdminPoolProgressCompetition(
      supabase,
      slug,
      [
        {
          name: 'Pojkar 11',
          startTime: minutesAgo(173),
          phase: 'pool_play_in_progress',
          registeredPlayers: 4,
          plannedTablesPerPool: 1,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    const receivedAt = minutesAgo(1)

    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt,
      classes: [
        {
          className: classRow.name,
          pools: [{ poolNumber: 1, playerCount: 4, completedMatchCount: 5 }],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`pool-delay-chip-${classRow.id}`)).toContainText(/\+5\d min/)
    await expect(page.getByTestId(`pool-dot-${classRow.id}-1`)).toContainText(/\+5\d min/)
  })

  test('completed class hides the progress strip to keep the dashboard focused', async ({ page }) => {
    const slug = 'test-admin-pool-complete'
    const supabase = testClient()

    const seed = await seedAdminPoolProgressCompetition(
      supabase,
      slug,
      [
        {
          name: 'Veteraner',
          startTime: minutesAgo(120),
          phase: 'pool_play_complete',
          registeredPlayers: 4,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    const receivedAt = minutesAgo(1)

    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt,
      classes: [
        {
          className: classRow.name,
          pools: [{ poolNumber: 1, playerCount: 4, completedMatchCount: 6 }],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`class-row-${classRow.id}`)).toBeVisible()
    await expect(page.getByTestId(`pool-progress-strip-${classRow.id}`)).toHaveCount(0)
  })

  test('non-pool-play class renders no progress strip', async ({ page }) => {
    const slug = 'test-admin-pool-none'
    const supabase = testClient()

    const seed = await seedAdminPoolProgressCompetition(
      supabase,
      slug,
      [
        {
          name: 'Mixed',
          startTime: minutesAgo(5),
          phase: 'awaiting_attendance',
          registeredPlayers: 4,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`class-row-${classRow.id}`)).toBeVisible()
    await expect(page.getByTestId(`pool-progress-strip-${classRow.id}`)).toHaveCount(0)
  })
})
