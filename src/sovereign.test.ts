import { describe, it, expect } from 'vitest';
import { gravityPull, coreOrbitPos, beamHitsPoint, isSovereignExposed, sovereignBodyArmored, sovereignBeamActive, exposeSovereign, sovereignFinale, novaSpiralTelegraphFrac } from './sovereign';
import { SOVEREIGN } from './tune';
import type { Enemy } from './types';

function mkBoss(over: Partial<Enemy> = {}): Enemy {
  return {
    active: true, kind: 'sovereign', x: 0, y: 0, vx: 0, vy: 0, hp: 30, maxHp: 30, radius: 50,
    color: '#fde047', baseScore: 0, timer: 0, phase: 0, telegraph: 0, angle: 0, spawnTime: 0,
    hitFlash: 0, lastDashId: -1, shielded: false, shieldAngle: 0, elite: false, speedMul: 1,
    bulletMul: 1, isBoss: true, bossWave: 6, scale: 1, fireTimer: 0, subPhase: 0, fireCount: 0, ...over,
  };
}

describe('sovereign gravityPull', () => {
  it('pulls a bullet toward the well', () => {
    // bullet to the right of the well → pull points left (−x)
    const g = gravityPull(100, 0, 0, 0, 1 / 60);
    expect(g.dvx).toBeLessThan(0);
    expect(Math.abs(g.dvy)).toBeLessThan(1e-9);
  });

  it('pulls harder when closer (softened ~1/d field)', () => {
    const near = gravityPull(40, 0, 0, 0, 1 / 60);
    const far = gravityPull(400, 0, 0, 0, 1 / 60);
    expect(Math.abs(near.dvx)).toBeGreaterThan(Math.abs(far.dvx));
  });

  it('scales with dt', () => {
    const a = gravityPull(200, 0, 0, 0, 1 / 60);
    const b = gravityPull(200, 0, 0, 0, 2 / 60);
    expect(Math.abs(b.dvx)).toBeCloseTo(Math.abs(a.dvx) * 2, 6);
  });

  it('does not blow up at the well centre', () => {
    const g = gravityPull(0, 0, 0, 0, 1 / 60);
    expect(Number.isFinite(g.dvx)).toBe(true);
    expect(Number.isFinite(g.dvy)).toBe(true);
  });
});

describe('sovereign coreOrbitPos', () => {
  it('places cores on the orbit radius', () => {
    for (let i = 0; i < 3; i++) {
      const p = coreOrbitPos(100, 100, 0, i, 3, 120);
      expect(Math.hypot(p.x - 100, p.y - 100)).toBeCloseTo(120, 6);
    }
  });

  it('spaces N cores evenly (2π/N apart)', () => {
    const a0 = coreOrbitPos(0, 0, 0, 0, 3, 100).angle;
    const a1 = coreOrbitPos(0, 0, 0, 1, 3, 100).angle;
    expect(a1 - a0).toBeCloseTo((2 * Math.PI) / 3, 6);
  });
});

describe('sovereign beamHitsPoint', () => {
  it('hits a point on the beam line', () => {
    // base beam along +x axis through origin: a point on +x is on the line
    expect(beamHitsPoint(0, 0, 0, 1, 16, 300, 0)).toBe(true);
  });

  it('misses a point in the safe wedge', () => {
    // single beam along +x; a point straight up is far from the line
    expect(beamHitsPoint(0, 0, 0, 1, 16, 0, 300)).toBe(false);
  });

  it('a 2-arm star (4 spokes) catches the perpendicular direction the single beam missed', () => {
    // arms=2 → beams along 0 and π/2 → the up direction is now ON a beam
    expect(beamHitsPoint(0, 0, 0, 2, 16, 0, 300)).toBe(true);
  });

  it('respects the half-width tolerance', () => {
    expect(beamHitsPoint(0, 0, 0, 1, 16, 100, 15)).toBe(true); // within 16
    expect(beamHitsPoint(0, 0, 0, 1, 16, 100, 20)).toBe(false); // outside 16
  });
});

describe('sovereign phase predicates', () => {
  it('armored everywhere except the exposed phase', () => {
    expect(sovereignBodyArmored(mkBoss({ phase: 0 }))).toBe(true);
    expect(sovereignBodyArmored(mkBoss({ phase: 1 }))).toBe(true);
    expect(sovereignBodyArmored(mkBoss({ phase: 2 }))).toBe(false);
    expect(isSovereignExposed(mkBoss({ phase: 2 }))).toBe(true);
    expect(isSovereignExposed(mkBoss({ phase: 0 }))).toBe(false);
  });

  it('beams are lethal only in phase 0 sub-phase 1', () => {
    expect(sovereignBeamActive(mkBoss({ phase: 0, subPhase: 1 }))).toBe(true);
    expect(sovereignBeamActive(mkBoss({ phase: 0, subPhase: 0 }))).toBe(false);
    expect(sovereignBeamActive(mkBoss({ phase: 1, subPhase: 1 }))).toBe(false);
  });

  it('predicates ignore non-sovereign enemies', () => {
    const warden = mkBoss({ kind: 'warden', phase: 2 });
    expect(isSovereignExposed(warden)).toBe(false);
    expect(sovereignBodyArmored(warden)).toBe(false);
  });

  it('exposeSovereign opens a timed punish window', () => {
    const e = mkBoss({ phase: 0, timer: 3, subPhase: 2 });
    exposeSovereign(e);
    expect(e.phase).toBe(2);
    expect(e.timer).toBe(SOVEREIGN.exposeDuration);
    expect(e.subPhase).toBe(0);
    expect(isSovereignExposed(e)).toBe(true);
  });
});

describe('sovereign finale', () => {
  it('enters finale below the finale HP fraction', () => {
    expect(sovereignFinale(mkBoss({ hp: 6, maxHp: 30 }))).toBe(true); // 0.20 < 0.25
    expect(sovereignFinale(mkBoss({ hp: 20, maxHp: 30 }))).toBe(false); // 0.67
  });
  it('is exactly bounded at the finale fraction (not inclusive)', () => {
    const atFrac = SOVEREIGN.finaleFrac * 30;
    expect(sovereignFinale(mkBoss({ hp: atFrac, maxHp: 30 }))).toBe(false); // == frac is not below
    expect(sovereignFinale(mkBoss({ hp: atFrac - 0.01, maxHp: 30 }))).toBe(true);
  });
  it('ignores non-sovereign enemies even at low HP', () => {
    expect(sovereignFinale(mkBoss({ kind: 'warden', hp: 1, maxHp: 30 }))).toBe(false);
  });
});

describe('nova spiral telegraph', () => {
  it('ramps 0 → 1 over the telegraph as fireTimer counts down', () => {
    expect(novaSpiralTelegraphFrac(SOVEREIGN.spiralTelegraph)).toBeCloseTo(0, 6); // just entered
    expect(novaSpiralTelegraphFrac(SOVEREIGN.spiralTelegraph / 2)).toBeCloseTo(0.5, 6);
    expect(novaSpiralTelegraphFrac(0)).toBeCloseTo(1, 6); // wind-up complete → about to arm
  });
  it('clamps outside the window', () => {
    expect(novaSpiralTelegraphFrac(SOVEREIGN.spiralTelegraph * 2)).toBe(0);
    expect(novaSpiralTelegraphFrac(-1)).toBe(1);
  });
});
