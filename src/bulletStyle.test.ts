import { describe, it, expect } from 'vitest';
import { bulletVisual } from './bulletStyle';

// Playtest (Nick): bullets need individuality per enemy + shot type, not colour alone.
// bulletVisual resolves the render silhouette: homing (SEEKER) + boss fire are derived from
// existing Bullet fields (no per-spawn tag needed), while dart/mine come from an explicit
// b.shot tag. Precedence matters — a curving homing threat must ALWAYS read as a comet.
const base = { homing: 0, fromBoss: false, shot: undefined as 'orb' | 'dart' | 'mine' | undefined };

describe('bulletVisual — per-shot-type silhouette resolution', () => {
  it('defaults to orb for plain chaff fire', () => {
    expect(bulletVisual({ ...base })).toBe('orb');
  });
  it('a homing bolt is a comet regardless of other tags (the SEEKER must look distinct)', () => {
    expect(bulletVisual({ ...base, homing: 1 })).toBe('comet');
    expect(bulletVisual({ ...base, homing: 1, fromBoss: true, shot: 'dart' })).toBe('comet');
  });
  it('boss fire reads heavy when not homing', () => {
    expect(bulletVisual({ ...base, fromBoss: true })).toBe('bossHeavy');
    expect(bulletVisual({ ...base, fromBoss: true, shot: 'dart' })).toBe('bossHeavy');
  });
  it('explicit per-shot tags map through for chaff', () => {
    expect(bulletVisual({ ...base, shot: 'dart' })).toBe('dart');
    expect(bulletVisual({ ...base, shot: 'mine' })).toBe('mine');
  });
});
