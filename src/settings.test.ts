import { describe, it, expect } from 'vitest';
import { sanitizeSettings, defaultSettings, sanitizeHandle } from './save';

// loadSettings previously did an untyped shallow spread of parsed JSON — a corrupted or
// hand-edited blob could inject wrong-typed / out-of-range values straight into the live
// game. sanitizeSettings now coerces field-by-field; these lock that down.

// Playtest (Nick): "work on the anon player name." The handle sanitizer is shared by the
// in-game setter + the live RANKS preview (and mirrored by the worker), and must trim BEFORE
// the 16-char cap so leading spaces can't eat real characters. '' = anonymous (not 'ANON').
describe('sanitizeHandle', () => {
  it('keeps word chars, spaces, hyphens; caps at 16', () => {
    expect(sanitizeHandle('Lance_99 X')).toBe('Lance_99 X');
    expect(sanitizeHandle('a'.repeat(30)).length).toBe(16);
  });
  it('strips disallowed characters', () => {
    expect(sanitizeHandle('<script>')).toBe('script');
    expect(sanitizeHandle('hi!@#$%^&*()')).toBe('hi');
  });
  it('trims BEFORE the cap so leading spaces never eat real characters', () => {
    expect(sanitizeHandle('   abcdefghijklmnop')).toBe('abcdefghijklmnop'); // 16 real chars survive
  });
  it('blank or all-junk → empty (the not-set / anonymous sentinel, NOT "ANON")', () => {
    expect(sanitizeHandle('')).toBe('');
    expect(sanitizeHandle('   ')).toBe('');
    expect(sanitizeHandle('!!!')).toBe('');
  });
});

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
    expect(s.hudScale).toBe(1.8);
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
    const s = sanitizeSettings({ particleDensity: 'ultra', dashStyle: 'rocket', soundtrack: 'metal', hudLayout: 'floating' });
    expect(s.particleDensity).toBe(d.particleDensity);
    expect(s.dashStyle).toBe(d.dashStyle);
    expect(s.soundtrack).toBe(d.soundtrack);
    expect(s.hudLayout).toBe(d.hudLayout); // 'floating' → default 'edges'
  });

  it('defaults the HUD layout to edges', () => {
    expect(defaultSettings().hudLayout).toBe('edges');
  });

  it('preserves valid values', () => {
    const valid = { ...defaultSettings(), master: 0.5, reduceMotion: true, particleDensity: 'low' as const, dashStyle: 'slingshot' as const };
    expect(sanitizeSettings(valid)).toEqual(valid);
  });

  it('ignores unknown extra keys (no leak-through)', () => {
    const s = sanitizeSettings({ ...defaultSettings(), hackerField: 'pwned' }) as unknown as Record<string, unknown>;
    expect(s.hackerField).toBeUndefined();
  });

  it('defaults include a keymap for the core actions', () => {
    const d = defaultSettings();
    expect(d.keymap.dash).toContain(' ');
    expect(d.keymap.overdrive.length).toBeGreaterThan(0);
    expect(d.keymap.pause).toContain('escape');
  });

  it('accepts a valid rebound keymap (deduped + lowercased)', () => {
    const s = sanitizeSettings({ keymap: { dash: ['Q', 'q'], overdrive: ['E'], pause: ['Tab'] } });
    expect(s.keymap.dash).toEqual(['q']); // 'Q' lowercased, duplicate dropped
    expect(s.keymap.overdrive).toEqual(['e']);
    expect(s.keymap.pause).toEqual(['tab']);
  });

  it('falls back to default for an empty / wrong-typed action so nothing is ever unbound', () => {
    const d = defaultSettings();
    const s = sanitizeSettings({ keymap: { dash: [], overdrive: 'nope', pause: [42, null] } });
    expect(s.keymap.dash).toEqual(d.keymap.dash); // empty → default
    expect(s.keymap.overdrive).toEqual(d.keymap.overdrive); // wrong type → default
    expect(s.keymap.pause).toEqual(d.keymap.pause); // no valid strings → default
  });

  it('a missing keymap object falls back to the full default', () => {
    const d = defaultSettings();
    expect(sanitizeSettings({ master: 0.5 }).keymap).toEqual(d.keymap);
  });

  it('defaults Boss Rush ciphers ON, and tolerates a missing/garbage flag', () => {
    expect(defaultSettings().bossRushCiphers).toBe(true);
    expect(sanitizeSettings({}).bossRushCiphers).toBe(true); // missing → default true
    expect(sanitizeSettings({ bossRushCiphers: 'yes' }).bossRushCiphers).toBe(true); // wrong type → default
    expect(sanitizeSettings({ bossRushCiphers: false }).bossRushCiphers).toBe(false); // explicit false round-trips
  });
});
