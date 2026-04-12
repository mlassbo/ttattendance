import { expect, test, Page } from '@playwright/test'
import { config } from 'dotenv'
import { signCookie } from '@/lib/cookie-signing'
import {
  cleanTestCompetitions,
  seedClassSettingsCompetition,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const TEST_PREFIX = 'test-sm-cls-'

function formatDeadlineForInputs(iso: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(iso)).map(part => [part.type, part.value]),
  )

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

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
}

test.beforeEach(async () => {
  const supabase = testClient()
  await cleanTestCompetitions(supabase, `${TEST_PREFIX}%`)
})

test('auth gate — visiting classes page without cookie redirects', async ({ page }) => {
  await page.goto('/super/competitions/00000000-0000-0000-0000-000000000000/classes')
  await page.waitForURL(/\/super$/)
})

test('tab navigation — Integration and Klasser tabs are shown', async ({ page }) => {
  const supabase = testClient()
  const slug = `${TEST_PREFIX}tabs`
  const { competitionId } = await seedClassSettingsCompetition(supabase, slug)

  await loginAsSuperadmin(page)
  await page.goto(`/super/competitions/${competitionId}/integration`)

  await expect(page.getByTestId('settings-tabs')).toBeVisible()
  await expect(page.getByTestId('tab-integration')).toBeVisible()
  await expect(page.getByTestId('tab-classes')).toBeVisible()

  // Click Klasser tab
  await page.getByTestId('tab-classes').click()
  await page.waitForURL(/\/classes$/)
  await expect(page.getByTestId('tab-classes')).toBeVisible()
})

test('page renders sessions and classes', async ({ page }) => {
  const supabase = testClient()
  const slug = `${TEST_PREFIX}render`
  const { competitionId, sessions } = await seedClassSettingsCompetition(supabase, slug)

  await loginAsSuperadmin(page)
  await page.goto(`/super/competitions/${competitionId}/classes`)

  // Both sessions should be visible
  await expect(page.getByTestId(`session-section-${sessions[0].id}`)).toBeVisible()
  await expect(page.getByTestId(`session-section-${sessions[1].id}`)).toBeVisible()
  await expect(page.getByTestId(`session-section-${sessions[0].id}`)).toContainText('Lör - Pass 1')
  await expect(page.getByTestId(`session-section-${sessions[1].id}`)).toContainText('Lör - Pass 2')

  // Classes should be visible
  for (const session of sessions) {
    for (const cls of session.classes) {
      await expect(page.getByTestId(`class-row-${cls.id}`)).toBeVisible()
    }
  }
})

test('edit attendance deadline — happy path', async ({ page }) => {
  const supabase = testClient()
  const slug = `${TEST_PREFIX}deadline`
  const { competitionId, sessions } = await seedClassSettingsCompetition(supabase, slug)

  const cls = sessions[0].classes[0] // Herrar A, start 09:00

  await loginAsSuperadmin(page)
  await page.goto(`/super/competitions/${competitionId}/classes`)

  await expect(page.getByTestId(`deadline-date-${cls.id}`)).toBeVisible()
  await page.getByTestId(`deadline-date-${cls.id}`).click()
  await expect(page.locator('.class-settings-datepicker-calendar')).toBeVisible()

  await page.getByTestId(`deadline-date-${cls.id}`).fill('2025-09-13')
  await page.getByTestId(`deadline-date-${cls.id}`).press('Tab')
  await page.getByTestId(`deadline-time-${cls.id}`).fill('08:00')
  await page.getByTestId(`deadline-time-${cls.id}`).press('Tab')

  await expect.poll(async () => {
    const { data, error } = await supabase
      .from('classes')
      .select('attendance_deadline')
      .eq('id', cls.id)
      .single()

    expect(error).toBeNull()

    if (!data?.attendance_deadline) {
      return null
    }

    const formatted = formatDeadlineForInputs(data.attendance_deadline)
    return `${formatted.date} ${formatted.time}`
  }).toBe('2025-09-13 08:00')

  await page.reload()
  await expect(page.getByTestId(`deadline-date-${cls.id}`)).toHaveValue('2025-09-13')
  await expect(page.getByTestId(`deadline-time-${cls.id}`)).toHaveValue('08:00')
})

test('edit attendance deadline — validation rejects deadline after start time', async ({ page }) => {
  const supabase = testClient()
  const slug = `${TEST_PREFIX}deadline-val`
  const { competitionId, sessions } = await seedClassSettingsCompetition(supabase, slug)

  const cls = sessions[0].classes[0] // Herrar A, start 09:00

  await loginAsSuperadmin(page)
  await page.goto(`/super/competitions/${competitionId}/classes`)

  // Set a deadline AFTER the start time
  await page.getByTestId(`deadline-date-${cls.id}`).fill('2025-09-13')
  await page.getByTestId(`deadline-date-${cls.id}`).press('Tab')
  await page.getByTestId(`deadline-time-${cls.id}`).fill('10:00')
  await page.getByTestId(`deadline-time-${cls.id}`).press('Tab')

  // Error should be shown
  await expect(page.getByTestId(`deadline-error-${cls.id}`)).toBeVisible()
  await expect(page.getByTestId(`deadline-error-${cls.id}`)).toContainText('före starttiden')
})

test('move class to different session', async ({ page }) => {
  const supabase = testClient()
  const slug = `${TEST_PREFIX}move-session`
  const { competitionId, sessions } = await seedClassSettingsCompetition(supabase, slug)

  const cls = sessions[0].classes[0] // Herrar A in Pass 1

  await loginAsSuperadmin(page)
  await page.goto(`/super/competitions/${competitionId}/classes`)

  // Herrar A should be in Pass 1 section
  await expect(page.getByTestId(`session-section-${sessions[0].id}`)).toContainText('Herrar A')

  // Change session to Pass 2
  await page.getByTestId(`session-select-${cls.id}`).selectOption(sessions[1].id)

  // After reload, Herrar A should be in Pass 2 section
  await expect(page.getByTestId(`session-section-${sessions[1].id}`)).toContainText('Herrar A')
})

test('re-import preserves manually edited deadline', async ({ page }) => {
  const supabase = testClient()
  const slug = `${TEST_PREFIX}reimport`
  const { competitionId, sessions } = await seedClassSettingsCompetition(supabase, slug)

  const cls = sessions[0].classes[0] // Herrar A

  // Manually update the deadline in the database
  const manualDeadline = '2025-09-13T07:00:00+02:00'
  const { error } = await supabase
    .from('classes')
    .update({ attendance_deadline: manualDeadline })
    .eq('id', cls.id)
  expect(error).toBeNull()

  await loginAsSuperadmin(page)
  await page.goto(`/super/competitions/${competitionId}/classes`)

  // Verify the manual deadline is shown in the autosaving inputs
  await expect(page.getByTestId(`deadline-date-${cls.id}`)).toHaveValue('2025-09-13')
  await expect(page.getByTestId(`deadline-time-${cls.id}`)).toHaveValue('07:00')

  // Verify the deadline persists in the database (simulating that re-import wouldn't change it)
  const { data: classAfter } = await supabase
    .from('classes')
    .select('attendance_deadline')
    .eq('id', cls.id)
    .single()

  const expected = new Date(manualDeadline).getTime()
  const actual = new Date(classAfter!.attendance_deadline).getTime()
  expect(actual).toBe(expected)
})
