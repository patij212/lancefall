import { describe, it, expect } from 'vitest';
import { beaconBeamActive, beaconEnraged, beaconSweepTightnessFrac } from './beacon';
import { beamHitsPoint } from '../sovereign';
import { BEACON } from '../tune';
import type { Enemy } from '../types';

const mk = (over: Partial<Enemy>): Enemy => ({ kind: 'beacon', phase: 0, subPhase: 0, hp: 30, maxHp: 30, ...over } as Enemy);

describe('beacon predicates', () => {
  it('beam is lethal only during the active sweep sub-phase', () => {
    expect(beaconBeamActive(mk({ phase: 0, subPhase: 1 }))).toBe(true);
    expect(beaconBeamActive(mk({ phase: 0, subPhase: 0 }))).toBe(false);
    expect(beaconBeamActive(mk({ phase: 1, subPhase: 1 }))).toBe(false);
  });
  it('enrages below the HP fraction (and never for a non-beacon)', () => {
    expect(beaconEnraged(mk({ hp: 30 }))).toBe(false);
    expect(beaconEnraged(mk({ hp: BEACON.enrageFrac * 30 - 0.1 }))).toBe(true);
    expect(beaconEnraged(mk({ kind: 'warden', hp: 1 }))).toBe(false);
  });
});

describe('beacon sweep tightness (dash-through pressure)', () => {
  it('is 1 (unchanged rest window) above the enrage threshold', () => {
    expect(beaconSweepTightnessFrac(mk({ hp: 30 }))).toBe(1);
    expect(beaconSweepTightnessFrac(mk({ hp: BEACON.enrageFrac * 30 + 0.1 }))).toBe(1);
  });
  it('shrinks the rest window to offDurEnragedMul below the threshold (forces dash-through)', () => {
    expect(beaconSweepTightnessFrac(mk({ hp: BEACON.enrageFrac * 30 - 0.1 }))).toBe(BEACON.offDurEnragedMul);
    expect(BEACON.offDurEnragedMul).toBeLessThan(1);
  });
  it('never tightens a non-beacon', () => {
    expect(beaconSweepTightnessFrac(mk({ kind: 'warden', hp: 1 }))).toBe(1);
  });
});

describe('beacon enraged cross geometry (beamHitsPoint arms=2)', () => {
  const halfW = BEACON.beamWidth / 2 + 9;
  it('arms=1 (normal) misses the perpendicular direction', () => {
    // single beam along +x; a point straight up is safe
    expect(beamHitsPoint(0, 0, 0, 1, halfW, 0, 300)).toBe(false);
  });
  it('arms=2 (enraged cross) catches the perpendicular the single beam missed', () => {
    expect(beamHitsPoint(0, 0, 0, 2, halfW, 0, 300)).toBe(true);
  });
});
