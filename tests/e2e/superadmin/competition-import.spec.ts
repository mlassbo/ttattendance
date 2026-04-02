import { expect, test, Page } from '@playwright/test'
import { config } from 'dotenv'
import { signCookie } from '@/lib/cookie-signing'
import {
  cleanTestCompetitions,
  seedSuperadminCompetition,
  testClient,
} from '../../helpers/db'
import { buildCompetitionImportText } from '../../helpers/competition-import'

config({ path: '.env.test.local' })

const TEST_PREFIX = 'test-sm-import-'

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

async function openImportPage(page: Page, slug: string) {
  await page.getByTestId(`import-action-${slug}`).click()
  await page.waitForURL(/\/super\/competitions\/.+\/import$/)
}

async function previewImport(page: Page, sourceText: string) {
  await page.getByTestId('import-source').fill(sourceText)
  await page.getByTestId('preview-import-button').click()
}

async function selectClassSession(page: Page, index: number, sessionNumber: number) {
  await page.getByTestId(`class-session-select-${index}`).selectOption(String(sessionNumber))
}

test.describe('Competition import', () => {
  test.beforeEach(async () => {
    await cleanTestCompetitions(testClient(), `${TEST_PREFIX}%`)
  })

  test('unauthenticated user is redirected away from the import page', async ({ page }) => {
    const { competitionId } = await seedSuperadminCompetition(testClient(), `${TEST_PREFIX}auth`)

    await page.goto(`/super/competitions/${competitionId}/import`)

    await page.waitForURL('/super')
    await expect(page.getByTestId('login-button')).toBeVisible()
  })

  test('initial import creates sessions, classes, players, and registrations', async ({ page }) => {
    const supabase = testClient()
    const slug = `${TEST_PREFIX}initial`
    const { competitionId } = await seedSuperadminCompetition(supabase, slug)

    const sourceText = buildCompetitionImportText({
      competitionName: 'Test Cup 2025',
      classes: [
        {
          className: 'Max400',
          classDate: '2025-05-03',
          classTime: '09:00',
          registrations: [
            { playerName: 'Alfredsson Alva', clubName: 'BTK Dalen' },
            { playerName: 'Dahl August', clubName: 'Grästorps BTK' },
          ],
        },
        {
          className: 'PF11',
          classDate: '2025-05-03',
          classTime: '11:30',
          registrations: [
            { playerName: 'Alfredsson Alva', clubName: 'BTK Dalen' },
            { playerName: 'Ek Elin', clubName: 'Söderhamns UIF' },
          ],
        },
      ],
    })

    await loginAsSuperadmin(page)
    await expect(page.getByTestId(`import-status-${slug}`)).toContainText('0 importerade anmälningar')
    await openImportPage(page, slug)
    await previewImport(page, sourceText)

    await expect(page.getByTestId('summary-classes-parsed')).toContainText('2')
    await expect(page.getByTestId('summary-players-parsed')).toContainText('3')
    await expect(page.getByTestId('summary-registrations-parsed')).toContainText('4')
    await expect(page.getByTestId('summary-registrations-to-add')).toHaveCount(0)
    await expect(page.getByTestId('summary-registrations-to-remove')).toHaveCount(0)
    await expect(page.getByTestId('additions-list')).toHaveCount(0)
    await expect(page.getByTestId('removals-list')).toHaveCount(0)
    await expect(page.getByTestId('session-prompts')).toBeVisible()
    await expect(page.getByTestId('class-session-select-0')).toHaveValue('1')
    await expect(page.getByTestId('class-session-select-1')).toHaveValue('2')
    await expect(page.getByTestId('class-session-select-0').locator('option').nth(1)).toHaveText('Lör - Pass 1')
    await expect(page.getByTestId('class-session-select-1').locator('option').nth(2)).toHaveText('Lör - Pass 2')
    await expect(page.getByTestId('preview-import-button')).toContainText('Förhandsgranska')
    await expect(page.getByTestId('apply-import-button')).toContainText('Importera')

    await page.getByTestId('apply-import-button').click()

    await expect(page.getByTestId('apply-success')).toBeVisible()
    await expect(page.getByTestId('apply-registrations-added')).toContainText('4')
    await expect(page.getByTestId('apply-players-created')).toContainText('3')
    await expect(page.getByTestId('apply-sessions-created')).toContainText('2')
    await expect(page.getByTestId('apply-classes-created')).toContainText('2')
    await expect(page.getByTestId('apply-classes-updated')).toContainText('0')

    const { count: sessionsCount } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .eq('competition_id', competitionId)
    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, name')
      .eq('competition_id', competitionId)
      .order('session_order')
    const sessionIds = (sessions ?? []).map(session => session.id)
    const { count: classesCount } = await supabase
      .from('classes')
      .select('*', { count: 'exact', head: true })
      .in('session_id', sessionIds)
    const { count: playersCount } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('competition_id', competitionId)
    const { data: classes } = await supabase
      .from('classes')
      .select('id')
      .in('session_id', sessionIds)
    const classIds = (classes ?? []).map(classRow => classRow.id)
    const { count: registrationsCount } = await supabase
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .in('class_id', classIds)

    expect(sessionsCount).toBe(2)
    expect(sessions?.map(session => session.name)).toEqual(['Pass 1', 'Pass 2'])
    expect(classesCount).toBe(2)
    expect(playersCount).toBe(3)
    expect(registrationsCount).toBe(4)

    await page.getByTestId('back-to-competitions').click()
    await page.waitForURL('/super/competitions')
    await expect(page.getByTestId(`import-status-${slug}`)).toContainText('4 importerade anmälningar')
    await expect(page.getByTestId(`import-action-${slug}`)).toContainText('Importera startlista')
  })

  test('suggested pass can be overridden and is preserved on re-import preview', async ({ page }) => {
    const supabase = testClient()
    const slug = `${TEST_PREFIX}session-override`
    const { competitionId } = await seedSuperadminCompetition(supabase, slug)

    const sourceText = buildCompetitionImportText({
      classes: [
        {
          className: 'Sen kvällsklass',
          classDate: '2025-05-03',
          classTime: '15:30',
          registrations: [
            { playerName: 'Ada Andersson', clubName: 'BTK Dalen' },
          ],
        },
      ],
    })

    await loginAsSuperadmin(page)
    await openImportPage(page, slug)
    await previewImport(page, sourceText)

    await expect(page.getByTestId('class-session-select-0')).toHaveValue('3')

    await selectClassSession(page, 0, 2)
    await page.getByTestId('apply-import-button').click()

    await expect(page.getByTestId('apply-success')).toBeVisible()
    await expect(page.getByTestId('apply-sessions-created')).toContainText('1')

    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, name')
      .eq('competition_id', competitionId)
      .order('session_order')

    expect(sessions?.map(session => session.name)).toEqual(['Pass 2'])

    await previewImport(page, sourceText)

    await expect(page.getByTestId('class-session-select-0')).toHaveValue('2')
  })

  test('re-import adds new registrations and removes missing registrations', async ({ page }) => {
    const supabase = testClient()
    const slug = `${TEST_PREFIX}sync`
    const { competitionId } = await seedSuperadminCompetition(supabase, slug)

    const initialSource = buildCompetitionImportText({
      classes: [
        {
          className: 'Öppen',
          classDate: '2025-05-03',
          classTime: '10:00',
          registrations: [
            { playerName: 'Ari Andersson', clubName: 'BTK Dalen' },
            { playerName: 'Bo Bengtsson', clubName: 'Kalmar BTK' },
          ],
        },
      ],
    })

    const updatedSource = buildCompetitionImportText({
      classes: [
        {
          className: 'Öppen',
          classDate: '2025-05-03',
          classTime: '10:00',
          registrations: [
            { playerName: 'Ari Andersson', clubName: 'BTK Dalen' },
            { playerName: 'Cia Carlsson', clubName: 'Kalmar BTK' },
          ],
        },
      ],
    })

    await loginAsSuperadmin(page)
    await openImportPage(page, slug)
    await previewImport(page, initialSource)
    await page.getByTestId('apply-import-button').click()
    await expect(page.getByTestId('apply-success')).toBeVisible()

    await previewImport(page, updatedSource)

    await expect(page.getByTestId('summary-registrations-to-add')).toContainText('1')
    await expect(page.getByTestId('summary-registrations-to-remove')).toContainText('1')
    await expect(page.getByTestId('additions-list')).toContainText('Cia Carlsson')
    await expect(page.getByTestId('removals-list')).toContainText('Bo Bengtsson')

    await page.getByTestId('apply-import-button').click()
    await expect(page.getByTestId('apply-registrations-added')).toContainText('1')
    await expect(page.getByTestId('apply-registrations-removed')).toContainText('1')
    await expect(page.getByTestId('apply-players-created')).toContainText('1')
    await expect(page.getByTestId('apply-players-deleted')).toContainText('1')

    const { data: players } = await supabase
      .from('players')
      .select('name')
      .eq('competition_id', competitionId)
      .order('name')

    expect(players?.map(player => player.name)).toEqual(['Ari Andersson', 'Cia Carlsson'])
  })

  test('re-import preview shows removals that already have attendance', async ({ page }) => {
    const supabase = testClient()
    const slug = `${TEST_PREFIX}preview-warning`
    const { competitionId } = await seedSuperadminCompetition(supabase, slug)

    const initialSource = buildCompetitionImportText({
      classes: [
        {
          className: 'Max400',
          classDate: '2025-05-03',
          classTime: '09:00',
          registrations: [
            { playerName: 'Alva Alfredsson', clubName: 'BTK Dalen' },
            { playerName: 'Bosse Berg', clubName: 'IFK Lund' },
          ],
        },
      ],
    })

    const updatedSource = buildCompetitionImportText({
      classes: [
        {
          className: 'Max400',
          classDate: '2025-05-03',
          classTime: '09:00',
          registrations: [
            { playerName: 'Bosse Berg', clubName: 'IFK Lund' },
          ],
        },
      ],
    })

    await loginAsSuperadmin(page)
    await openImportPage(page, slug)
    await previewImport(page, initialSource)
    await page.getByTestId('apply-import-button').click()
    await expect(page.getByTestId('apply-success')).toBeVisible()

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
      idempotency_key: `warn-${registration!.id}`,
    })

    await previewImport(page, updatedSource)

    await expect(page.getByTestId('summary-registrations-to-remove-with-attendance')).toContainText('1')
    await expect(page.getByTestId('destructive-warning')).toContainText('1 av dessa har redan närvarostatus')
    await expect(page.getByTestId('removals-list')).toContainText('Alva Alfredsson')
    await expect(page.getByTestId('removals-list')).toContainText('Bekräftad')
  })

  test('apply is blocked until destructive removals are confirmed', async ({ page }) => {
    const supabase = testClient()
    const slug = `${TEST_PREFIX}apply-warning`
    const { competitionId } = await seedSuperadminCompetition(supabase, slug)

    const initialSource = buildCompetitionImportText({
      classes: [
        {
          className: 'Max400',
          classDate: '2025-05-03',
          classTime: '09:00',
          registrations: [
            { playerName: 'Alva Alfredsson', clubName: 'BTK Dalen' },
            { playerName: 'Bosse Berg', clubName: 'IFK Lund' },
          ],
        },
      ],
    })

    const updatedSource = buildCompetitionImportText({
      classes: [
        {
          className: 'Max400',
          classDate: '2025-05-03',
          classTime: '09:00',
          registrations: [
            { playerName: 'Bosse Berg', clubName: 'IFK Lund' },
          ],
        },
      ],
    })

    await loginAsSuperadmin(page)
    await openImportPage(page, slug)
    await previewImport(page, initialSource)
    await page.getByTestId('apply-import-button').click()
    await expect(page.getByTestId('apply-success')).toBeVisible()

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
      idempotency_key: `block-${registration!.id}`,
    })

    await previewImport(page, updatedSource)
    await expect(page.getByTestId('apply-import-button')).toBeDisabled()

    await page.getByTestId('confirm-removal-with-attendance').check()
    await expect(page.getByTestId('apply-import-button')).toBeEnabled()
    await page.getByTestId('apply-import-button').click()

    await expect(page.getByTestId('apply-registrations-removed')).toContainText('1')

    const { data: remainingPlayers } = await supabase
      .from('players')
      .select('name')
      .eq('competition_id', competitionId)
      .order('name')
    expect(remainingPlayers?.map(player => player.name)).toEqual(['Bosse Berg'])
  })

  test('page-break boilerplate inside a class block is ignored', async ({ page }) => {
    const slug = `${TEST_PREFIX}pagebreak`
    await seedSuperadminCompetition(testClient(), slug)

    const sourceText = buildCompetitionImportText({
      competitionName: 'Page Break Open 2025',
      classes: [
        {
          className: 'Dubbel <2000p',
          classDate: '2025-05-04',
          classTime: '13:00',
          registrations: [
            { playerName: 'Adam Andersson', clubName: 'BTK Dalen' },
            { playerName: 'Bea Berg', clubName: 'IFK Lund' },
            { playerName: 'Cleo Carlsson', clubName: 'Spårvägens BTK' },
          ],
          pageBreakAfterRegistrationIndexes: [0],
        },
      ],
    })

    await loginAsSuperadmin(page)
    await openImportPage(page, slug)
    await previewImport(page, sourceText)

    await expect(page.getByTestId('preview-errors')).not.toBeVisible()
    await expect(page.getByTestId('summary-registrations-parsed')).toContainText('3')
    await expect(page.getByTestId('class-session-select-0')).toHaveValue('2')
    await expect(page.getByTestId('class-session-select-0').locator('option').nth(1)).toHaveText('Sön - Pass 1')
  })

  test('import fails when the declared class count does not match parsed registrations', async ({ page }) => {
    const slug = `${TEST_PREFIX}count-mismatch`
    await seedSuperadminCompetition(testClient(), slug)

    const sourceText = buildCompetitionImportText({
      classes: [
        {
          className: 'PF11',
          classDate: '2025-05-03',
          classTime: '14:30',
          declaredCount: 3,
          registrations: [
            { playerName: 'Alma Andersson', clubName: 'BTK Dalen' },
            { playerName: 'Bosse Berg', clubName: 'IFK Lund' },
          ],
        },
      ],
    })

    await loginAsSuperadmin(page)
    await openImportPage(page, slug)
    await previewImport(page, sourceText)

    await expect(page.getByTestId('preview-errors')).toContainText('Klassen PF11 har deklarerat 3 anmälningar men 2 kunde läsas.')
    await expect(page.getByTestId('apply-import-button')).toBeDisabled()
  })
})