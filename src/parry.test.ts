import { describe, it, expect } from 'vitest';
import {
  parryArcContains,
  parryReward,
  parryDeflectsBoss,
  parrySweep,
  applyParryReward,
  parryCooldownAfter,
  parryShove,
  boundedGuardShave,
  parryEnemySweep,
} from './parry';
import { PARRY, TUNE } from './tune';
import { makeOverdrive } from './overdrive';
import { newCoherence } from './coherence';

type B = { x: number; y: number; fromBoss: boolean };

describe('parry arc', () => {
  const px = 0,
    py = 0,
    aim = 0; // facing +x
  it('catches a bullet dead ahead within reach', () => {
    expect(parryArcContains(px, py, aim, PARRY.reach - 5, 0)).toBe(true);
  });
  it('misses a bullet behind the player', () => {
    expect(parryArcContains(px, py, aim, -(PARRY.reach - 5), 0)).toBe(false);
  });
  it('misses a bullet beyond reach', () => {
    expect(parryArcContains(px, py, aim, PARRY.reach + 40, 0)).toBe(false);
  });
  it('misses a bullet outside the half-angle', () => {
    const r = PARRY.reach - 10;
    const a = PARRY.halfAngle + 0.2;
    expect(parryArcContains(px, py, aim, Math.cos(a) * r, Math.sin(a) * r)).toBe(false);
  });
  it('catches a bullet right on the half-angle edge', () => {
    const r = PARRY.reach - 10;
    const a = PARRY.halfAngle - 0.01;
    expect(parryArcContains(px, py, aim, Math.cos(a) * r, Math.sin(a) * r)).toBe(true);
  });
  it('respects a rotated aim', () => {
    const aimUp = Math.PI / 2; // facing +y
    expect(parryArcContains(px, py, aimUp, 0, PARRY.reach - 5)).toBe(true);
    expect(parryArcContains(px, py, aimUp, PARRY.reach - 5, 0)).toBe(false);
  });
});

describe('parry reward', () => {
  it('on-beat doubles the off-beat payout', () => {
    const off = parryReward(false);
    const on = parryReward(true);
    expect(on.stamina).toBe(off.stamina * 2);
    expect(on.combo).toBe(off.combo * 2);
    expect(on.overdrive).toBeCloseTo(off.overdrive * 2);
  });
  it('off-beat pays the tuned base values', () => {
    const off = parryReward(false);
    expect(off.stamina).toBe(PARRY.staminaReward);
    expect(off.combo).toBe(PARRY.comboReward);
    expect(off.overdrive).toBeCloseTo(PARRY.overdriveReward);
  });
});

describe('parry boss-deflect budget', () => {
  it('allows deflects under the budget and stops at it', () => {
    expect(parryDeflectsBoss(PARRY.bossBudget, 0)).toBe(true);
    expect(parryDeflectsBoss(PARRY.bossBudget, PARRY.bossBudget - 1)).toBe(true);
    expect(parryDeflectsBoss(PARRY.bossBudget, PARRY.bossBudget)).toBe(false);
  });
  it('clamps a build budget above the PARRY cap', () => {
    expect(parryDeflectsBoss(99, PARRY.bossBudget)).toBe(false);
  });
});

describe('parry sweep', () => {
  const run = (bullets: B[], aim = 0) => {
    const destroyed: B[] = [];
    const r = parrySweep<B>(
      0,
      0,
      aim,
      PARRY.bossBudget,
      (visit) => bullets.forEach(visit),
      (b) => destroyed.push(b),
    );
    return { ...r, destroyed };
  };

  it('deflects only chaff bullets inside the arc', () => {
    const inside: B = { x: PARRY.reach - 5, y: 0, fromBoss: false };
    const behind: B = { x: -(PARRY.reach - 5), y: 0, fromBoss: false };
    const far: B = { x: PARRY.reach + 50, y: 0, fromBoss: false };
    const { total, boss, destroyed } = run([inside, behind, far]);
    expect(total).toBe(1);
    expect(boss).toBe(0);
    expect(destroyed).toEqual([inside]);
  });

  it('caps boss-bullet deflects at the budget and reports the boss count', () => {
    const boss = (i: number): B => ({ x: PARRY.reach - 10 - i, y: 0, fromBoss: true });
    const many = [boss(0), boss(1), boss(2), boss(3)]; // 4 in-arc boss bullets
    const r = run(many);
    expect(r.total).toBe(PARRY.bossBudget); // never exceeds the boss cap
    expect(r.boss).toBe(PARRY.bossBudget); // …and the boss-deflect count drives the guard-shave
    expect(r.destroyed.length).toBe(PARRY.bossBudget);
  });

  it('a whiff (nothing in arc) deflects nothing', () => {
    const { total, boss, destroyed } = run([{ x: 0, y: PARRY.reach + 10, fromBoss: false }]);
    expect(total).toBe(0);
    expect(boss).toBe(0);
    expect(destroyed).toEqual([]);
  });
});

