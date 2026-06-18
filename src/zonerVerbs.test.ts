import { describe, it, expect } from 'vitest';
import { World } from './world';
import { createRng } from './rng';
import { updateEnemy, applyEdgePull, heraldWall } from './enemies';
import { ORBITER, LANCER, ZONER, DRIFTER_TUNE, SEEKER_TUNE, BLOOMER, HERALD } from './tune';
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
function run(w: World, e: Enemy, seconds: number): { x: number; y: number; vx: number; vy: number; color: string; life: number; homing: number }[] {
  const seen = new Set<number>();
  const shots: { x: number; y: number; vx: number; vy: number; color: string; life: number; homing: number }[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    updateEnemy(e, w, DT);
    w.bullets.forEachActive((b) => {
      // identity by pool slot index — capture once when it first goes active
      const idx = w.bullets.items.indexOf(b);
      if (!seen.has(idx)) {
        seen.add(idx);
        shots.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, color: b.color, life: b.life, homing: b.homing });
      }
    });
  }
  return shots;
}

/** Drive one enemy and record the size of each fire VOLLEY (count of bullets that went
 *  active in the same frame) — for verbs whose bullet COUNT varies per shot. */
function wallVolleys(w: World, e: Enemy, seconds: number): number[] {
  const seen = new Set<number>();
  const volleys: number[] = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    let fresh = 0;
    updateEnemy(e, w, DT);
    w.bullets.forEachActive((b) => {
      const idx = w.bullets.items.indexOf(b);
      if (!seen.has(idx)) { seen.add(idx); fresh++; }
    });
    if (fresh > 0) volleys.push(fresh);
  }
  return volleys;
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

  it('a mine lingers only its OWN short life, not the full 8s bullet life (balance)', () => {
    // Telemetry showed parked mines lingering the full bullet life paved the arena —
    // ~40% of all player hits. A mine must expire on ORBITER.mineLife, well under 8s.
    expect(ORBITER.mineLife).toBeLessThan(8);
    const w = freshWorld();
    const e = w.spawnEnemy('orbiter', 800, 360, 1, 1, false, false, 0)!;
    const shots = run(w, e, ORBITER.fireCadence * (ORBITER.mineEvery + 1) + 0.2);
    const mines = shots.filter((s) => s.vx === 0 && s.vy === 0);
    expect(mines.length).toBeGreaterThanOrEqual(1);
    // captured on its first active frame (one dt of decay at most), so life ≈ mineLife
    for (const m of mines) expect(m.life).toBeLessThanOrEqual(ORBITER.mineLife);
    for (const m of mines) expect(m.life).toBeGreaterThan(ORBITER.mineLife - DT - 1e-6);
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

// Playtest (Nick): standoff zoners (esp. the LANCER sniper) hug the arena perimeter when
// the player holds center — their steering has no arena-bounds term. applyEdgePull blends a
// soft nudge toward center once a zoner strays within an edge margin, so it drifts back into
// playable space. Pure fn of positions + arena size (no rng) → the Daily stays bit-identical.
describe('zoner edge-pull keeps standoff zoners off the walls', () => {
  it('is a no-op in open space (mid-arena)', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('lancer', 640, 360, 1, 1, false, false, 0)!;
    e.vx = 12;
    e.vy = -5;
    applyEdgePull(e, w);
    expect(e.vx).toBe(12);
    expect(e.vy).toBe(-5);
  });
  it('nudges a wall-hugging zoner back toward center', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('lancer', 8, 360, 1, 1, false, false, 0)!; // hard against the left wall
    e.vx = 0;
    e.vy = 0;
    applyEdgePull(e, w);
    expect(e.vx).toBeGreaterThan(0); // pushed rightward, into the arena
  });
  it('pulls harder the deeper into the edge margin', () => {
    const w = freshWorld();
    const near = w.spawnEnemy('lancer', ZONER.edgeMargin - 2, 360, 1, 1, false, false, 0)!;
    near.vx = 0;
    applyEdgePull(near, w);
    const deep = w.spawnEnemy('lancer', 4, 360, 1, 1, false, false, 0)!;
    deep.vx = 0;
    applyEdgePull(deep, w);
    expect(deep.vx).toBeGreaterThan(near.vx);
  });
});

