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
      'Sök spelare, klubb eller klass',
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
    await expect(page.getByTestId('public-search-mode-tabs')).toContainText('Klasser')
  })

  test('public search supports club-only filtering', async ({ page }) => {
    await page.goto(`/${SLUG}/search?q=Test%20B&mode=club`)

    await expect(page.getByTestId('public-search-mode-club')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('public-search-clubs-section')).toContainText('Test BTK')
    await expect(page.getByTestId('public-search-players-section')).toHaveCount(0)
  })

  test('switching search type clears the previous search query', async ({ page }) => {
    await page.goto(`/${SLUG}/search?q=Anna&mode=player`)

    await page.getByTestId('public-search-mode-club').click()

    await expect(page).toHaveURL(`/${SLUG}/search?mode=club`)
    await expect(page.getByTestId('public-search-input')).toHaveValue('')
    await expect(page.getByTestId('public-search-empty-state')).toBeVisible()
  })

  test('mobile search scrolls the results summary into view after submitting a query', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 500 })
    await page.goto(`/${SLUG}/search?mode=player`)

    await page.getByTestId('public-search-input').fill('Anna')
    await page.getByTestId('public-search-submit').click()

    await expect.poll(async () => new URL(page.url()).pathname).toBe(`/${SLUG}/search`)
    await expect.poll(async () => new URL(page.url()).searchParams.get('q')).toBe('Anna')
    await expect.poll(async () => new URL(page.url()).searchParams.get('mode')).toBe('player')
    await expect(page.getByTestId('public-search-results-summary')).toBeVisible()
    await expect(page.getByTestId(`public-search-player-card-${seeded.player.id}`)).toBeVisible()
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await expect.poll(async () => page.getByTestId('public-search-results-summary').evaluate(element => Math.round(element.getBoundingClientRect().top))).toBeLessThan(80)
  })

  test('public search can open a club page from the result list', async ({ page }) => {
    await page.goto(`/${SLUG}/search?q=Test%20B&mode=club`)

    await page.getByTestId('public-search-club-link-test-btk').click()

    await expect(page.getByTestId('public-club-page')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Test BTK')
    await expect(page.getByTestId('public-club-back-link')).toContainText('Tillbaka till sök')
  })

  test('class mode shows all class suggestion pills and class roster results', async ({ page }) => {
    await page.goto(`/${SLUG}/search?mode=class`)

    await expect(page.getByTestId('public-search-mode-class')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('public-search-class-picker')).toContainText('Herrar A-klass')
    await expect(page.getByTestId('public-search-class-picker')).toContainText('Utgången klass')
    await expect(page.getByTestId('public-search-form')).toHaveCount(0)
    await expect(page.getByTestId('public-search-input')).toHaveCount(0)

    await page.getByTestId(/^public-search-class-pill-/).filter({ hasText: 'Herrar A-klass' }).click()

    await expect(page.getByTestId('public-search-classes-section')).toBeVisible()
    await expect(page.getByTestId('public-search-classes-section')).toContainText('Herrar A-klass')
    await expect(page.getByTestId('public-search-classes-section')).toContainText('Anna Testsson')
    await expect(page.getByTestId('public-search-classes-section')).toContainText('Bertil Berg')
  })

  test('player class pills are shown as non-clickable status indicators', async ({ page }) => {
    await page.goto(`/${SLUG}/search?q=Anna&mode=player`)

    await expect(page.getByTestId(`public-search-player-class-pill-${seeded.player.id}-herrar-a-klass`)).toBeVisible()
    await expect(page.getByTestId(`public-search-player-class-pill-${seeded.player.id}-herrar-a-klass`)).toContainText(
      'Herrar A-klass',
    )
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

  test('expandable player search card asks for PIN before confirming attendance and accepts a valid PIN', async ({ page }) => {
    await page.goto(`/${SLUG}/search?q=Anna&mode=player`)

    await expect(page.getByTestId(`public-search-player-toggle-${seeded.player.id}`)).toContainText(
      'Anmäl närvaro',
    )

    await page.getByTestId(`public-search-player-toggle-${seeded.player.id}`).click()
    await page.getByTestId(`public-search-confirm-btn-${seeded.player.futureRegId}`).click()
    await expect(page.getByTestId('public-pin-modal')).toBeVisible()

    await page.getByTestId('public-pin-input').fill('0000')
    await page.getByTestId('public-pin-submit').click()
    await expect(page.getByTestId('public-pin-error')).toContainText('Fel PIN-kod')

    await page.getByTestId('public-pin-input').fill(PLAYER_PIN)
    await page.getByTestId('public-pin-submit').click()

    await expect(page.getByTestId('public-pin-modal')).toHaveCount(0)
    await expect(page.getByTestId(`public-search-status-badge-${seeded.player.futureRegId}`)).toContainText(
      'Närvaro bekräftad',
    )
    await expect(page.getByTestId(`public-search-player-toggle-${seeded.player.id}`)).toContainText(
      'Ändra närvaro',
    )
  })

  test('expandable player search card shows an explicit inline error when attendance reporting fails', async ({ page }) => {
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

    await page.goto(`/${SLUG}/search?q=Anna&mode=player`)
    await page.getByTestId(`public-search-player-toggle-${seeded.player.id}`).click()
    await page.getByTestId(`public-search-confirm-btn-${seeded.player.futureRegId}`).click()
    await page.getByTestId('public-pin-input').fill(PLAYER_PIN)
    await page.getByTestId('public-pin-submit').click()

    await expect(page.getByTestId('public-search-error')).toContainText(
      'Tävlingsschemat är inte importerat än.',
    )
    await expect(
      page.getByTestId(`public-search-status-badge-${seeded.player.futureRegId}`),
    ).toHaveCount(0)
    await expect(page.getByTestId(`public-search-player-class-card-${seeded.player.futureRegId}`)).toBeVisible()
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