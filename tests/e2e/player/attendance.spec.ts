import { test, expect, type Page } from '@playwright/test'
import { config } from 'dotenv'
import {
  testClient,
  cleanTestCompetitions,
  seedPlayerTestCompetition,
  SeededCompetition,
  seedPlayerWindowTestCompetition,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const SLUG = 'test-player-attendance-2025'
const PLAYER_PIN = '9999'

async function loginAsPlayer(page: Page, slug: string = SLUG) {
  await page.goto(`/${slug}/player`)
  await page.getByTestId('pin-input').fill(PLAYER_PIN)
  await page.getByTestId('login-button').click()
  await page.waitForURL(`/${slug}/search`)
}

test.describe('Player attendance flow', () => {
  let seeded: SeededCompetition

  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, 'test-player-attendance-%')
    seeded = await seedPlayerTestCompetition(supabase, SLUG, PLAYER_PIN)
  })

  // ── Authentication ──────────────────────────────────────────────────────

  test('root landing page lists the competition and opens it from the card', async ({
    page,
  }) => {
    await page.goto('/')

    await expect(page.locator('main')).toContainText(
      'Välj din tävling för att se registrerade spelare, anmäla närvaro och följa tävlingen live.'
    )
    await expect(page.getByTestId(`competition-entry-card-${SLUG}`)).toBeVisible()
    await expect(page.getByTestId(`competition-open-link-${SLUG}`)).toContainText(
      'Till tävlingen →'
    )
    await expect(page.getByTestId(`admin-login-link-${SLUG}`)).toHaveCount(0)

    await expect(page.getByRole('link', { name: 'Superadmin' })).toHaveCount(0)
    await expect(page.getByTestId(`competition-entry-card-${SLUG}`)).toContainText('Test Tävling')

    await page.getByTestId(`competition-open-link-${SLUG}`).click()
    await page.waitForURL(`/${SLUG}`)
  })

  test('competition page shows the public start and still keeps secretariat access', async ({ page }) => {
    await page.goto(`/${SLUG}`)

    await expect(page.getByTestId('public-start-page')).toBeVisible()
    await expect(page.getByTestId('public-start-search-input')).toHaveAttribute(
      'placeholder',
      'Sök spelare eller klubb',
    )
    await expect(page.getByTestId('public-start-admin-link')).toContainText('Sekretariat')
  })

  test('player PIN page renders the shared login shell', async ({ page }) => {
    await page.goto(`/${SLUG}/player`)

    await expect(page.getByTestId('pin-login-page')).toBeVisible()
    await expect(page.getByTestId('pin-login-card')).toBeVisible()
    await expect(page.getByTestId('pin-login-form')).toBeVisible()
    await expect(page.getByTestId('pin-login-eyebrow')).toContainText('Spelare')
    await expect(page.getByTestId('pin-login-title')).toContainText('Test Tävling')
    await expect(page.getByTestId('pin-input')).toHaveAttribute('placeholder', 'PIN-kod')
  })

  test('wrong PIN shows error', async ({ page }) => {
    await page.goto(`/${SLUG}/player`)
    await page.getByTestId('pin-input').fill('0000')
    await page.getByTestId('login-button').click()
    await expect(page.getByTestId('pin-error')).toContainText('Fel PIN-kod')
  })

  test('correct PIN redirects to the public search page', async ({ page }) => {
    await loginAsPlayer(page)
    await expect(page.getByTestId('public-search-page')).toBeVisible()
    await expect(page.getByTestId('public-search-input')).toBeVisible()
    await expect(page.getByTestId('public-search-mode-all')).toHaveAttribute('aria-current', 'page')
  })

  test('already logged-in player is redirected from PIN page to search', async ({ page }) => {
    // First login
    await loginAsPlayer(page)

    // Navigate back to PIN page — should skip it
    await page.goto(`/${SLUG}/player`)
    await page.waitForURL(`/${SLUG}/search`)
    await expect(page.getByTestId('public-search-input')).toBeVisible()
  })

  test('legacy player search URL redirects to the public search page', async ({ page }) => {
    await page.goto(`/${SLUG}/player/search`)
    await page.waitForURL(`/${SLUG}/search`)
    await expect(page.getByTestId('public-search-page')).toBeVisible()
  })

  test('legacy player detail URL redirects to the public player page', async ({ page }) => {
    await page.goto(`/${SLUG}/player/players/${seeded.player.id}`)
    await page.waitForURL(`/${SLUG}/players/${seeded.player.id}`)
    await expect(page.getByTestId('public-player-page')).toBeVisible()
  })

  test('player login pre-unlocks attendance in the public flow', async ({ page }) => {
    await loginAsPlayer(page)
    await page.getByTestId('public-search-input').fill('Anna')
    await page.getByTestId('public-search-submit').click()
    await page.getByTestId(`public-search-player-link-${seeded.player.id}`).click()

    await expect(page.getByTestId('public-player-page')).toBeVisible()
    await page.getByTestId(`public-player-confirm-btn-${seeded.player.futureRegId}`).click()
    await expect(page.getByTestId('public-pin-modal')).toHaveCount(0)
    await expect(
      page.getByTestId(`public-player-status-badge-${seeded.player.futureRegId}`)
    ).toContainText('Närvaro bekräftad')
  })

  test('past-deadline class shows secretariat warning on the public player page', async ({ page }) => {
    await page.goto(`/${SLUG}/players/${seeded.player.id}`)
    await expect(
      page.getByTestId(`public-player-missing-attendance-${seeded.player.pastRegId}`)
    ).toContainText('Tiden för anmälan har gått ut')
    await expect(
      page.getByTestId(`public-player-missing-attendance-${seeded.player.pastRegId}`)
    ).toContainText('Kontakta sekretariatet')
    await expect(
      page.getByTestId(`public-player-confirm-btn-${seeded.player.pastRegId}`)
    ).toHaveCount(0)
    await expect(
      page.getByTestId(`public-player-absent-btn-${seeded.player.pastRegId}`)
    ).toHaveCount(0)
  })

  test('past-deadline class with registered attendance does not show missing warning', async ({ page }) => {
    const supabase = testClient()
    await supabase.from('attendance').insert({
      registration_id: seeded.player.pastRegId,
      status: 'confirmed',
      reported_at: new Date().toISOString(),
      reported_by: 'player',
      idempotency_key: `past-confirmed-${seeded.player.pastRegId}`,
    })

    await page.goto(`/${SLUG}/players/${seeded.player.id}`)
    await expect(
      page.getByTestId(`public-player-status-badge-${seeded.player.pastRegId}`)
    ).toContainText('Närvaro bekräftad')
    await expect(
      page.getByTestId(`public-player-missing-attendance-${seeded.player.pastRegId}`)
    ).toHaveCount(0)
  })

  test('attendance opens per class at 20:00 the night before in Swedish time', async ({ page }) => {
    const supabase = testClient()
    const windowSlug = 'test-player-attendance-window'

    await cleanTestCompetitions(supabase, 'test-player-attendance-%')
    const windowSeeded = await seedPlayerWindowTestCompetition(supabase, windowSlug, PLAYER_PIN, {
      competitionName: 'Fönster Test Tävling',
    })

    await page.goto(`/${windowSlug}/players/${windowSeeded.player.id}`)
    await expect(page.getByTestId(`public-player-confirm-btn-${windowSeeded.player.openRegId}`)).toBeVisible()
    await expect(
      page.getByTestId(`public-player-attendance-not-open-${windowSeeded.player.lockedRegId}`)
    ).toContainText('20:00')
    await expect(page.getByTestId(`public-player-confirm-btn-${windowSeeded.player.lockedRegId}`)).toHaveCount(0)
  })
})
