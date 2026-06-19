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
