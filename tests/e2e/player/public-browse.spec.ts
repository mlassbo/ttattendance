import { test, expect } from '@playwright/test'
import { config } from 'dotenv'
import {
  cleanTestCompetitions,
  seedPlayerTestCompetition,
  SeededCompetition,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const SLUG = 'test-player-public-2025'
const PLAYER_PIN = '9999'

test.describe('Public browse flow', () => {
  let seeded: SeededCompetition

  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, 'test-player-public-%')
    seeded = await seedPlayerTestCompetition(supabase, SLUG, PLAYER_PIN, {
      competitionName: 'Publik Testtävling',
    })
  })

  test('competition start page exposes the public search entry', async ({ page }) => {
    await page.goto(`/${SLUG}`)

    await expect(page.getByTestId('public-start-page')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Publik Testtävling')
    await expect(page.getByTestId('public-start-search-input')).toHaveAttribute(
      'placeholder',
      'Sök spelare eller klubb',
    )
    await expect(page.getByTestId('public-start-live-card')).toContainText('Kommer snart')
    await expect(page.getByTestId('public-start-admin-link')).toContainText('Sekretariat')
  })

  test('start page search submits into the public search page', async ({ page }) => {
    await page.goto(`/${SLUG}`)

    await page.getByTestId('public-start-search-input').fill('Anna')
    await page.getByTestId('public-start-search-button').click()

    await expect(page).toHaveURL(new RegExp(`/${SLUG}/search\\?q=Anna`))
    await expect(page.getByTestId(`public-search-player-card-${seeded.player.id}`)).toBeVisible()
    await expect(page.getByTestId(`public-search-player-class-pills-${seeded.player.id}`)).toContainText(
      'Herrar A-klass',
    )
    await expect(page.getByTestId(`public-search-player-class-pills-${seeded.player.id}`)).toContainText(
      'Utgången klass',
    )
  })

  test('public search in all mode shows the matching result groups for the query', async ({ page }) => {
    await page.goto(`/${SLUG}/search?q=Test%20B`)

    await expect(page.getByTestId('public-search-page')).toBeVisible()
    await expect(page.getByTestId('public-search-mode-all')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('public-search-admin-link')).toHaveCount(0)
    await expect(page.getByTestId('public-search-clubs-section')).toContainText('Test BTK')
    await expect(page.getByTestId('public-search-players-section')).toHaveCount(0)
    await expect(page.getByTestId('public-search-mode-tabs')).not.toContainText('Klasser')
  })

  test('public search supports club-only filtering', async ({ page }) => {
    await page.goto(`/${SLUG}/search?q=Test%20B&mode=club`)

    await expect(page.getByTestId('public-search-mode-club')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('public-search-clubs-section')).toContainText('Test BTK')
    await expect(page.getByTestId('public-search-players-section')).toHaveCount(0)
  })

  test('public search can open a club page from the result list', async ({ page }) => {
    await page.goto(`/${SLUG}/search?q=Test%20B&mode=club`)

    await page.getByTestId('public-search-club-link-test-btk').click()

    await expect(page.getByTestId('public-club-page')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Test BTK')
    await expect(page.getByTestId('public-club-back-link')).toContainText('Tillbaka till sök')
  })

  test('public player page shows the registered classes without login', async ({ page }) => {
    await page.goto(`/${SLUG}/players/${seeded.player.id}`)

    await expect(page.getByTestId('public-player-page')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Anna Testsson')
    await expect(page.getByTestId(`public-player-class-card-${seeded.player.futureRegId}`)).toContainText(
      'Herrar A-klass',
    )
    await expect(page.getByTestId(`public-player-class-card-${seeded.player.pastRegId}`)).toContainText(
      'Utgången klass',
    )
  })

  test('public player page asks for PIN before confirming attendance and accepts a valid PIN', async ({ page }) => {
    await page.goto(`/${SLUG}/players/${seeded.player.id}`)

    await page.getByTestId(`public-player-confirm-btn-${seeded.player.futureRegId}`).click()
    await expect(page.getByTestId('public-pin-modal')).toBeVisible()

    await page.getByTestId('public-pin-input').fill('0000')
    await page.getByTestId('public-pin-submit').click()
    await expect(page.getByTestId('public-pin-error')).toContainText('Fel PIN-kod')

    await page.getByTestId('public-pin-input').fill(PLAYER_PIN)
    await page.getByTestId('public-pin-submit').click()

    await expect(page.getByTestId('public-pin-modal')).toHaveCount(0)
    await expect(page.getByTestId(`public-player-status-badge-${seeded.player.futureRegId}`)).toContainText(
      'Närvaro bekräftad',
    )
  })

  test('public player page shows an explicit inline error when attendance reporting fails', async ({ page }) => {
    await page.route('**/api/attendance', async route => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Tävlingsschemat är inte importerat än.',
          code: 'competition_schedule_missing',
        }),
      })
    })

    await page.goto(`/${SLUG}/players/${seeded.player.id}`)
    await page.getByTestId(`public-player-confirm-btn-${seeded.player.futureRegId}`).click()
    await page.getByTestId('public-pin-input').fill(PLAYER_PIN)
    await page.getByTestId('public-pin-submit').click()

    await expect(page.getByTestId('public-player-error')).toContainText(
      'Tävlingsschemat är inte importerat än.',
    )
    await expect(
      page.getByTestId(`public-player-status-badge-${seeded.player.futureRegId}`),
    ).toHaveCount(0)
    await expect(page.getByTestId(`public-player-class-card-${seeded.player.futureRegId}`)).toBeVisible()
  })

  test('public player page returns to the previous search with results preserved', async ({ page }) => {
    await page.goto(`/${SLUG}/search?q=Anna&mode=player`)

    await page.getByTestId(`public-search-player-link-${seeded.player.id}`).click()
    await expect(page).toHaveURL(new RegExp(`/players/${seeded.player.id}.*returnTo=`))
    await expect(page.getByTestId('public-player-back-link')).toContainText('Tillbaka till sök')

    await page.getByTestId('public-player-back-link').click()
    await expect(page.getByTestId('public-search-input')).toHaveValue('Anna')
    await expect(page.getByTestId('public-search-mode-player')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId(`public-search-player-card-${seeded.player.id}`)).toBeVisible()
  })

  test('public club page lists players and filters locally', async ({ page }) => {
    const anna = seeded.players.find(player => player.name === 'Anna Testsson')!
    const bertil = seeded.players.find(player => player.name === 'Bertil Berg')!

    await page.goto(`/${SLUG}/clubs/${encodeURIComponent('Test BTK')}`)

    await expect(page.getByTestId('public-club-page')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Test BTK')
    await expect(page.getByTestId(`public-club-player-card-${anna.id}`)).toBeVisible()
    await expect(page.getByTestId(`public-club-player-card-${bertil.id}`)).toBeVisible()

    await page.getByTestId('public-club-filter-input').fill('Bertil')
    await expect(page.getByTestId(`public-club-player-card-${bertil.id}`)).toBeVisible()
    await expect(page.getByTestId(`public-club-player-card-${anna.id}`)).toHaveCount(0)
  })

  test('public club page can report attendance and reuse the unlocked session', async ({ page }) => {
    const anna = seeded.players.find(player => player.name === 'Anna Testsson')!
    const bertil = seeded.players.find(player => player.name === 'Bertil Berg')!

    await page.goto(`/${SLUG}/clubs/${encodeURIComponent('Test BTK')}`)

    await page.getByTestId(`public-club-confirm-btn-${anna.futureRegId}`).click()
    await expect(page.getByTestId('public-pin-modal')).toBeVisible()
    await page.getByTestId('public-pin-input').fill(PLAYER_PIN)
    await page.getByTestId('public-pin-submit').click()

    await expect(page.getByTestId(`public-club-status-badge-${anna.futureRegId}`)).toContainText(
      'Närvaro bekräftad',
    )

    await page.getByTestId(`public-club-absent-btn-${bertil.futureRegId}`).click()
    await expect(page.getByTestId('public-pin-modal')).toHaveCount(0)
    await expect(page.getByTestId(`public-club-status-badge-${bertil.futureRegId}`)).toContainText(
      'Frånvaro',
    )
  })

  test('public club page shows an explicit inline error when attendance reporting fails', async ({ page }) => {
    const anna = seeded.players.find(player => player.name === 'Anna Testsson')!

    await page.route('**/api/attendance', async route => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Databasfel',
        }),
      })
    })

    await page.goto(`/${SLUG}/clubs/${encodeURIComponent('Test BTK')}`)
    await page.getByTestId(`public-club-confirm-btn-${anna.futureRegId}`).click()
    await page.getByTestId('public-pin-input').fill(PLAYER_PIN)
    await page.getByTestId('public-pin-submit').click()

    await expect(page.getByTestId('public-club-error')).toContainText('Databasfel')
    await expect(page.getByTestId(`public-club-player-card-${anna.id}`)).toBeVisible()
    await expect(page.getByTestId(`public-club-status-badge-${anna.futureRegId}`)).toHaveCount(0)
  })
})