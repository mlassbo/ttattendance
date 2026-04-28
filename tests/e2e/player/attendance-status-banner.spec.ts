import { test, expect } from '@playwright/test'
import { config } from 'dotenv'
import {
  canSeedOpensSoonScenario,
  cleanTestCompetitions,
  seedAttendanceBannerScenario,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const SLUG_OPEN = 'test-player-banner-open'
const SLUG_OPENS_SOON = 'test-player-banner-opens-soon'
const SLUG_CLOSED = 'test-player-banner-closed'
const SLUG_IDLE = 'test-player-banner-idle'

test.describe('Attendance status banner', () => {
  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, 'test-player-banner-%')
  })

  test('landing page shows the open banner with the search instruction', async ({ page }) => {
    const supabase = testClient()
    await seedAttendanceBannerScenario(supabase, SLUG_OPEN, 'open')

    await page.goto(`/${SLUG_OPEN}`)

    const banner = page.getByTestId('attendance-status-banner-open')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Närvaroanmälan är öppen')
    await expect(banner).toContainText('Sök spelare eller klubb för att anmäla närvaro.')
  })

  test('landing page shows the opens-soon banner with the next opens-at time', async ({ page }) => {
    test.skip(
      !canSeedOpensSoonScenario(),
      'opens_soon banner can only be reliably seeded between 19:00 and 20:00 Swedish time',
    )

    const supabase = testClient()
    await seedAttendanceBannerScenario(supabase, SLUG_OPENS_SOON, 'opens_soon')

    await page.goto(`/${SLUG_OPENS_SOON}`)

    await expect(page.getByTestId('attendance-status-banner-opens-soon')).toBeVisible()
    await expect(page.getByTestId('attendance-status-banner-opens-soon')).toContainText(
      'Närvaroanmälan',
    )
    await expect(page.getByTestId('attendance-status-banner-opens-at')).toHaveText(/\d{2}:\d{2}/)
  })

  test('landing page shows the closed-pending banner when attendance is missing', async ({
    page,
  }) => {
    const supabase = testClient()
    await seedAttendanceBannerScenario(supabase, SLUG_CLOSED, 'closed_pending')

    await page.goto(`/${SLUG_CLOSED}`)

    await expect(page.getByTestId('attendance-status-banner-closed-pending')).toBeVisible()
    await expect(page.getByTestId('attendance-status-banner-closed-pending')).toContainText(
      'Kontakta sekretariatet om du inte anmält närvaro.',
    )
  })

  test('landing page renders no banner when there is nothing to surface', async ({ page }) => {
    const supabase = testClient()
    await seedAttendanceBannerScenario(supabase, SLUG_IDLE, 'idle')

    await page.goto(`/${SLUG_IDLE}`)

    await expect(page.getByTestId('public-start-page')).toBeVisible()
    await expect(page.getByTestId('attendance-status-banner-open')).toHaveCount(0)
    await expect(page.getByTestId('attendance-status-banner-opens-soon')).toHaveCount(0)
    await expect(page.getByTestId('attendance-status-banner-closed-pending')).toHaveCount(0)
  })

  test('search page shows the open banner subtitle and removes the original subline', async ({
    page,
  }) => {
    const supabase = testClient()
    await seedAttendanceBannerScenario(supabase, SLUG_OPEN, 'open')

    await page.goto(`/${SLUG_OPEN}/search`)

    await expect(page.getByTestId('attendance-status-banner-open')).toBeVisible()
    await expect(page.getByTestId('attendance-status-banner-open')).toContainText(
      'Sök spelare eller klubb för att anmäla närvaro.',
    )
    await expect(page.getByTestId('attendance-status-banner-cta')).toHaveCount(0)
    // Header subline removed; empty-state still mentions the same copy.
    await expect(page.getByText('Sök på spelare, klubb eller klass.')).toHaveCount(1)
    await expect(page.getByTestId('public-search-empty-state')).toBeVisible()
  })

  test('search page hides the opens-soon banner and keeps the original subline', async ({
    page,
  }) => {
    test.skip(
      !canSeedOpensSoonScenario(),
      'opens_soon banner can only be reliably seeded between 19:00 and 20:00 Swedish time',
    )

    const supabase = testClient()
    await seedAttendanceBannerScenario(supabase, SLUG_OPENS_SOON, 'opens_soon')

    await page.goto(`/${SLUG_OPENS_SOON}/search`)

    await expect(page.getByTestId('attendance-status-banner-opens-soon')).toHaveCount(0)
    await expect(page.getByText('Sök på spelare, klubb eller klass.')).toHaveCount(2)
  })

  test('search page hides the closed-pending banner and keeps the original subline', async ({
    page,
  }) => {
    const supabase = testClient()
    await seedAttendanceBannerScenario(supabase, SLUG_CLOSED, 'closed_pending')

    await page.goto(`/${SLUG_CLOSED}/search`)

    await expect(page.getByTestId('attendance-status-banner-closed-pending')).toHaveCount(0)
    await expect(page.getByText('Sök på spelare, klubb eller klass.')).toHaveCount(2)
  })
})
