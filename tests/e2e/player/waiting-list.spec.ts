import { expect, test } from '@playwright/test'
import { config } from 'dotenv'
import {
  cleanTestCompetitions,
  seedPlayerTestCompetition,
  seedWaitingList,
  SeededCompetition,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const SLUG = 'test-player-waiting-2025'
const PLAYER_PIN = '9999'

test.describe('Public waiting list', () => {
  let seeded: SeededCompetition
  let futureClassId: string

  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, 'test-player-waiting-%')
    seeded = await seedPlayerTestCompetition(supabase, SLUG, PLAYER_PIN, {
      competitionName: 'Reserv Publik Testtävling',
    })

    const { data: sessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('competition_id', seeded.competitionId)

    const { data: futureClass } = await supabase
      .from('classes')
      .select('id')
      .in('session_id', (sessions ?? []).map(session => session.id))
      .eq('name', 'Herrar A-klass')
      .single()

    futureClassId = futureClass!.id
  })

  test('player search shows reserve position and hides attendance actions for reserve classes', async ({ page }) => {
    await seedWaitingList(testClient(), {
      slug: SLUG,
      classId: futureClassId,
      playerName: 'Adam Reserv',
      clubName: 'Valbo BTK',
      joinedAt: '2025-01-01T07:55:00.000Z',
    })
    const seededReserve = await seedWaitingList(testClient(), {
      slug: SLUG,
      classId: futureClassId,
      playerName: 'Rasmus Reserv',
      clubName: 'Test BTK',
      joinedAt: '2025-01-01T08:00:00.000Z',
    })

    await page.goto(`/${SLUG}/search?q=Rasmus&mode=player`)

    await expect(page.getByTestId('public-search-players-section')).toContainText('Rasmus Reserv')
    await expect(page.getByTestId('public-search-players-section')).toContainText('Reserv #2')
    await expect(page.getByTestId(/^public-search-player-toggle-/)).toContainText('Visa klasser')

    await page.getByTestId(/^public-search-player-toggle-/).click()

    await expect(page.getByTestId(`public-search-player-class-card-${seededReserve.registrationId}`)).toContainText(
      'Du är på plats #2 på reservlistan för denna klass.',
    )
    await expect(page.getByTestId(`public-search-confirm-btn-${seededReserve.registrationId}`)).toHaveCount(0)
    await expect(page.getByTestId(`public-search-absent-btn-${seededReserve.registrationId}`)).toHaveCount(0)
  })

  test('class search shows the waiting list in reserve order', async ({ page }) => {
    const first = await seedWaitingList(testClient(), {
      slug: SLUG,
      classId: futureClassId,
      playerName: 'Axel Reserv',
      clubName: 'Valbo BTK',
      joinedAt: '2025-01-01T08:00:00.000Z',
    })
    const second = await seedWaitingList(testClient(), {
      slug: SLUG,
      classId: futureClassId,
      playerName: 'Bella Reserv',
      clubName: 'Test BTK',
      joinedAt: '2025-01-01T08:05:00.000Z',
    })

    await page.goto(`/${SLUG}/search?q=Herrar%20A-klass&mode=class`)

    await expect(page.getByTestId('public-search-classes-section')).toContainText('Reservlista')
    await expect(page.getByTestId(/^public-search-class-availability-/)).toContainText('Fullt')
    await expect(
      page.getByTestId(`public-search-class-reserve-${futureClassId}-${first.registrationId}`),
    ).toContainText('1. Axel Reserv')
    await expect(
      page.getByTestId(`public-search-class-reserve-${futureClassId}-${second.registrationId}`),
    ).toContainText('2. Bella Reserv')
  })
})