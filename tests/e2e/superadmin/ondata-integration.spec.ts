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
  await page.getByTestId(`settings-action-${slug}`).click()
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

function buildRegistrationSnapshotPayloadWithRemovedPlayer(onDataSlug: string) {
  const payload = buildRegistrationSnapshotPayload(onDataSlug)

  payload.source = {
    ...payload.source,
    processedAt: '2026-04-08T12:10:10.000Z',
    fileHash: 'sha256:registrationhash-removed-player',
  }

  payload.classes[0].registrations = [
    { playerName: 'Bosse Berg', clubName: 'IFK Lund' },
  ]

  payload.summary = {
    classes: 2,
    players: 3,
    registrations: 3,
  }

  return payload
}

function buildPlayoffSnapshotPayload(onDataSlug: string) {
  return buildPlayoffSnapshotPayloadForBracket(onDataSlug, 'A')
}

function buildPlayoffSnapshotPayloadForBracket(onDataSlug: string, bracket: 'A' | 'B') {
  const sourceClassId = bracket === 'A' ? '31882' : '32168'
  const className = bracket === 'A' ? 'Max500' : 'Max500 B'

  return {
    schemaVersion: 2,
    competitionSlug: onDataSlug,
    source: {
      sourceType: 'ondata-stage5-playoff',
      competitionUrl: `https://resultat.ondata.se/${onDataSlug}/`,
      sourceClassId,
      stage5Path: `https://resultat.ondata.se/ViewClassPDF.php?classID=${sourceClassId}&stage=5`,
      stage6Path: `https://resultat.ondata.se/ViewClassPDF.php?classID=${sourceClassId}&stage=6`,
      processedAt: '2026-04-20T12:00:10.000Z',
      fileHash: `sha256:playoffhash-${bracket.toLowerCase()}`,
    },
    playoff: {
      bracket,
    },
    class: {
      sourceClassId,
      externalClassKey: `ondata::${sourceClassId}`,
      className,
    },
    parentClass: {
      sourceClassId: '31879',
      externalClassKey: 'max500::Lör 28::13:00',
      className: 'Max500',
      classDate: 'Lör 28',
      classTime: '13:00',
    },
    summary: {
      rounds: 2,
      matches: 3,
      completedMatches: 2,
    },
    rounds: [
      {
        name: 'Semifinaler',
        matches: [
          {
            matchKey: `${sourceClassId}::${bracket}::Semifinaler::1`,
            playerA: 'Alva Alfredsson',
            playerB: 'Bosse Berg',
            winner: 'Alva Alfredsson',
            result: '11,-8,9,7',
          },
          {
            matchKey: `${sourceClassId}::${bracket}::Semifinaler::2`,
            playerA: 'Cia Carlsson',
            playerB: 'Dana Dalen',
            winner: null,
            result: null,
          },
        ],
      },
      {
        name: 'Final',
        matches: [
          {
            matchKey: `${sourceClassId}::${bracket}::Final::1`,
            playerA: 'Alva Alfredsson',
            playerB: 'Dana Dalen',
            winner: 'Alva Alfredsson',
            result: '8,9,-7,6',
          },
        ],
      },
    ],
  }
}

function buildInvalidPlayoffSnapshotPayload(onDataSlug: string) {
  return buildInvalidPlayoffSnapshotPayloadForBracket(onDataSlug, 'A')
}