describe('DRIFTER verb — alternates the arc fan with a wide scatter spray', () => {
  it('every sprayEvery-th lock fires a wide short-lived spray; the rest fire the arc fan', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('drifter', 700, 360, 1, 1, false, false, 0)!;
    // long enough for at least one spray (the sprayEvery-th lock) plus arc fans
    const perLock = DRIFTER_TUNE.repositionTime + DRIFTER_TUNE.lockTime;
    const shots = run(w, e, perLock * (DRIFTER_TUNE.sprayEvery + 1) + 0.4);
    // spray bullets carry the short sprayLife; arc-fan bullets keep the default 8s life
    const spray = shots.filter((s) => s.life <= DRIFTER_TUNE.sprayLife + 1e-3);
    const arc = shots.filter((s) => s.life > DRIFTER_TUNE.sprayLife + 1e-3);
    expect(spray.length).toBeGreaterThanOrEqual(DRIFTER_TUNE.sprayCount); // ≥ one full cone, fired at once
    expect(arc.length).toBeGreaterThanOrEqual(3); // and the precise arc fan still fires
    // the drifter has no parked mines — every bullet it emits is a moving bolt
    for (const s of shots) expect(Math.hypot(s.vx, s.vy)).toBeGreaterThan(0);
  });

  it('the spray fans bullets across a wider cone than the 3-bullet arc fan', () => {
    // aim the drifter straight DOWN (enemy above the centred player) so the cone never
    // wraps across ±π and atan2 spreads compare cleanly.
    const w = freshWorld();
    w.player.x = 640;
    const e = w.spawnEnemy('drifter', 640, 120, 1, 1, false, false, 0)!;
    const perLock = DRIFTER_TUNE.repositionTime + DRIFTER_TUNE.lockTime;
    const shots = run(w, e, perLock * (DRIFTER_TUNE.sprayEvery + 1) + 0.4);
    const spray = shots.filter((s) => s.life <= DRIFTER_TUNE.sprayLife + 1e-3).slice(0, DRIFTER_TUNE.sprayCount);
    expect(spray.length).toBe(DRIFTER_TUNE.sprayCount);
    const angles = spray.map((s) => Math.atan2(s.vy, s.vx));
    const spread = Math.max(...angles) - Math.min(...angles);
    expect(spread).toBeGreaterThan(2 * DRIFTER_TUNE.arcSpread); // wider than the arc fan
    expect(spread).toBeCloseTo(DRIFTER_TUNE.spraySpan, 1); // ≈ the configured cone width
  });
});

describe('SEEKER feint — every Nth shot is a straight non-homing fake-out (a breather)', () => {
  it('most shots home; every feintEvery-th is a faster STRAIGHT bolt with no homing', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('seeker', 900, 360, 1, 1, false, false, 0)!;
    const per = SEEKER_TUNE.fireCadence + SEEKER_TUNE.lockTime;
    const shots = run(w, e, SEEKER_TUNE.repositionTime + per * (SEEKER_TUNE.feintEvery + 1) + 0.5);
    // the test loop drives only updateEnemy (not the bullet homing pass), so a bolt is
    // captured at its spawn velocity: the HOMER carries homing>0, the FEINT carries 0.
    const homers = shots.filter((s) => s.homing > 0);
    const feints = shots.filter((s) => s.homing === 0);
    expect(homers.length).toBeGreaterThanOrEqual(1); // still fires the slow homer
    expect(feints.length).toBeGreaterThanOrEqual(1); // and at least one straight feint
    // the feint snaps in faster than the homer (a distinct read), and never homes
    expect(Math.hypot(feints[0].vx, feints[0].vy)).toBeGreaterThan(Math.hypot(homers[0].vx, homers[0].vy));
  });
});

describe('HERALD wide gate — every Nth wall opens a doubled safe lane (a breather)', () => {
  it('a wide-gate wall fires fewer bullets / a bigger opening than a normal wall', () => {
    // same centred gap, only the lane width differs → the wide gate omits more bullets
    const normal = heraldWall(0, 0, 0, 0, HERALD.bulletSpeed, HERALD.gapHalf);
    const wide = heraldWall(0, 0, 0, 0, HERALD.bulletSpeed, HERALD.gapHalf * HERALD.wideGateMul);
    expect(normal.length).toBeGreaterThan(0);
    expect(wide.length).toBeLessThan(normal.length); // a wider safe lane = fewer wall bullets
  });
});

describe('BLOOMER broken ring — every Nth bloom drops an arc, leaving a safe wedge', () => {
  it('every brokenEvery-th bloom fires brokenArc fewer bullets than a full ring', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('bloomer', 640, 360, 1, 1, false, false, 0)!;
    const volleys = wallVolleys(w, e, BLOOMER.ringCadence * (BLOOMER.brokenEvery + 1) + 0.6);
    expect(volleys.length).toBeGreaterThanOrEqual(BLOOMER.brokenEvery); // bloomed several times
    expect(volleys).toContain(BLOOMER.ringCount); // a full ring
    expect(volleys).toContain(BLOOMER.ringCount - BLOOMER.brokenArc); // a broken ring (the wedge)
  });
});

describe('zoner verbs are world.rng-free (Daily stays bit-identical)', () => {
  it('driving an orbiter + lancer + drifter + seeker for seconds consumes ZERO world.rng draws', () => {
    const w = freshWorld(7);
    const orb = w.spawnEnemy('orbiter', 800, 360, 1, 1, false, false, 0)!;
    const lan = w.spawnEnemy('lancer', 900, 360, 1, 1, false, false, 0)!;
    const dri = w.spawnEnemy('drifter', 700, 360, 1, 1, false, false, 0)!;
    const see = w.spawnEnemy('seeker', 950, 360, 1, 1, false, false, 0)!;
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
      updateEnemy(dri, w, DT); // includes the spray verb — bullet count varies, rng must not
      updateEnemy(see, w, DT); // includes the feint verb — counter-based, zero rng
    }
    // the very next world.rng draw must match the twin's next draw — i.e. the enemy
    // verbs advanced world.rng ZERO times over 10s of fire
    expect(w.rng.next()).toBe(ref.next());
  });
});
