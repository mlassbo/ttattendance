import { expect, Page, test } from '@playwright/test'
import { config } from 'dotenv'
import {
  cleanTestCompetitions,
  seedAdminTestCompetition,
  SeededAdminData,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const SLUG = 'test-checklist-admin-2025'
const ADMIN_PIN = '6767'

async function loginAsAdmin(page: Page, slug: string, pin: string) {
  await page.goto(`/${slug}/admin`)
  await page.getByTestId('admin-pin-input').fill(pin)
  await page.getByTestId('admin-login-button').click()
  await page.waitForURL(`/${slug}/admin/dashboard`)
}

test.describe('Admin checklist flow', () => {
  let seed: SeededAdminData

  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, 'test-checklist-admin-%')
    seed = await seedAdminTestCompetition(supabase, SLUG, ADMIN_PIN)
  })

  test('workflow endpoints require admin auth', async ({ page }) => {
    const getResponse = await page.request.get(`/api/admin/classes/${seed.futureClassId}/workflow`)
    expect(getResponse.status()).toBe(401)

    const patchResponse = await page.request.patch(
      `/api/admin/classes/${seed.futureClassId}/workflow/steps/seed_class`,
      { data: { status: 'done' } },
    )
    expect(patchResponse.status()).toBe(401)

    const postResponse = await page.request.post(
      `/api/admin/classes/${seed.pastClassId}/workflow/events`,
      { data: { eventKey: 'missing_players_callout' } },
    )
    expect(postResponse.status()).toBe(401)
  })

  test('class detail shows attendance-driven checklist states and lets staff log callout', async ({ page }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)

    await page.goto(`/${SLUG}/admin/classes/${seed.futureClassId}`)
    await expect(page.getByTestId('workflow-current-phase')).toHaveCount(0)
    await expect(page.getByTestId('workflow-step-state-attendance')).toContainText('Pågår')
    await expect(page.getByTestId('workflow-step-remove_absent_players')).toContainText(
      'Ta bort frånvarande i tävlingssystemet',
    )
    await expect(page.getByTestId('workflow-step-state-remove_absent_players')).toContainText('Blockerad')
    await expect(page.getByTestId('workflow-absent-players')).toContainText('Bertil Testsson')
    await expect(page.getByTestId('workflow-step-state-seed_class')).toContainText('Blockerad')
    await expect(page.getByTestId('workflow-missing-players')).toContainText('Carin Testsson')
    await expect(page.getByTestId('attendance-list-jump-link')).toBeVisible()
    await expect(page.getByTestId('workflow-callout-button')).toHaveCount(0)

    await page.goto(`/${SLUG}/admin/classes/${seed.pastClassId}`)
    await expect(page.getByTestId('workflow-current-phase')).toContainText('Ropa upp saknade spelare')
    await expect(page.getByTestId('workflow-step-state-attendance')).toContainText('Pågår')
    await expect(page.getByTestId('workflow-step-remove_absent_players')).toHaveCount(0)
    await expect(page.getByTestId('workflow-missing-players')).toContainText('Anna Testsson')
    await expect(page.getByTestId('workflow-callout-button')).toBeVisible()

    await page.getByTestId('workflow-callout-button').click()
    await expect(page.getByTestId('workflow-last-callout')).toHaveText(/Senaste upprop [A-ZÅÄÖ][a-zåäö]{2} \d{2}:\d{2}/)
  })

  test('class detail still shows attendance list if checklist returns 404', async ({ page }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)

    await page.route(`**/api/admin/classes/${seed.futureClassId}/workflow`, route =>
      route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Klassen hittades inte' }),
      }),
    )

    await page.goto(`/${SLUG}/admin/classes/${seed.futureClassId}`)

    await expect(page.getByTestId('class-competition-name')).toContainText('Test Admintävling')
    await expect(page.getByTestId('attendance-list')).toBeVisible()
    await expect(page.getByTestId('workflow-error')).toContainText('Checklistan kunde inte hämtas')
    await expect(page.locator('body')).not.toContainText('Klassen hittades inte.')
  })

  test('secretariat can work a class through the full checklist flow', async ({ page }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await page.goto(`/${SLUG}/admin/classes/${seed.futureClassId}`)

    const carin = seed.players.find(player => player.name === 'Carin Testsson')
    if (!carin) {
      throw new Error('Carin Testsson not found in seeded data')
    }

    await page.getByTestId(`confirm-btn-${carin.futureRegId}`).click()
    await expect(page.getByTestId('workflow-step-state-attendance')).toContainText('Klar')
    await expect(page.getByTestId('workflow-step-state-remove_absent_players')).toContainText('Kan påbörjas')
    await expect(page.getByTestId('workflow-step-state-seed_class')).toContainText('Blockerad')

    await page.getByTestId('workflow-done-btn-remove_absent_players').click()
    await expect(page.getByTestId('workflow-step-state-remove_absent_players')).toContainText('Klar')
    await expect(page.getByTestId('workflow-step-state-seed_class')).toContainText('Kan påbörjas')

    await page.getByTestId('workflow-done-btn-seed_class').click()
    await expect(page.getByTestId('workflow-step-state-seed_class')).toContainText('Klar')
    await expect(page.getByTestId('workflow-step-state-publish_pools')).toContainText('Kan påbörjas')

    await page.getByTestId('workflow-done-btn-publish_pools').click()
    await expect(page.getByTestId('workflow-current-phase')).toContainText('Poolspel pågår')
    await expect(page.getByTestId('workflow-step-state-register_match_results')).toContainText('Kan påbörjas')
    await expect(page.getByTestId('workflow-step-register_match_results')).toContainText('Registrera matchresultat poolspel')

    await page.getByTestId('workflow-done-btn-register_match_results').click()
    await expect(page.getByTestId('workflow-current-phase')).toContainText('Poolspel klart')
    await expect(page.getByTestId('workflow-step-state-publish_pool_results')).toContainText('Kan påbörjas')

    await page.getByTestId('workflow-done-btn-publish_pool_results').click()
    await expect(page.getByTestId('workflow-step-state-a_playoff')).toContainText('Kan påbörjas')
    await expect(page.getByTestId('workflow-step-state-b_playoff')).toContainText('Kan påbörjas')

    await page.getByTestId('workflow-done-btn-a_playoff').click()
    await expect(page.getByTestId('workflow-current-phase')).toContainText('Slutspel pågår')
    await expect(page.getByTestId('workflow-step-state-a_playoff')).toContainText('Klar')
    await page.getByTestId('workflow-done-btn-b_playoff').click()
    await expect(page.getByTestId('workflow-step-state-b_playoff')).toContainText('Klar')

    await expect(page.getByTestId('workflow-step-register_playoff_match_results')).toContainText('Registrera matchresultat slutspel')
    await expect(page.getByTestId('workflow-step-state-register_playoff_match_results')).toContainText('Kan påbörjas')

    await page.getByTestId('workflow-done-btn-register_playoff_match_results').click()
    await expect(page.getByTestId('workflow-current-phase')).toContainText('Slutspel klart')
    await expect(page.getByTestId('workflow-step-state-register_playoff_match_results')).toContainText('Klar')

    await expect(page.getByTestId('workflow-step-state-prize_ceremony')).toContainText('Kan påbörjas')

    await page.getByTestId('workflow-done-btn-prize_ceremony').click()
    await expect(page.getByTestId('workflow-current-phase')).toContainText('Klassen är klar')
  })

  test('optional steps can be skipped and reset cascades to downstream steps', async ({ page }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)
    await page.goto(`/${SLUG}/admin/classes/${seed.futureClassId}`)

    const carin = seed.players.find(player => player.name === 'Carin Testsson')
    if (!carin) {
      throw new Error('Carin Testsson not found in seeded data')
    }

    await page.getByTestId(`confirm-btn-${carin.futureRegId}`).click()
    await page.getByTestId('workflow-done-btn-remove_absent_players').click()

    await page.getByTestId('workflow-skip-btn-seed_class').click()
    await expect(page.getByTestId('workflow-step-state-publish_pools')).toContainText('Kan påbörjas')

    await page.getByTestId('workflow-done-btn-publish_pools').click()
    await expect(page.getByTestId('workflow-step-state-register_match_results')).toContainText('Kan påbörjas')
    await page.getByTestId('workflow-done-btn-register_match_results').click()
    await page.getByTestId('workflow-done-btn-publish_pool_results').click()

    await page.getByTestId('workflow-skip-btn-a_playoff').click()
    await expect(page.getByTestId('workflow-step-state-a_playoff')).toContainText('Skippad')
    await page.getByTestId('workflow-skip-btn-b_playoff').click()
    await expect(page.getByTestId('workflow-step-state-b_playoff')).toContainText('Skippad')

    await expect(page.getByTestId('workflow-step-state-register_playoff_match_results')).toContainText('Kan påbörjas')
    await page.getByTestId('workflow-skip-btn-register_playoff_match_results').click()
    await expect(page.getByTestId('workflow-step-state-register_playoff_match_results')).toContainText('Skippad')
    await expect(page.getByTestId('workflow-step-state-prize_ceremony')).toContainText('Kan påbörjas')

    await page.getByTestId('workflow-reset-btn-publish_pools').click()
    await expect(page.getByTestId('workflow-step-state-publish_pools')).toContainText('Kan påbörjas')
    await expect(page.getByTestId('workflow-step-state-register_match_results')).toContainText('Blockerad')
    await expect(page.getByTestId('workflow-step-state-publish_pool_results')).toContainText('Blockerad')
    await expect(page.getByTestId('workflow-step-state-a_playoff')).toContainText('Blockerad')
    await expect(page.getByTestId('workflow-step-state-register_playoff_match_results')).toContainText('Blockerad')
    await expect(page.getByTestId('workflow-step-state-prize_ceremony')).toContainText('Blockerad')
  })

  test('dashboard shows workflow badges, next action, and concurrent playoff status', async ({ page }) => {
    const supabase = testClient()
    const now = new Date().toISOString()

    await supabase.from('attendance').upsert(
      seed.players.map(player => ({
        registration_id: player.futureRegId,
        status: 'confirmed',
        reported_at: now,
        reported_by: 'admin',
        idempotency_key: `checklist-${player.futureRegId}`,
      })),
      { onConflict: 'registration_id' },
    )

    await supabase.from('class_workflow_steps').upsert(
      [
        { class_id: seed.futureClassId, step_key: 'seed_class', status: 'skipped', updated_at: now },
        { class_id: seed.futureClassId, step_key: 'publish_pools', status: 'done', updated_at: now },
        { class_id: seed.futureClassId, step_key: 'register_match_results', status: 'done', updated_at: now },
        { class_id: seed.futureClassId, step_key: 'publish_pool_results', status: 'done', updated_at: now },
        { class_id: seed.futureClassId, step_key: 'a_playoff', status: 'active', updated_at: now },
        { class_id: seed.futureClassId, step_key: 'b_playoff', status: 'active', updated_at: now },
      ],
      { onConflict: 'class_id,step_key' },
    )

    await loginAsAdmin(page, SLUG, ADMIN_PIN)

    await expect(page.getByTestId(`dashboard-workflow-badge-${seed.futureClassId}`)).toContainText(
      'Slutspel pågår',
    )
    await expect(page.getByTestId(`dashboard-next-action-${seed.futureClassId}`)).toContainText(
      'Lotta och publicera A-slutspel',
    )
    await expect(page.getByTestId(`dashboard-workflow-badge-${seed.pastClassId}`)).toContainText(
      'Ropa upp saknade spelare',
    )
    await expect(page.getByTestId(`dashboard-callout-list-${seed.pastClassId}`)).toContainText(
      'Anna Testsson',
    )
    await expect(page.getByTestId(`dashboard-callout-btn-${seed.pastClassId}`)).toBeVisible()
  })

  test('dashboard lists absent players when they must be removed from the competition system', async ({ page }) => {
    const supabase = testClient()
    const now = new Date().toISOString()
    const carin = seed.players.find(player => player.name === 'Carin Testsson')

    if (!carin) {
      throw new Error('Carin Testsson not found in seeded data')
    }

    await supabase.from('attendance').upsert(
      {
        registration_id: carin.futureRegId,
        status: 'confirmed',
        reported_at: now,
        reported_by: 'admin',
        idempotency_key: `dashboard-absent-list-${carin.futureRegId}`,
      },
      { onConflict: 'registration_id' },
    )

    await loginAsAdmin(page, SLUG, ADMIN_PIN)

    await expect(page.getByTestId(`dashboard-absent-list-${seed.futureClassId}`)).toContainText(
      'Ta bort i tävlingssystemet:',
    )
    await expect(page.getByTestId(`dashboard-absent-list-${seed.futureClassId}`)).toContainText(
      'Bertil Testsson',
    )
    await expect(page.getByTestId(`dashboard-followup-action-${seed.futureClassId}`)).toContainText(
      'Seeda klass',
    )
  })

  test('dashboard shows latest callout time after marking callout done', async ({ page }) => {
    await loginAsAdmin(page, SLUG, ADMIN_PIN)

    await expect(page.getByTestId(`dashboard-callout-btn-${seed.pastClassId}`)).toBeVisible()

    await page.getByTestId(`dashboard-callout-btn-${seed.pastClassId}`).click()

    await expect(page.getByTestId(`dashboard-last-callout-${seed.pastClassId}`)).toHaveText(
      /Senaste upprop [A-ZÅÄÖ][a-zåäö]{2} \d{2}:\d{2}/,
    )
  })

  test('dashboard can mark the current workflow step as done', async ({ page }) => {
    const supabase = testClient()
    const now = new Date().toISOString()

    await supabase.from('attendance').upsert(
      seed.players.map(player => ({
        registration_id: player.futureRegId,
        status: 'confirmed',
        reported_at: now,
        reported_by: 'admin',
        idempotency_key: `dashboard-done-${player.futureRegId}`,
      })),
      { onConflict: 'registration_id' },
    )

    await loginAsAdmin(page, SLUG, ADMIN_PIN)

    await expect(page.getByTestId(`dashboard-next-action-${seed.futureClassId}`)).toContainText(
      'Seeda klass',
    )
    await expect(page.getByTestId(`dashboard-next-action-helper-${seed.futureClassId}`)).toContainText(
      'Gör seedning i tävlingssystemet om klassen ska seedas.',
    )
    await expect(page.getByTestId(`dashboard-followup-action-${seed.futureClassId}`)).toContainText(
      'Lotta och publicera pooler',
    )

    await page.getByTestId(`dashboard-done-btn-${seed.futureClassId}`).click()

    await expect(page.getByTestId(`dashboard-next-action-${seed.futureClassId}`)).toContainText(
      'Lotta och publicera pooler',
    )
  })

  test('dashboard can skip an optional workflow step', async ({ page }) => {
    const supabase = testClient()
    const now = new Date().toISOString()

    await supabase.from('attendance').upsert(
      seed.players.map(player => ({
        registration_id: player.futureRegId,
        status: 'confirmed',
        reported_at: now,
        reported_by: 'admin',
        idempotency_key: `dashboard-skip-${player.futureRegId}`,
      })),
      { onConflict: 'registration_id' },
    )

    await loginAsAdmin(page, SLUG, ADMIN_PIN)

    await expect(page.getByTestId(`dashboard-next-action-${seed.futureClassId}`)).toContainText(
      'Seeda klass',
    )
    await expect(page.getByTestId(`dashboard-skip-btn-${seed.futureClassId}`)).toBeVisible()

    await page.getByTestId(`dashboard-skip-btn-${seed.futureClassId}`).click()

    await expect(page.getByTestId(`dashboard-next-action-${seed.futureClassId}`)).toContainText(
      'Lotta och publicera pooler',
    )
  })

  test('admin sessions API rejects cookie scoped to another competition slug', async ({ page }) => {
    const otherSlug = 'test-checklist-admin-other-2025'
    const otherAdminPin = '7878'
    const supabase = testClient()

    await seedAdminTestCompetition(supabase, otherSlug, otherAdminPin)
    await loginAsAdmin(page, SLUG, ADMIN_PIN)

    const okResponse = await page.request.get('/api/admin/sessions', {
      headers: {
        'x-competition-slug': SLUG,
      },
    })
    expect(okResponse.status()).toBe(200)

    const wrongSlugResponse = await page.request.get('/api/admin/sessions', {
      headers: {
        'x-competition-slug': otherSlug,
      },
    })
    expect(wrongSlugResponse.status()).toBe(401)
  })

  test('admin sessions API heals stale cookie competition id when the same slug is recreated', async ({ page }) => {
    const staleSlug = 'test-checklist-admin-stale-2025'
    const staleAdminPin = '7979'
    const supabase = testClient()

    await cleanTestCompetitions(supabase, staleSlug)
    const original = await seedAdminTestCompetition(supabase, staleSlug, staleAdminPin)

    await loginAsAdmin(page, staleSlug, staleAdminPin)

    const deleteResponse = await supabase
      .from('competitions')
      .delete()
      .eq('id', original.competitionId)

    if (deleteResponse.error) {
      throw new Error(`Failed to delete stale competition: ${deleteResponse.error.message}`)
    }

    await seedAdminTestCompetition(supabase, staleSlug, staleAdminPin)

    const response = await page.request.get('/api/admin/sessions', {
      headers: {
        'x-competition-slug': staleSlug,
      },
    })

    expect(response.status()).toBe(200)

    const payload = await response.json()
    expect(payload.sessions.length).toBeGreaterThan(0)
  })
})