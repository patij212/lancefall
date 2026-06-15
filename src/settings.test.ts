import { describe, it, expect } from 'vitest';
import { sanitizeSettings, defaultSettings } from './save';

// loadSettings previously did an untyped shallow spread of parsed JSON — a corrupted or
// hand-edited blob could inject wrong-typed / out-of-range values straight into the live
// game. sanitizeSettings now coerces field-by-field; these lock that down.

describe('sanitizeSettings', () => {
  it('non-objects fall back to defaults', () => {
    expect(sanitizeSettings(null)).toEqual(defaultSettings());
    expect(sanitizeSettings('nonsense')).toEqual(defaultSettings());
    expect(sanitizeSettings(42)).toEqual(defaultSettings());
  });

  it('clamps out-of-range numbers', () => {
    const s = sanitizeSettings({ master: 9, sfx: -3, hudScale: 99, chromAberration: 2, shake: 100 });
    expect(s.master).toBe(1);
    expect(s.sfx).toBe(0);
    expect(s.hudScale).toBe(1.4);
    expect(s.chromAberration).toBe(1);
    expect(s.shake).toBe(1.5);
  });

  it('rejects wrong-typed values, keeping the default', () => {
    const d = defaultSettings();
    const s = sanitizeSettings({ master: 'loud', reduceMotion: 'yes', rumble: 1, music: NaN });
    expect(s.master).toBe(d.master);
    expect(s.reduceMotion).toBe(d.reduceMotion);
    expect(s.rumble).toBe(d.rumble);
    expect(s.music).toBe(d.music);
  });

  it('rejects invalid enum members', () => {
    const d = defaultSettings();
    const s = sanitizeSettings({ particleDensity: 'ultra', dashStyle: 'rocket', soundtrack: 'metal' });
    expect(s.particleDensity).toBe(d.particleDensity);
    expect(s.dashStyle).toBe(d.dashStyle);
    expect(s.soundtrack).toBe(d.soundtrack);
  });

  it('preserves valid values', () => {
    const valid = { ...defaultSettings(), master: 0.5, reduceMotion: true, particleDensity: 'low' as const, dashStyle: 'slingshot' as const };
    expect(sanitizeSettings(valid)).toEqual(valid);
  });

  it('ignores unknown extra keys (no leak-through)', () => {
    const s = sanitizeSettings({ ...defaultSettings(), hackerField: 'pwned' }) as unknown as Record<string, unknown>;
    expect(s.hackerField).toBeUndefined();
  });
});
