import { expect, test } from '@playwright/test'
import { config } from 'dotenv'
import {
  cleanTestCompetitions,
  seedClassPoolTables,
  seedCompetitionWithPools,
  type SeededCompetitionWithPools,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const SLUG = 'test-player-clv-2025'

test.describe('Public class live view', () => {
  let seeded: SeededCompetitionWithPools

  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, 'test-player-clv-%')
    seeded = await seedCompetitionWithPools(supabase, SLUG)
  })

  test('dashboard card shows "Poolspel startat" when pool matches exist', async ({ page }) => {
    await page.goto(`/${SLUG}`)

    await expect(page.getByTestId(`class-live-pill-${seeded.classId}`)).toContainText('Poolspel startat')
  })

  test('dashboard card keeps normal availability when no pool data exists', async ({ page }) => {
    await page.goto(`/${SLUG}`)

    const fallbackRow = page.getByTestId(`class-dashboard-row-${seeded.classWithoutPoolsId}`)

    await expect(fallbackRow.getByTestId(`class-live-pill-${seeded.classWithoutPoolsId}`)).toHaveCount(0)
    await expect(fallbackRow).toContainText('2 platser kvar')
  })

  test('dashboard expand shows the inline pool grid', async ({ page }) => {
    await page.goto(`/${SLUG}`)

    const liveRow = page.getByTestId(`class-dashboard-row-${seeded.classId}`)

    await page.getByTestId(`class-card-expand-${seeded.classId}`).click()

    await expect(liveRow.getByRole('tab', { name: 'Spelare' })).toBeVisible()
    await expect(liveRow.getByRole('tab', { name: 'Pooler' })).toHaveAttribute('aria-selected', 'true')
    await expect(liveRow.getByTestId('class-live-view')).toBeVisible()
    await expect(liveRow.getByTestId('class-live-pool-1')).toContainText('Anna Andersson')
    await expect(liveRow.getByTestId('class-live-pool-1')).toContainText('Björn Berg')
    await expect(liveRow.getByTestId('class-live-pool-2')).toContainText('Carin Cedersund')
  })

  test('dashboard expand behaves like an accordion', async ({ page }) => {
    await page.goto(`/${SLUG}`)

    const liveRow = page.getByTestId(`class-dashboard-row-${seeded.classId}`)
    const fallbackRow = page.getByTestId(`class-dashboard-row-${seeded.classWithoutPoolsId}`)

    await page.getByTestId(`class-card-expand-${seeded.classId}`).click()
    await expect(liveRow.getByTestId('class-live-view')).toBeVisible()

    await page.getByTestId(`class-card-expand-${seeded.classWithoutPoolsId}`).click()

    await expect(liveRow.getByTestId('class-live-view')).toHaveCount(0)
    await expect(fallbackRow.getByRole('tab', { name: 'Spelare' })).toHaveAttribute('aria-selected', 'true')
    await expect(fallbackRow.getByRole('tab', { name: 'Pooler' })).toBeDisabled()
    await expect(fallbackRow.getByTestId(`public-search-class-roster-${seeded.classWithoutPoolsId}`)).toContainText('Clara Carlsson')
    await expect(fallbackRow).toContainText('Reservlista')
    await expect(fallbackRow).toContainText('Erik Ek')
  })

  test('expanded dashboard card includes an open-in-new-tab link', async ({ page }) => {
    await page.goto(`/${SLUG}`)

    const liveRow = page.getByTestId(`class-dashboard-row-${seeded.classId}`)

    await page.getByTestId(`class-card-expand-${seeded.classId}`).click()

    const openLink = liveRow.getByTestId('class-live-open-tab')
    await expect(openLink).toHaveAttribute('href', `/${SLUG}/classes/${seeded.classId}`)
    await expect(openLink).toHaveAttribute('target', '_blank')
  })

  test('class page renders the pool grid', async ({ page }) => {
    await page.goto(`/${SLUG}/classes/${seeded.classId}`)

    await expect(page.getByTestId('class-page-header')).toContainText('Liveklass A')
    await expect(page.getByTestId('class-page-back-link')).toContainText('Tillbaka till Liveklass Testtävling')
    await expect(page.getByTestId('class-page-header')).toContainText('2 anmälda')
    await expect(page.getByTestId('class-page-header')).not.toContainText('6 platser kvar')
    await expect(page.getByTestId('class-page-header')).not.toContainText('på reservlistan')
    await expect(page.getByTestId('class-page-attendance-opens')).toContainText(
      'Närvarorapportering öppnar 2025-09-12 20:00',
    )
    await expect(page.getByTestId('class-page-attendance-deadline')).toContainText(
      'Anmäl närvaro senast 2099-09-13 08:15',
    )
    await expect(page.getByTestId('class-page-header')).toContainText('Poolspel startat')
    await expect(page.getByRole('tab', { name: 'Spelare' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Pooler' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('class-live-view')).toBeVisible()
    await expect(page.getByTestId('class-live-pool-1')).toContainText('Anna Andersson')
    await expect(page.getByTestId('class-live-pool-2')).toContainText('Doris Dahl')
  })

  test('class page without pool data shows the registered players list instead', async ({ page }) => {
    await page.goto(`/${SLUG}/classes/${seeded.classWithoutPoolsId}`)

    const pageContent = page.locator('main')

    await expect(page.getByTestId('class-page-header')).toContainText('Klass utan lottning')
    await expect(page.getByTestId('class-page-header')).toContainText('2 anmälda')
    await expect(page.getByTestId('class-page-header')).toContainText('2 platser kvar')
    await expect(page.getByTestId('class-page-header')).toContainText('1 på reservlistan')
    await expect(page.getByTestId('class-page-attendance-opens')).toContainText(
      'Närvarorapportering öppnar 2025-09-12 20:00',
    )
    await expect(page.getByTestId('class-page-attendance-deadline')).toContainText(
      'Anmäl närvaro senast 2099-09-13 10:15',
    )
    await expect(page.getByRole('tab', { name: 'Spelare' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('tab', { name: 'Pooler' })).toBeDisabled()
    await expect(page.getByTestId('class-live-view')).toHaveCount(0)
    await expect(page.getByTestId(`public-search-class-roster-${seeded.classWithoutPoolsId}`)).toContainText('Clara Carlsson')
    await expect(page.getByTestId(`public-search-class-roster-${seeded.classWithoutPoolsId}`)).toContainText('David Dahl')
    await expect(pageContent).toContainText('Reservlista')
    await expect(pageContent).toContainText('Erik Ek')
  })

  test('class page shows a not-found state for an unknown class id', async ({ page }) => {
    await page.goto(`/${SLUG}/classes/00000000-0000-0000-0000-000000000000`)

    await expect(page.getByText('Klassen hittades inte.')).toBeVisible()
  })

  test('pool card shows a Bord pill when a pool has table assignments', async ({ page }) => {
    const supabase = testClient()
    await seedClassPoolTables(supabase, seeded.classId, [
      { poolNumber: 1, tables: [1, 2] },
    ])

    await page.goto(`/${SLUG}/classes/${seeded.classId}`)

    await expect(page.getByTestId('class-live-pool-tables-1')).toHaveText('Bord 1, 2')
    await expect(page.getByTestId('class-live-pool-tables-2')).toHaveCount(0)
  })
})
