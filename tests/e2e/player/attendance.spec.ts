import { test, expect } from '@playwright/test'
import { config } from 'dotenv'
import { testClient, cleanTestCompetitions, seedPlayerTestCompetition } from '../../helpers/db'

config({ path: '.env.test.local' })

const SLUG = 'test-player-2025'
const PLAYER_PIN = '9999'

test.describe('Player attendance flow', () => {
  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, 'test-player-%')
    await seedPlayerTestCompetition(supabase, SLUG, PLAYER_PIN)
  })

  // ── Authentication ──────────────────────────────────────────────────────

  test('player PIN page renders the shared login shell', async ({ page }) => {
    await page.goto(`/${SLUG}`)

    await expect(page.getByTestId('pin-login-page')).toBeVisible()
    await expect(page.getByTestId('pin-login-card')).toBeVisible()
    await expect(page.getByTestId('pin-login-form')).toBeVisible()
    await expect(page.getByTestId('pin-login-eyebrow')).toContainText('Spelare')
    await expect(page.getByTestId('pin-login-title')).toContainText('Test Tävling')
  })

  test('wrong PIN shows error', async ({ page }) => {
    await page.goto(`/${SLUG}`)
    await page.getByTestId('pin-input').fill('0000')
    await page.getByTestId('login-button').click()
    await expect(page.getByTestId('pin-error')).toContainText('Fel PIN-kod')
  })

  test('correct PIN redirects to search page', async ({ page }) => {
    await page.goto(`/${SLUG}`)
    await page.getByTestId('pin-input').fill(PLAYER_PIN)
    await page.getByTestId('login-button').click()
    await page.waitForURL(`/${SLUG}/search`)
    await expect(page.getByTestId('search-input')).toBeVisible()
  })

  test('already logged-in player is redirected from PIN page to search', async ({ page }) => {
    // First login
    await page.goto(`/${SLUG}`)
    await page.getByTestId('pin-input').fill(PLAYER_PIN)
    await page.getByTestId('login-button').click()
    await page.waitForURL(`/${SLUG}/search`)

    // Navigate back to PIN page — should skip it
    await page.goto(`/${SLUG}`)
    await page.waitForURL(`/${SLUG}/search`)
    await expect(page.getByTestId('search-input')).toBeVisible()
  })

  // ── Search ──────────────────────────────────────────────────────────────

  test('search with fewer than 2 characters shows no results', async ({ page }) => {
    await page.goto(`/${SLUG}`)
    await page.getByTestId('pin-input').fill(PLAYER_PIN)
    await page.getByTestId('login-button').click()
    await page.waitForURL(`/${SLUG}/search`)

    await page.getByTestId('search-input').fill('A')
    // Give the debounce time to settle — results list should stay empty
    await page.waitForTimeout(400)
    await expect(page.getByTestId('search-results')).toBeEmpty()
  })

  test('search finds player by name prefix', async ({ page }) => {
    await page.goto(`/${SLUG}`)
    await page.getByTestId('pin-input').fill(PLAYER_PIN)
    await page.getByTestId('login-button').click()
    await page.waitForURL(`/${SLUG}/search`)

    await page.getByTestId('search-input').fill('Ann')
    await expect(page.getByTestId('search-results')).toContainText('Anna Testsson')
    await expect(page.getByTestId('search-results')).toContainText('Test BTK')
  })

  test('no results shown for non-matching query', async ({ page }) => {
    await page.goto(`/${SLUG}`)
    await page.getByTestId('pin-input').fill(PLAYER_PIN)
    await page.getByTestId('login-button').click()
    await page.waitForURL(`/${SLUG}/search`)

    await page.getByTestId('search-input').fill('Xyz')
    await expect(page.getByTestId('no-results')).toBeVisible()
  })

  // ── Classes view ────────────────────────────────────────────────────────

  test('clicking a player navigates to their classes', async ({ page }) => {
    await page.goto(`/${SLUG}`)
    await page.getByTestId('pin-input').fill(PLAYER_PIN)
    await page.getByTestId('login-button').click()
    await page.waitForURL(`/${SLUG}/search`)

    await page.getByTestId('search-input').fill('Ann')
    await page.getByTestId('search-results').locator('button').first().click()
    await page.waitForURL(`/${SLUG}/players/**`)

    await expect(page.locator('h1')).toContainText('Anna Testsson')
    await expect(page.locator('body')).toContainText('Herrar A-klass')
    await expect(page.locator('body')).toContainText('Utgången klass')
  })

  // ── Attendance actions ──────────────────────────────────────────────────

  test('can confirm attendance on a future-deadline class', async ({ page }) => {
    await page.goto(`/${SLUG}`)
    await page.getByTestId('pin-input').fill(PLAYER_PIN)
    await page.getByTestId('login-button').click()
    await page.waitForURL(`/${SLUG}/search`)

    await page.getByTestId('search-input').fill('Ann')
    await page.getByTestId('search-results').locator('button').first().click()
    await page.waitForURL(`/${SLUG}/players/**`)

    // Click the first "Bekräfta närvaro" button (future-deadline class)
    await page.locator('[data-testid^="confirm-btn-"]').first().click()

    // Status badge should update to "Bekräftad"
    await expect(page.locator('[data-testid^="status-badge-"]').first()).toContainText('Bekräftad')
  })

  test('can change attendance from confirmed to absent', async ({ page }) => {
    await page.goto(`/${SLUG}`)
    await page.getByTestId('pin-input').fill(PLAYER_PIN)
    await page.getByTestId('login-button').click()
    await page.waitForURL(`/${SLUG}/search`)

    await page.getByTestId('search-input').fill('Ann')
    await page.getByTestId('search-results').locator('button').first().click()
    await page.waitForURL(`/${SLUG}/players/**`)

    // Confirm first
    await page.locator('[data-testid^="confirm-btn-"]').first().click()
    await expect(page.locator('[data-testid^="status-badge-"]').first()).toContainText('Bekräftad')

    // Then switch to absent
    await page.locator('[data-testid^="absent-btn-"]').first().click()
    await expect(page.locator('[data-testid^="status-badge-"]').first()).toContainText('Frånvaro')
  })

  test('past-deadline class shows locked message and no action buttons', async ({ page }) => {
    await page.goto(`/${SLUG}`)
    await page.getByTestId('pin-input').fill(PLAYER_PIN)
    await page.getByTestId('login-button').click()
    await page.waitForURL(`/${SLUG}/search`)

    await page.getByTestId('search-input').fill('Ann')
    await page.getByTestId('search-results').locator('button').first().click()
    await page.waitForURL(`/${SLUG}/players/**`)

    // "Utgången klass" card should show the deadline-passed message
    await expect(page.locator('[data-testid^="deadline-passed-"]')).toBeVisible()
    await expect(page.locator('[data-testid^="deadline-passed-"]')).toContainText('Anmälningstiden har gått ut')
  })

  test('back button returns to search', async ({ page }) => {
    await page.goto(`/${SLUG}`)
    await page.getByTestId('pin-input').fill(PLAYER_PIN)
    await page.getByTestId('login-button').click()
    await page.waitForURL(`/${SLUG}/search`)

    await page.getByTestId('search-input').fill('Ann')
    await page.getByTestId('search-results').locator('button').first().click()
    await page.waitForURL(`/${SLUG}/players/**`)

    await page.getByTestId('back-button').click()
    await page.waitForURL(`/${SLUG}/search`)
    await expect(page.getByTestId('search-input')).toBeVisible()
  })
})
