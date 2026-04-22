import { expect, Page, test } from '@playwright/test'
import { config } from 'dotenv'
import { applyRosterImport, buildClassIdentityKey } from '@/lib/roster-import/planner'
import { parseCompetitionImportSource } from '@/lib/roster-import/ttcoordinator-source'
import {
  cleanTestCompetitions,
  seedAdminTestCompetition,
  seedSuperadminCompetition,
  seedWaitingList,
  SeededAdminData,
  testClient,
} from '../../helpers/db'
import { buildCompetitionImportText } from '../../helpers/competition-import'

config({ path: '.env.test.local' })

const SLUG = 'test-admin-waiting-2025'
const ADMIN_PIN = '7777'

async function loginAsAdmin(page: Page, slug: string, pin: string) {
  await page.goto(`/${slug}/admin`)
  await page.getByTestId('admin-pin-input').fill(pin)
  await page.getByTestId('admin-login-button').click()
  await page.waitForURL(`/${slug}/admin/dashboard`)
}

test.describe('Admin waiting list', () => {
  let seed: SeededAdminData

  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, 'test-admin-waiting-%')
    seed = await seedAdminTestCompetition(supabase, SLUG, ADMIN_PIN)
  })

  test('unauthenticated access to waiting-list endpoints returns 401', async ({ request }) => {
    const supabase = testClient()
    const seededReserve = await seedWaitingList(supabase, {
      slug: SLUG,
      classId: seed.futureClassId,
      playerName: 'Una Reserve',
      clubName: 'Test BTK',
    })

    const addResponse = await request.post(`/api/admin/classes/${seed.futureClassId}/reserve`, {
      headers: {
        'x-competition-slug': SLUG,
      },
      data: {
        playerId: null,
        name: 'Ny Reserv',
        club: 'Test BTK',
      },
    })

    const deleteResponse = await request.delete(
      `/api/admin/classes/${seed.futureClassId}/reserve/${seededReserve.registrationId}`,
      {
        headers: {
          'x-competition-slug': SLUG,
        },
      },
    )

    expect(addResponse.status()).toBe(401)
    expect(deleteResponse.status()).toBe(401)
  })

  test('secretariat can add an existing competition player to the waiting list', async ({ page }) => {
    const supabase = testClient()
    const { data: player } = await supabase
      .from('players')
      .insert({
        competition_id: seed.competitionId,
        name: 'David Reserv',
        club: 'Test BTK',
      })
      .select('id')
      .single()

    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await page.goto(`/${SLUG}/admin/classes/${seed.futureClassId}`)

    await page.getByTestId('reserve-add-toggle').click()
    await page.getByTestId('reserve-player-name-input').fill('David')
    await expect(page.getByTestId(`reserve-suggestion-${player!.id}`)).toBeVisible()
    await page.getByTestId(`reserve-suggestion-${player!.id}`).click()

    await expect(page.getByTestId('reserve-list')).toContainText('David Reserv')
    await expect(page.getByTestId('reserve-list')).toContainText('Test BTK')
    await expect(page.locator('[data-testid^="reserve-row-"]')).toHaveCount(1)
  })

  test('secretariat can add a brand new player to the waiting list', async ({ page }) => {
    const supabase = testClient()
    await supabase.from('players').insert({
      competition_id: seed.competitionId,
      name: 'Klubb Ankare',
      club: 'Valbo BTK',
    })

    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await page.goto(`/${SLUG}/admin/classes/${seed.futureClassId}`)

    await page.getByTestId('reserve-add-toggle').click()
    await page.getByTestId('reserve-player-name-input').fill('Erik Reserv')
    await expect(page.getByTestId('reserve-suggestion-new-player')).toBeVisible()
    await page.getByTestId('reserve-suggestion-new-player').click()
    await page.getByTestId('reserve-player-club-input').fill('Val')
    await expect(page.getByTestId('reserve-club-suggestions')).toBeVisible()
    await page.getByTestId('reserve-club-suggestion-0').click()
    await expect(page.getByTestId('reserve-player-club-input')).toHaveValue('Valbo BTK')
    await page.getByTestId('reserve-submit-button').click()

    await expect(page.getByTestId('reserve-list')).toContainText('Erik Reserv')
    await expect(page.getByTestId('reserve-list')).toContainText('Valbo BTK')
  })

  test('secretariat can remove a waiting-list player and remaining players are renumbered', async ({ page }) => {
    const supabase = testClient()
    const first = await seedWaitingList(supabase, {
      slug: SLUG,
      classId: seed.futureClassId,
      playerName: 'Anna Reserv',
      clubName: 'Test BTK',
      joinedAt: '2025-01-01T08:00:00.000Z',
    })
    const second = await seedWaitingList(supabase, {
      slug: SLUG,
      classId: seed.futureClassId,
      playerName: 'Bertil Reserv',
      clubName: 'Test BTK',
      joinedAt: '2025-01-01T08:05:00.000Z',
    })

    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await page.goto(`/${SLUG}/admin/classes/${seed.futureClassId}`)

    await expect(page.getByTestId(`reserve-position-${first.registrationId}`)).toContainText('1')
    await expect(page.getByTestId(`reserve-position-${second.registrationId}`)).toContainText('2')

    await page.getByTestId(`reserve-remove-${first.registrationId}`).click()

    await expect(page.getByTestId(`reserve-row-${first.registrationId}`)).toHaveCount(0)
    await expect(page.getByTestId(`reserve-position-${second.registrationId}`)).toContainText('1')
    await expect(page.getByTestId(`reserve-row-${second.registrationId}`)).toContainText('Bertil Reserv')
  })

  test('adding a duplicate waiting-list entry shows an inline error', async ({ page }) => {
    const supabase = testClient()
    const { data: player } = await supabase
      .from('players')
      .insert({
        competition_id: seed.competitionId,
        name: 'Doris Dublett',
        club: 'Test BTK',
      })
      .select('id')
      .single()

    await seedWaitingList(supabase, {
      slug: SLUG,
      classId: seed.futureClassId,
      playerName: 'Doris Dublett',
      clubName: 'Test BTK',
      playerId: player!.id,
    })

    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await page.goto(`/${SLUG}/admin/classes/${seed.futureClassId}`)

    await page.getByTestId('reserve-add-toggle').click()
    await page.getByTestId('reserve-player-name-input').fill('Doris')
    await page.getByTestId(`reserve-suggestion-${player!.id}`).click()

    await expect(page.getByTestId('reserve-error')).toContainText(
      'Spelaren är redan på listan eller är fullt registrerad i denna klass.',
    )
  })

  test('import promotes a reserve registration to registered', async () => {
    const supabase = testClient()
    const slug = 'test-admin-waiting-import'
    const { competitionId } = await seedSuperadminCompetition(supabase, slug)

    const { data: session } = await supabase
      .from('sessions')
      .insert({
        competition_id: competitionId,
        name: 'Pass 1',
        date: '2025-09-13',
        session_order: 1,
      })
      .select('id')
      .single()

    const { data: cls } = await supabase
      .from('classes')
      .insert({
        session_id: session!.id,
        name: 'Reservklass',
        start_time: '2025-09-13T09:00:00+02:00',
        attendance_deadline: '2099-09-13T08:15:00+02:00',
      })
      .select('id')
      .single()

    const seededReserve = await seedWaitingList(supabase, {
      slug,
      classId: cls!.id,
      playerName: 'Rasmus Reserv',
      clubName: 'Test BTK',
      joinedAt: '2025-01-01T08:00:00.000Z',
    })

    const dataset = parseCompetitionImportSource(
      buildCompetitionImportText({
        competitionName: 'Import Reserv Cup',
        classes: [
          {
            className: 'Reservklass',
            classDate: '2025-09-13',
            classTime: '09:00',
            registrations: [
              { playerName: 'Rasmus Reserv', clubName: 'Test BTK' },
            ],
          },
        ],
      }),
    )

    const result = await applyRosterImport(
      supabase,
      competitionId,
      dataset,
      true,
      [{ classKey: dataset.classes[0].externalClassKey, sessionNumber: 1 }],
    )

    expect(result.result).toBeDefined()

    const { data: registration } = await supabase
      .from('registrations')
      .select('status, reserve_joined_at')
      .eq('id', seededReserve.registrationId)
      .single()

    expect(registration?.status).toBe('registered')
    expect(registration?.reserve_joined_at).toBeNull()
  })
})

