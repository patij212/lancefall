import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';

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
