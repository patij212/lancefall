import { describe, it, expect } from 'vitest';
import { makePowerup, resetPowerup, tickPowerup, activatePowerup, applyPowerup, rollPowerup, POWERUPS, POWERUP_KINDS } from './powerups';
import { deriveStats } from './perks';

describe('powerups — state machine', () => {
  it('starts inactive', () => {
    const p = makePowerup();
    expect(p.active).toBe(null);
    expect(tickPowerup(p, 1)).toBe(false);
  });

  it('activate sets the kind + timer to the def duration', () => {
    const p = makePowerup();
    activatePowerup(p, 'haste');
    expect(p.active).toBe('haste');
    expect(p.timer).toBe(POWERUPS.haste.duration);
    expect(p.total).toBe(POWERUPS.haste.duration);
  });

  it('ticks down and fires exactly one expiry', () => {
    const p = makePowerup();
    activatePowerup(p, 'greed');
    expect(tickPowerup(p, POWERUPS.greed.duration - 0.1)).toBe(false);
    expect(p.active).toBe('greed');
    expect(tickPowerup(p, 0.2)).toBe(true); // expires this tick
    expect(p.active).toBe(null);
    expect(tickPowerup(p, 1)).toBe(false); // no double-expiry
  });

  it('a new pickup replaces the current buff', () => {
    const p = makePowerup();
    activatePowerup(p, 'overreach');
    tickPowerup(p, 3);
    activatePowerup(p, 'frenzy');
    expect(p.active).toBe('frenzy');
    expect(p.timer).toBe(POWERUPS.frenzy.duration); // refreshed, not stacked
  });

  it('resetPowerup clears everything', () => {
    const p = makePowerup();
    activatePowerup(p, 'aegis');
    resetPowerup(p);
    expect(p.active).toBe(null);
    expect(p.timer).toBe(0);
  });
});

describe('powerups — buffs', () => {
  it('applyPowerup is a no-op when inactive', () => {
    const p = makePowerup();
    const base = deriveStats({});
    const s = deriveStats({});
    applyPowerup(p, s);
    expect(s.dashHitboxRadius).toBe(base.dashHitboxRadius);
    expect(s.scoreMul).toBe(base.scoreMul);
  });

  it('OVERREACH grows the spear reach', () => {
    const p = makePowerup();
    activatePowerup(p, 'overreach');
    const s = deriveStats({});
    const before = s.dashHitboxRadius;
    applyPowerup(p, s);
    expect(s.dashHitboxRadius).toBeGreaterThan(before);
    expect(s.dashLenMul).toBeGreaterThan(1);
  });

  it('GREED doubles score + shards', () => {
    const p = makePowerup();
    activatePowerup(p, 'greed');
    const s = deriveStats({});
    applyPowerup(p, s);
    expect(s.scoreMul).toBeCloseTo(2, 6);
    expect(s.shardMul).toBeCloseTo(2, 6);
  });

  it('FRENZY raises dash damage', () => {
    const p = makePowerup();
    activatePowerup(p, 'frenzy');
    const s = deriveStats({});
    const before = s.dashDamage;
    applyPowerup(p, s);
    expect(s.dashDamage).toBe(before + 3);
  });

  it('every kind has a complete def', () => {
    for (const k of POWERUP_KINDS) {
      const d = POWERUPS[k];
      expect(d.name.length).toBeGreaterThan(0);
      expect(d.duration).toBeGreaterThan(0);
      expect(typeof d.apply).toBe('function');
    }
  });
});

describe('powerups — rollPowerup', () => {
  it('returns a valid kind across the rng range', () => {
    for (let i = 0; i < POWERUP_KINDS.length; i++) {
      const kind = rollPowerup({ int: () => i });
      expect(POWERUP_KINDS).toContain(kind);
    }
  });
});
