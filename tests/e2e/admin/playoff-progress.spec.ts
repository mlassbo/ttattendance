import { expect, Page, test } from '@playwright/test'
import { config } from 'dotenv'
import {
  cleanTestCompetitions,
  seedAdminPlayoffCompetition,
  seedOnDataPlayoffSnapshot,
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

function pairs(count: number): Array<{ playerA: string; playerB: string }> {
  return Array.from({ length: count }, (_, index) => ({
    playerA: `Spelare A${index + 1}`,
    playerB: `Spelare B${index + 1}`,
  }))
}

function completedMatches(count: number): Array<{ playerA: string; playerB: string; winner: string }> {
  return pairs(count).map(match => ({ ...match, winner: match.playerA }))
}

test.describe('Admin playoff progress strip', () => {
  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, 'test-admin-playoff-%')
  })

  test('shows placeholder when phase is a_playoff_in_progress but no snapshot exists', async ({ page }) => {
    const slug = 'test-admin-playoff-no-data'
    const supabase = testClient()

    const seed = await seedAdminPlayoffCompetition(
      supabase,
      slug,
      [
        {
          name: 'Max 350',
          startTime: minutesAgo(60),
          phase: 'a_playoff_in_progress',
          registeredPlayers: 8,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await loginAsAdmin(page, slug, ADMIN_PIN)

    const strip = page.getByTestId(`playoff-progress-strip-${classRow.id}`)
    await expect(strip).toBeVisible()
    await expect(strip).toContainText('Inväntar slutspelsdata')
    await expect(page.getByTestId(`playoff-bracket-block-${classRow.id}-a`)).toHaveCount(0)
    await expect(page.getByTestId(`playoff-bracket-block-${classRow.id}-b`)).toHaveCount(0)
  })

  test('renders only A-bracket when no B snapshot exists', async ({ page }) => {
    const slug = 'test-admin-playoff-a-only'
    const supabase = testClient()

    const seed = await seedAdminPlayoffCompetition(
      supabase,
      slug,
      [
        {
          name: 'Max 350',
          startTime: minutesAgo(60),
          phase: 'a_playoff_in_progress',
          registeredPlayers: 8,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await seedOnDataPlayoffSnapshot(supabase, {
      competitionId: seed.competitionId,
      parentClassName: classRow.name,
      parentExternalClassKey: classRow.externalClassKey,
      bracket: 'A',
      rounds: [
        { name: 'Kvartsfinal', matches: completedMatches(4) },
        {
          name: 'Semifinal',
          matches: [
            { playerA: 'A1', playerB: 'A2', winner: 'A1' },
            { playerA: 'A3', playerB: 'A4' },
          ],
        },
        { name: 'Final', matches: [{ playerA: 'A1', playerB: 'A3' }] },
      ],
      sourceProcessedAt: minutesAgo(1),
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`playoff-progress-strip-${classRow.id}`)).toBeVisible()
    const aBlock = page.getByTestId(`playoff-bracket-block-${classRow.id}-a`)
    await expect(aBlock).toContainText('A-slutspel')
    await expect(aBlock).toContainText('5 / 7 matcher')
    await expect(page.getByTestId(`playoff-bracket-block-${classRow.id}-b`)).toHaveCount(0)

    const round0 = page.getByTestId(`playoff-round-${classRow.id}-a-0`)
    await expect(round0).toContainText('Kvartsfinal')
    await expect(round0).toContainText('4/4')
    const round1 = page.getByTestId(`playoff-round-${classRow.id}-a-1`)
    await expect(round1).toContainText('Semifinal')
    await expect(round1).toContainText('1/2')
    await expect(page.getByTestId(`playoff-round-active-${classRow.id}-a`)).toHaveCount(0)
  })

  test('uses explicit upstream round names for partial brackets instead of relabeling them by visible round count', async ({ page }) => {
    const slug = 'test-admin-playoff-explicit-rounds'
    const supabase = testClient()

    const seed = await seedAdminPlayoffCompetition(
      supabase,
      slug,
      [
        {
          name: 'Pojkar 11',
          startTime: minutesAgo(60),
          phase: 'a_playoff_in_progress',
          registeredPlayers: 32,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await seedOnDataPlayoffSnapshot(supabase, {
      competitionId: seed.competitionId,
      parentClassName: classRow.name,
      parentExternalClassKey: classRow.externalClassKey,
      bracket: 'A',
      rounds: [
        { name: 'Round of 32', matches: completedMatches(4) },
        { name: 'Round of 16', matches: completedMatches(8) },
        {
          name: 'Round of 8',
          matches: [
            { playerA: 'Q1', playerB: 'Q2' },
            { playerA: 'Q3', playerB: 'Q4' },
            { playerA: 'Q5', playerB: 'Q6' },
            { playerA: 'Q7', playerB: 'Q8', winner: 'Q7' },
          ],
        },
      ],
      sourceProcessedAt: minutesAgo(1),
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`playoff-round-${classRow.id}-a-0`)).toContainText('Sextondel')
    await expect(page.getByTestId(`playoff-round-${classRow.id}-a-1`)).toContainText('Åttondel')
    await expect(page.getByTestId(`playoff-round-${classRow.id}-a-2`)).toContainText('Kvartsfinal')
  })

  test('stacks A and B bracket blocks when both exist', async ({ page }) => {
    const slug = 'test-admin-playoff-ab'
    const supabase = testClient()

    const seed = await seedAdminPlayoffCompetition(
      supabase,
      slug,
      [
        {
          name: 'Max 350',
          startTime: minutesAgo(90),
          phase: 'playoffs_in_progress',
          registeredPlayers: 16,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await seedOnDataPlayoffSnapshot(supabase, {
      competitionId: seed.competitionId,
      parentClassName: classRow.name,
      parentExternalClassKey: classRow.externalClassKey,
      bracket: 'A',
      rounds: [
        { name: 'Kvartsfinal', matches: completedMatches(4) },
        {
          name: 'Semifinal',
          matches: [
            { playerA: 'A1', playerB: 'A2', winner: 'A1' },
            { playerA: 'A3', playerB: 'A4' },
          ],
        },
        { name: 'Final', matches: [{ playerA: 'A1', playerB: 'A3' }] },
      ],
      sourceProcessedAt: minutesAgo(1),
    })
    await seedOnDataPlayoffSnapshot(supabase, {
      competitionId: seed.competitionId,
      parentClassName: classRow.name,
      parentExternalClassKey: classRow.externalClassKey,
      bracket: 'B',
      rounds: [
        {
          name: 'Kvartsfinal',
          matches: [
            { playerA: 'B1', playerB: 'B2', winner: 'B1' },
            { playerA: 'B3', playerB: 'B4', winner: 'B3' },
            { playerA: 'B5', playerB: 'B6', winner: 'B5' },
            { playerA: 'B7', playerB: 'B8' },
          ],
        },
        {
          name: 'Semifinal',
          matches: [
            { playerA: 'B1', playerB: 'B3' },
            { playerA: 'B5', playerB: 'B7' },
          ],
        },
        { name: 'Final', matches: [{ playerA: 'B1', playerB: 'B5' }] },
      ],
      sourceProcessedAt: minutesAgo(2),
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`playoff-bracket-block-${classRow.id}-a`)).toBeVisible()
    await expect(page.getByTestId(`playoff-bracket-block-${classRow.id}-b`)).toBeVisible()
    await expect(page.getByTestId(`playoff-bracket-block-${classRow.id}-a`)).toContainText('5 / 7 matcher')
    await expect(page.getByTestId(`playoff-bracket-block-${classRow.id}-b`)).toContainText('3 / 7 matcher')
  })

  test('does not show bye suffix in playoff progress', async ({ page }) => {
    const slug = 'test-admin-playoff-byes'
    const supabase = testClient()

    const seed = await seedAdminPlayoffCompetition(
      supabase,
      slug,
      [
        {
          name: 'Max 400',
          startTime: minutesAgo(60),
          phase: 'a_playoff_in_progress',
          registeredPlayers: 6,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await seedOnDataPlayoffSnapshot(supabase, {
      competitionId: seed.competitionId,
      parentClassName: classRow.name,
      parentExternalClassKey: classRow.externalClassKey,
      bracket: 'A',
      rounds: [
        { name: 'Kvartsfinal', matches: pairs(2) },
        { name: 'Semifinal', matches: pairs(2) },
        { name: 'Final', matches: pairs(1) },
      ],
      sourceProcessedAt: minutesAgo(1),
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    const round0 = page.getByTestId(`playoff-round-${classRow.id}-a-0`)
    await expect(round0).toContainText('Kvartsfinal')
    await expect(round0).not.toContainText('frilott')
    const round1 = page.getByTestId(`playoff-round-${classRow.id}-a-1`)
    await expect(round1).not.toContainText('frilott')
  })

  test('does not show a separate "pågår" pill for the active round', async ({ page }) => {
    const slug = 'test-admin-playoff-active'
    const supabase = testClient()

    const seed = await seedAdminPlayoffCompetition(
      supabase,
      slug,
      [
        {
          name: 'Max 500',
          startTime: minutesAgo(90),
          phase: 'a_playoff_in_progress',
          registeredPlayers: 8,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await seedOnDataPlayoffSnapshot(supabase, {
      competitionId: seed.competitionId,
      parentClassName: classRow.name,
      parentExternalClassKey: classRow.externalClassKey,
      bracket: 'A',
      rounds: [
        { name: 'Kvartsfinal', matches: completedMatches(4) },
        {
          name: 'Semifinal',
          matches: [
            { playerA: 'S1', playerB: 'S2' },
            { playerA: 'S3', playerB: 'S4' },
          ],
        },
        { name: 'Final', matches: [{ playerA: 'F1', playerB: 'F2' }] },
      ],
      sourceProcessedAt: minutesAgo(1),
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    const round1 = page.getByTestId(`playoff-round-${classRow.id}-a-1`)
    await expect(round1).toContainText('Semifinal')
    await expect(round1).not.toContainText('pågår')
    await expect(page.getByTestId(`playoff-round-active-${classRow.id}-a`)).toHaveCount(0)
  })

  test('soft-stale sync surfaces a "Data från" caption', async ({ page }) => {
    const slug = 'test-admin-playoff-soft-stale'
    const supabase = testClient()

    const seed = await seedAdminPlayoffCompetition(
      supabase,
      slug,
      [
        {
          name: 'Max 600',
          startTime: minutesAgo(90),
          phase: 'a_playoff_in_progress',
          registeredPlayers: 8,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await seedOnDataPlayoffSnapshot(supabase, {
      competitionId: seed.competitionId,
      parentClassName: classRow.name,
      parentExternalClassKey: classRow.externalClassKey,
      bracket: 'A',
      rounds: [
        { name: 'Kvartsfinal', matches: [...completedMatches(2), ...pairs(2)] },
        { name: 'Semifinal', matches: pairs(2) },
        { name: 'Final', matches: pairs(1) },
      ],
      sourceProcessedAt: minutesAgo(8),
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`playoff-sync-soft-${classRow.id}`)).toContainText('Data från')
    await expect(page.getByTestId(`playoff-sync-stale-${classRow.id}`)).toHaveCount(0)
  })

  test('hard-stale sync surfaces a strong warning banner', async ({ page }) => {
    const slug = 'test-admin-playoff-hard-stale'
    const supabase = testClient()

    const seed = await seedAdminPlayoffCompetition(
      supabase,
      slug,
      [
        {
          name: 'Max 700',
          startTime: minutesAgo(120),
          phase: 'a_playoff_in_progress',
          registeredPlayers: 8,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await seedOnDataPlayoffSnapshot(supabase, {
      competitionId: seed.competitionId,
      parentClassName: classRow.name,
      parentExternalClassKey: classRow.externalClassKey,
      bracket: 'A',
      rounds: [
        { name: 'Kvartsfinal', matches: [...completedMatches(2), ...pairs(2)] },
        { name: 'Semifinal', matches: pairs(2) },
        { name: 'Final', matches: pairs(1) },
      ],
      sourceProcessedAt: minutesAgo(20),
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`playoff-sync-stale-${classRow.id}`)).toContainText('OnData-sync har inte gått')
  })

  test('hides the playoff progress strip once every round is finished', async ({ page }) => {
    const slug = 'test-admin-playoff-complete'
    const supabase = testClient()

    const seed = await seedAdminPlayoffCompetition(
      supabase,
      slug,
      [
        {
          name: 'Max 800',
          startTime: minutesAgo(180),
          phase: 'playoffs_complete',
          registeredPlayers: 8,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await seedOnDataPlayoffSnapshot(supabase, {
      competitionId: seed.competitionId,
      parentClassName: classRow.name,
      parentExternalClassKey: classRow.externalClassKey,
      bracket: 'A',
      rounds: [
        { name: 'Kvartsfinal', matches: completedMatches(4) },
        { name: 'Semifinal', matches: completedMatches(2) },
        { name: 'Final', matches: completedMatches(1) },
      ],
      sourceProcessedAt: minutesAgo(1),
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`playoff-progress-strip-${classRow.id}`)).toHaveCount(0)
  })

  test('renders nothing in pool-play phase even if a playoff snapshot exists', async ({ page }) => {
    const slug = 'test-admin-playoff-hidden'
    const supabase = testClient()

    const seed = await seedAdminPlayoffCompetition(
      supabase,
      slug,
      [
        {
          name: 'Max 900',
          startTime: minutesAgo(30),
          phase: 'pool_play_in_progress',
          registeredPlayers: 8,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await seedOnDataPlayoffSnapshot(supabase, {
      competitionId: seed.competitionId,
      parentClassName: classRow.name,
      parentExternalClassKey: classRow.externalClassKey,
      bracket: 'A',
      rounds: [{ name: 'Final', matches: pairs(1) }],
      sourceProcessedAt: minutesAgo(1),
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`class-row-${classRow.id}`)).toBeVisible()
    await expect(page.getByTestId(`playoff-progress-strip-${classRow.id}`)).toHaveCount(0)
  })
})
