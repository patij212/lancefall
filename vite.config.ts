import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5197 },
  test: {
    // Tests run offline-first regardless of a local .env (VITE_LEADERBOARD_URL),
    // so the api offline-no-op contract holds and tests never touch the network.
    env: { VITE_LEADERBOARD_URL: '' },
    // e2e/*.spec.ts use @playwright/test's runner (it throws if Vitest collects it).
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
