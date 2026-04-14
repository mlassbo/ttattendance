import { expect, test } from '@playwright/test'
import { config } from 'dotenv'
import {
  cleanTestCompetitions,
  seedClassDashboard,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const SLUG = 'test-player-dashboard-2025'

test.describe('Public class dashboard', () => {
  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, 'test-player-dashboard-%')
    await seedClassDashboard(supabase, SLUG, '2222')
  })

  test('dashboard renders on landing page', async ({ page }) => {
    await page.goto(`/${SLUG}`)

    const dashboard = page.getByTestId('class-dashboard')

    await expect(dashboard).toBeVisible()
    await expect(dashboard).toContainText('H-klass A')
    await expect(dashboard).toContainText('2 platser kvar')
    await expect(dashboard).toContainText('D-klass A')
    await expect(dashboard).toContainText('Fullt')
    await expect(dashboard).toContainText('3 på reservlistan')
    await expect(page.getByTestId(/^class-card-expand-/).filter({ hasText: 'Mixed' })).toContainText('–')
  })

  test('session heading format', async ({ page }) => {
    await page.goto(`/${SLUG}`)

    await expect(page.getByTestId('class-dashboard')).toContainText('Lör - Pass 1')
  })

  test('class row expands inline instead of navigating away', async ({ page }) => {
    await page.goto(`/${SLUG}`)

    await page.getByTestId(/^class-card-expand-/).filter({ hasText: 'H-klass A' }).click()

    await expect(page).toHaveURL(`/${SLUG}`)
    await expect(page.getByTestId('class-dashboard')).toContainText('Spelare')
    await expect(page.getByTestId('class-dashboard')).toContainText('Dashboardspelare 1')
  })
})
