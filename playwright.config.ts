import { defineConfig, devices } from '@playwright/test';

// E2E smoke tests — the ONLY automated coverage of the real Web-Audio path. The unit suite mocks
// every AudioContext/fetch, which is exactly how the "Illegal invocation" preload bug hid; these run
// the production bundle in a real headless Chromium so that class of browser-only defect fails CI.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Serial: these smoke tests share ONE `vite preview` server and each drives a full Web-Audio +
  // canvas run. Under parallel workers they contend on that single server and flake intermittently
  // (transient asset 404s, timing-sensitive run-clock/overlay assertions). One worker = one browser
  // at a time = no contention; the suite is small (~10 tests) so the serial cost is minor.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    // headless Chromium suspends audio by default; let the AudioContext run so the music scheduler
    // ticks (a trusted click also unlocks it), and mute output so CI machines stay silent.
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // builds the prod bundle + serves it; reused locally, fresh in CI.
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
