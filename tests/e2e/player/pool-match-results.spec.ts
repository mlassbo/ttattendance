import { expect, test, type Locator, type Page } from '@playwright/test'
import { config } from 'dotenv'
import {
  cleanTestCompetitions,
  seedCompetitionWithPoolMatches,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const POOL_ONE_PLAYERS = [
  'Anna Andersson',
  'Björn Berg',
  'Carin Cedersund',
  'Doris Dahl',
]

async function openClassPage(page: Page, slug: string, classId: string) {
  await page.goto(`/${slug}/classes/${classId}`)
  await expect(page.getByTestId('class-live-view')).toBeVisible()
}

async function expectPoolPlayers(page: Page, poolNumber: number, players: string[]) {
  const pool = page.getByTestId(`class-live-pool-${poolNumber}`)

  for (const player of players) {
    await expect(pool).toContainText(player)
  }
}

async function openPoolMatches(scope: Page | Locator, poolNumber: number) {
  const toggle = scope.getByTestId(`class-live-pool-matches-toggle-${poolNumber}`)
  await expect(toggle).toBeVisible()
  await toggle.click()
}

async function expectPendingMatch(scope: Page | Locator, poolNumber: number, matchIndex: number) {
  const row = scope.getByTestId(`class-live-match-${poolNumber}-${matchIndex}`)
  await expect(row).toContainText('Ej spelad än')
}

test.describe('Public pool match results', () => {
  test.beforeEach(async () => {
    await cleanTestCompetitions(testClient(), 'test-player-pmr-%')
  })

  test('pool with zero played matches still renders the full fixture', async ({ page }) => {
    const slug = 'test-player-pmr-zero'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      matchesPerPool: [[]],
    })

    await openClassPage(page, slug, seeded.classId)

    const pool = page.getByTestId('class-live-pool-1')

    await expect(pool.getByTestId('class-live-pool-progress-1')).toHaveText('0/6 matcher spelade')
    await expect(pool.getByTestId('class-live-pool-matches-1')).toBeVisible()
    await expect(pool.getByText('Spelare', { exact: true })).toHaveCount(0)
    await openPoolMatches(page, 1)
    await expect(page.locator('[data-testid^="class-live-match-1-"]')).toHaveCount(6)
    await expectPendingMatch(page, 1, 0)
    await expectPendingMatch(page, 1, 5)
    await expectPoolPlayers(page, 1, POOL_ONE_PLAYERS)
  })

  test('pool with partial matches shows progress and rendered scores', async ({ page }) => {
    const slug = 'test-player-pmr-partial'
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
    await expect(pool.getByTestId('class-live-pool-matches-1')).toBeVisible()
    await expect(pool.getByText('Spelare', { exact: true })).toHaveCount(0)
    await expect(pool.getByText('Matcher', { exact: true })).toHaveCount(0)
    await openPoolMatches(page, 1)
    await expect(pool.getByTestId('class-live-match-1-0')).toContainText('Anna Andersson')
    await expect(pool.getByTestId('class-live-match-1-0')).toContainText('3–0')
    await expect(pool.getByTestId('class-live-match-1-0')).toContainText('Björn Berg')
    await expect(pool.getByTestId('class-live-match-1-1')).toContainText('Carin Cedersund')
    await expect(pool.getByTestId('class-live-match-1-1')).toContainText('3–1')
    await expect(pool.getByTestId('class-live-match-1-1')).toContainText('Doris Dahl')
    await expect(page.locator('[data-testid^="class-live-match-1-"]')).toHaveCount(6)
    await expectPendingMatch(page, 1, 2)
    await expectPoolPlayers(page, 1, POOL_ONE_PLAYERS)
  })

  test('pool with all matches played shows full progress', async ({ page }) => {
    const slug = 'test-player-pmr-full'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      matchesPerPool: [[
        { playerAIndex: 0, playerBIndex: 1, result: '6, 3, 8' },
        { playerAIndex: 0, playerBIndex: 2, result: '7, 8, 9' },
        { playerAIndex: 0, playerBIndex: 3, result: '4, 6, 11' },
        { playerAIndex: 1, playerBIndex: 2, result: '-6, -7, 9, -8' },
        { playerAIndex: 1, playerBIndex: 3, result: '8, -6, 11, 9' },
        { playerAIndex: 2, playerBIndex: 3, result: '-9, 8, -7, 6, -10' },
      ]],
    })

    await openClassPage(page, slug, seeded.classId)

    await expect(page.getByTestId('class-live-pool-progress-1')).toHaveText('6/6 matcher spelade')
    await openPoolMatches(page, 1)
    await expect(page.locator('[data-testid^="class-live-match-1-"]')).toHaveCount(6)
    await expectPoolPlayers(page, 1, POOL_ONE_PLAYERS)
  })

  test('set score is derived from varied result strings', async ({ page }) => {
    const slug = 'test-player-pmr-set-scores'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      matchesPerPool: [[
        { playerAIndex: 0, playerBIndex: 1, result: '0, 4, 2' },
        { playerAIndex: 0, playerBIndex: 3, result: '6, 3, 8' },
        { playerAIndex: 0, playerBIndex: 2, result: '-4, 6, 4, 11' },
        { playerAIndex: 1, playerBIndex: 3, result: '-9, -7, 5, 3, -8' },
        { playerAIndex: 2, playerBIndex: 3, result: '11, -12, 10, -9, 11' },
      ]],
    })

    await openClassPage(page, slug, seeded.classId)

  await openPoolMatches(page, 1)
    await expect(page.getByTestId('class-live-match-1-0')).toContainText('3–0')
    await expect(page.getByTestId('class-live-match-1-1')).toContainText('3–0')
    await expect(page.getByTestId('class-live-match-1-2')).toContainText('3–1')
    await expect(page.getByTestId('class-live-match-1-3')).toContainText('2–3')
    await expect(page.getByTestId('class-live-match-1-4')).toContainText('3–2')
    await expectPoolPlayers(page, 1, POOL_ONE_PLAYERS)
  })

  test('walkover result shows a WO pill and counts as played', async ({ page }) => {
    const slug = 'test-player-pmr-wo'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      matchesPerPool: [[
        { playerAIndex: 0, playerBIndex: 1, result: 'WO' },
        { playerAIndex: 2, playerBIndex: 3, result: '6, 3, 8' },
      ]],
    })

    await openClassPage(page, slug, seeded.classId)

    await expect(page.getByTestId('class-live-pool-progress-1')).toHaveText('2/6 matcher spelade')
    await openPoolMatches(page, 1)

    const woRow = page.getByTestId('class-live-match-1-0')
    await expect(woRow).toContainText('WO')
    await expect(woRow).not.toContainText('Ej spelad än')
    await expect(woRow.locator('.font-semibold')).toHaveCount(0)

    await expect(page.getByTestId('class-live-match-1-1')).toContainText('3–0')
    await expectPoolPlayers(page, 1, POOL_ONE_PLAYERS)
  })

  test('unparseable result falls back to an unplayed placeholder', async ({ page }) => {
    const slug = 'test-player-pmr-invalid'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      matchesPerPool: [[
        { playerAIndex: 0, playerBIndex: 1, result: '6, 3, 8' },
        { playerAIndex: 2, playerBIndex: 3, result: 'invalid' },
      ]],
    })

    await openClassPage(page, slug, seeded.classId)

    await expect(page.getByTestId('class-live-pool-progress-1')).toHaveText('1/6 matcher spelade')
  await openPoolMatches(page, 1)
    await expect(page.locator('[data-testid^="class-live-match-1-"]')).toHaveCount(6)
    await expect(page.getByTestId('class-live-match-1-0')).toContainText('Anna Andersson')
    await expect(page.getByTestId('class-live-match-1-0')).toContainText('Björn Berg')
    await expectPendingMatch(page, 1, 1)
    await expectPoolPlayers(page, 1, POOL_ONE_PLAYERS)
  })

  test('matches render in match_order order', async ({ page }) => {
    const slug = 'test-player-pmr-order'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      matchesPerPool: [[
        { playerAIndex: 0, playerBIndex: 1, result: '6, 3, 8', matchOrder: 2 },
        { playerAIndex: 2, playerBIndex: 3, result: '-4, 6, 4, 11', matchOrder: 0 },
        { playerAIndex: 0, playerBIndex: 2, result: '11, -12, 10, -9, 11', matchOrder: 1 },
      ]],
    })

    await openClassPage(page, slug, seeded.classId)

  await openPoolMatches(page, 1)
    const rows = page.locator('[data-testid^="class-live-match-1-"]')
    await expect(rows).toHaveCount(6)
    await expect(page.getByTestId('class-live-match-1-0')).toContainText('Carin Cedersund')
    await expect(page.getByTestId('class-live-match-1-0')).toContainText('Doris Dahl')
    await expect(page.getByTestId('class-live-match-1-1')).toContainText('Anna Andersson')
    await expect(page.getByTestId('class-live-match-1-1')).toContainText('Carin Cedersund')
    await expect(page.getByTestId('class-live-match-1-2')).toContainText('Anna Andersson')
    await expect(page.getByTestId('class-live-match-1-2')).toContainText('Björn Berg')
    await expectPoolPlayers(page, 1, POOL_ONE_PLAYERS)
  })

  test('dashboard card expand shows matches in the shared live view', async ({ page }) => {
    const slug = 'test-player-pmr-dashboard'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      matchesPerPool: [[
        { playerAIndex: 0, playerBIndex: 1, result: '6, 3, 8' },
      ]],
    })

    await page.goto(`/${slug}`)

    const row = page.getByTestId(`class-dashboard-row-${seeded.classId}`)
    await page.getByTestId(`class-card-expand-${seeded.classId}`).click()

    await expect(row.getByTestId('class-live-view')).toBeVisible()
    await expect(row.getByTestId('class-live-pool-progress-1')).toHaveText('1/6 matcher spelade')
  await openPoolMatches(row, 1)
    await expect(row.getByTestId('class-live-match-1-0')).toContainText('Anna Andersson')
    await expect(row.getByTestId('class-live-match-1-0')).toContainText('3–0')
    await expect(row.getByTestId('class-live-match-1-0')).toContainText('Björn Berg')
    await expectPendingMatch(row, 1, 1)
    await expectPoolPlayers(page, 1, POOL_ONE_PLAYERS)
  })

  test('reloading the class page fetches updated snapshot matches', async ({ page }) => {
    const slug = 'test-player-pmr-reload'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPoolMatches(supabase, slug, {
      matchesPerPool: [[]],
    })

    await openClassPage(page, slug, seeded.classId)
    await expect(page.getByTestId('class-live-pool-progress-1')).toHaveText('0/6 matcher spelade')

    const { error: insertError } = await supabase
      .from('ondata_integration_snapshot_matches')
      .insert({
        snapshot_pool_id: seeded.poolIds[0],
        match_order: 0,
        match_number: 1,
        player_a_name: 'Anna Andersson',
        player_a_club: 'BTK Mansen',
        player_b_name: 'Björn Berg',
        player_b_club: 'IFK Umeå',
        result: '6, 3, 8',
      })

    if (insertError) {
      throw new Error(`Failed to insert snapshot match during reload test: ${insertError.message}`)
    }

    const { error: updateError } = await supabase
      .from('ondata_integration_snapshot_pools')
      .update({ completed_match_count: 1 })
      .eq('id', seeded.poolIds[0])

    if (updateError) {
      throw new Error(`Failed to update snapshot pool match count during reload test: ${updateError.message}`)
    }

    await page.reload()

    await expect(page.getByTestId('class-live-pool-progress-1')).toHaveText('1/6 matcher spelade')
    await openPoolMatches(page, 1)
    await expect(page.getByTestId('class-live-match-1-0')).toContainText('Anna Andersson')
    await expect(page.getByTestId('class-live-match-1-0')).toContainText('3–0')
    await expect(page.getByTestId('class-live-match-1-0')).toContainText('Björn Berg')
    await expectPendingMatch(page, 1, 1)
    await expectPoolPlayers(page, 1, POOL_ONE_PLAYERS)
  })
})