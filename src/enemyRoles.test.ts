import { describe, it, expect } from 'vitest';
import { World } from './world';
import { createRng } from './rng';
import { updateEnemy, splitInto, shadeLethal } from './enemies';
import { SPLITTER, SHADE_TUNE, BOMBER, WISP, BROODER } from './tune';
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

describe('SHADE — a timing-duel (harmless while drifting, lethal only mid-strike)', () => {
  /** Drive a shade until its phase flips to `targetPhase`, returning the enemy + steps. */
  function driveToPhase(w: World, e: Enemy, targetPhase: number, maxSec = 6): number {
    const steps = Math.round(maxSec / DT);
    for (let i = 0; i < steps; i++) {
      updateEnemy(e, w, DT);
      if (e.phase === targetPhase) return i;
    }
    return -1;
  }

  it('is HARMLESS while drifting (phase 0) and only lethal mid-strike (phase 1)', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('shade', 900, 360, 1, 1, false, false, 0)!;
    expect(e.phase).toBe(0);
    expect(shadeLethal(e)).toBe(false); // dormant drift → cannot kill on contact
    const reached = driveToPhase(w, e, 1);
    expect(reached).toBeGreaterThan(0); // it does strike after the cadence
    expect(shadeLethal(e)).toBe(true); // the brief lunge IS lethal
  });

  it('drifts SLOW while dormant, then lunges FAST on the strike', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('shade', 900, 360, 1, 1, false, false, 0)!;
    updateEnemy(e, w, DT); // one drift tick
    expect(Math.hypot(e.vx, e.vy)).toBeLessThanOrEqual(SHADE_TUNE.driftSpeed + 1e-3);
    driveToPhase(w, e, 1);
    // captured on the strike frame: the committed lunge moves at strikeSpeed (>> drift)
    expect(Math.hypot(e.vx, e.vy)).toBeCloseTo(SHADE_TUNE.strikeSpeed, 2);
  });

  it('returns to a harmless drift after the strike window (safe between strikes)', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('shade', 900, 360, 1, 1, false, false, 0)!;
    driveToPhase(w, e, 1); // into the strike
    const back = driveToPhase(w, e, 0); // it eases back to drift
    expect(back).toBeGreaterThanOrEqual(0);
    expect(shadeLethal(e)).toBe(false); // harmless again
  });

  it('the shade verb draws ZERO world.rng (the old blink edgeSpawn draw is gone)', () => {
    const w = freshWorld(7);
    const ref = createRng(7);
    const e = w.spawnEnemy('shade', 900, 360, 1, 1, false, false, 0)!; // explicit angle → no rng
    expect(w.rng.next()).toBe(ref.next());
    for (let i = 0; i < 1200; i++) updateEnemy(e, w, DT); // ~20s: several full strike cycles
    expect(w.rng.next()).toBe(ref.next()); // shade advanced world.rng zero times
  });
});

describe('BOMBER — don\'t-greed kamikaze (arm in range, self-detonate a blast ring)', () => {
  it('rushes (phase 0), then ARMS (phase 1) once inside armRange', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('bomber', 640, 200, 1, 1, false, false, 0)!; // 160px away → just outside armRange
    expect(e.phase).toBe(0);
    let armed = false;
    for (let i = 0; i < 120 && !armed; i++) {
      updateEnemy(e, w, DT);
      if (e.phase === 1) armed = true;
    }
    expect(armed).toBe(true); // it closed the distance and armed
    expect(e.timer).toBeGreaterThan(0); // a charge window is counting down
  });

  it('SELF-DETONATES a full bullet ring after armTime, then removes itself', () => {
    const w = freshWorld();
    // park it INSIDE armRange so it arms on the first tick
    const e = w.spawnEnemy('bomber', 640, 360 + BOMBER.armRange - 20, 1, 1, false, false, 0)!;
    let ringBefore = 0;
    w.bullets.forEachActive(() => ringBefore++);
    const steps = Math.ceil(BOMBER.armTime / DT) + 3;
    // mirror the real loop: only ACTIVE enemies get updated (forEachActive), so a
    // self-detonated bomber is not re-ticked into a second blast
    for (let i = 0; i < steps && e.active; i++) updateEnemy(e, w, DT);
    let ring = 0;
    w.bullets.forEachActive((b) => {
      if (Math.hypot(b.vx, b.vy) > 0) ring++;
    });
    expect(ring - ringBefore).toBe(BOMBER.detonateCount); // the full blast ring fired
    expect(e.active).toBe(false); // consumed itself in the blast
  });

  it('the self-detonation draws ZERO world.rng (Daily-safe)', () => {
    const w = freshWorld(7);
    const ref = createRng(7);
    const e = w.spawnEnemy('bomber', 640, 360 + BOMBER.armRange - 20, 1, 1, false, false, 0)!;
    expect(w.rng.next()).toBe(ref.next());
    const steps = Math.ceil(BOMBER.armTime / DT) + 3;
    for (let i = 0; i < steps && e.active; i++) updateEnemy(e, w, DT);
    expect(e.active).toBe(false); // it detonated
    expect(w.rng.next()).toBe(ref.next()); // and consumed zero world.rng doing so
  });
});

