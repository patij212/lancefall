import { describe, it, expect } from 'vitest';
import { World } from './world';
import { createRng } from './rng';
import { updateEnemy } from './enemies';
import { darterDetectsDash } from './enemies/darter';
import { DARTER } from './tune';

// DARTER — the dash-duelist. It counter-lunges ALONG YOUR LINE only when you dash TOWARD
// it (within range + a cone). Pure detect helper + the reactive state machine. Tame-first
// + deterministic (reads replayed player state, draws zero world.rng).

const DT = 1 / 60;

function freshWorld(seed = 1): World {
  const w = new World(createRng(seed));
  w.reset(1280, 720);
  w.player.x = 640;
  w.player.y = 360;
  return w;
}

describe('darterDetectsDash (pure trigger geometry)', () => {
  it('triggers on a dash aimed at the darter within range', () => {
    expect(darterDetectsDash(100, 0, 1, 0, DARTER.counterRange, DARTER.counterCos)).toBe(true);
  });
  it('does NOT trigger when the dash points away (weaving past is safe)', () => {
    expect(darterDetectsDash(100, 0, -1, 0, DARTER.counterRange, DARTER.counterCos)).toBe(false);
  });
  it('does NOT trigger beyond counterRange', () => {
    expect(darterDetectsDash(DARTER.counterRange + 50, 0, 1, 0, DARTER.counterRange, DARTER.counterCos)).toBe(false);
  });
  it('does NOT trigger outside the cone (a glancing 90° dash)', () => {
    expect(darterDetectsDash(0, 100, 1, 0, DARTER.counterRange, DARTER.counterCos)).toBe(false);
  });
});

describe('DARTER — counter-lunge state machine', () => {
  function dashAt(w: World, dirX: number, dirY: number): void {
    const p = w.player;
    p.phase = 'dashing';
    p.dashDirX = dirX;
    p.dashDirY = dirY;
  }

  it('stays in PATROL and never counters a dash aimed AWAY (weave past = safe)', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('darter', 640 + 150, 360, 1, 1, false, false, 0)!;
    dashAt(w, -1, 0); // dashing LEFT, away from the darter
    for (let i = 0; i < 60; i++) updateEnemy(e, w, DT);
    expect(e.phase).toBe(0); // never triggered
  });

  it('a dash AIMED at it triggers WINDUP → COUNTER → RECOVER', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('darter', 640 + 150, 360, 1, 1, false, false, 0)!;
    dashAt(w, 1, 0); // dash toward the darter
    updateEnemy(e, w, DT);
    expect(e.phase).toBe(1); // entered windup
    let sawCounter = false;
    let sawRecover = false;
    const steps = Math.ceil((DARTER.counterWindup + DARTER.counterTime + DARTER.recoverTime) / DT) + 5;
    for (let i = 0; i < steps; i++) {
      updateEnemy(e, w, DT);
      if (e.phase === 2) sawCounter = true;
      if (e.phase === 3) sawRecover = true;
    }
    expect(sawCounter).toBe(true);
    expect(sawRecover).toBe(true);
  });

  it('the COUNTER lunges along the player dash line at counterSpeed', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('darter', 640 + 150, 360, 1, 1, false, false, 0)!;
    dashAt(w, 1, 0);
    updateEnemy(e, w, DT); // windup
    for (let i = 0; i < Math.ceil(DARTER.counterWindup / DT) + 3 && e.phase !== 2; i++) updateEnemy(e, w, DT);
    expect(e.phase).toBe(2);
    expect(Math.hypot(e.vx, e.vy)).toBeCloseTo(DARTER.counterSpeed, 1);
    expect(Math.atan2(e.vy, e.vx)).toBeCloseTo(0, 3); // along +x (the locked dash line)
  });

  it('respects the cooldown — will not immediately counter again after recovering', () => {
    const w = freshWorld();
    const e = w.spawnEnemy('darter', 640 + 150, 360, 1, 1, false, false, 0)!;
    dashAt(w, 1, 0);
    const steps = Math.ceil((DARTER.counterWindup + DARTER.counterTime + DARTER.recoverTime) / DT) + 5;
    for (let i = 0; i < steps; i++) updateEnemy(e, w, DT);
    expect(e.phase).toBe(0);
    expect(e.fireTimer).toBeGreaterThan(0); // cooldown is active
    w.player.x = e.x - 100; // re-aim a dash straight at it
    dashAt(w, 1, 0);
    updateEnemy(e, w, DT);
    expect(e.phase).toBe(0); // still cooling down → no instant re-counter
  });

  it('draws ZERO world.rng (Daily-safe)', () => {
    const w = freshWorld(7);
    const ref = createRng(7);
    const e = w.spawnEnemy('darter', 790, 360, 1, 1, false, false, 0)!; // explicit angle → no rng
    expect(w.rng.next()).toBe(ref.next());
    dashAt(w, 1, 0);
    for (let i = 0; i < 600; i++) updateEnemy(e, w, DT);
    expect(w.rng.next()).toBe(ref.next());
  });
});
