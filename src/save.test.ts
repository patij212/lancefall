import { describe, it, expect } from 'vitest';
import { defaultSave, defaultSettings, sanitizeSettings } from './save';

describe('settings — tutorial hints toggle', () => {
  it('defaults tutorialHints ON (a new player gets taught)', () => {
    expect(defaultSettings().tutorialHints).toBe(true);
  });

  it('preserves an explicit false and coerces a non-boolean back to the default', () => {
    expect(sanitizeSettings({ tutorialHints: false }).tutorialHints).toBe(false);
    expect(sanitizeSettings({ tutorialHints: 'no' }).tutorialHints).toBe(true);
    expect(sanitizeSettings({}).tutorialHints).toBe(true);
  });
});

describe('settings — touch fields', () => {
  it('defaults are safe', () => {
    const d = defaultSettings();
    expect(d.inputMode).toBe('auto');
    expect(d.assistMode).toBe('subtle');
    expect(d.haptics).toBe(true);
    expect(d.mirrorTouch).toBe(false);
    expect(d.touchScale).toBe('m');
  });
  it('sanitize keeps valid values and rejects junk', () => {
    const s = sanitizeSettings({ inputMode: 'touch', assistMode: 'strong', haptics: false, mirrorTouch: true, touchScale: 'l' });
    expect(s.inputMode).toBe('touch');
    expect(s.assistMode).toBe('strong');
    expect(s.haptics).toBe(false);
    expect(s.mirrorTouch).toBe(true);
    expect(s.touchScale).toBe('l');
    const bad = sanitizeSettings({ inputMode: 'xx', assistMode: 9, touchScale: 'huge' });
    expect(bad.inputMode).toBe('auto');
    expect(bad.assistMode).toBe('subtle');
    expect(bad.touchScale).toBe('m');
  });
});

describe('defaultSave — act-two onboarding field', () => {
  it('starts with an empty taught set', () => {
    expect(defaultSave().taught).toEqual([]);
  });
});

describe('defaultSave — v9 dossier fields', () => {
  it('seeds the new tracking fields empty', () => {
    const s = defaultSave();
    expect(s.runHistory).toEqual([]);
    expect(s.playDays).toEqual({});
    expect(s.lifeTimeSec).toBe(0);
    expect(s.runsByMode).toEqual({});
    expect(s.winsByMode).toEqual({});
  });
});
