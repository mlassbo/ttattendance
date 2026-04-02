import { defineConfig, devices } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

const PLAYWRIGHT_PORT = '3001'

loadEnv({ path: '.env.test.local', override: true })

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: `http://127.0.0.1:${PLAYWRIGHT_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'superadmin',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/superadmin/**',
    },
    {
      name: 'player',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/player/**',
    },
    {
      name: 'admin',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/admin/**',
    },
  ],
  webServer: {
    command: 'node scripts/playwright-webserver.js',
    env: {
      ...process.env,
      E2E_TEST_ENV: 'true',
      PLAYWRIGHT_PORT,
      PORT: PLAYWRIGHT_PORT,
    },
    url: `http://127.0.0.1:${PLAYWRIGHT_PORT}/super`,
    reuseExistingServer: true,
    timeout: 120000,
  },
})