describe('parryCooldownAfter', () => {
  it('a successful parry flows (short flowCooldown)', () => {
    expect(parryCooldownAfter(true)).toBe(TUNE.parry.flowCooldown);
  });
  it('a whiff is punished (long cooldown)', () => {
    expect(parryCooldownAfter(false)).toBe(TUNE.parry.cooldown);
  });
  it('flow is strictly shorter than the whiff cooldown', () => {
    expect(parryCooldownAfter(true)).toBeLessThan(parryCooldownAfter(false));
  });
});

describe('parryShove', () => {
  it('pushes a near bullet outward (away from the player)', () => {
    const v = parryShove(0, 0, 30, 0, 200, 64); // bullet to the right, within radius
    expect(v.dvx).toBeGreaterThan(0);
    expect(v.dvy).toBeCloseTo(0);
    expect(Math.hypot(v.dvx, v.dvy)).toBeCloseTo(200);
  });
  it('does not shove a bullet outside the radius', () => {
    const v = parryShove(0, 0, 100, 0, 200, 64);
    expect(v.dvx).toBe(0);
    expect(v.dvy).toBe(0);
  });
  it('shoves along the player→bullet direction', () => {
    const v = parryShove(0, 0, 0, 20, 200, 64); // bullet below
    expect(v.dvx).toBeCloseTo(0);
    expect(v.dvy).toBeGreaterThan(0);
  });
});

describe('boundedGuardShave', () => {
  it('shaves the timer by shave×bossDeflected', () => {
    expect(boundedGuardShave(2, 2, 0.3, 0)).toBeCloseTo(2 - 0.6);
  });
  it('never drives the timer below the floor', () => {
    expect(boundedGuardShave(0.1, 5, 0.3, 0.05)).toBe(0.05);
  });
  it('is a no-op when no boss bullets were parried', () => {
    expect(boundedGuardShave(1.2, 0, 0.3, 0)).toBe(1.2);
  });
});

describe('parryEnemySweep (riposte arc)', () => {
  type E = { x: number; y: number };
  const run = (enemies: E[], aim = 0) => {
    const hit: E[] = [];
    const n = parryEnemySweep<E>(0, 0, aim, (visit) => enemies.forEach(visit), (e) => hit.push(e));
    return { n, hit };
  };
  it('hits only enemies inside the parry arc', () => {
    const inFront: E = { x: PARRY.reach - 8, y: 0 };
    const behind: E = { x: -(PARRY.reach - 8), y: 0 };
    const far: E = { x: PARRY.reach + 60, y: 0 };
    const { n, hit } = run([inFront, behind, far]);
    expect(n).toBe(1);
    expect(hit).toEqual([inFront]);
  });
  it('hits nothing when the arc is empty', () => {
    expect(run([{ x: 0, y: PARRY.reach + 30 }]).n).toBe(0);
  });
});

describe('applyParryReward', () => {
  const setup = () => ({
    player: { stamina: 0 },
    combo: { combo: 5, comboTimer: 0, bestComboRun: 5, overdrive: makeOverdrive() },
    coh: newCoherence(),
  });

  it('off-beat grants the base reward', () => {
    const { player, combo, coh } = setup();
    applyParryReward(player, combo, coh, 3, false);
    expect(player.stamina).toBe(PARRY.staminaReward);
    expect(combo.combo).toBe(5 + PARRY.comboReward);
    expect(combo.bestComboRun).toBe(5 + PARRY.comboReward);
    expect(combo.comboTimer).toBe(TUNE.combo.window);
    expect(combo.overdrive.meter).toBeCloseTo(PARRY.overdriveReward);
    expect(coh.value).toBeGreaterThan(0);
  });

  it('on-beat doubles the stamina/combo/overdrive payout', () => {
    const { player, combo, coh } = setup();
    applyParryReward(player, combo, coh, 3, true);
    expect(player.stamina).toBe(PARRY.staminaReward * 2);
    expect(combo.combo).toBe(5 + PARRY.comboReward * 2);
    expect(combo.overdrive.meter).toBeCloseTo(PARRY.overdriveReward * 2);
  });

  it('clamps the stamina refund to the bar max', () => {
    const { player, combo, coh } = setup();
    player.stamina = 290; // near a 3-segment (300) bar
    applyParryReward(player, combo, coh, 3, true);
    expect(player.stamina).toBe(300);
  });
});
