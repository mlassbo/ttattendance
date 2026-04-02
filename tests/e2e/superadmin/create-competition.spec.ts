import { test, expect } from '@playwright/test'
import { config } from 'dotenv'
import { testClient, cleanTestCompetitions } from '../../helpers/db'

config({ path: '.env.test.local' })

test.beforeEach(async () => {
  await cleanTestCompetitions(testClient(), 'test-sm-%')
})

test('super admin PIN page renders the shared login shell', async ({ page }) => {
  await page.goto('/super')

  await expect(page.getByTestId('pin-login-page')).toBeVisible()
  await expect(page.getByTestId('pin-login-card')).toBeVisible()
  await expect(page.getByTestId('pin-login-form')).toBeVisible()
  await expect(page.getByTestId('pin-login-eyebrow')).toContainText('System')
  await expect(page.getByTestId('pin-login-title')).toContainText('Superadmin')
})

test('super admin can create a competition and see it in the list', async ({ page }) => {
  // Log in
  await page.goto('/super')
  await page.getByTestId('pin-input').fill('0000')
  await page.getByTestId('login-button').click()
  await page.waitForURL('/super/competitions')

  // Open the create form
  await page.getByTestId('new-competition-button').click()

  // Fill in the form
  await page.getByTestId('field-name').fill('Test SM 2025')
  await page.getByTestId('field-slug').fill('test-sm-2025')
  await page.getByTestId('field-start-date').fill('2025-06-14')
  await page.getByTestId('field-end-date').fill('2025-06-15')
  await page.getByTestId('field-player-pin').fill('1234')
  await page.getByTestId('field-admin-pin').fill('5678')

  // Submit
  await page.getByTestId('submit-competition').click()

  // Form should close and the new competition should appear in the list
  await expect(page.getByTestId('competition-list')).toContainText('Test SM 2025')
  await expect(page.getByTestId('competition-list')).toContainText('test-sm-2025')
  await expect(page.getByTestId('import-status-test-sm-2025')).toContainText('0 importerade anmälningar')
  await expect(page.getByTestId('player-pin-test-sm-2025')).toContainText('1234')
  await expect(page.getByTestId('admin-pin-test-sm-2025')).toContainText('5678')
  await expect(page.getByTestId('import-action-test-sm-2025')).toContainText('Importera startlista')
})
