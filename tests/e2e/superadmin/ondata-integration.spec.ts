import { expect, test, Page } from '@playwright/test'
import { config } from 'dotenv'
import { signCookie } from '@/lib/cookie-signing'
import {
  cleanTestCompetitions,
  seedSuperadminCompetition,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const TEST_PREFIX = 'test-sm-ondata-'

async function loginAsSuperadmin(page: Page) {
  const secret = process.env.COOKIE_SECRET
  if (!secret) {
    throw new Error('COOKIE_SECRET is required for superadmin E2E tests')
  }

  const signedRole = await signCookie('superadmin', secret)

  await page.context().addCookies([
    {
      name: 'role',
      value: signedRole,
      url: 'http://127.0.0.1:3001',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ])

  await page.goto('/super/competitions')
}

async function openIntegrationPage(page: Page, slug: string) {
  await page.getByTestId(`integration-action-${slug}`).click()
  await page.waitForURL(/\/super\/competitions\/.+\/integration$/)
}

function buildSnapshotPayload(onDataSlug: string) {
  return {
    schemaVersion: 1,
    competitionSlug: onDataSlug,
    source: {
      fileName: 'ondata-competition',
      filePath: `https://resultat.ondata.se/${onDataSlug}/`,
      fileModifiedAt: '2026-04-06T08:07:38.623Z',
      copiedToTempAt: '2026-04-06T08:07:38.623Z',
      processedAt: '2026-04-06T08:07:38.623Z',
      fileHash: 'sha256:testhash',
    },
    summary: {
      classes: 1,
      pools: 2,
      completedMatches: 4,
    },
    classes: [
      {
        externalClassKey: 'herrsingel 7::Lör 28::09:00',
        className: 'Herrsingel 7',
        classDate: 'Lör 28',
        classTime: '09:00',
        pools: [
          {
            poolNumber: 1,
            completedMatchCount: 3,
            players: [
              { name: 'YAO Zisheng', club: 'IFK Lund Bordtennis' },
              { name: 'SCHULTZ Vincent', club: 'BTK Rekord' },
            ],
            matches: [
              {
                matchNumber: 1,
                playerA: { name: 'YAO Zisheng', club: 'IFK Lund Bordtennis' },
                playerB: { name: 'SCHULTZ Vincent', club: 'BTK Rekord' },
                result: '6, 5, 3',
              },
            ],
          },
          {
            poolNumber: 2,
            completedMatchCount: 1,
            players: [
              { name: 'ZHOU Yifan', club: 'IFK Lund Bordtennis' },
              { name: 'LAGERSTEDT Julius', club: 'Kvarnby AK' },
            ],
            matches: [
              {
                matchNumber: 2,
                playerA: { name: 'ZHOU Yifan', club: 'IFK Lund Bordtennis' },
                playerB: { name: 'LAGERSTEDT Julius', club: 'Kvarnby AK' },
                result: '8, 5, -4, 6',
              },
            ],
          },
        ],
      },
    ],
  }
}

function buildInvalidSnapshotPayload(onDataSlug: string) {
  const payload = buildSnapshotPayload(onDataSlug)
  payload.source = {
    ...payload.source,
    fileHash: 'sha256:broken-hash',
    processedAt: '2026-04-06T08:08:38.623Z',
    copiedToTempAt: '2026-04-06T08:08:38.623Z',
  }
  payload.classes[0].pools = [
    payload.classes[0].pools[0],
    {
      ...payload.classes[0].pools[1],
      poolNumber: payload.classes[0].pools[0].poolNumber,
    },
  ]

  return payload
}

function buildRegistrationSnapshotPayload(onDataSlug: string) {
  return {
    schemaVersion: 1,
    competitionSlug: onDataSlug,
    source: {
      sourceType: 'ondata-stage1',
      fileName: 'class-players.pdf',
      filePath: `https://resultat.ondata.se/ViewClassPDF.php?competition=${onDataSlug}&stage=1`,
      fileModifiedAt: '2026-04-08T12:00:00.000Z',
      processedAt: '2026-04-08T12:00:10.000Z',
      fileHash: 'sha256:registrationhash',
    },
    summary: {
      classes: 2,
      players: 3,
      registrations: 4,
    },
    classes: [
      {
        externalClassKey: 'max-400::2026-05-03::09:00',
        sourceClassId: '31882',
        className: 'Max400',
        startAt: '2026-05-03T07:00:00.000Z',
        registrations: [
          { playerName: 'Alva Alfredsson', clubName: 'BTK Dalen' },
          { playerName: 'Bosse Berg', clubName: 'IFK Lund' },
        ],
      },
      {
        externalClassKey: 'pf11::2026-05-03::11:30',
        sourceClassId: '31883',
        className: 'PF11',
        startAt: '2026-05-03T09:30:00.000Z',
        registrations: [
          { playerName: 'Alva Alfredsson', clubName: 'BTK Dalen' },
          { playerName: 'Cia Carlsson', clubName: 'Kalmar BTK' },
        ],
      },
    ],
  }
}

function buildInvalidRegistrationSnapshotPayload(onDataSlug: string) {
  const payload = buildRegistrationSnapshotPayload(onDataSlug)

  payload.source = {
    ...payload.source,
    filePath: `${payload.source.filePath}&attempt=broken`,
    processedAt: '2026-04-08T12:05:10.000Z',
    fileHash: 'sha256:registrationhash-broken',
  }

  payload.classes = [
    ...payload.classes,
    {
      externalClassKey: payload.classes[0].externalClassKey,
      sourceClassId: '39999',
      className: 'Duplicerad klassnyckel',
      startAt: '2026-05-03T12:00:00.000Z',
      registrations: [
        { playerName: 'Dana Dalen', clubName: 'BTK Dalen' },
        { playerName: 'Eva Eklund', clubName: 'IFK Lund' },
      ],
    },
  ]

  payload.summary = {
    classes: 3,
    players: 5,
    registrations: 6,
  }

  return payload
}

test.describe('OnData integration', () => {
  test.beforeEach(async () => {
    await cleanTestCompetitions(testClient(), `${TEST_PREFIX}%`)
  })

  test('unauthenticated user is redirected away from the integration page', async ({ page }) => {
    const { competitionId } = await seedSuperadminCompetition(testClient(), `${TEST_PREFIX}auth`)

    await page.goto(`/super/competitions/${competitionId}/integration`)

    await page.waitForURL('/super')
    await expect(page.getByTestId('login-button')).toBeVisible()
  })

  test('superadmin can generate an API key for a competition', async ({ page }) => {
    const slug = `${TEST_PREFIX}apikey`
    await seedSuperadminCompetition(testClient(), slug)

    await loginAsSuperadmin(page)
    await openIntegrationPage(page, slug)

    await page.getByTestId('generate-api-key-button').click()

    await expect(page.getByTestId('generated-api-key-input')).toHaveValue(/tta_ondata_/)
    await expect(page.getByTestId('integration-api-key-generated-at')).not.toContainText('Ingen data än')
    await expect(page.getByTestId('schema-version')).toContainText('1')
  })

  test('snapshot ingest updates the competition integration status', async ({ page }) => {
    const supabase = testClient()
    const ttAttendanceSlug = `${TEST_PREFIX}ingest`
    const onDataSlug = '001348'
    const { competitionId } = await seedSuperadminCompetition(supabase, ttAttendanceSlug)

    await loginAsSuperadmin(page)
    await openIntegrationPage(page, ttAttendanceSlug)
    await page.getByTestId('generate-api-key-button').click()

    const apiKey = await page.getByTestId('generated-api-key-input').inputValue()
    const response = await page.request.post(`/api/integrations/ondata/competitions/${ttAttendanceSlug}/snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildSnapshotPayload(onDataSlug),
    })

    expect(response.status()).toBe(202)

    await page.getByTestId('refresh-integration-status').click()

    await expect(page.getByTestId('integration-summary-classes')).toContainText('1')
    await expect(page.getByTestId('integration-summary-pools')).toContainText('2')
    await expect(page.getByTestId('integration-summary-matches')).toContainText('4')
    await expect(page.getByTestId('integration-source-path')).toContainText(`https://resultat.ondata.se/${onDataSlug}/`)
    await expect(page.getByTestId('integration-last-error')).toHaveCount(0)

    const { data: status } = await supabase
      .from('ondata_integration_status')
      .select('last_summary_classes, last_summary_pools, last_summary_completed_matches, current_snapshot_id')
      .eq('competition_id', competitionId)
      .single()

    expect(status?.last_summary_classes).toBe(1)
    expect(status?.last_summary_pools).toBe(2)
    expect(status?.last_summary_completed_matches).toBe(4)
    expect(status?.current_snapshot_id).toBeTruthy()
  })

  test('duplicate snapshot deliveries create new immutable snapshot rows', async ({ page }) => {
    const supabase = testClient()
    const ttAttendanceSlug = `${TEST_PREFIX}duplicate`
    const onDataSlug = '001349'
    const { competitionId } = await seedSuperadminCompetition(supabase, ttAttendanceSlug)

    await loginAsSuperadmin(page)
    await openIntegrationPage(page, ttAttendanceSlug)
    await page.getByTestId('generate-api-key-button').click()

    const apiKey = await page.getByTestId('generated-api-key-input').inputValue()
    const payload = buildSnapshotPayload(onDataSlug)

    const firstResponse = await page.request.post(`/api/integrations/ondata/competitions/${ttAttendanceSlug}/snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: payload,
    })
    const secondResponse = await page.request.post(`/api/integrations/ondata/competitions/${ttAttendanceSlug}/snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: payload,
    })

    expect(firstResponse.status()).toBe(202)
    expect(secondResponse.status()).toBe(202)

    const { data: snapshots } = await supabase
      .from('ondata_integration_snapshots')
      .select('id')
      .eq('competition_id', competitionId)
      .order('received_at', { ascending: true })

    expect(snapshots).toHaveLength(2)
    expect(snapshots?.[0]?.id).not.toBe(snapshots?.[1]?.id)

    const { data: status } = await supabase
      .from('ondata_integration_status')
      .select('current_snapshot_id')
      .eq('competition_id', competitionId)
      .single()

    expect(status?.current_snapshot_id).toBe(snapshots?.[1]?.id)
  })

  test('failed ingest keeps the last successful snapshot as current', async ({ page }) => {
    const supabase = testClient()
    const ttAttendanceSlug = `${TEST_PREFIX}failed-retry`
    const onDataSlug = '001350'
    const { competitionId } = await seedSuperadminCompetition(supabase, ttAttendanceSlug)

    await loginAsSuperadmin(page)
    await openIntegrationPage(page, ttAttendanceSlug)
    await page.getByTestId('generate-api-key-button').click()

    const apiKey = await page.getByTestId('generated-api-key-input').inputValue()

    const successResponse = await page.request.post(`/api/integrations/ondata/competitions/${ttAttendanceSlug}/snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildSnapshotPayload(onDataSlug),
    })

    expect(successResponse.status()).toBe(202)

    const { data: successStatus } = await supabase
      .from('ondata_integration_status')
      .select('current_snapshot_id')
      .eq('competition_id', competitionId)
      .single()

    const successfulSnapshotId = successStatus?.current_snapshot_id
    expect(successfulSnapshotId).toBeTruthy()

    const failedResponse = await page.request.post(`/api/integrations/ondata/competitions/${ttAttendanceSlug}/snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildInvalidSnapshotPayload(onDataSlug),
    })

    expect(failedResponse.status()).toBe(500)

    const { data: failedStatus } = await supabase
      .from('ondata_integration_status')
      .select('current_snapshot_id, last_error')
      .eq('competition_id', competitionId)
      .single()

    expect(failedStatus?.current_snapshot_id).toBe(successfulSnapshotId)
    expect(failedStatus?.last_error).toBeTruthy()
  })

  test('snapshot ingest rejects an invalid API key', async ({ page }) => {
    const slug = `${TEST_PREFIX}unauthorized`
    await seedSuperadminCompetition(testClient(), slug)

    const response = await page.request.post(`/api/integrations/ondata/competitions/${slug}/snapshots`, {
      headers: {
        Authorization: 'Bearer wrong-token',
      },
      data: buildSnapshotPayload(slug),
    })

    expect(response.status()).toBe(401)
  })

  test('registration snapshot ingest updates the registration import status', async ({ page }) => {
    const slug = `${TEST_PREFIX}registration-status`
    const onDataSlug = '001351'
    await seedSuperadminCompetition(testClient(), slug)

    await loginAsSuperadmin(page)
    await openIntegrationPage(page, slug)
    await page.getByTestId('generate-api-key-button').click()

    const apiKey = await page.getByTestId('generated-api-key-input').inputValue()
    const response = await page.request.post(`/api/integrations/ondata/competitions/${slug}/registration-snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildRegistrationSnapshotPayload(onDataSlug),
    })

    expect(response.status()).toBe(202)

    await page.getByTestId('refresh-integration-status').click()

    await expect(page.getByTestId('integration-endpoint-input')).toHaveValue(new RegExp(`/api/integrations/ondata/competitions/${slug}$`))
    await expect(page.getByTestId('registration-summary-classes')).toContainText('2')
    await expect(page.getByTestId('registration-summary-players')).toContainText('3')
    await expect(page.getByTestId('registration-summary-registrations')).toContainText('4')
    await expect(page.getByTestId('registration-source-path')).toContainText('ViewClassPDF.php')
    await expect(page.getByTestId('registration-last-error')).toHaveCount(0)
  })

  test('failed registration ingest keeps the last successful registration snapshot as current', async ({ page }) => {
    const supabase = testClient()
    const slug = `${TEST_PREFIX}registration-failed-retry`
    const onDataSlug = '001354'
    const { competitionId } = await seedSuperadminCompetition(supabase, slug)

    await loginAsSuperadmin(page)
    await openIntegrationPage(page, slug)
    await page.getByTestId('generate-api-key-button').click()

    const apiKey = await page.getByTestId('generated-api-key-input').inputValue()

    const successResponse = await page.request.post(`/api/integrations/ondata/competitions/${slug}/registration-snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildRegistrationSnapshotPayload(onDataSlug),
    })

    expect(successResponse.status()).toBe(202)

    const { data: successStatus } = await supabase
      .from('ondata_registration_status')
      .select('current_snapshot_id')
      .eq('competition_id', competitionId)
      .single()

    const successfulSnapshotId = successStatus?.current_snapshot_id
    expect(successfulSnapshotId).toBeTruthy()

    const failedResponse = await page.request.post(`/api/integrations/ondata/competitions/${slug}/registration-snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildInvalidRegistrationSnapshotPayload(onDataSlug),
    })

    expect(failedResponse.status()).toBe(500)

    const { data: failedStatus } = await supabase
      .from('ondata_registration_status')
      .select('current_snapshot_id, last_error, last_summary_classes, last_summary_players, last_summary_registrations')
      .eq('competition_id', competitionId)
      .single()

    expect(failedStatus?.current_snapshot_id).toBe(successfulSnapshotId)
    expect(failedStatus?.last_error).toBeTruthy()
    expect(failedStatus?.last_summary_classes).toBe(2)
    expect(failedStatus?.last_summary_players).toBe(3)
    expect(failedStatus?.last_summary_registrations).toBe(4)

    await page.getByTestId('refresh-integration-status').click()

    await expect(page.getByTestId('registration-summary-classes')).toContainText('2')
    await expect(page.getByTestId('registration-summary-players')).toContainText('3')
    await expect(page.getByTestId('registration-summary-registrations')).toContainText('4')
    await expect(page.getByTestId('registration-source-path')).not.toContainText('attempt=broken')
    await expect(page.getByTestId('registration-last-error')).toBeVisible()
  })

  test('superadmin can preview and apply the latest OnData registration snapshot', async ({ page }) => {
    const supabase = testClient()
    const slug = `${TEST_PREFIX}registration-apply`
    const onDataSlug = '001352'
    const { competitionId } = await seedSuperadminCompetition(supabase, slug)

    await loginAsSuperadmin(page)
    await openIntegrationPage(page, slug)
    await page.getByTestId('generate-api-key-button').click()

    const apiKey = await page.getByTestId('generated-api-key-input').inputValue()
    const ingestResponse = await page.request.post(`/api/integrations/ondata/competitions/${slug}/registration-snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildRegistrationSnapshotPayload(onDataSlug),
    })

    expect(ingestResponse.status()).toBe(202)

    await page.getByTestId('refresh-integration-status').click()
    await page.getByTestId('preview-ondata-registration-import-button').click()

    await expect(page.getByTestId('ondata-summary-classes-parsed')).toContainText('2')
    await expect(page.getByTestId('ondata-summary-players-parsed')).toContainText('3')
    await expect(page.getByTestId('ondata-summary-registrations-parsed')).toContainText('4')
    await expect(page.getByTestId('ondata-class-session-select-0')).toHaveValue('1')
    await expect(page.getByTestId('ondata-class-session-select-1')).toHaveValue('2')

    await page.getByTestId('apply-ondata-registration-import-button').click()

    await expect(page.getByTestId('ondata-registration-apply-success')).toBeVisible()
    await expect(page.getByTestId('ondata-apply-registrations-added')).toContainText('4')
    await expect(page.getByTestId('ondata-apply-players-created')).toContainText('3')
    await expect(page.getByTestId('ondata-apply-sessions-created')).toContainText('2')
    await expect(page.getByTestId('ondata-apply-classes-created')).toContainText('2')

    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, name')
      .eq('competition_id', competitionId)
      .order('session_order')

    expect(sessions?.map(session => session.name)).toEqual(['Pass 1', 'Pass 2'])

    const sessionIds = (sessions ?? []).map(session => session.id)
    const { data: classes } = await supabase
      .from('classes')
      .select('id')
      .in('session_id', sessionIds)

    const classIds = (classes ?? []).map(classRow => classRow.id)

    const { count: playersCount } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('competition_id', competitionId)
    const { count: registrationsCount } = await supabase
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .in('class_id', classIds)
    const { data: status } = await supabase
      .from('ondata_registration_status')
      .select('current_snapshot_id, last_applied_snapshot_id, last_applied_at')
      .eq('competition_id', competitionId)
      .single()

    expect(playersCount).toBe(3)
    expect(registrationsCount).toBe(4)
    expect(status?.current_snapshot_id).toBeTruthy()
    expect(status?.last_applied_snapshot_id).toBe(status?.current_snapshot_id)
    expect(status?.last_applied_at).toBeTruthy()

    await expect(page.getByTestId('registration-latest-applied')).not.toContainText('Ingen data än')
  })

  test('registration preview shows an inline error when the request fails', async ({ page }) => {
    const slug = `${TEST_PREFIX}registration-preview-error`
    const onDataSlug = '001353'
    await seedSuperadminCompetition(testClient(), slug)

    await loginAsSuperadmin(page)
    await openIntegrationPage(page, slug)
    await page.getByTestId('generate-api-key-button').click()

    const apiKey = await page.getByTestId('generated-api-key-input').inputValue()
    const ingestResponse = await page.request.post(`/api/integrations/ondata/competitions/${slug}/registration-snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildRegistrationSnapshotPayload(onDataSlug),
    })

    expect(ingestResponse.status()).toBe(202)

    await page.route('**/api/super/competitions/*/integration/registration-import/preview', route =>
      route.abort('failed'),
    )

    await page.getByTestId('refresh-integration-status').click()
    await page.getByTestId('preview-ondata-registration-import-button').click()

    await expect(page.getByTestId('ondata-registration-import-error')).toContainText('Kunde inte nå servern. Försök igen.')
    await expect(page.getByTestId('preview-ondata-registration-import-button')).toBeVisible()
  })
})