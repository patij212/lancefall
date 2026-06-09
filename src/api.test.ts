import { describe, it, expect } from 'vitest';
import { leaderboardEnabled, submitScore, fetchLeaderboard } from './api';

// With no VITE_LEADERBOARD_URL configured (the test/default state), the client
// must be a complete no-op that never throws and never touches the network.
describe('leaderboard api (offline-first)', () => {
  it('reports disabled when no backend is configured', () => {
    expect(leaderboardEnabled()).toBe(false);
  });

  it('submitScore resolves (no-op) without throwing when offline', async () => {
    await expect(
      submitScore({ mode: 'endless', name: 'ACE', score: 12345, wave: 7, combo: 22, heat: 3 }),
    ).resolves.toBeUndefined();
  });

  it('fetchLeaderboard returns [] when offline', async () => {
    expect(await fetchLeaderboard('endless')).toEqual([]);
    expect(await fetchLeaderboard('daily', '2026-06-09')).toEqual([]);
  });
});
