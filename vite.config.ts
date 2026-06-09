import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  server: { port: 5197 },
  // Tests run offline-first regardless of a local .env (VITE_LEADERBOARD_URL),
  // so the api offline-no-op contract holds and tests never touch the network.
  test: { env: { VITE_LEADERBOARD_URL: '' } },
});