test('OnData re-import with changed class time reuses the existing class and updates start time', async () => {
    const supabase = testClient()
    const slug = 'test-admin-waiting-ondata-time-change'
    const { competitionId } = await seedSuperadminCompetition(supabase, slug)

    const { data: session } = await supabase
      .from('sessions')
      .insert({
        competition_id: competitionId,
        name: 'Pass 1',
        date: '2025-09-13',
        session_order: 1,
      })
      .select('id')
      .single()

    const { data: cls } = await supabase
      .from('classes')
      .insert({
        session_id: session!.id,
        name: 'Reservklass',
        start_time: '2025-09-13T09:00:00+02:00',
        attendance_deadline: '2099-09-13T08:15:00+02:00',
      })
      .select('id')
      .single()

    const seededReserve = await seedWaitingList(supabase, {
      slug,
      classId: cls!.id,
      playerName: 'Rasmus Reserv',
      clubName: 'Test BTK',
      joinedAt: '2025-01-01T08:00:00.000Z',
    })

    const result = await applyRosterImport(
      supabase,
      competitionId,
      {
        sourceType: 'ondata-stage1',
        competitionTitleFromSource: 'Import Reserv Cup',
        errors: [],
        summary: {
          classesParsed: 1,
          playersParsed: 1,
          registrationsParsed: 1,
        },
        classes: [
          {
            externalClassKey: 'reservklass::2025-09-13::11:00',
            identityKey: buildClassIdentityKey('Reservklass', '2025-09-13', '11:00'),
            className: 'Reservklass',
            startAt: '2025-09-13T11:00:00+02:00',
            classDate: '2025-09-13',
            classTime: '11:00',
            registrations: [
              {
                playerName: 'Rasmus Reserv',
                clubName: 'Test BTK',
                playerKey: 'rasmus reserv::test btk',
              },
            ],
          },
        ],
      },
      true,
      [{ classKey: 'reservklass::2025-09-13::11:00', sessionNumber: 1 }],
    )

    expect(result.result).toBeDefined()
    expect(result.result?.summary.classesUpdated).toBe(1)
    expect(result.result?.summary.classesCreated).toBe(0)

    const { data: registration } = await supabase
      .from('registrations')
      .select('id, class_id, status, reserve_joined_at')
      .eq('id', seededReserve.registrationId)
      .single()

    expect(registration?.class_id).toBe(cls!.id)
    expect(registration?.status).toBe('registered')
    expect(registration?.reserve_joined_at).toBeNull()

    const { data: classes } = await supabase
      .from('classes')
      .select('id, start_time')
      .eq('session_id', session!.id)

    expect(classes).toHaveLength(1)
    expect(classes?.[0]?.id).toBe(cls!.id)
    expect(new Date(classes?.[0]?.start_time ?? '').toISOString()).toBe('2025-09-13T09:00:00.000Z')
  })