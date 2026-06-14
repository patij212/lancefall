import { describe, it, expect } from 'vitest';
import { World } from './world';
import { createRng } from './rng';
import { spawnSovereignCores } from './boss';
import { makeCipher, cipherSeed, dashCipherCore } from './cipher';
import { SOVEREIGN } from './tune';

// The boss→cipher wiring (boss.ts) + the determinism invariant: the cipher order
// is derived from (world.seed, bossWave), NOT world.rng — so a Daily seed yields
// the same cipher for everyone and the scoring stream is never perturbed.
describe('cipher integration — spawnSovereignCores arms the keypad', () => {
  function armed(seed: number, bossWave: number) {
    const w = new World(createRng(0xfeed));
    w.reset(800, 600);
    w.seed = seed;
    // a stand-in boss enemy (spawnSovereignCores only reads x/y/bossWave); real
    // bosses come from spawnBoss, which isn't needed to exercise the cipher wiring.
    const boss = w.spawnEnemy('darter', 400, 300, 1, 1, false)!;
    boss.bossWave = bossWave;
    spawnSovereignCores(w, boss);
    return w;
  }

  it('sets a cipher with one slot per core', () => {
    const w = armed(20260621, 1);
    expect(w.cipher).not.toBeNull();
    expect(w.cipher!.order.length).toBe(SOVEREIGN.coreCount);
    expect(w.cipher!.glyphs.length).toBe(SOVEREIGN.coreCount);
    // exactly coreCount cores orbit
    let cores = 0;
    w.enemies.forEachActive((e) => {
      if (e.kind === 'sovereign_core') cores++;
    });
    expect(cores).toBe(SOVEREIGN.coreCount);
  });

  it('derives the order from (seed, bossWave) — Daily-shared, not from world.rng', () => {
    const w = armed(20260621, 1);
    expect(w.cipher!.order).toEqual(makeCipher(SOVEREIGN.coreCount, cipherSeed(20260621, 1)).order);
    // same seed+wave → same cipher even from a different world.rng state
    expect(armed(20260621, 1).cipher!.order).toEqual(w.cipher!.order);
  });

  it('keying the cores in the decoded order solves the cipher', () => {
    const w = armed(777, 2);
    const c = w.cipher!;
    for (const slot of [...c.order]) dashCipherCore(c, slot);
    expect(c.solved).toBe(true);
    expect(c.progress).toBe(SOVEREIGN.coreCount);
  });

  it('a wrong key re-locks before the cipher is solved', () => {
    const w = armed(555, 1);
    const c = w.cipher!;
    dashCipherCore(c, c.order[0]); // correct first key
    const wrongSlot = c.order[c.order.length - 1]; // not the expected second key
    expect(dashCipherCore(c, wrongSlot)).toBe('wrong');
    expect(c.progress).toBe(0);
    expect(c.solved).toBe(false);
  });
});
