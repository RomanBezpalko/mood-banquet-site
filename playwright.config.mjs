import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.MOOD_QA_BASE_URL || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/site',
  testMatch: '**/*.spec.mjs',
  grepInvert: /@visual/, // Visual baselines are opt-in and created after human approval.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'qa-report/playwright-html', open: 'never' }],
    ['json', { outputFile: 'qa-report/playwright-results.json' }]
  ],
  outputDir: 'qa-report/test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {}
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } }
    },
    {
      name: 'tablet-chromium',
      use: { ...devices['iPad (gen 7)'], defaultBrowserType: 'chromium', viewport: { width: 820, height: 1180 } }
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium', viewport: { width: 390, height: 844 } }
    },
    {
      name: 'small-mobile-chromium',
      use: { ...devices['Pixel 5'], defaultBrowserType: 'chromium', viewport: { width: 360, height: 800 } }
    }
  ],
  webServer: {
    // Start Vite directly, not server.mjs. Browser QA must never poll Telegram
    // or send real messages to the personal chat / MOOD group.
    command: 'npm run qa:server',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe'
  }
});
