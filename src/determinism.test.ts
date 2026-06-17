import { describe, it, expect } from 'vitest';
import { Director } from './waves';
import { modeById } from './modes';
import { createRng } from './rng';
import { makeCipher, cipherSeed, ciphertext, dashCipherCore } from './cipher';

// FULL-RUN determinism guard. The Daily, async seed-duels, and ghost replays all promise
// that one seed reproduces the same run for everyone. The existing waves test compares the
// spawn *labels*; this asserts the rng STATE is bit-identical after a long run — the stronger
// end-to-end guarantee those features actually depend on. And it locks the cipher / READ THE
// KEY decode surface as a pure function of (n, seed) drawing ZERO world.rng, so the decode
// skin can never silently fork the seeded wave stream (the cipherCycle is skill-dependent).

const DT = 1 / 60;

function driveDirector(seed: number, modeId = 'daily') {
  const d = new Director();
  d.configure(modeById(modeId));
  const rng = createRng(seed);
  const spawns: string[] = [];
  let bossAlive = false;
  let fight = 0;
  for (let i = 0; i < 18000; i++) {
    // ~300s — crosses several bosses, lulls, and pre-boss calms
    const dec = d.update(DT, 0, bossAlive, rng);
    for (const s of dec.spawn) spawns.push(s);
    if (dec.boss) {
      bossAlive = true;
      fight = 0;
    } else if (bossAlive) {
      fight += DT;
      if (fight >= 6) bossAlive = false;
    }
  }
  // The next draws reflect the FULL rng state after the run — bit-identical iff the entire
  // stream was identical (strictly stronger than comparing spawn labels alone).
  return { spawns, tail: [rng.next(), rng.next(), rng.next(), rng.next()] };
}

describe('full-run determinism — a Daily seed reproduces exactly', () => {
  it('same seed → identical spawn stream AND bit-identical rng state after a 300s run', () => {
    const a = driveDirector(20260621);
    const b = driveDirector(20260621);
    expect(a.spawns).toEqual(b.spawns);
    expect(a.tail).toEqual(b.tail); // rng state bit-identical end-to-end
    expect(a.spawns.length).toBeGreaterThan(50);
  });

  it('the guard can actually fail — different seeds diverge', () => {
    const a = driveDirector(1);
    const b = driveDirector(2);
    expect(a.tail).not.toEqual(b.tail);
  });

  it('WEEKLY SIEGE is as deterministic as the Daily — same seed → identical run', () => {
    // The weekly board promises "one seed for the whole world, all week"; it runs the same
    // Director under a different ModeRules config, so reproducibility must hold there too.
    const a = driveDirector(20260615, 'weekly');
    const b = driveDirector(20260615, 'weekly');
    expect(a.spawns).toEqual(b.spawns);
    expect(a.tail).toEqual(b.tail);
    expect(a.spawns.length).toBeGreaterThan(50);
  });
});

describe('cipher / READ THE KEY decode surface is world.rng-free + Daily-reproducible', () => {
  it('ciphertext + dashCipherCore operate only on the CipherState (no World, no rng)', () => {
    // The decode skin renders ciphertext() and resolves dashes via dashCipherCore — both take
    // ONLY the cipher state, so they structurally cannot touch world.rng.
    const c = makeCipher(5, cipherSeed(20260621, 97));
    const readout = ciphertext(c);
    expect(readout.length).toBe(5);
    // a permutation of the glyph set (the ciphertext is the glyphs in required dash order)
    expect([...readout].sort((x, y) => x - y)).toEqual([...c.glyphs].sort((x, y) => x - y));
    for (const slot of [...c.order]) dashCipherCore(c, slot);
    expect(c.solved).toBe(true);
  });

  it('same (n, seed) → identical cipher for everyone on a Daily (reproducible decode)', () => {
    const seed = cipherSeed(20260621, 1 * 97 + 0);
    const a = makeCipher(6, seed);
    const b = makeCipher(6, seed);
    expect(a.order).toEqual(b.order);
    expect(a.glyphs).toEqual(b.glyphs);
    expect(ciphertext(a)).toEqual(ciphertext(b));
    // a different Daily wave yields a different code
    expect(makeCipher(6, cipherSeed(20260621, 2 * 97 + 0)).order).not.toEqual(a.order);
  });
});
