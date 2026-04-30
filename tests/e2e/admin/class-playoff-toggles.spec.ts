import { expect, Page, test } from '@playwright/test'
import { config } from 'dotenv'
import {
  cleanTestCompetitions,
  seedAdminPlayoffCompetition,
  testClient,
} from '../../helpers/db'

config({ path: '.env.test.local' })

const ADMIN_PIN = '8181'

async function loginAsAdmin(page: Page, slug: string, pin: string) {
  await page.goto(`/${slug}/admin`)
  await page.getByTestId('admin-pin-input').fill(pin)
  await page.getByTestId('admin-login-button').click()
  await page.waitForURL(`/${slug}/admin/dashboard`)
}

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

test.describe('Class playoff toggles — admin workflow', () => {
  test.beforeEach(async () => {
    const supabase = testClient()
    await cleanTestCompetitions(supabase, 'test-admin-clpf-%')
  })

  test('both playoffs off — playoff steps hidden, prize_ceremony is next', async ({ page }) => {
    const slug = 'test-admin-clpf-both-off'
    const supabase = testClient()

    const seed = await seedAdminPlayoffCompetition(
      supabase,
      slug,
      [
        {
          name: 'Klass utan slutspel',
          startTime: minutesAgo(60),
          phase: 'pool_results_published',
          registeredPlayers: 4,
          hasAPlayoff: false,
          hasBPlayoff: false,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await loginAsAdmin(page, slug, ADMIN_PIN)

    await expect(page.getByTestId(`playoff-progress-strip-${classRow.id}`)).toHaveCount(0)

    await page.goto(`/${slug}/admin/classes/${classRow.id}`)

    await expect(page.getByTestId('workflow-step-prize_ceremony')).toBeVisible()
    await expect(page.getByTestId('workflow-step-a_playoff')).toHaveCount(0)
    await expect(page.getByTestId('workflow-step-b_playoff')).toHaveCount(0)
    await expect(page.getByTestId('workflow-step-register_playoff_match_results')).toHaveCount(0)

    await expect(page.getByTestId('workflow-step-focus-prize_ceremony')).toContainText('Nästa steg')
  })

  test('only A playoff — B step hidden, register skippable only when A skipped', async ({ page }) => {
    const slug = 'test-admin-clpf-only-a'
    const supabase = testClient()

    const seed = await seedAdminPlayoffCompetition(
      supabase,
      slug,
      [
        {
          name: 'Klass med A-slutspel',
          startTime: minutesAgo(60),
          phase: 'pool_results_published',
          registeredPlayers: 4,
          hasAPlayoff: true,
          hasBPlayoff: false,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await loginAsAdmin(page, slug, ADMIN_PIN)

    await page.goto(`/${slug}/admin/classes/${classRow.id}`)

    await expect(page.getByTestId('workflow-step-a_playoff')).toBeVisible()
    await expect(page.getByTestId('workflow-step-b_playoff')).toHaveCount(0)
    await expect(page.getByTestId('workflow-step-register_playoff_match_results')).toBeVisible()

    // a_playoff is the next ready step — register_playoff_match_results is blocked.
    await expect(page.getByTestId('workflow-skip-btn-register_playoff_match_results')).toHaveCount(0)

    // After skipping a_playoff, register_playoff_match_results should become skippable.
    await page.getByTestId('workflow-skip-btn-a_playoff').click()
    await expect(page.getByTestId('workflow-skip-btn-register_playoff_match_results')).toBeVisible()
  })

  test('only B playoff — A step hidden, register skippable only when B skipped', async ({ page }) => {
    const slug = 'test-admin-clpf-only-b'
    const supabase = testClient()

    const seed = await seedAdminPlayoffCompetition(
      supabase,
      slug,
      [
        {
          name: 'Klass med B-slutspel',
          startTime: minutesAgo(60),
          phase: 'pool_results_published',
          registeredPlayers: 4,
          hasAPlayoff: false,
          hasBPlayoff: true,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await loginAsAdmin(page, slug, ADMIN_PIN)

    await page.goto(`/${slug}/admin/classes/${classRow.id}`)

    await expect(page.getByTestId('workflow-step-b_playoff')).toBeVisible()
    await expect(page.getByTestId('workflow-step-a_playoff')).toHaveCount(0)
    await expect(page.getByTestId('workflow-step-register_playoff_match_results')).toBeVisible()

    await expect(page.getByTestId('workflow-skip-btn-register_playoff_match_results')).toHaveCount(0)

    await page.getByTestId('workflow-skip-btn-b_playoff').click()
    await expect(page.getByTestId('workflow-skip-btn-register_playoff_match_results')).toBeVisible()
  })

  test('both playoffs on (default) — all playoff steps visible', async ({ page }) => {
    const slug = 'test-admin-clpf-both-on'
    const supabase = testClient()

    const seed = await seedAdminPlayoffCompetition(
      supabase,
      slug,
      [
        {
          name: 'Klass standard',
          startTime: minutesAgo(60),
          phase: 'pool_results_published',
          registeredPlayers: 4,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await loginAsAdmin(page, slug, ADMIN_PIN)

    await page.goto(`/${slug}/admin/classes/${classRow.id}`)

    await expect(page.getByTestId('workflow-step-a_playoff')).toBeVisible()
    await expect(page.getByTestId('workflow-step-b_playoff')).toBeVisible()
    await expect(page.getByTestId('workflow-step-register_playoff_match_results')).toBeVisible()
  })

  test('adapted helper — publish_pool_results helper text changes when no playoffs', async ({ page }) => {
    const slug = 'test-admin-clpf-helper'
    const supabase = testClient()

    const seed = await seedAdminPlayoffCompetition(
      supabase,
      slug,
      [
        {
          name: 'Klass utan slutspel helper',
          startTime: minutesAgo(60),
          phase: 'pool_results_published',
          registeredPlayers: 4,
          hasAPlayoff: false,
          hasBPlayoff: false,
        },
      ],
      { adminPin: ADMIN_PIN },
    )

    const classRow = seed.classes[0]
    await loginAsAdmin(page, slug, ADMIN_PIN)

    await page.goto(`/${slug}/admin/classes/${classRow.id}`)

    const step = page.getByTestId('workflow-step-publish_pool_results')
    await expect(step).toBeVisible()
    await expect(step).toContainText('prisutdelning sker inom kort')
    await expect(step).not.toContainText('slutspelet lottas inom kort')
  })
})
