import { describe, it, expect } from 'vitest';
import { World } from './world';
import { createRng } from './rng';
import { updateEnemy } from './enemies';
import { ORBITER, LANCER } from './tune';
import type { Enemy } from './types';

// Two overlapping ZONER enemies gain a DISTINCT mechanical verb beyond "fire a bolt":
//   • ORBITER drops a parked MINE every Nth shot (area-denial).
//   • LANCER fires a DOUBLE-TAP — a quick second bolt on the same frozen aim line.
// Both are cadence-timed off sim dt and draw ZERO world.rng, so a seeded Daily stays
// bit-identical (the determinism guard, asserted explicitly below).

const DT = 1 / 60;

function freshWorld(seed = 1): World {
  const w = new World(createRng(seed));
  w.reset(1280, 720);
  // park the player off to one side so aimed bolts have a clear, stable heading
  w.player.x = 200;
  w.player.y = 360;
  return w;
}

/** Drive one enemy for `seconds`, collecting a snapshot of every NEW bullet. */
function run(w: World, e: Enemy, seconds: number): { x: number; y: number; vx: number; vy: number; color: string }[] {
  const seen = new Set<number>();
  const shots: { x: number; y: number; vx: number; vy: number; color: string }[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    updateEnemy(e, w, DT);
    w.bullets.forEachActive((b) => {
      // identity by pool slot index — capture once when it first goes active
      const idx = w.bullets.items.indexOf(b);
      if (!seen.has(idx)) {
        seen.add(idx);
        shots.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, color: b.color });
      }
    });
  }
  return shots;
}

describe('ORBITER verb — drops a parked mine every Nth shot', () => {
  it('every mineEvery-th shot is stationary (vx=vy=0) and a distinct color', () => {
    const w = freshWorld();
    // explicit angle ⇒ spawnEnemy draws ZERO world.rng (keeps the Daily clean)
    const e = w.spawnEnemy('orbiter', 800, 360, 1, 1, false, false, 0)!;
    // long enough to emit several shots (fireCadence apart)
    const shots = run(w, e, ORBITER.fireCadence * (ORBITER.mineEvery + 1) + 0.2);
    expect(shots.length).toBeGreaterThanOrEqual(ORBITER.mineEvery);
    const mines = shots.filter((s) => s.vx === 0 && s.vy === 0);
    const bolts = shots.filter((s) => s.vx !== 0 || s.vy !== 0);
    expect(mines.length).toBeGreaterThanOrEqual(1); // at least one mine dropped
    expect(bolts.length).toBeGreaterThanOrEqual(1); // and still fires aimed bolts
    for (const m of mines) expect(m.color).toBe(ORBITER.mineColor);
    // a parked mine never grazes (approaching-only graze needs a moving bullet) — it is
    // pure area-denial; assert it truly has no velocity
    for (const m of mines) expect(Math.hypot(m.vx, m.vy)).toBe(0);
  });
});

describe('LANCER verb — double-tap (a second bolt on the same aim line)', () => {
  it('fires two bolts close together per lock, on the SAME heading', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('lancer', 900, 360, 1, 1, false, false, 0)!;
    // one full cycle: reposition + lock + the double-tap delay, with margin
    const shots = run(w, e, LANCER.repositionTime + LANCER.lockTime + LANCER.doubleTapDelay + 0.3);
    expect(shots.length).toBeGreaterThanOrEqual(2); // the double-tap fired both bolts
    const a = shots[0];
    const b = shots[1];
    // both bolts travel along the same frozen aim line (identical heading)
    const angA = Math.atan2(a.vy, a.vx);
    const angB = Math.atan2(b.vy, b.vx);
    expect(angB).toBeCloseTo(angA, 6);
    // both are real moving bolts (not mines)
    expect(Math.hypot(a.vx, a.vy)).toBeGreaterThan(0);
    expect(Math.hypot(b.vx, b.vy)).toBeGreaterThan(0);
  });
});

describe('zoner verbs are world.rng-free (Daily stays bit-identical)', () => {
  it('driving an orbiter + lancer for seconds consumes ZERO world.rng draws', () => {
    const w = freshWorld(7);
    const orb = w.spawnEnemy('orbiter', 800, 360, 1, 1, false, false, 0)!;
    const lan = w.spawnEnemy('lancer', 900, 360, 1, 1, false, false, 0)!;
    // a clean twin with the same seed, no enemy ticks, is the reference rng state
    const ref = createRng(7);
    // advance both worlds' rng identically up to here? No — instead: capture the
    // world.rng state by drawing from a fresh twin and compare the NEXT draw after
    // driving the enemies. The enemy ticks must not have advanced world.rng.
    const before = w.rng.next();
    const refAfterOne = ref.next();
    expect(before).toBe(refAfterOne); // same seed → same first post-spawn draw (spawns used explicit angle)
    for (let i = 0; i < 600; i++) {
      updateEnemy(orb, w, DT);
      updateEnemy(lan, w, DT);
    }
    // the very next world.rng draw must match the twin's next draw — i.e. the enemy
    // verbs advanced world.rng ZERO times over 10s of fire
    expect(w.rng.next()).toBe(ref.next());
  });
});
