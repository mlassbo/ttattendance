import { expect, Page, test } from '@playwright/test'
import { config } from 'dotenv'
import {
  cleanTestCompetitions,
  seedOnDataPlayoffSnapshot,
  seedOnDataSnapshotForClasses,
  seedStartReadinessCompetition,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const ADMIN_PIN = '6262'
const TEST_PREFIX = 'test-admin-readiness-'

async function loginAsAdmin(page: Page, slug: string, pin: string) {
  await page.goto(`/${slug}/admin`)
  await page.getByTestId('admin-pin-input').fill(pin)
  await page.getByTestId('admin-login-button').click()
  await page.waitForURL(`/${slug}/admin/dashboard`)
}

function isoMinutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

function isoMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

test.describe('Admin start-readiness strip', () => {
  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, `${TEST_PREFIX}%`)
  })

  test('hidden when attendance is not complete', async ({ page }) => {
    const slug = `${TEST_PREFIX}attendance-pending`
    const supabase = testClient()
    const seed = await seedStartReadinessCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer A',
          startTime: isoMinutesFromNow(20),
          phase: 'awaiting_attendance',
          confirmedPlayers: [],
          noResponsePlayers: [{ name: 'Anna Andersson' }],
        },
      ],
      { adminPin: ADMIN_PIN, venueTableCount: 22 },
    )

    const damerA = seed.classes[0]
    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`start-readiness-strip-${damerA.id}`)).toHaveCount(0)
  })

  test('hidden before T-30 min', async ({ page }) => {
    const slug = `${TEST_PREFIX}before-window`
    const supabase = testClient()
    const seed = await seedStartReadinessCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer A',
          startTime: isoMinutesFromNow(45),
          phase: 'attendance_complete',
          confirmedPlayers: [{ name: 'Anna Andersson' }],
        },
      ],
      { adminPin: ADMIN_PIN, venueTableCount: 22 },
    )

    const damerA = seed.classes[0]
    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`start-readiness-strip-${damerA.id}`)).toHaveCount(0)
  })

  test('shown at T-30 min and stays after late start', async ({ page }) => {
    const slug = `${TEST_PREFIX}window-open`
    const supabase = testClient()
    const seed = await seedStartReadinessCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer A',
          startTime: isoMinutesFromNow(20),
          phase: 'attendance_complete',
          confirmedPlayers: [{ name: 'Anna Andersson' }],
        },
        {
          name: 'Damer B',
          startTime: isoMinutesAgo(15),
          phase: 'pool_draw_in_progress',
          confirmedPlayers: [{ name: 'Bertil Berg' }],
        },
      ],
      { adminPin: ADMIN_PIN, venueTableCount: 22 },
    )

    const damerA = seed.classes[0]
    const damerB = seed.classes[1]
    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`start-readiness-strip-${damerA.id}`)).toBeVisible()
    await expect(page.getByTestId(`start-readiness-strip-${damerB.id}`)).toBeVisible()
  })

  test('disappears after pool draw published (replaced by pool progress strip)', async ({ page }) => {
    const slug = `${TEST_PREFIX}pool-play`
    const supabase = testClient()
    const seed = await seedStartReadinessCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer A',
          startTime: isoMinutesAgo(2),
          phase: 'pool_play_in_progress',
          confirmedPlayers: [
            { name: 'Anna Andersson' },
            { name: 'Bertil Berg' },
            { name: 'Carin Cedersund' },
            { name: 'Doris Dahl' },
          ],
        },
      ],
      { adminPin: ADMIN_PIN, venueTableCount: 22 },
    )

    const damerA = seed.classes[0]
    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`start-readiness-strip-${damerA.id}`)).toHaveCount(0)
  })

  test('clear case: required, free, and zero overlap', async ({ page }) => {
    const slug = `${TEST_PREFIX}clear`
    const supabase = testClient()

    const seed = await seedStartReadinessCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer B',
          startTime: isoMinutesFromNow(20),
          phase: 'attendance_complete',
          playersPerPool: 4,
          confirmedPlayers: [
            { name: 'Anna Andersson' },
            { name: 'Bertil Berg' },
            { name: 'Carin Cedersund' },
            { name: 'Doris Dahl' },
          ],
        },
      ],
      { adminPin: ADMIN_PIN, venueTableCount: 22 },
    )

    const damerB = seed.classes[0]
    // A fresh ondata snapshot so the strip uses fresh sync.
    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt: new Date().toISOString(),
      classes: [
        {
          className: 'Damer B',
          pools: [{ poolNumber: 1, playerCount: 4, completedMatchCount: 0 }],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`start-readiness-strip-${damerB.id}`)).toBeVisible()
    await expect(page.getByTestId(`start-readiness-tables-required-${damerB.id}`)).toContainText(
      'Kräver 1 bord',
    )
    await expect(page.getByTestId(`start-readiness-tables-free-${damerB.id}`)).toContainText(
      'Lediga bord just nu: ca 22 st',
    )
    await expect(page.getByTestId(`start-readiness-overlap-summary-${damerB.id}`)).toContainText(
      'Inga spelare aktiva i andra klasser',
    )
  })

  test('tables held by a running pool reduce free tables', async ({ page }) => {
    const slug = `${TEST_PREFIX}pool-hold`
    const supabase = testClient()

    const seed = await seedStartReadinessCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer B',
          startTime: isoMinutesFromNow(20),
          phase: 'attendance_complete',
          playersPerPool: 4,
          confirmedPlayers: [
            { name: 'Anna Andersson' },
            { name: 'Bertil Berg' },
          ],
        },
        {
          name: 'Herrar A',
          startTime: isoMinutesAgo(40),
          phase: 'pool_play_in_progress',
          plannedTablesPerPool: 2,
          confirmedPlayers: [
            { name: 'Erik Eriksson' },
            { name: 'Fia Forsell' },
            { name: 'Gustav Gran' },
            { name: 'Hanna Holm' },
          ],
        },
      ],
      { adminPin: ADMIN_PIN, venueTableCount: 22 },
    )

    const damerB = seed.classes[0]

    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt: new Date().toISOString(),
      classes: [
        {
          className: 'Herrar A',
          pools: [{ poolNumber: 1, playerCount: 4, completedMatchCount: 0 }],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`start-readiness-tables-free-${damerB.id}`)).toContainText(
      'Lediga bord just nu: ca 20 st',
    )
  })

  test('tables held by playoffs reduce free tables', async ({ page }) => {
    const slug = `${TEST_PREFIX}playoff-hold`
    const supabase = testClient()

    const seed = await seedStartReadinessCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer B',
          startTime: isoMinutesFromNow(20),
          phase: 'attendance_complete',
          playersPerPool: 4,
          confirmedPlayers: [{ name: 'Anna Andersson' }],
        },
        {
          name: 'Herrar A',
          startTime: isoMinutesAgo(60),
          phase: 'a_playoff_in_progress',
          confirmedPlayers: [
            { name: 'Erik Eriksson' },
            { name: 'Fia Forsell' },
            { name: 'Gustav Gran' },
            { name: 'Hanna Holm' },
          ],
        },
      ],
      { adminPin: ADMIN_PIN, venueTableCount: 22 },
    )

    const damerB = seed.classes[0]

    // Fresh pool ondata snapshot so lastSyncAt is recent.
    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt: new Date().toISOString(),
      classes: [],
    })

    await seedOnDataPlayoffSnapshot(supabase, {
      competitionId: seed.competitionId,
      parentClassName: 'Herrar A',
      parentExternalClassKey: 'herrar-a-key',
      bracket: 'A',
      rounds: [
        {
          name: 'Semifinal',
          matches: [
            { playerA: 'Erik Eriksson', playerB: 'Fia Forsell' },
            { playerA: 'Gustav Gran', playerB: 'Hanna Holm' },
            { playerA: 'Anders Anka', playerB: 'Britta Berg' },
          ],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`start-readiness-tables-free-${damerB.id}`)).toContainText(
      'Lediga bord just nu: ca 19 st',
    )
  })

  test('player overlap during pool play flags shared player', async ({ page }) => {
    const slug = `${TEST_PREFIX}overlap-pool`
    const supabase = testClient()

    const seed = await seedStartReadinessCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer B',
          startTime: isoMinutesFromNow(20),
          phase: 'attendance_complete',
          confirmedPlayers: [
            { name: 'Anna Andersson', club: 'BTK Centrum' },
            { name: 'Carin Cedersund', club: 'Spårvägen' },
          ],
        },
        {
          name: 'Herrar A',
          startTime: isoMinutesAgo(40),
          phase: 'pool_play_in_progress',
          confirmedPlayers: [
            { name: 'Anna Andersson', club: 'BTK Centrum' },
            { name: 'Erik Eriksson' },
            { name: 'Fia Forsell' },
            { name: 'Gustav Gran' },
          ],
        },
      ],
      { adminPin: ADMIN_PIN, venueTableCount: 22 },
    )

    const damerB = seed.classes[0]
    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt: new Date().toISOString(),
      classes: [
        {
          className: 'Herrar A',
          pools: [{ poolNumber: 1, playerCount: 4, completedMatchCount: 0 }],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`start-readiness-overlap-summary-${damerB.id}`)).toContainText(
      '1 spelare aktiv i andra klasser',
    )
    await expect(page.getByTestId(`start-readiness-overlap-player-${damerB.id}-0`)).toContainText(
      'Anna Andersson',
    )
    await expect(page.getByTestId(`start-readiness-overlap-player-${damerB.id}-0`)).toContainText(
      'Herrar A',
    )
  })

  test('playoff drawn — only players with pending matches block', async ({ page }) => {
    const slug = `${TEST_PREFIX}overlap-playoff-pending`
    const supabase = testClient()

    const seed = await seedStartReadinessCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer B',
          startTime: isoMinutesFromNow(20),
          phase: 'attendance_complete',
          confirmedPlayers: [
            { name: 'Anna Andersson', club: 'BTK Centrum' },
            { name: 'Bertil Berg' },
          ],
        },
        {
          name: 'Herrar A',
          startTime: isoMinutesAgo(60),
          phase: 'a_playoff_in_progress',
          confirmedPlayers: [
            { name: 'Anna Andersson', club: 'BTK Centrum' },
            { name: 'Bertil Berg' },
            { name: 'Erik Eriksson' },
            { name: 'Fia Forsell' },
          ],
        },
      ],
      { adminPin: ADMIN_PIN, venueTableCount: 22 },
    )

    const damerB = seed.classes[0]

    await seedOnDataPlayoffSnapshot(supabase, {
      competitionId: seed.competitionId,
      parentClassName: 'Herrar A',
      parentExternalClassKey: 'herrar-a-key',
      bracket: 'A',
      rounds: [
        {
          name: 'Final',
          matches: [
            // Anna is still in (pending). Bertil is NOT in the snapshot at all.
            { playerA: 'Anna Andersson', playerB: 'Erik Eriksson' },
            { playerA: 'Fia Forsell', playerB: 'Gustav Gran', winner: 'Fia Forsell', result: '3-0' },
          ],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    const summary = page.getByTestId(`start-readiness-overlap-summary-${damerB.id}`)
    await expect(summary).toContainText('1 spelare aktiv')
    await expect(summary).not.toContainText('2 spelare')
    await expect(page.getByTestId(`start-readiness-overlap-player-${damerB.id}-0`)).toContainText(
      'Anna Andersson',
    )
  })

  test('class winding down does not block (playoffs_complete)', async ({ page }) => {
    const slug = `${TEST_PREFIX}wind-down`
    const supabase = testClient()

    const seed = await seedStartReadinessCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer B',
          startTime: isoMinutesFromNow(20),
          phase: 'attendance_complete',
          confirmedPlayers: [{ name: 'Anna Andersson' }],
        },
        {
          name: 'Herrar A',
          startTime: isoMinutesAgo(120),
          phase: 'playoffs_complete',
          confirmedPlayers: [{ name: 'Anna Andersson' }, { name: 'Erik Eriksson' }],
        },
      ],
      { adminPin: ADMIN_PIN, venueTableCount: 22 },
    )

    const damerB = seed.classes[0]
    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`start-readiness-overlap-summary-${damerB.id}`)).toContainText(
      'Inga spelare aktiva i andra klasser',
    )
  })

  test('overlap truncation: 10 overlapping → 8 listed + "+2 fler"', async ({ page }) => {
    const slug = `${TEST_PREFIX}truncated`
    const supabase = testClient()

    const players = [
      'Aaron Ahl',
      'Bea Berg',
      'Carl Cedergren',
      'Doris Dahl',
      'Erik Ek',
      'Fia Forsell',
      'Gustav Gran',
      'Hanna Holm',
      'Isak Ivars',
      'Jenny Jönsson',
    ]

    const seed = await seedStartReadinessCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer B',
          startTime: isoMinutesFromNow(20),
          phase: 'attendance_complete',
          playersPerPool: 4,
          confirmedPlayers: players.map(name => ({ name })),
        },
        {
          name: 'Herrar A',
          startTime: isoMinutesAgo(40),
          phase: 'pool_play_in_progress',
          confirmedPlayers: players.map(name => ({ name })),
        },
      ],
      { adminPin: ADMIN_PIN, venueTableCount: 22 },
    )

    const damerB = seed.classes[0]
    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt: new Date().toISOString(),
      classes: [
        {
          className: 'Herrar A',
          pools: [{ poolNumber: 1, playerCount: 10, completedMatchCount: 0 }],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`start-readiness-overlap-player-${damerB.id}-7`)).toBeVisible()
    await expect(page.getByTestId(`start-readiness-overlap-player-${damerB.id}-8`)).toHaveCount(0)
    await expect(page.getByTestId(`start-readiness-overlap-truncated-${damerB.id}`)).toContainText(
      '+2 fler',
    )
  })

  test('no venue capacity configured shows hint instead of free tables', async ({ page }) => {
    const slug = `${TEST_PREFIX}no-venue`
    const supabase = testClient()

    const seed = await seedStartReadinessCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer B',
          startTime: isoMinutesFromNow(20),
          phase: 'attendance_complete',
          playersPerPool: 4,
          confirmedPlayers: [
            { name: 'Anna Andersson' },
            { name: 'Bertil Berg' },
          ],
        },
      ],
      { adminPin: ADMIN_PIN, venueTableCount: null },
    )

    const damerB = seed.classes[0]
    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`start-readiness-tables-required-${damerB.id}`)).toContainText(
      'Kräver 1 bord',
    )
    await expect(page.getByTestId(`start-readiness-tables-free-${damerB.id}`)).toHaveCount(0)
    await expect(page.getByTestId(`start-readiness-no-venue-cap-${damerB.id}`)).toContainText(
      'Sätt antal bord på tävlingen i superadmin',
    )
  })

  test('no players_per_pool shows fallback line; free tables still rendered', async ({ page }) => {
    const slug = `${TEST_PREFIX}no-ppp`
    const supabase = testClient()

    const seed = await seedStartReadinessCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer B',
          startTime: isoMinutesFromNow(20),
          phase: 'attendance_complete',
          playersPerPool: null,
          confirmedPlayers: [{ name: 'Anna Andersson' }],
        },
      ],
      { adminPin: ADMIN_PIN, venueTableCount: 22 },
    )

    const damerB = seed.classes[0]
    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt: new Date().toISOString(),
      classes: [],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(
      page.getByTestId(`start-readiness-no-players-per-pool-${damerB.id}`),
    ).toContainText('antal spelare per pool saknas')
    await expect(page.getByTestId(`start-readiness-tables-required-${damerB.id}`)).toHaveCount(0)
    await expect(page.getByTestId(`start-readiness-tables-free-${damerB.id}`)).toContainText(
      'Lediga bord just nu: ca 22 st',
    )
  })

  test('hard sync staleness shows ca ? and warning banner', async ({ page }) => {
    const slug = `${TEST_PREFIX}stale-hard`
    const supabase = testClient()

    const seed = await seedStartReadinessCompetition(
      supabase,
      slug,
      [
        {
          name: 'Damer B',
          startTime: isoMinutesFromNow(20),
          phase: 'attendance_complete',
          playersPerPool: 4,
          confirmedPlayers: [{ name: 'Anna Andersson' }],
        },
      ],
      { adminPin: ADMIN_PIN, venueTableCount: 22 },
    )

    const damerB = seed.classes[0]

    await seedOnDataSnapshotForClasses(supabase, {
      competitionId: seed.competitionId,
      receivedAt: isoMinutesAgo(20),
      classes: [
        {
          className: 'Damer B',
          pools: [{ poolNumber: 1, playerCount: 4, completedMatchCount: 0 }],
        },
      ],
    })

    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`start-readiness-tables-free-${damerB.id}`)).toContainText(
      'Lediga bord just nu: ca ?',
    )
    await expect(page.getByTestId(`start-readiness-sync-hard-${damerB.id}`)).toContainText(
      'OnData-sync har inte gått sedan',
    )
  })
})
