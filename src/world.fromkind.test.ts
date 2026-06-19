// The core of the LAST RUN damage attribution: spawnBullet stamps each bullet with the World's
// current firingKind (set before each enemy/boss update) so a frames-later hit can be blamed on
// the right foe. Reset clears it. Pure unit test of that stamp.
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { createRng } from './rng';

function fresh(): World {
  const w = new World(createRng(1));
  w.reset(800, 600);
  return w;
}

describe('spawnBullet — firingKind attribution', () => {
  it('stamps the bullet with the current firingKind', () => {
    const w = fresh();
    w.firingKind = 'darter';
    expect(w.spawnBullet(100, 100, 1, 0, 6, '#fff', false)?.fromKind).toBe('darter');
    w.firingKind = 'sovereign';
    expect(w.spawnBullet(100, 100, 1, 0, 6, '#fff', true)?.fromKind).toBe('sovereign');
  });

  it('leaves fromKind empty when no firing context is set', () => {
    const w = fresh();
    expect(w.spawnBullet(100, 100, 1, 0, 6, '#fff', false)?.fromKind).toBe('');
  });

  it('reset() clears the firing context and damage tally', () => {
    const w = fresh();
    w.firingKind = 'brute';
    w.damageByKind.brute = 3;
    w.reset(800, 600);
    expect(w.firingKind).toBe('');
    expect(w.damageByKind).toEqual({});
  });
});
