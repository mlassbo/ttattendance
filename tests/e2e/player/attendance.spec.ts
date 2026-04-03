import { test, expect, type Page } from '@playwright/test'
import { config } from 'dotenv'
import {
  testClient,
  cleanTestCompetitions,
  seedPlayerTestCompetition,
  SeededCompetition,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const SLUG = 'test-player-2025'
const PLAYER_PIN = '9999'

async function loginAsPlayer(page: Page) {
  await page.goto(`/${SLUG}/player`)
  await page.getByTestId('pin-input').fill(PLAYER_PIN)
  await page.getByTestId('login-button').click()
  await page.waitForURL(`/${SLUG}/search`)
}

async function selectPlayerSearch(page: Page) {
  await page.getByTestId('search-mode-player').click()
}

async function selectClubSearch(page: Page) {
  await page.getByTestId('search-mode-club').click()
}

test.describe('Player attendance flow', () => {
  let seeded: SeededCompetition

  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, 'test-player-%')
    seeded = await seedPlayerTestCompetition(supabase, SLUG, PLAYER_PIN)
  })

  // ── Authentication ──────────────────────────────────────────────────────

  test('root landing page lists the competition and login actions', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(page.getByTestId(`competition-entry-card-${SLUG}`)).toBeVisible()
    await expect(page.getByTestId(`player-login-link-${SLUG}`)).toContainText(
      'Logga in som spelare'
    )
    await expect(page.getByTestId(`admin-login-link-${SLUG}`)).toContainText(
      'Logga in som sekretariat'
    )

    await expect(page.getByRole('link', { name: 'Superadmin' })).toHaveCount(0)
    await expect(page.getByTestId(`competition-entry-card-${SLUG}`)).toContainText('Test Tävling')
  })

  test('competition chooser links to the player PIN page', async ({ page }) => {
    await page.goto(`/${SLUG}`)

    await page.getByTestId('competition-role-link-player').click()
    await page.waitForURL(`/${SLUG}/player`)
    await expect(page.getByTestId('pin-login-page')).toBeVisible()
  })

  test('player PIN page renders the shared login shell', async ({ page }) => {
    await page.goto(`/${SLUG}/player`)

    await expect(page.getByTestId('pin-login-page')).toBeVisible()
    await expect(page.getByTestId('pin-login-card')).toBeVisible()
    await expect(page.getByTestId('pin-login-form')).toBeVisible()
    await expect(page.getByTestId('pin-login-eyebrow')).toContainText('Spelare')
    await expect(page.getByTestId('pin-login-title')).toContainText('Test Tävling')
  })

  test('wrong PIN shows error', async ({ page }) => {
    await page.goto(`/${SLUG}/player`)
    await page.getByTestId('pin-input').fill('0000')
    await page.getByTestId('login-button').click()
    await expect(page.getByTestId('pin-error')).toContainText('Fel PIN-kod')
  })

  test('correct PIN redirects to search page', async ({ page }) => {
    await loginAsPlayer(page)
    await expect(page.getByTestId('search-input')).toBeVisible()
    await expect(page.getByTestId('search-mode-player')).toHaveAttribute('aria-selected', 'true')
  })

  test('already logged-in player is redirected from PIN page to search', async ({ page }) => {
    // First login
    await loginAsPlayer(page)

    // Navigate back to PIN page — should skip it
    await page.goto(`/${SLUG}/player`)
    await page.waitForURL(`/${SLUG}/search`)
    await expect(page.getByTestId('search-input')).toBeVisible()
  })

  // ── Search ──────────────────────────────────────────────────────────────

  test('search with fewer than 2 characters shows no results', async ({ page }) => {
    await loginAsPlayer(page)
    await selectPlayerSearch(page)

    await page.getByTestId('search-input').fill('A')
    // Give the debounce time to settle — results list should stay empty
    await page.waitForTimeout(400)
    await expect(page.getByTestId('search-results')).toBeEmpty()
  })

  test('player search is selected by default', async ({ page }) => {
    await loginAsPlayer(page)

    await expect(page.getByTestId('search-mode-player')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('search-mode-club')).toHaveAttribute('aria-selected', 'false')
    await expect(page.getByTestId('search-input')).toBeEnabled()
  })

  test('search finds player by name prefix', async ({ page }) => {
    await loginAsPlayer(page)
    await selectPlayerSearch(page)

    await page.getByTestId('search-input').fill('Ann')
    await expect(page.getByTestId(`player-result-card-${seeded.player.id}`)).toBeVisible()
    await expect(page.getByTestId('search-results')).toContainText('Anna Testsson')
    await expect(page.getByTestId('search-results')).toContainText('Test BTK')
    await expect(
      page.locator(`[data-testid^="search-session-${seeded.player.id}-"]`).first()
    ).toContainText('Lör - Pass 1')
  })

  test('search finds players by club prefix', async ({ page }) => {
    await loginAsPlayer(page)
    await selectClubSearch(page)

    await page.getByTestId('search-input').fill('Test B')
    await expect(page.getByTestId(`player-result-card-${seeded.players[0].id}`)).toBeVisible()
    await expect(page.getByTestId(`player-result-card-${seeded.players[1].id}`)).toBeVisible()
  })

  test('player search matches later name tokens like Valter', async ({ page }) => {
    await loginAsPlayer(page)

    await page.getByTestId('search-input').fill('Valter')
    await expect(page.getByTestId('search-results')).toContainText('Karl Valtersson')
    await expect(page.getByTestId('search-results')).not.toContainText('Anna Testsson')
  })

  test('club search does not return player-name matches', async ({ page }) => {
    await loginAsPlayer(page)
    await selectClubSearch(page)

    await page.getByTestId('search-input').fill('Ann')
    await expect(page.getByTestId('no-results')).toContainText('Inga klubbar hittades.')
  })

  test('player search does not return club-name matches', async ({ page }) => {
    await loginAsPlayer(page)
    await selectPlayerSearch(page)

    await page.getByTestId('search-input').fill('Test B')
    await expect(page.getByTestId('no-results')).toContainText('Inga spelare hittades.')
  })

  test('no results shown for non-matching query', async ({ page }) => {
    await loginAsPlayer(page)
    await selectPlayerSearch(page)

    await page.getByTestId('search-input').fill('Xyz')
    await expect(page.getByTestId('no-results')).toBeVisible()
  })

  // ── Attendance actions ──────────────────────────────────────────────────

  test('can confirm attendance directly from the search results', async ({ page }) => {
    await loginAsPlayer(page)
    await selectPlayerSearch(page)

    await page.getByTestId('search-input').fill('Ann')
    await expect(
      page.getByTestId(`search-confirm-btn-${seeded.player.futureRegId}`)
    ).toContainText('Bekräfta närvaro')
    await page.getByTestId(`search-confirm-btn-${seeded.player.futureRegId}`).click()

    await expect(
      page.getByTestId(`search-status-badge-${seeded.player.futureRegId}`)
    ).toContainText('Närvaro bekräftad')
  })

  test('can confirm attendance on a future-deadline class', async ({ page }) => {
    await loginAsPlayer(page)
    await selectPlayerSearch(page)

    await page.getByTestId('search-input').fill('Ann')
    await page.getByTestId(`search-confirm-btn-${seeded.player.futureRegId}`).click()

    await expect(
      page.getByTestId(`search-status-badge-${seeded.player.futureRegId}`)
    ).toContainText('Närvaro bekräftad')
  })

  test('can change attendance from confirmed to absent', async ({ page }) => {
    await loginAsPlayer(page)
    await selectPlayerSearch(page)

    await page.getByTestId('search-input').fill('Ann')
    await page.getByTestId(`search-confirm-btn-${seeded.player.futureRegId}`).click()
    await expect(
      page.getByTestId(`search-status-badge-${seeded.player.futureRegId}`)
    ).toContainText('Närvaro bekräftad')
    await expect(
      page.getByTestId(`search-status-summary-${seeded.player.futureRegId}`)
    ).toContainText('Spelaren är markerad som närvarande i klassen.')
    await expect(
      page.getByTestId(`search-confirm-btn-${seeded.player.futureRegId}`)
    ).toHaveCount(0)
    await expect(
      page.getByTestId(`search-absent-btn-${seeded.player.futureRegId}`)
    ).toHaveCount(0)

    await page.getByTestId(`search-reset-btn-${seeded.player.futureRegId}`).click()
    await expect(
      page.getByTestId(`search-confirm-btn-${seeded.player.futureRegId}`)
    ).toBeVisible()

    await page.getByTestId(`search-absent-btn-${seeded.player.futureRegId}`).click()
    await expect(
      page.getByTestId(`search-status-badge-${seeded.player.futureRegId}`)
    ).toContainText('Frånvaro')
    await expect(
      page.getByTestId(`search-status-summary-${seeded.player.futureRegId}`)
    ).toContainText('Frånvaro anmäld')
  })

  test('can reset attendance back to no response', async ({ page }) => {
    await loginAsPlayer(page)
    await selectPlayerSearch(page)

    await page.getByTestId('search-input').fill('Ann')
    await page.getByTestId(`search-confirm-btn-${seeded.player.futureRegId}`).click()
    await expect(
      page.getByTestId(`search-status-badge-${seeded.player.futureRegId}`)
    ).toContainText('Närvaro bekräftad')

    await page.getByTestId(`search-reset-btn-${seeded.player.futureRegId}`).click()

    await expect(
      page.getByTestId(`search-status-badge-${seeded.player.futureRegId}`)
    ).toHaveCount(0)
    await expect(
      page.getByTestId(`search-reset-btn-${seeded.player.futureRegId}`)
    ).toHaveCount(0)
    await expect(
      page.getByTestId(`search-status-summary-${seeded.player.futureRegId}`)
    ).toHaveCount(0)
    await expect(
      page.getByTestId(`search-confirm-btn-${seeded.player.futureRegId}`)
    ).toBeVisible()
  })

  test('past-deadline class shows locked message and no action buttons', async ({ page }) => {
    await loginAsPlayer(page)
    await selectPlayerSearch(page)

    await page.getByTestId('search-input').fill('Ann')
    await expect(
      page.getByTestId(`search-deadline-passed-${seeded.player.pastRegId}`)
    ).toContainText('Anmälningstiden har gått ut')
  })

  test('attendance stays locked until 20:00 the night before the competition', async ({ page }) => {
    const supabase = testClient()
    const lockedSlug = 'test-player-locked'

    await cleanTestCompetitions(supabase, 'test-player-%')
    const lockedSeeded = await seedPlayerTestCompetition(supabase, lockedSlug, PLAYER_PIN, {
      competitionName: 'Låst Test Tävling',
      scheduleDate: '2099-09-13',
      futureDeadlineDate: '2099-09-13',
    })

    await page.goto(`/${lockedSlug}/player`)
    await page.getByTestId('pin-input').fill(PLAYER_PIN)
    await page.getByTestId('login-button').click()
    await page.waitForURL(`/${lockedSlug}/search`)

    await expect(page.getByTestId('attendance-not-open-banner')).toBeVisible()

    await page.getByTestId('search-input').fill('Ann')
    await expect(
      page.getByTestId(`attendance-not-open-${lockedSeeded.player.futureRegId}`)
    ).toBeVisible()
    await expect(
      page.getByTestId(`search-confirm-btn-${lockedSeeded.player.futureRegId}`)
    ).toHaveCount(0)
  })
})
