import { defineConfig, devices } from '@playwright/test'

import { WEB_URL } from './e2e/config'

/**
 * The suite drives the real stack: a compiled backend against an in-memory mongod
 * and a production build of the client, both booted by `e2e/global-setup.ts`.
 * `pnpm test:e2e` is the whole command.
 */
export default defineConfig({
  testDir: './e2e/tests',
  // Not *.spec.ts: that pattern is Vitest's, and the unit suite would collect these.
  testMatch: /.*\.e2e\.ts/,
  globalSetup: './e2e/global-setup.ts',
  // A flake here is a bug in the app or in the harness, and a retry only hides it.
  retries: 0,
  // One backend process, one mongod and one rate-limit bucket are shared by every
  // test, so serial keeps a failure attributable to the test that caused it.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  // 30s: worst-case honest convergence under contention is rebase churn plus the
  // 10s revision-probe healing cycle plus the 5s mirror interval — a loaded
  // 2-core CI runner needs the ceiling; fast machines never touch it.
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
