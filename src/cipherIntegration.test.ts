import { describe, it, expect } from 'vitest';
import { World } from './world';
import { createRng } from './rng';
import { spawnSovereignCores, spawnCipherRing, bossUsesRingCipher, updateBoss } from './boss';
import { makeCipher, cipherSeed, dashCipherCore } from './cipher';
import { SOVEREIGN, CIPHER } from './tune';

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
    // seed = bossWave*97 + cipherCycle (0 on the first arm) — a fresh code per re-lock
    expect(w.cipher!.order).toEqual(makeCipher(SOVEREIGN.coreCount, cipherSeed(20260621, 1 * 97 + 0)).order);
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

describe('THE LONGEST DAY — generic ring cipher', () => {
  it('only Warden/Weaver/Beacon use the generic ring (others are their own puzzles)', () => {
    expect(bossUsesRingCipher('warden')).toBe(true);
    expect(bossUsesRingCipher('weaver')).toBe(true);
    expect(bossUsesRingCipher('beacon')).toBe(true);
    expect(bossUsesRingCipher('hollow')).toBe(false);
    expect(bossUsesRingCipher('mirrorblade')).toBe(false);
    expect(bossUsesRingCipher('sovereign')).toBe(false);
  });

  it('spawnCipherRing arms a deterministic ring around any boss (no rng dependence)', () => {
    const w = new World(createRng(0xfeed));
    w.reset(800, 600);
    w.seed = 12345;
    const boss = w.spawnEnemy('darter', 400, 300, 1, 1, false)!;
    boss.kind = 'warden';
    boss.isBoss = true;
    boss.bossWave = 1;
    spawnCipherRing(w, boss, CIPHER.ringCount);
    expect(w.cipher).not.toBeNull();
    expect(w.cipher!.order).toEqual(makeCipher(CIPHER.ringCount, cipherSeed(12345, 1 * 97 + 0)).order);
    expect(boss.cipherExposed).toBe(0);
    let cores = 0;
    w.enemies.forEachActive((e) => {
      if (e.kind === 'sovereign_core') cores++;
    });
    expect(cores).toBe(CIPHER.ringCount);
  });

  it('a ring boss re-locks (re-arms a fresh cipher) when its expose window closes', () => {
    const w = new World(createRng(0xfeed));
    w.reset(800, 600);
    w.seed = 999;
    const boss = w.spawnEnemy('darter', 400, 300, 1, 1, false)!;
    boss.kind = 'warden';
    boss.isBoss = true;
    boss.bossWave = 1;
    // simulate a solved cipher → open punish window (cipher cleared, exposed timer set)
    w.cipher = null;
    boss.cipherExposed = 0.1;
    updateBoss(boss, w, 0.2); // window closes within this tick → re-arm
    expect(boss.cipherExposed).toBe(0);
    expect(w.cipher).not.toBeNull(); // a fresh ring cipher is armed
  });

  it('spawnCipherRing draws ZERO world.rng (the seeded wave stream is untouched)', () => {
    const setup = () => {
      const w = new World(createRng(42));
      w.reset(800, 600);
      w.seed = 1;
      const boss = w.spawnEnemy('darter', 400, 300, 1, 1, false)!;
      boss.kind = 'warden';
      boss.bossWave = 1;
      return { w, boss };
    };
    const a = setup();
    spawnCipherRing(a.w, a.boss, CIPHER.ringCount);
    const afterRing = a.w.rng.next();
    const b = setup(); // identical world.rng draws, but NO ring armed
    const noRing = b.w.rng.next();
    expect(afterRing).toBe(noRing); // arming the ring consumed no world.rng
  });
});
