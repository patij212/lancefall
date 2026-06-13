import { describe, it, expect } from 'vitest';
import { bossTheme, BOSS_THEMES } from './bossThemes';
import { PENTA } from './musicScore';
import type { EnemyKind } from './types';

const BOSS_KINDS: EnemyKind[] = ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign'];

describe('bossThemes', () => {
  it('every boss has a complete, distinct theme', () => {
    for (const k of BOSS_KINDS) {
      const t = bossTheme(k);
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.drone.length).toBeGreaterThan(0);
      expect(typeof t.detune).toBe('number');
      expect(t.arpMul).toBeGreaterThan(0);
    }
  });

  it('drone chords are distinct across bosses', () => {
    const sigs = BOSS_KINDS.map((k) => bossTheme(k).drone.join(','));
    expect(new Set(sigs).size).toBe(BOSS_KINDS.length);
  });

  it('the Sovereign gets the grandest (most voices) chord', () => {
    const sov = bossTheme('sovereign').drone.length;
    for (const k of BOSS_KINDS) {
      if (k !== 'sovereign') expect(sov).toBeGreaterThanOrEqual(bossTheme(k).drone.length);
    }
    expect(sov).toBe(4);
  });

  it('falls back to the Warden tritone for a non-boss / unknown kind', () => {
    expect(bossTheme('darter').name).toBe('WARDEN');
    expect(bossTheme('darter').drone).toEqual([6]);
  });

  it('intervals are sane semitone offsets', () => {
    for (const k of BOSS_KINDS) {
      for (const semi of bossTheme(k).drone) {
        expect(semi).toBeGreaterThanOrEqual(0);
        expect(semi).toBeLessThanOrEqual(24);
      }
    }
  });

  it('BOSS_THEMES only contains real boss kinds', () => {
    for (const key of Object.keys(BOSS_THEMES)) {
      expect(BOSS_KINDS).toContain(key as EnemyKind);
    }
  });

  it('every boss has a well-formed 8-step lead motif', () => {
    for (const k of BOSS_KINDS) {
      const t = bossTheme(k);
      expect(t.motif).toHaveLength(8);
      for (const idx of t.motif) {
        // -1 = rest, otherwise a valid PENTA index
        expect(idx === -1 || (idx >= 0 && idx < PENTA.length)).toBe(true);
      }
      expect(t.motif.some((i) => i >= 0)).toBe(true); // not all rests
      expect(t.motifGain).toBeGreaterThan(0);
      expect([1, 2]).toContain(t.motifOct);
    }
  });

  it('motif contours are distinct across bosses (you hear who you fight)', () => {
    const sigs = BOSS_KINDS.map((k) => bossTheme(k).motif.join(','));
    expect(new Set(sigs).size).toBe(BOSS_KINDS.length);
  });

  it('the fallback theme also carries a valid motif', () => {
    const fb = bossTheme('darter');
    expect(fb.motif).toHaveLength(8);
    expect(fb.motif.some((i) => i >= 0)).toBe(true);
  });
});
