import { test, expect, Page } from '@playwright/test'
import { config } from 'dotenv'
import {
  testClient,
  cleanTestCompetitions,
  seedAdminTestCompetition,
  SeededAdminData,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const SLUG      = 'test-admin-2025'
const ADMIN_PIN = '7777'

async function loginAsAdmin(page: Page, slug: string, pin: string) {
  await page.goto(`/${slug}/admin`)
  await page.getByTestId('admin-pin-input').fill(pin)
  await page.getByTestId('admin-login-button').click()
  await page.waitForURL(`/${slug}/admin/dashboard`)
}

test.describe('Admin attendance flow', () => {
  let seed: SeededAdminData

  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, 'test-admin-%')
    seed = await seedAdminTestCompetition(supabase, SLUG, ADMIN_PIN)
  })

  // ── Authentication ────────────────────────────────────────────────────────

  test('admin PIN page renders the shared login shell', async ({ page }) => {
    await page.goto(`/${SLUG}/admin`)

    await expect(page.getByTestId('pin-login-page')).toBeVisible()
    await expect(page.getByTestId('pin-login-card')).toBeVisible()
    await expect(page.getByTestId('pin-login-form')).toBeVisible()
    await expect(page.getByTestId('pin-login-eyebrow')).toContainText('Sekretariat')
    await expect(page.getByTestId('pin-login-title')).toContainText('Test Admintävling')
  })

  test('wrong admin PIN shows error', async ({ page }) => {
    await page.goto(`/${SLUG}/admin`)
    await page.getByTestId('admin-pin-input').fill('0000')
    await page.getByTestId('admin-login-button').click()
    await expect(page.getByTestId('admin-pin-error')).toContainText('Fel PIN-kod')
  })

  test('correct admin PIN redirects to dashboard', async ({ page }) => {
    await page.goto(`/${SLUG}/admin`)
    await page.getByTestId('admin-pin-input').fill(ADMIN_PIN)
    await page.getByTestId('admin-login-button').click()
    await page.waitForURL(`/${SLUG}/admin/dashboard`)
    await expect(page.getByTestId('dashboard-competition-name')).toContainText('Test Admintävling')
    await expect(page.getByTestId('auto-refresh-status')).toContainText('Automatisk uppdatering aktiv')
  })

  test('already authenticated admin is redirected from PIN page to dashboard', async ({
    page,
  }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    // Navigate back to the PIN page — should skip it
    await page.goto(`/${SLUG}/admin`)
    await page.waitForURL(`/${SLUG}/admin/dashboard`)
    await expect(page.getByTestId('auto-refresh-status')).toBeVisible()
  })

  test('player cookie does not grant access to admin dashboard', async ({ page }) => {
    // Login as player
    await page.goto(`/${SLUG}`)
    await page.getByTestId('pin-input').fill('0000')
    await page.getByTestId('login-button').click()
    await page.waitForURL(`/${SLUG}/search`)

    // Visiting admin dashboard should redirect back to admin login
    await page.goto(`/${SLUG}/admin/dashboard`)
    await expect(page.getByTestId('admin-pin-input')).toBeVisible()
  })

  // ── Dashboard ─────────────────────────────────────────────────────────────

  test('dashboard shows session and classes', async ({ page }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await expect(page.locator('body')).toContainText('Lördag förmiddag')
    await expect(page.locator('body')).toContainText('Herrar A-klass')
    await expect(page.locator('body')).toContainText('Utgången klass')
  })

  test('dashboard shows correct attendance counts for future class', async ({ page }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)

    // futureClass: Anna=confirmed, Bertil=absent, Carin=no-response
    const confirmedEl  = page.getByTestId(`count-confirmed-${seed.futureClassId}`)
    const absentEl     = page.getByTestId(`count-absent-${seed.futureClassId}`)
    const noResponseEl = page.getByTestId(`count-no-response-${seed.futureClassId}`)

    await expect(confirmedEl).toContainText('1')
    await expect(absentEl).toContainText('1')
    await expect(noResponseEl).toContainText('1')
  })

  test('dashboard shows correct no-response count for past-deadline class', async ({
    page,
  }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)

    // pastClass: all 3 players have no attendance
    const noResponseEl = page.getByTestId(`count-no-response-${seed.pastClassId}`)
    await expect(noResponseEl).toContainText('3')
  })

  test('dashboard clearly highlights past-deadline classes with missing players', async ({
    page,
  }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)

    await expect(page.getByTestId('dashboard-overdue-summary')).toContainText(
      'Deadline passerad i 1 klass.'
    )
    await expect(page.getByTestId('dashboard-overdue-summary')).toContainText(
      '3 spelare saknas fortfarande och bör ropas upp i sekretariatet.'
    )
    await expect(page.getByTestId(`class-overdue-badge-${seed.pastClassId}`)).toContainText(
      'Deadline passerad · 3 saknas'
    )
  })

  // ── Class detail navigation ───────────────────────────────────────────────

  test('clicking Visa on a class navigates to class detail', async ({ page }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await page.getByTestId(`class-detail-link-${seed.futureClassId}`).click()
    await page.waitForURL(`/${SLUG}/admin/classes/${seed.futureClassId}`)
    await expect(page.locator('body')).toContainText('Herrar A-klass')
    await expect(page.getByTestId('class-competition-name')).toContainText('Test Admintävling')
    await expect(page.getByTestId('auto-refresh-status')).toContainText('Automatisk uppdatering aktiv')
  })

  test('dashboard clearly marks classes where everyone has answered', async ({ page }) => {
    const supabase = testClient()
    const now = new Date().toISOString()
    await supabase.from('attendance').insert(
      seed.players.map(p => ({
        registration_id: p.pastRegId,
        status: 'confirmed',
        reported_at: now,
        reported_by: 'admin',
        idempotency_key: `complete-${p.pastRegId}-confirmed`,
      }))
    )

    await loginAsAdmin(page, SLUG, ADMIN_PIN)

    await expect(page.getByTestId(`class-complete-badge-${seed.pastClassId}`)).toContainText(
      'Alla har svarat'
    )
  })

  test('back button on class detail returns to dashboard', async ({ page }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await page.goto(`/${SLUG}/admin/classes/${seed.futureClassId}`)
    await page.getByTestId('back-to-dashboard').click()
    await page.waitForURL(`/${SLUG}/admin/dashboard`)
    await expect(page.getByTestId('auto-refresh-status')).toBeVisible()
  })

  // ── Class detail view ─────────────────────────────────────────────────────

  test('class detail shows all players alphabetically', async ({ page }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await page.goto(`/${SLUG}/admin/classes/${seed.futureClassId}`)

    // Wait for the async data fetch to complete before reading text.
    await expect(page.locator('[data-testid^="player-row-"]')).toHaveCount(3)
    const names = await page.locator('[data-testid^="player-row-"] p.font-medium').allTextContents()
    expect(names).toEqual(['Anna Testsson', 'Bertil Testsson', 'Carin Testsson'])
  })

  test('class detail shows pre-seeded attendance status badges', async ({ page }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await page.goto(`/${SLUG}/admin/classes/${seed.futureClassId}`)

    const anna   = seed.players.find(p => p.name === 'Anna Testsson')!
    const bertil = seed.players.find(p => p.name === 'Bertil Testsson')!

    // Wait for the player rows to load before asserting badge content.
    await expect(page.getByTestId(`player-row-${anna.futureRegId}`)).toBeVisible()

    await expect(page.getByTestId(`status-badge-${anna.futureRegId}`)).toContainText('Bekräftad')
    await expect(page.getByTestId(`status-badge-${bertil.futureRegId}`)).toContainText('Frånvaro')
  })

  // ── Attendance override ───────────────────────────────────────────────────

  test('admin can confirm attendance for a player with no response', async ({ page }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await page.goto(`/${SLUG}/admin/classes/${seed.futureClassId}`)

    const carin = seed.players.find(p => p.name === 'Carin Testsson')!
    await page.getByTestId(`confirm-btn-${carin.futureRegId}`).click()

    // Status badge should update optimistically
    await expect(page.getByTestId(`status-badge-${carin.futureRegId}`)).toContainText('Bekräftad')
  })

  test('admin can override confirmed attendance to absent', async ({ page }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await page.goto(`/${SLUG}/admin/classes/${seed.futureClassId}`)

    const anna = seed.players.find(p => p.name === 'Anna Testsson')!
    // Anna is already confirmed — admin overrides to absent
    await page.getByTestId(`absent-btn-${anna.futureRegId}`).click()

    await expect(page.getByTestId(`status-badge-${anna.futureRegId}`)).toContainText('Frånvaro')
  })

  test('admin can set attendance on a past-deadline class (bypasses deadline)', async ({
    page,
  }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await page.goto(`/${SLUG}/admin/classes/${seed.pastClassId}`)

    const anna = seed.players.find(p => p.name === 'Anna Testsson')!
    await page.getByTestId(`confirm-btn-${anna.pastRegId}`).click()

    await expect(page.getByTestId(`status-badge-${anna.pastRegId}`)).toContainText('Bekräftad')
  })

  // ── Past-deadline warning ─────────────────────────────────────────────────

  test('past-deadline class with no-response players shows warning', async ({ page }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await page.goto(`/${SLUG}/admin/classes/${seed.pastClassId}`)

    const warning = page.getByTestId('past-deadline-warning')
    await expect(warning).toBeVisible()
    await expect(warning).toContainText('Dessa spelare bör ropas upp i sekretariatet')
    await expect(warning).toContainText('Anna Testsson')
    await expect(warning).toContainText('Bertil Testsson')
    await expect(warning).toContainText('Carin Testsson')
  })

  test('past-deadline warning disappears once all players have attendance', async ({
    page,
  }) => {
    // Set attendance for all 3 players via API before loading the page
    const supabase = testClient()
    const now = new Date().toISOString()
    await supabase.from('attendance').insert(
      seed.players.map(p => ({
        registration_id: p.pastRegId,
        status: 'confirmed',
        reported_at: now,
        reported_by: 'admin',
        idempotency_key: `setup-${p.pastRegId}-confirmed`,
      }))
    )

    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await page.goto(`/${SLUG}/admin/classes/${seed.pastClassId}`)

    await expect(page.getByTestId('past-deadline-warning')).not.toBeVisible()
    await expect(page.getByTestId('attendance-complete-banner')).toContainText(
      'Alla 3 spelare har svarat i klassen.'
    )
  })

  // ── CSV export ────────────────────────────────────────────────────────────

  test('CSV export endpoint returns a CSV file', async ({ page }) => {
    // Login first so the admin cookie is set.
    await loginAsAdmin(page, SLUG, ADMIN_PIN)

    // Request the export URL directly — window.open() in the UI opens a new
    // tab which is hard to intercept, so we test the API directly instead.
    const response = await page.request.get(
      `/api/admin/classes/${seed.futureClassId}/export`
    )

    expect(response.status()).toBe(200)
    const contentType = response.headers()['content-type'] ?? ''
    expect(contentType).toContain('text/csv')

    const body = await response.text()
    // Header row and one row per player
    expect(body).toContain('Namn,Klubb')
    expect(body).toContain('Anna Testsson')
    expect(body).toContain('Bekräftad')
  })
})
