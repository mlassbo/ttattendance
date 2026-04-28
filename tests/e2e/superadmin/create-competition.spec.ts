import { test, expect, type Page } from '@playwright/test'
import { config } from 'dotenv'
import { signCookie } from '@/lib/cookie-signing'
import { testClient, cleanTestCompetitions } from '../../helpers/db'

config({ path: '.env.test.local' })

const TEST_PREFIX = 'test-sm-mgmt-'

async function authenticateSuperadmin(page: Page) {
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
  await cleanTestCompetitions(testClient(), `${TEST_PREFIX}%`)
})

test('super admin PIN page renders the shared login shell', async ({ page }) => {
  await page.goto('/super')

  await expect(page.getByTestId('pin-login-page')).toBeVisible()
  await expect(page.getByTestId('pin-login-card')).toBeVisible()
  await expect(page.getByTestId('pin-login-form')).toBeVisible()
  await expect(page.getByTestId('pin-login-eyebrow')).toContainText('System')
  await expect(page.getByTestId('pin-login-title')).toContainText('Superadmin')
  await expect(page.getByTestId('pin-input')).toHaveAttribute('placeholder', 'PIN-kod')
})

test('unauthenticated user is redirected away from the competitions page', async ({ page }) => {
  await page.goto('/super/competitions')

  await page.waitForURL('/super')
  await expect(page.getByTestId('login-button')).toBeVisible()
})

test('super admin can create a competition and see it in the list', async ({ page }) => {
  await authenticateSuperadmin(page)
  await page.goto('/super/competitions')

  // Open the create form
  await page.getByTestId('new-competition-button').click()

  // Fill in the form
  await page.getByTestId('field-name').fill('Test SM 2025')
  await page.getByTestId('field-slug').fill(`${TEST_PREFIX}2025`)
  await page.getByTestId('field-admin-pin').fill('5678')

  // Submit
  await page.getByTestId('submit-competition').click()

  // Form should close and the new competition should appear in the list
  await expect(page.getByTestId('competition-list')).toContainText('Test SM 2025')
  await expect(page.getByTestId('competition-list')).toContainText(`${TEST_PREFIX}2025`)
  await expect(page.getByTestId(`import-status-${TEST_PREFIX}2025`)).toContainText('0 importerade anmälningar')
  await expect(page.getByTestId(`admin-pin-${TEST_PREFIX}2025`)).toContainText('5678')
  await expect(page.getByTestId(`settings-action-${TEST_PREFIX}2025`)).toContainText('Inställningar')
  await expect(page.getByTestId(`import-action-${TEST_PREFIX}2025`)).toHaveCount(0)
})

test('newly created competitions appear on the root landing page after cache invalidation', async ({ page }) => {
  const slug = `${TEST_PREFIX}root-2026`

  await page.goto('/')
  await expect(page.getByTestId(`competition-entry-card-${slug}`)).toHaveCount(0)

  await authenticateSuperadmin(page)
  await page.goto('/super/competitions')

  await page.getByTestId('new-competition-button').click()
  await page.getByTestId('field-name').fill('Test Root 2026')
  await page.getByTestId('field-slug').fill(slug)
  await page.getByTestId('field-admin-pin').fill('5678')
  await page.getByTestId('submit-competition').click()

  await expect(page.getByTestId('competition-list')).toContainText('Test Root 2026')
  await expect(page.getByTestId('competition-list')).toContainText(slug)

  await page.goto('/')

  await expect(page.getByTestId(`competition-entry-card-${slug}`)).toBeVisible()
  await expect(page.getByTestId(`competition-open-link-${slug}`)).toContainText(
    'Till tävlingen →'
  )
  await expect(page.getByTestId(`admin-login-link-${slug}`)).toHaveCount(0)
})

test('super admin can hide a competition from the root landing page without removing direct access', async ({ page }) => {
  const slug = `${TEST_PREFIX}internal-2026`

  await authenticateSuperadmin(page)
  await page.goto('/super/competitions')

  await page.getByTestId('new-competition-button').click()
  await page.getByTestId('field-name').fill('Intern klubbtävling 2026')
  await page.getByTestId('field-slug').fill(slug)
  await page.getByTestId('field-admin-pin').fill('5678')
  await page.getByTestId('submit-competition').click()

  await expect(page.getByTestId(`competition-entry-card-${slug}`)).toHaveCount(0)
  await expect(page.getByTestId(`landing-visibility-${slug}`)).toContainText('Visas på startsidan')

  await page.getByTestId(`toggle-landing-visibility-${slug}`).click()

  await expect(page.getByTestId(`landing-visibility-${slug}`)).toContainText('Dold från startsidan')

  await page.goto('/')
  await expect(page.getByTestId(`competition-entry-card-${slug}`)).toHaveCount(0)

  await page.goto(`/${slug}`)
  await expect(page.getByTestId('public-start-page')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Intern klubbtävling 2026' })).toBeVisible()
})

test('super admin can permanently delete a competition', async ({ page }) => {
  const supabase = testClient()
  const slug = `${TEST_PREFIX}delete-me`

  await supabase
    .from('competitions')
    .insert({
      name: 'Ta bort mig',
      slug,
      player_pin_hash: 'placeholder',
      admin_pin_hash: 'placeholder',
    })

  await authenticateSuperadmin(page)
  await page.goto('/super/competitions')

  await page.getByTestId(`delete-action-${slug}`).click()
  await expect(page.getByTestId('delete-dialog')).toBeVisible()
  await page.getByTestId('delete-dialog-confirm').click()

  await expect(page.getByTestId('competition-list')).not.toContainText('Ta bort mig')

  const { data: deletedCompetition } = await supabase
    .from('competitions')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  expect(deletedCompetition).toBeNull()
})

test('super admin can cancel delete dialog without deleting the competition', async ({ page }) => {
  const supabase = testClient()
  const slug = `${TEST_PREFIX}cancel-delete`

  await supabase
    .from('competitions')
    .insert({
      name: 'Behåll mig',
      slug,
      player_pin_hash: 'placeholder',
      admin_pin_hash: 'placeholder',
    })

  await authenticateSuperadmin(page)
  await page.goto('/super/competitions')

  await page.getByTestId(`delete-action-${slug}`).click()
  await expect(page.getByTestId('delete-dialog')).toBeVisible()
  await page.getByTestId('delete-dialog-cancel').click()
  await expect(page.getByTestId('delete-dialog')).toHaveCount(0)
  await expect(page.getByTestId('competition-list')).toContainText('Behåll mig')

  const { data: remainingCompetition } = await supabase
    .from('competitions')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  expect(remainingCompetition).not.toBeNull()
})
