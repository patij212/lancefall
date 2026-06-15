import { describe, it, expect } from 'vitest';
import {
  bossName,
  isBossKind,
  beaconBeamActive,
  mirrorbladeDashing,
  hollowSyncActive,
  isBossLethal,
} from './boss';
import type { Enemy } from './types';

// The predicates below only ever read kind / phase / subPhase. We cast a partial
// stub so each test states exactly the state under test.
function enemy(kind: Enemy['kind'], phase = 0, subPhase = 0): Enemy {
  return { kind, phase, subPhase } as Enemy;
}

describe('bossName', () => {
  it('maps each boss kind to its incoming-warning name', () => {
    expect(bossName('warden')).toBe('THE WARDEN');
    expect(bossName('weaver')).toBe('THE WEAVER');
    expect(bossName('beacon')).toBe('THE BEACON');
    expect(bossName('mirrorblade')).toBe('THE MIRRORBLADE');
    expect(bossName('hollow')).toBe('THE HOLLOW');
    expect(bossName('sovereign')).toBe('THE SOVEREIGN');
  });

  it('defaults unknown / chaff kinds to THE WARDEN', () => {
    expect(bossName('drifter')).toBe('THE WARDEN');
  });
});

describe('isBossKind', () => {
  it('is true for the six real boss kinds', () => {
    for (const k of ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign']) {
      expect(isBossKind(k)).toBe(true);
    }
  });

  it('is false for chaff and boss sub-entities', () => {
    expect(isBossKind('drifter')).toBe(false);
    expect(isBossKind('hollow_echo')).toBe(false);
    expect(isBossKind('sovereign_core')).toBe(false);
    expect(isBossKind('')).toBe(false);
  });
});

describe('beaconBeamActive', () => {
  it('is lethal only on the beacon during its active sweep sub-phase', () => {
    expect(beaconBeamActive(enemy('beacon', 0, 1))).toBe(true);
  });
  it('is inactive on the wrong phase / sub-phase', () => {
    expect(beaconBeamActive(enemy('beacon', 0, 0))).toBe(false);
    expect(beaconBeamActive(enemy('beacon', 1, 1))).toBe(false);
  });
  it('is never active for a non-beacon boss in the same state', () => {
    expect(beaconBeamActive(enemy('warden', 0, 1))).toBe(false);
  });
});

describe('mirrorbladeDashing', () => {
  it('is true only for the mirrorblade in its lunge phase', () => {
    expect(mirrorbladeDashing(enemy('mirrorblade', 1))).toBe(true);
    expect(mirrorbladeDashing(enemy('mirrorblade', 0))).toBe(false);
    expect(mirrorbladeDashing(enemy('weaver', 1))).toBe(false);
  });
});

describe('hollowSyncActive', () => {
  it('is true only for the hollow in its clone-sync window', () => {
    expect(hollowSyncActive(enemy('hollow', 2))).toBe(true);
    expect(hollowSyncActive(enemy('hollow', 1))).toBe(false);
    expect(hollowSyncActive(enemy('beacon', 2))).toBe(false);
  });
});

describe('isBossLethal', () => {
  it('a generic boss body is always contact-lethal', () => {
    expect(isBossLethal(enemy('warden'))).toBe(true);
    expect(isBossLethal(enemy('weaver'))).toBe(true);
    expect(isBossLethal(enemy('sovereign'))).toBe(true);
  });

  it('the mirrorblade is lethal only mid-lunge', () => {
    expect(isBossLethal(enemy('mirrorblade', 1))).toBe(true);
    expect(isBossLethal(enemy('mirrorblade', 0))).toBe(false);
  });

  it('the hollow is an intangible phantom — never contact-lethal', () => {
    expect(isBossLethal(enemy('hollow', 0))).toBe(false);
    expect(isBossLethal(enemy('hollow', 2))).toBe(false);
  });
});
