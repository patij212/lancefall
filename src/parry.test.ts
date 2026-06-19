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
  parryStreakNext,
  parryStreakMult,
  parryGrade,
  effectiveParryArc,
} from './parry';
import { PARRY, TUNE } from './tune';
import { makeOverdrive } from './overdrive';
import { newCoherence } from './coherence';
import { deriveStats } from './perks';
import { META_NODES, metaApplyFor } from './meta';

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

describe('parryStreakNext', () => {
  it('an on-beat success builds the streak (capped at streakMax)', () => {
    expect(parryStreakNext(0, true, true)).toBe(1);
    expect(parryStreakNext(2, true, true)).toBe(3);
    expect(parryStreakNext(PARRY.streakMax, true, true)).toBe(PARRY.streakMax); // capped
  });
  it('an off-beat success breaks the streak', () => {
    expect(parryStreakNext(4, false, true)).toBe(0);
  });
  it('a whiff breaks the streak', () => {
    expect(parryStreakNext(4, true, false)).toBe(0);
  });
});

describe('parryStreakMult', () => {
  it('is 1× at streak 0 and grows per step', () => {
    expect(parryStreakMult(0)).toBeCloseTo(1);
    expect(parryStreakMult(3)).toBeCloseTo(1 + 3 * PARRY.streakPerStreak);
  });
  it('is clamped at streakMax (never a runaway win-button)', () => {
    expect(parryStreakMult(99)).toBeCloseTo(1 + PARRY.streakMax * PARRY.streakPerStreak);
  });
});

describe('parryGrade', () => {
  it('grades PERFECT inside the perfect window, GOOD after', () => {
    expect(parryGrade(0, PARRY.perfectWindow)).toBe('perfect');
    expect(parryGrade(PARRY.perfectWindow - 0.001, PARRY.perfectWindow)).toBe('perfect');
    expect(parryGrade(PARRY.perfectWindow + 0.01, PARRY.perfectWindow)).toBe('good');
  });
});

describe('effectiveParryArc', () => {
  it('at zero coherence + no meta returns the base arc', () => {
    const a = effectiveParryArc(0, 0, 0);
    expect(a.reach).toBeCloseTo(PARRY.reach);
    expect(a.halfAngle).toBeCloseTo(PARRY.halfAngle);
  });
  it('coherence widens reach and angle', () => {
    const a = effectiveParryArc(1, 0, 0);
    expect(a.reach).toBeGreaterThan(PARRY.reach);
    expect(a.halfAngle).toBeGreaterThan(PARRY.halfAngle);
  });
  it('meta bonuses STACK on top of coherence', () => {
    const base = effectiveParryArc(0.5, 0, 0);
    const buffed = effectiveParryArc(0.5, 40, 0.3);
    expect(buffed.reach).toBeGreaterThan(base.reach);
    expect(buffed.halfAngle).toBeGreaterThan(base.halfAngle);
  });
  it('clamps halfAngle at π (a full guard) and reach at the cap — the earned apex, never an overshoot', () => {
    const a = effectiveParryArc(1, 9999, 99);
    expect(a.halfAngle).toBeCloseTo(Math.PI);
    expect(a.reach).toBe(PARRY.reachCap);
  });

  it('the apex (maxed PARRY meta AT max coherence) reaches the full-circle guard', () => {
    const maxed: Record<string, number> = {};
    for (const n of META_NODES) if (n.id.startsWith('parry')) maxed[n.id] = n.maxLevel;
    const s = deriveStats({}, undefined, metaApplyFor(maxed));
    const apex = effectiveParryArc(1, s.parryReach, s.parryHalfAngle);
    expect(apex.halfAngle).toBeCloseTo(Math.PI); // full 360° guard — earned
    expect(apex.reach).toBe(PARRY.reachCap);
    // …but max coherence WITHOUT the meta is wide, not full
    const noMeta = effectiveParryArc(1, 0, 0);
    expect(noMeta.halfAngle).toBeLessThan(Math.PI);
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