function buildInvalidPlayoffSnapshotPayloadForBracket(onDataSlug: string, bracket: 'A' | 'B') {
  const payload = buildPlayoffSnapshotPayloadForBracket(onDataSlug, bracket)
  payload.source = {
    ...payload.source,
    processedAt: '2026-04-20T12:05:10.000Z',
    fileHash: `sha256:playoffhash-${bracket.toLowerCase()}-broken`,
  }

  payload.rounds = [
    payload.rounds[0],
    {
      ...payload.rounds[1],
      matches: [
        payload.rounds[1].matches[0],
        {
          ...payload.rounds[1].matches[0],
          playerB: 'Erik Ek',
        },
      ],
    },
  ]

  payload.summary = {
    rounds: 2,
    matches: 4,
    completedMatches: 3,
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

  test('playoff snapshot ingest stores class-level playoff data', async ({ page }) => {
    const supabase = testClient()
    const ttAttendanceSlug = `${TEST_PREFIX}playoff-ingest`
    const onDataSlug = '001348'
    const { competitionId } = await seedSuperadminCompetition(supabase, ttAttendanceSlug)

    await loginAsSuperadmin(page)
    await openIntegrationPage(page, ttAttendanceSlug)
    await page.getByTestId('generate-api-key-button').click()

    const apiKey = await page.getByTestId('generated-api-key-input').inputValue()
    const response = await page.request.post(`/api/integrations/ondata/competitions/${ttAttendanceSlug}/playoff-snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildPlayoffSnapshotPayload(onDataSlug),
    })

    expect(response.status()).toBe(202)

    const { data: status } = await supabase
      .from('ondata_playoff_status')
      .select('last_summary_rounds, last_summary_matches, last_summary_completed_matches, current_snapshot_id')
      .eq('competition_id', competitionId)
      .eq('parent_external_class_key', 'max500::Lör 28::13:00')
      .eq('playoff_bracket', 'A')
      .single()

    expect(status?.last_summary_rounds).toBe(2)
    expect(status?.last_summary_matches).toBe(3)
    expect(status?.last_summary_completed_matches).toBe(2)
    expect(status?.current_snapshot_id).toBeTruthy()

    const { data: snapshot } = await supabase
      .from('ondata_playoff_snapshots')
      .select('class_name, source_stage5_path, playoff_bracket, parent_external_class_key')
      .eq('competition_id', competitionId)
      .single()

    expect(snapshot?.class_name).toBe('Max500')
    expect(snapshot?.source_stage5_path).toContain('stage=5')
    expect(snapshot?.playoff_bracket).toBe('A')
    expect(snapshot?.parent_external_class_key).toBe('max500::Lör 28::13:00')

    const { data: rounds } = await supabase
      .from('ondata_playoff_snapshot_rounds')
      .select('id, round_order')
      .eq('snapshot_id', status!.current_snapshot_id)

    const roundOrderById = new Map((rounds ?? []).map(round => [round.id, round.round_order]))

    const { data: rawMatches } = await supabase
      .from('ondata_playoff_snapshot_matches')
      .select('match_key, winner_name, is_completed, match_order, snapshot_round_id')
      .eq('snapshot_id', status!.current_snapshot_id)

    const matches = [...(rawMatches ?? [])].sort((a, b) => {
      const roundA = roundOrderById.get(a.snapshot_round_id) ?? 0
      const roundB = roundOrderById.get(b.snapshot_round_id) ?? 0
      return roundA - roundB || a.match_order - b.match_order
    })

    expect(matches).toHaveLength(3)
    expect(matches.filter(match => match.is_completed)).toHaveLength(2)
    expect(matches[0]?.match_key).toBe('31882::A::Semifinaler::1')
  })

  test('failed playoff ingest keeps the last successful class snapshot as current', async ({ page }) => {
    const supabase = testClient()
    const ttAttendanceSlug = `${TEST_PREFIX}playoff-failed-retry`
    const onDataSlug = '001350'
    const { competitionId } = await seedSuperadminCompetition(supabase, ttAttendanceSlug)

    await loginAsSuperadmin(page)
    await openIntegrationPage(page, ttAttendanceSlug)
    await page.getByTestId('generate-api-key-button').click()

    const apiKey = await page.getByTestId('generated-api-key-input').inputValue()

    const successResponse = await page.request.post(`/api/integrations/ondata/competitions/${ttAttendanceSlug}/playoff-snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildPlayoffSnapshotPayload(onDataSlug),
    })

    expect(successResponse.status()).toBe(202)

    const { data: successStatus } = await supabase
      .from('ondata_playoff_status')
      .select('current_snapshot_id')
      .eq('competition_id', competitionId)
      .eq('parent_external_class_key', 'max500::Lör 28::13:00')
      .eq('playoff_bracket', 'A')
      .single()

    const successfulSnapshotId = successStatus?.current_snapshot_id
    expect(successfulSnapshotId).toBeTruthy()

    const failedResponse = await page.request.post(`/api/integrations/ondata/competitions/${ttAttendanceSlug}/playoff-snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildInvalidPlayoffSnapshotPayload(onDataSlug),
    })

    expect(failedResponse.status()).toBe(500)

    const { data: failedStatus } = await supabase
      .from('ondata_playoff_status')
      .select('current_snapshot_id, last_error')
      .eq('competition_id', competitionId)
      .eq('parent_external_class_key', 'max500::Lör 28::13:00')
      .eq('playoff_bracket', 'A')
      .single()

    expect(failedStatus?.current_snapshot_id).toBe(successfulSnapshotId)
    expect(failedStatus?.last_error).toBeTruthy()
  })

  test('playoff snapshot ingest rejects payload without playoff bracket metadata', async ({ page }) => {
    const slug = `${TEST_PREFIX}playoff-missing-bracket`
    await seedSuperadminCompetition(testClient(), slug)

    await loginAsSuperadmin(page)
    await openIntegrationPage(page, slug)
    await page.getByTestId('generate-api-key-button').click()

    const apiKey = await page.getByTestId('generated-api-key-input').inputValue()
    const payload = buildPlayoffSnapshotPayload('001270') as Record<string, unknown>
    delete payload.playoff

    const response = await page.request.post(`/api/integrations/ondata/competitions/${slug}/playoff-snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: payload,
    })

    expect(response.status()).toBe(400)
  })

  test('playoff snapshot ingest rejects payload without parent class metadata', async ({ page }) => {
    const slug = `${TEST_PREFIX}playoff-missing-parent`
    await seedSuperadminCompetition(testClient(), slug)

    await loginAsSuperadmin(page)
    await openIntegrationPage(page, slug)
    await page.getByTestId('generate-api-key-button').click()

    const apiKey = await page.getByTestId('generated-api-key-input').inputValue()
    const payload = buildPlayoffSnapshotPayload('001270') as Record<string, unknown>
    delete payload.parentClass

    const response = await page.request.post(`/api/integrations/ondata/competitions/${slug}/playoff-snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: payload,
    })

    expect(response.status()).toBe(400)
  })

  test('A and B playoff snapshots are stored independently for the same parent class', async ({ page }) => {
    const supabase = testClient()
    const ttAttendanceSlug = `${TEST_PREFIX}playoff-brackets`
    const onDataSlug = '001356'
    const { competitionId } = await seedSuperadminCompetition(supabase, ttAttendanceSlug)

    await loginAsSuperadmin(page)
    await openIntegrationPage(page, ttAttendanceSlug)
    await page.getByTestId('generate-api-key-button').click()

    const apiKey = await page.getByTestId('generated-api-key-input').inputValue()

    const aResponse = await page.request.post(`/api/integrations/ondata/competitions/${ttAttendanceSlug}/playoff-snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildPlayoffSnapshotPayloadForBracket(onDataSlug, 'A'),
    })
    const bResponse = await page.request.post(`/api/integrations/ondata/competitions/${ttAttendanceSlug}/playoff-snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildPlayoffSnapshotPayloadForBracket(onDataSlug, 'B'),
    })

    expect(aResponse.status()).toBe(202)
    expect(bResponse.status()).toBe(202)

    const { data: statuses } = await supabase
      .from('ondata_playoff_status')
      .select('playoff_bracket, current_snapshot_id, parent_external_class_key')
      .eq('competition_id', competitionId)
      .order('playoff_bracket', { ascending: true })

    expect(statuses).toHaveLength(2)
    expect(statuses?.map(status => status.playoff_bracket)).toEqual(['A', 'B'])
    expect(statuses?.every(status => status.parent_external_class_key === 'max500::Lör 28::13:00')).toBe(true)

    const aStatus = statuses?.find(status => status.playoff_bracket === 'A')
    const bStatus = statuses?.find(status => status.playoff_bracket === 'B')

    expect(aStatus?.current_snapshot_id).toBeTruthy()
    expect(bStatus?.current_snapshot_id).toBeTruthy()

    const failedBResponse = await page.request.post(`/api/integrations/ondata/competitions/${ttAttendanceSlug}/playoff-snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildInvalidPlayoffSnapshotPayloadForBracket(onDataSlug, 'B'),
    })

    expect(failedBResponse.status()).toBe(500)

    const { data: afterFailureStatuses } = await supabase
      .from('ondata_playoff_status')
      .select('playoff_bracket, current_snapshot_id, last_error')
      .eq('competition_id', competitionId)

    const aStatusAfterFailure = afterFailureStatuses?.find(status => status.playoff_bracket === 'A')
    const bStatusAfterFailure = afterFailureStatuses?.find(status => status.playoff_bracket === 'B')

    expect(aStatusAfterFailure?.current_snapshot_id).toBe(aStatus?.current_snapshot_id)
    expect(aStatusAfterFailure?.last_error).toBeNull()
    expect(bStatusAfterFailure?.current_snapshot_id).toBe(bStatus?.current_snapshot_id)
    expect(bStatusAfterFailure?.last_error).toBeTruthy()
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

    expect(response.status()).toBe(200)

    await expect(response).toBeOK()

    await page.getByTestId('refresh-integration-status').click()

    await expect(page.getByTestId('integration-endpoint-input')).toHaveValue(new RegExp(`/api/integrations/ondata/competitions/${slug}$`))
    await expect(page.getByTestId('registration-summary-classes')).toContainText('2')
    await expect(page.getByTestId('registration-summary-players')).toContainText('3')
    await expect(page.getByTestId('registration-summary-registrations')).toContainText('4')
    await expect(page.getByTestId('registration-source-path')).toContainText('ViewClassPDF.php')
    await expect(page.getByTestId('registration-last-error')).toHaveCount(0)
    await expect(page.getByTestId('registration-decision-badge')).toContainText('Automatiskt applicerad')
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

    expect(successResponse.status()).toBe(200)

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

  test('safe registration snapshot is auto-applied and exposed through the status endpoint', async ({ page }) => {
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

    expect(ingestResponse.status()).toBe(200)

    const ingestBody = await ingestResponse.json()
    expect(ingestBody.decision?.state).toBe('auto_applied')

    const statusResponse = await page.request.get(`/api/integrations/ondata/competitions/${slug}/registration-import-status`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    expect(statusResponse.status()).toBe(200)
    const statusBody = await statusResponse.json()
    expect(statusBody.decision?.state).toBe('auto_applied')

    await page.getByTestId('refresh-integration-status').click()
    await expect(page.getByTestId('registration-decision-badge')).toContainText('Automatiskt applicerad')

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
      .select('current_snapshot_id, last_applied_snapshot_id, last_applied_at, decision_state, decision_reason_code')
      .eq('competition_id', competitionId)
      .single()

    expect(playersCount).toBe(3)
    expect(registrationsCount).toBe(4)
    expect(status?.current_snapshot_id).toBeTruthy()
    expect(status?.last_applied_snapshot_id).toBe(status?.current_snapshot_id)
    expect(status?.last_applied_at).toBeTruthy()
    expect(status?.decision_state).toBe('auto_applied')
    expect(status?.decision_reason_code).toBe('none')

    await expect(page.getByTestId('registration-latest-applied')).not.toContainText('Ingen data än')
  })

  test('confirmed removals stay pending manual review until superadmin applies them', async ({ page }) => {
    const supabase = testClient()
    const slug = `${TEST_PREFIX}registration-manual-review`
    const onDataSlug = '001355'
    const { competitionId } = await seedSuperadminCompetition(supabase, slug)

    await loginAsSuperadmin(page)
    await openIntegrationPage(page, slug)
    await page.getByTestId('generate-api-key-button').click()

    const apiKey = await page.getByTestId('generated-api-key-input').inputValue()

    const initialIngest = await page.request.post(`/api/integrations/ondata/competitions/${slug}/registration-snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildRegistrationSnapshotPayload(onDataSlug),
    })

    expect(initialIngest.status()).toBe(200)

    const { data: players } = await supabase
      .from('players')
      .select('id, name')
      .eq('competition_id', competitionId)
    const alva = players?.find(player => player.name === 'Alva Alfredsson')

    const { data: sessions } = await supabase
      .from('sessions')
      .select('id')
      .eq('competition_id', competitionId)
    const { data: classes } = await supabase
      .from('classes')
      .select('id, name')
      .in('session_id', (sessions ?? []).map(session => session.id))
    const max400 = classes?.find(classRow => classRow.name === 'Max400')
    const { data: registration } = await supabase
      .from('registrations')
      .select('id')
      .eq('player_id', alva?.id ?? '')
      .eq('class_id', max400?.id ?? '')
      .single()

    await supabase.from('attendance').insert({
      registration_id: registration!.id,
      status: 'confirmed',
      reported_at: new Date().toISOString(),
      reported_by: 'admin',
      idempotency_key: `ondata-confirmed-${registration!.id}`,
    })

    const pendingIngest = await page.request.post(`/api/integrations/ondata/competitions/${slug}/registration-snapshots`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      data: buildRegistrationSnapshotPayloadWithRemovedPlayer(onDataSlug),
    })

    expect(pendingIngest.status()).toBe(200)
    const pendingBody = await pendingIngest.json()
    expect(pendingBody.decision?.state).toBe('pending_manual_review')
    expect(pendingBody.decision?.reasonCode).toBe('confirmed_removals')

    const pendingStatusResponse = await page.request.get(`/api/integrations/ondata/competitions/${slug}/registration-import-status`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    expect(pendingStatusResponse.status()).toBe(200)
    const pendingStatusBody = await pendingStatusResponse.json()
    expect(pendingStatusBody.decision?.state).toBe('pending_manual_review')

    await page.getByTestId('refresh-integration-status').click()
    await expect(page.getByTestId('registration-decision-badge')).toContainText('Väntar på manuell granskning')
    await page.getByTestId('preview-ondata-registration-import-button').click()

    await expect(page.getByTestId('ondata-summary-registrations-to-remove-with-confirmed-attendance')).toContainText('1')
    await expect(page.getByTestId('ondata-summary-registrations-to-remove-with-absent-attendance')).toContainText('0')
    await expect(page.getByTestId('apply-ondata-registration-import-button')).toBeDisabled()

    await page.getByTestId('ondata-confirm-removal-with-attendance').check()
    await expect(page.getByTestId('apply-ondata-registration-import-button')).toBeEnabled()
    await page.getByTestId('apply-ondata-registration-import-button').click()

    await expect(page.getByTestId('ondata-registration-apply-success')).toBeVisible()
    await expect(page.getByTestId('registration-decision-badge')).toContainText('Manuellt applicerad')

    const appliedStatusResponse = await page.request.get(`/api/integrations/ondata/competitions/${slug}/registration-import-status`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    const appliedStatusBody = await appliedStatusResponse.json()
    expect(appliedStatusBody.decision?.state).toBe('manually_applied')
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

    expect(ingestResponse.status()).toBe(200)

    await page.route('**/api/super/competitions/*/integration/registration-import/preview', route =>
      route.abort('failed'),
    )

    await page.getByTestId('refresh-integration-status').click()
    await page.getByTestId('preview-ondata-registration-import-button').click()

    await expect(page.getByTestId('ondata-registration-import-error')).toContainText('Kunde inte nå servern. Försök igen.')
    await expect(page.getByTestId('preview-ondata-registration-import-button')).toBeVisible()
  })
})