describe('WISP — weave-swarm (slow, erratic, a graze treat not a threat)', () => {
  it('approaches the player overall but is SLOW (a graze/sweep-able pack, no beeline)', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('wisp', 1000, 360, 1, 1, false, false, 0)!;
    const d0 = Math.hypot(e.x - w.player.x, e.y - w.player.y);
    for (let i = 0; i < 180; i++) {
      updateEnemy(e, w, DT);
      expect(Math.hypot(e.vx, e.vy)).toBeLessThanOrEqual(WISP.approachSpeed + 1e-3); // never faster than the slow cap
    }
    const d1 = Math.hypot(e.x - w.player.x, e.y - w.player.y);
    expect(d1).toBeLessThan(d0); // net closes in
  });

  it('WEAVES — its heading is not a constant beeline (it changes frame to frame)', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('wisp', 1000, 360, 1, 1, false, false, 0)!;
    const headings: number[] = [];
    for (let i = 0; i < 40; i++) {
      updateEnemy(e, w, DT);
      headings.push(Math.atan2(e.vy, e.vx));
    }
    const spread = Math.max(...headings) - Math.min(...headings);
    expect(spread).toBeGreaterThan(0.15); // a real weave, not a straight line
  });

  it('the wisp verb draws ZERO world.rng (Daily-safe)', () => {
    const w = freshWorld(7);
    const ref = createRng(7);
    const e = w.spawnEnemy('wisp', 1000, 360, 1, 1, false, false, 0)!; // explicit angle → no rng
    expect(w.rng.next()).toBe(ref.next());
    for (let i = 0; i < 600; i++) updateEnemy(e, w, DT);
    expect(w.rng.next()).toBe(ref.next());
  });
});

describe('BROODER — priority target (hangs at the edge, hatches a capped swarm)', () => {
  it('drifts out to HANG near the arena edge (far from centre — break off to kill it)', () => {
    const w = freshWorld();
    // spawn it near centre; it should migrate OUT to the perimeter ellipse
    const e = w.spawnEnemy('brooder', 640, 360, 1, 1, false, false, 0)!;
    for (let i = 0; i < 600; i++) updateEnemy(e, w, DT); // ~10s to settle on the drift
    const distFromCentre = Math.hypot(e.x - w.width / 2, e.y - w.height / 2);
    // the target ellipse sits at edgeFrac of the arena → well outside the central quarter
    expect(distFromCentre).toBeGreaterThan(w.width * 0.25);
  });

  it('still hatches drones, capped at maxSpawns', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('brooder', 640, 360, 1, 1, false, false, 0)!;
    const seconds = BROODER.spawnEvery * (BROODER.maxSpawns + 3) + 1;
    for (let i = 0; i < Math.round(seconds / DT); i++) updateEnemy(e, w, DT);
    expect(countKind(w, 'mini')).toBe(BROODER.maxSpawns); // exactly the cap, never more
  });

  it('the brooder verb draws ZERO world.rng (Daily-safe)', () => {
    const w = freshWorld(7);
    const ref = createRng(7);
    const e = w.spawnEnemy('brooder', 640, 360, 1, 1, false, false, 0)!; // explicit angle → no rng
    expect(w.rng.next()).toBe(ref.next());
    const seconds = BROODER.spawnEvery * (BROODER.maxSpawns + 2) + 1;
    for (let i = 0; i < Math.round(seconds / DT); i++) updateEnemy(e, w, DT); // includes hatches
    expect(w.rng.next()).toBe(ref.next()); // hatches use explicit angles → zero world.rng
  });
});
