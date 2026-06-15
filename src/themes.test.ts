import { describe, it, expect } from 'vitest';
import { THEMES, themeById } from './themes';

describe('themeById', () => {
  it('returns the matching theme for a known id', () => {
    for (const t of THEMES) {
      expect(themeById(t.id)).toBe(t);
    }
  });

  it('falls back to the first (default NEON) theme for an unknown id', () => {
    expect(themeById('not-a-real-theme')).toBe(THEMES[0]);
    expect(themeById('')).toBe(THEMES[0]);
  });

  it('the default theme is free (NEON, unlockShards 0)', () => {
    expect(THEMES[0].id).toBe('neon');
    expect(THEMES[0].unlockShards).toBe(0);
  });
});

describe('THEMES table integrity', () => {
  it('has unique ids', () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every theme ships three nebula tints', () => {
    for (const t of THEMES) {
      expect(t.nebula).toHaveLength(3);
    }
  });

  it('exposes valid hex accents for every theme', () => {
    const hex = /^#[0-9a-fA-F]{6}$/;
    for (const t of THEMES) {
      expect(t.accent).toMatch(hex);
      expect(t.accent2).toMatch(hex);
      for (const n of t.nebula) expect(n).toMatch(hex);
    }
  });
});
