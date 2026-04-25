import { expect, test, type Page } from '@playwright/test'
import { config } from 'dotenv'
import {
  cleanTestCompetitions,
  seedCompetitionWithPlayoff,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

async function openClassPage(page: Page, slug: string, classId: string) {
  await page.goto(`/${slug}/classes/${classId}`)
  await expect(page.getByTestId('class-page-header')).toBeVisible()
}

test.describe('Public playoff view', () => {
  test.beforeEach(async () => {
    await cleanTestCompetitions(testClient(), 'test-player-pl-%')
  })

  test('class with no playoff data does not show the Slutspel tab', async ({ page }) => {
    const slug = 'test-player-pl-none'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPlayoff(supabase, slug, {})

    await openClassPage(page, slug, seeded.classId)

    await expect(page.getByRole('tab', { name: 'Slutspel' })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: 'Spelare' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Pooler' })).toBeDisabled()
  })

  test('A-only playoff defaults to Slutspel and renders rounds in order', async ({ page }) => {
    const slug = 'test-player-pl-a-only'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPlayoff(supabase, slug, {
      bracketA: [
        {
          name: 'Kvartsfinal',
          matches: [
            { playerA: 'Anna Andersson', playerB: 'Lisa Berg' },
            { playerA: 'Maria Nilsson', playerB: 'Karin Karlsson' },
            { playerA: 'Eva Svensson', playerB: 'Petra Persson' },
            { playerA: 'Sara Sjöberg', playerB: 'Tina Tegnér' },
          ],
        },
        {
          name: 'Semifinal',
          matches: [
            { playerA: 'Anna Andersson', playerB: 'Maria Nilsson', winner: 'Anna Andersson', result: '6, 8, 9' },
            { playerA: 'Eva Svensson', playerB: 'Tina Tegnér', winner: 'Eva Svensson', result: '4, 7, -10, 5' },
          ],
        },
        {
          name: 'Final',
          matches: [
            { playerA: 'Anna Andersson', playerB: 'Eva Svensson' },
          ],
        },
      ],
    })

    await openClassPage(page, slug, seeded.classId)

    await expect(page.getByRole('tab', { name: 'Slutspel' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Pooler' })).toBeDisabled()
    await expect(page.getByTestId('class-playoff-view')).toBeVisible()

    const bracket = page.getByTestId('class-playoff-bracket-A')
    await expect(bracket).toBeVisible()
    // The "A-slutspel" heading is hidden when there is no B bracket.
    await expect(bracket.getByRole('heading', { name: 'A-slutspel' })).toHaveCount(0)

    await expect(page.getByTestId('class-playoff-bracket-B')).toHaveCount(0)

    // labelRound: 3 rounds → first = Kvartsfinal, second = Semifinal, third = Final
    const round0 = page.getByTestId('class-playoff-round-A-0')
    const round1 = page.getByTestId('class-playoff-round-A-1')
    const round2 = page.getByTestId('class-playoff-round-A-2')
    await expect(round0).toContainText('Kvartsfinal')
    await expect(round1).toContainText('Semifinal')
    await expect(round2).toContainText('Final')

    // Quarterfinals are unplayed
    await expect(page.getByTestId('class-playoff-match-A-0-0')).toContainText('Anna Andersson')
    await expect(page.getByTestId('class-playoff-match-A-0-0')).toContainText('Lisa Berg')
    await expect(page.getByTestId('class-playoff-match-A-0-0')).toContainText('Ej spelad än')
    await expect(page.getByTestId('class-playoff-match-A-0-3')).toContainText('Sara Sjöberg')

    // Semifinal: scores rendered
    await expect(page.getByTestId('class-playoff-match-A-1-0')).toContainText('3–0')
    await expect(page.getByTestId('class-playoff-match-A-1-1')).toContainText('3–1')

    // Final: not yet played
    await expect(page.getByTestId('class-playoff-match-A-2-0')).toContainText('Ej spelad än')
  })

  test('A + B brackets render in order with A before B', async ({ page }) => {
    const slug = 'test-player-pl-a-b'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPlayoff(supabase, slug, {
      bracketA: [
        {
          name: 'Final',
          matches: [
            { playerA: 'Anna Andersson', playerB: 'Lisa Berg', winner: 'Anna Andersson', result: '6, 4, 8' },
          ],
        },
      ],
      bracketB: [
        {
          name: 'Final',
          matches: [
            { playerA: 'Maria Nilsson', playerB: 'Karin Karlsson' },
          ],
        },
      ],
    })

    await openClassPage(page, slug, seeded.classId)

    const view = page.getByTestId('class-playoff-view')
    await expect(view).toBeVisible()

    const sections = view.locator('[data-testid^="class-playoff-bracket-"]')
    await expect(sections).toHaveCount(2)
    await expect(sections.nth(0)).toHaveAttribute('data-testid', 'class-playoff-bracket-A')
    await expect(sections.nth(1)).toHaveAttribute('data-testid', 'class-playoff-bracket-B')

    await expect(page.getByTestId('class-playoff-bracket-A')).toContainText('A-slutspel')
    await expect(page.getByTestId('class-playoff-bracket-B')).toContainText('B-slutspel')

    await expect(page.getByTestId('class-playoff-match-A-0-0')).toContainText('3–0')
    await expect(page.getByTestId('class-playoff-match-B-0-0')).toContainText('Ej spelad än')
  })

  test('snapshot with only opening round matches does not invent later rounds', async ({ page }) => {
    const slug = 'test-player-pl-opening'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPlayoff(supabase, slug, {
      bracketA: [
        {
          name: 'Kvartsfinal',
          matches: [
            { playerA: 'Anna Andersson', playerB: 'Lisa Berg' },
            { playerA: 'Maria Nilsson', playerB: 'Karin Karlsson' },
          ],
        },
      ],
    })

    await openClassPage(page, slug, seeded.classId)

    // Explicit raw round names should win even when only one round is visible so
    // partial brackets do not get relabeled as later stages.
    const round0 = page.getByTestId('class-playoff-round-A-0')
    await expect(round0).toContainText('Kvartsfinal')

    await expect(page.locator('[data-testid^="class-playoff-round-A-"]')).toHaveCount(1)
    await expect(page.locator('[data-testid^="class-playoff-match-A-0-"]')).toHaveCount(2)

    await expect(page.getByTestId('class-playoff-match-A-0-0')).toContainText('Anna Andersson')
    await expect(page.getByTestId('class-playoff-match-A-0-0')).toContainText('Lisa Berg')
    await expect(page.getByTestId('class-playoff-match-A-0-0')).toContainText('Ej spelad än')
    await expect(page.getByTestId('class-playoff-match-A-0-1')).toContainText('Maria Nilsson')
    await expect(page.getByTestId('class-playoff-match-A-0-1')).toContainText('Karin Karlsson')
    await expect(page.getByTestId('class-playoff-match-A-0-1')).toContainText('Ej spelad än')

    // No bye explanation copy.
    await expect(page.getByText('bye', { exact: false })).toHaveCount(0)
    await expect(page.getByText('Vinnare', { exact: false })).toHaveCount(0)
  })

  test('walkover renders as WO and unplayed renders as Ej spelad än', async ({ page }) => {
    const slug = 'test-player-pl-walkover'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPlayoff(supabase, slug, {
      bracketA: [
        {
          name: 'Final',
          matches: [
            { playerA: 'Anna Andersson', playerB: 'Lisa Berg', result: 'WO', winner: 'Anna Andersson' },
          ],
        },
      ],
    })

    await openClassPage(page, slug, seeded.classId)

    const woRow = page.getByTestId('class-playoff-match-A-0-0')
    await expect(woRow).toContainText('WO')
    await expect(woRow).not.toContainText('Ej spelad än')
  })

  test('completed final shows Slutspel klart on the class page', async ({ page }) => {
    const slug = 'test-player-pl-complete'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPlayoff(supabase, slug, {
      bracketA: [
        {
          name: 'Final',
          matches: [
            { playerA: 'Anna Andersson', playerB: 'Lisa Berg', winner: 'Anna Andersson', result: '6, 4, 8' },
          ],
        },
      ],
    })

    await openClassPage(page, slug, seeded.classId)

    await expect(page.getByTestId('class-page-header')).toContainText('Slutspel klart')
  })

  test('dashboard card shows completed playoff pill and expands to the Slutspel tab by default', async ({ page }) => {
    const slug = 'test-player-pl-dashboard'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPlayoff(supabase, slug, {
      bracketA: [
        {
          name: 'Final',
          matches: [
            { playerA: 'Anna Andersson', playerB: 'Lisa Berg', winner: 'Anna Andersson', result: '6, 4, 8' },
          ],
        },
      ],
    })

    await page.goto(`/${slug}`)

    const row = page.getByTestId(`class-dashboard-row-${seeded.classId}`)
  await expect(row.getByTestId(`class-live-pill-${seeded.classId}`)).toContainText('Slutspel klart')

    await page.getByTestId(`class-card-expand-${seeded.classId}`).click()

    await expect(row.getByRole('tab', { name: 'Slutspel' })).toHaveAttribute('aria-selected', 'true')
    await expect(row.getByRole('tab', { name: 'Pooler' })).toBeDisabled()
    await expect(row.getByTestId('class-playoff-view')).toBeVisible()
    await expect(row.getByTestId('class-playoff-match-A-0-0')).toContainText('3–0')
  })

  test('winner name is bolded in completed matches with a recognised winner', async ({ page }) => {
    const slug = 'test-player-pl-winner'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPlayoff(supabase, slug, {
      bracketA: [
        {
          name: 'Final',
          matches: [
            { playerA: 'Anna Andersson', playerB: 'Lisa Berg', winner: 'Lisa Berg', result: '-6, -8, 5, -9' },
          ],
        },
      ],
    })

    await openClassPage(page, slug, seeded.classId)

    const row = page.getByTestId('class-playoff-match-A-0-0')
    const lines = row.locator('div.min-w-0 p')
    await expect(lines).toHaveCount(2)
    await expect(lines.nth(0)).toHaveText('Anna Andersson')
    await expect(lines.nth(0)).not.toHaveClass(/font-semibold/)
    await expect(lines.nth(1)).toHaveText('Lisa Berg')
    await expect(lines.nth(1)).toHaveClass(/font-semibold/)
  })

  test('flips displayed set score when player B is the recorded winner', async ({ page }) => {
    const slug = 'test-player-pl-score-order'
    const supabase = testClient()
    const seeded = await seedCompetitionWithPlayoff(supabase, slug, {
      bracketA: [
        {
          name: 'Final',
          matches: [
            { playerA: 'Anna Andersson', playerB: 'Lisa Berg', winner: 'Lisa Berg', result: '6, 8, -9, 7' },
          ],
        },
      ],
    })

    await openClassPage(page, slug, seeded.classId)

    const row = page.getByTestId('class-playoff-match-A-0-0')
    await expect(row).toContainText('1–3')
    await expect(row).not.toContainText('3–1')
  })
})
