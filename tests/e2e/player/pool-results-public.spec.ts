import { expect, test, type Locator, type Page } from '@playwright/test'
import { config } from 'dotenv'
import {
  cleanTestCompetitions,
  seedCompetitionWithPoolMatches,
  seedPoolResultSnapshots,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const POOL_ONE_STANDINGS = [
  { placement: 1, playerName: 'Anna Andersson', clubName: 'BTK Mansen' },
  { placement: 2, playerName: 'Björn Berg', clubName: 'IFK Umeå' },
  { placement: 3, playerName: 'Carin Cedersund', clubName: 'Team Eken' },
  { placement: 4, playerName: 'Doris Dahl', clubName: 'Lunds BTK' },
]

const ALL_POOL_MATCHES = [
  { playerAIndex: 0, playerBIndex: 1, result: '6, 3, 8' },
  { playerAIndex: 0, playerBIndex: 2, result: '7, 8, 9' },
  { playerAIndex: 0, playerBIndex: 3, result: '4, 6, 11' },
  { playerAIndex: 1, playerBIndex: 2, result: '-6, -7, 9, -8' },
  { playerAIndex: 1, playerBIndex: 3, result: '8, -6, 11, 9' },
  { playerAIndex: 2, playerBIndex: 3, result: '-9, 8, -7, 6, -10' },
]

async function openClassPage(page: Page, slug: string, classId: string) {
  await page.goto(`/${slug}/classes/${classId}`)
  await expect(page.getByTestId('class-live-view')).toBeVisible()
}

async function openPoolMatches(scope: Page | Locator, poolNumber: number) {
  const toggle = scope.getByTestId(`class-live-pool-matches-toggle-${poolNumber}`)
  await expect(toggle).toBeVisible()
  await toggle.click()
}

test.describe('Public pool results', () => {
  test.beforeEach(async () => {
    await cleanTestCompetitions(testClient(), 'test-player-pres-%')
  })

  test('in-progress pool keeps the current player list and progress pill', async ({ page }) => {
    const slug = 'test-player-pres-in-progress'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      matchesPerPool: [[
        { playerAIndex: 0, playerBIndex: 1, result: '6, 3, 8' },
        { playerAIndex: 2, playerBIndex: 3, result: '-4, 6, 4, 11' },
      ]],
    })

    await openClassPage(page, slug, seeded.classId)

    const pool = page.getByTestId('class-live-pool-1')
    await expect(pool.getByTestId('class-live-pool-progress-1')).toHaveText('2/6 matcher spelade')
    await expect(pool.getByTestId('class-live-pool-standings-1')).toHaveCount(0)
    await expect(pool.getByTestId('class-live-pool-awaiting-results-1')).toHaveCount(0)
    await expect(pool.getByTestId('class-live-pool-final-pill-1')).toHaveCount(0)
    await expect(pool).toContainText('Anna Andersson')
    await expect(pool).toContainText('Doris Dahl')
  })

  test('all matches played without published standings shows the awaiting-results notice', async ({ page }) => {
    const slug = 'test-player-pres-awaiting'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      matchesPerPool: [ALL_POOL_MATCHES],
    })

    await openClassPage(page, slug, seeded.classId)

    const pool = page.getByTestId('class-live-pool-1')
    await expect(pool.getByTestId('class-live-pool-progress-1')).toHaveText('6/6 matcher spelade')
    await expect(pool.getByTestId('class-live-pool-awaiting-results-1')).toHaveText(
      'OBS. Alla matcher är klara men poolresultatet är inte publicerat ännu',
    )
    await expect(pool.getByTestId('class-live-pool-standings-1')).toHaveCount(0)
    await expect(pool.getByTestId('class-live-pool-final-pill-1')).toHaveCount(0)
  })

  test('published standings replace the progress pill and keep the match grid available', async ({ page }) => {
    const slug = 'test-player-pres-published'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      matchesPerPool: [ALL_POOL_MATCHES],
    })

    await seedPoolResultSnapshots(supabase, {
      competitionId: seeded.competitionId,
      classes: [
        {
          externalClassKey: seeded.externalClassKey,
          className: seeded.className,
          classDate: '2025-09-13',
          classTime: '09:00',
          pools: [
            {
              poolNumber: 1,
              standings: POOL_ONE_STANDINGS,
            },
          ],
        },
      ],
    })

    await openClassPage(page, slug, seeded.classId)

    await expect(page.getByTestId('class-page-header')).toContainText('Poolspel klart')

    const pool = page.getByTestId('class-live-pool-1')
    await expect(pool.getByTestId('class-live-pool-final-pill-1')).toHaveText('Klar')
    await expect(pool.getByTestId('class-live-pool-progress-1')).toHaveCount(0)
    await expect(pool.getByTestId('class-live-pool-awaiting-results-1')).toHaveCount(0)
    await expect(pool.getByTestId('class-live-pool-standings-1')).toBeVisible()

    for (const standing of POOL_ONE_STANDINGS) {
      const row = pool.getByTestId(`class-live-pool-standing-1-${standing.placement}`)
      await expect(row).toContainText(String(standing.placement))
      await expect(row).toContainText(standing.playerName)
      await expect(row).toContainText(standing.clubName ?? '')
    }

    const details = pool.getByTestId('class-live-pool-matches-1')
    await expect(details).toBeVisible()
    await expect(details).toHaveJSProperty('open', false)
  })

  test('mixed per-pool state in one class renders standings only where a matching result pool exists', async ({ page }) => {
    const slug = 'test-player-pres-mixed'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      poolCount: 2,
      matchesPerPool: [ALL_POOL_MATCHES, ALL_POOL_MATCHES],
    })

    await seedPoolResultSnapshots(supabase, {
      competitionId: seeded.competitionId,
      classes: [
        {
          externalClassKey: seeded.externalClassKey,
          className: seeded.className,
          classDate: '2025-09-13',
          classTime: '09:00',
          pools: [
            {
              poolNumber: 1,
              standings: POOL_ONE_STANDINGS,
            },
          ],
        },
      ],
    })

    await openClassPage(page, slug, seeded.classId)

    const poolOne = page.getByTestId('class-live-pool-1')
    await expect(poolOne.getByTestId('class-live-pool-final-pill-1')).toBeVisible()
    await expect(poolOne.getByTestId('class-live-pool-standings-1')).toBeVisible()

    const poolTwo = page.getByTestId('class-live-pool-2')
    await expect(poolTwo.getByTestId('class-live-pool-standings-2')).toHaveCount(0)
    await expect(poolTwo.getByTestId('class-live-pool-progress-2')).toHaveText('6/6 matcher spelade')
    await expect(poolTwo.getByTestId('class-live-pool-awaiting-results-2')).toHaveText(
      'OBS. Alla matcher är klara men poolresultatet är inte publicerat ännu',
    )
  })

  test('without any pool-result snapshot status the page stays in its pre-results form', async ({ page }) => {
    const slug = 'test-player-pres-no-status'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      matchesPerPool: [[]],
    })

    await openClassPage(page, slug, seeded.classId)

    const pool = page.getByTestId('class-live-pool-1')
    await expect(pool.getByTestId('class-live-pool-progress-1')).toHaveText('0/6 matcher spelade')
    await expect(pool.getByTestId('class-live-pool-standings-1')).toHaveCount(0)
    await expect(pool.getByTestId('class-live-pool-awaiting-results-1')).toHaveCount(0)
    await expect(pool.getByTestId('class-live-pool-final-pill-1')).toHaveCount(0)
  })

  test('external_class_key mismatch does not leak standings into the real class', async ({ page }) => {
    const slug = 'test-player-pres-class-key-mismatch'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      matchesPerPool: [ALL_POOL_MATCHES],
    })

    await seedPoolResultSnapshots(supabase, {
      competitionId: seeded.competitionId,
      classes: [
        {
          externalClassKey: 'wrong-class-key',
          className: seeded.className,
          classDate: '2025-09-13',
          classTime: '09:00',
          pools: [
            {
              poolNumber: 1,
              standings: POOL_ONE_STANDINGS,
            },
          ],
        },
      ],
    })

    await openClassPage(page, slug, seeded.classId)

    const pool = page.getByTestId('class-live-pool-1')
    await expect(pool.getByTestId('class-live-pool-final-pill-1')).toHaveCount(0)
    await expect(pool.getByTestId('class-live-pool-standings-1')).toHaveCount(0)
    await expect(pool.getByTestId('class-live-pool-awaiting-results-1')).toHaveText(
      'OBS. Alla matcher är klara men poolresultatet är inte publicerat ännu',
    )
  })

  test('standings render in placement order even when inserted out of order', async ({ page }) => {
    const slug = 'test-player-pres-standings-order'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      matchesPerPool: [ALL_POOL_MATCHES],
    })

    await seedPoolResultSnapshots(supabase, {
      competitionId: seeded.competitionId,
      classes: [
        {
          externalClassKey: seeded.externalClassKey,
          className: seeded.className,
          classDate: '2025-09-13',
          classTime: '09:00',
          pools: [
            {
              poolNumber: 1,
              standings: [
                { placement: 3, playerName: 'Carin Cedersund', clubName: 'Team Eken' },
                { placement: 1, playerName: 'Anna Andersson', clubName: 'BTK Mansen' },
                { placement: 2, playerName: 'Björn Berg', clubName: 'IFK Umeå' },
                { placement: 4, playerName: 'Doris Dahl', clubName: 'Lunds BTK' },
              ],
            },
          ],
        },
      ],
    })

    await openClassPage(page, slug, seeded.classId)

    const rows = page.getByTestId('class-live-pool-standings-1').locator('li')
    await expect(rows).toHaveCount(4)
    await expect(rows.nth(0)).toContainText('1')
    await expect(rows.nth(0)).toContainText('Anna Andersson')
    await expect(rows.nth(1)).toContainText('2')
    await expect(rows.nth(1)).toContainText('Björn Berg')
    await expect(rows.nth(2)).toContainText('3')
    await expect(rows.nth(2)).toContainText('Carin Cedersund')
    await expect(rows.nth(3)).toContainText('4')
    await expect(rows.nth(3)).toContainText('Doris Dahl')
  })

  test('dashboard card expand shows the published standings in the shared live view', async ({ page }) => {
    const slug = 'test-player-pres-dashboard'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      matchesPerPool: [ALL_POOL_MATCHES],
    })

    await seedPoolResultSnapshots(supabase, {
      competitionId: seeded.competitionId,
      classes: [
        {
          externalClassKey: seeded.externalClassKey,
          className: seeded.className,
          classDate: '2025-09-13',
          classTime: '09:00',
          pools: [
            {
              poolNumber: 1,
              standings: POOL_ONE_STANDINGS,
            },
          ],
        },
      ],
    })

    await page.goto(`/${slug}`)

    const row = page.getByTestId(`class-dashboard-row-${seeded.classId}`)
    await expect(row.getByTestId(`class-live-pill-${seeded.classId}`)).toHaveText('Poolspel klart')
    await page.getByTestId(`class-card-expand-${seeded.classId}`).click()

    await expect(row.getByTestId('class-live-view')).toBeVisible()
    await expect(row.getByTestId('class-live-pool-final-pill-1')).toHaveText('Klar')
    await expect(row.getByTestId('class-live-pool-standing-1-1')).toContainText('Anna Andersson')
    await expect(row.getByTestId('class-live-pool-progress-1')).toHaveCount(0)
    await openPoolMatches(row, 1)
    await expect(row.getByTestId('class-live-match-1-0')).toContainText('Anna Andersson')
  })
})
