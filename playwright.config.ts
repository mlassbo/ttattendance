import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'html',
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:3000',
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
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/super',
    reuseExistingServer: true,
    timeout: 120000,
  },
})
