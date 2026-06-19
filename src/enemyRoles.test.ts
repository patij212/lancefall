import { describe, it, expect } from 'vitest';
import { World } from './world';
import { createRng } from './rng';
import { updateEnemy, splitInto } from './enemies';
import { SPLITTER } from './tune';
import type { Enemy } from './types';

// ENEMY OVERHAUL — Phase 1 (the 6 reworked chasers). Each enemy gets a distinct
// tactical role; this suite locks the per-enemy BEHAVIOUR (the tells are render-only and
// covered by eye). Determinism is load-bearing: every new behaviour is asserted to draw
// ZERO world.rng so a seeded Daily stays bit-identical.

const DT = 1 / 60;

function freshWorld(seed = 1): World {
  const w = new World(createRng(seed));
  w.reset(1280, 720);
  w.player.x = 640;
  w.player.y = 360;
  return w;
}

function countKind(w: World, kind: string): number {
  let n = 0;
  w.enemies.forEachActive((e) => {
    if (e.kind === kind) n++;
  });
  return n;
}

describe('SPLITTER — the parry signature target (sweep = clean, non-sweep = combo-shower)', () => {
  it('a SWEEP kill (dash/heavy) spawns NO surviving minis — clean', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('splitter', 400, 300, 1, 1, false, false, 0)!;
    splitInto(e, w, true); // fromSweep
    expect(countKind(w, 'mini')).toBe(0);
  });

  it('a NON-sweep kill (parry/graze/AoE) SHATTERS into showerCount minis', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('splitter', 400, 300, 1, 1, false, false, 0)!;
    splitInto(e, w, false);
    expect(countKind(w, 'mini')).toBe(SPLITTER.showerCount);
  });

  it('shower minis are weak, slow & marked ephemeral (phase 1 + a finite life)', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('splitter', 400, 300, 1, 1, false, false, 0)!;
    splitInto(e, w, false);
    const minis: Enemy[] = [];
    w.enemies.forEachActive((m) => {
      if (m.kind === 'mini') minis.push(m);
    });
    for (const m of minis) {
      expect(m.phase).toBe(1); // ephemeral marker
      expect(m.timer).toBeCloseTo(SPLITTER.showerLife, 6);
      expect(m.hp).toBe(1); // weak
    }
    // one tick: chaser steers a shower mini at the SLOW shower speed (not the 150 mini base)
    const m = minis[0];
    updateEnemy(m, w, DT);
    expect(Math.hypot(m.vx, m.vy)).toBeCloseTo(SPLITTER.showerSpeed, 4);
  });

  it('a shower mini harmlessly fizzles after showerLife (released, not lingering)', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('splitter', 400, 300, 1, 1, false, false, 0)!;
    splitInto(e, w, false);
    expect(countKind(w, 'mini')).toBe(SPLITTER.showerCount);
    const steps = Math.ceil(SPLITTER.showerLife / DT) + 2;
    for (let i = 0; i < steps; i++) {
      // snapshot then tick (release happens inside updateEnemy)
      const live: Enemy[] = [];
      w.enemies.forEachActive((m) => {
        if (m.kind === 'mini') live.push(m);
      });
      for (const m of live) updateEnemy(m, w, DT);
    }
    expect(countKind(w, 'mini')).toBe(0); // all expired
  });

  it('splitInto draws ZERO world.rng on both paths (Daily-safe)', () => {
    const w = freshWorld(7);
    const ref = createRng(7);
    const e = w.spawnEnemy('splitter', 400, 300, 1, 1, false, false, 0)!; // explicit angle → no rng
    splitInto(e, w, true);
    splitInto(e, w, false);
    expect(w.rng.next()).toBe(ref.next()); // the splits advanced world.rng zero times
  });
});
