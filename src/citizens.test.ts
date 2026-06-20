// src/citizens.test.ts — THE CITY REMEMBERS. Tests for the citizens roster + woken derive.
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { INTERCEPTS, interceptWords, vocabulary } from './intercepts';
import { CITIZENS, wokenCitizens, cityRememberedCount } from './citizens';

const TRANSMISSION_IDS = new Set(INTERCEPTS.map((i) => i.id));
const FIGURES = new Set(['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign']);

describe('CITIZENS roster', () => {
  it('has 16 citizens with unique ids and non-empty memory + deeper text', () => {
    expect(CITIZENS).toHaveLength(16);
    expect(new Set(CITIZENS.map((c) => c.id)).size).toBe(16);
    for (const c of CITIZENS) {
      expect(c.name).toBeTruthy(); expect(c.role).toBeTruthy();
      expect(c.memory.length).toBeGreaterThan(20);
      expect(c.deeper.length).toBeGreaterThan(20);
    }
  });
  it('every wakeBy is a real transmission id or a milestone key; every figure is real', () => {
    for (const c of CITIZENS) {
      const ok = TRANSMISSION_IDS.has(c.wakeBy) || c.wakeBy === 'm50' || c.wakeBy === 'm75';
      expect(ok).toBe(true);
      if (c.figure) expect(FIGURES.has(c.figure)).toBe(true);
    }
  });
  it('every transmission wakes exactly one citizen', () => {
    for (const ic of INTERCEPTS) {
      expect(CITIZENS.filter((c) => c.wakeBy === ic.id)).toHaveLength(1);
    }
  });
});

describe('wokenCitizens', () => {
  it('none woken on a fresh save; rises as transmissions complete', () => {
    const s = defaultSave();
    expect(wokenCitizens(s)).toHaveLength(0);
    // complete the warden transmission → its citizen wakes
    const warden = INTERCEPTS.find((i) => i.id === 'int-warden')!;
    s.decryptedWords.push(...interceptWords(warden));
    const woken = wokenCitizens(s);
    expect(woken.some((c) => c.wakeBy === 'int-warden')).toBe(true);
  });
  it('milestone citizens wake at 50%/75% master fraction', () => {
    const s = defaultSave();
    const vocab: string[] = vocabulary();
    s.decryptedWords = vocab.slice(0, Math.ceil(vocab.length * 0.5));
    expect(wokenCitizens(s).some((c) => c.wakeBy === 'm50')).toBe(true);
    expect(wokenCitizens(s).some((c) => c.wakeBy === 'm75')).toBe(false);
  });
  it('cityRememberedCount reports woken/total', () => {
    const s = defaultSave();
    expect(cityRememberedCount(s)).toEqual({ woken: 0, total: 16 });
  });
});
