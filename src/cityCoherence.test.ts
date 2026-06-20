import { describe, it, expect } from 'vitest';
import { cityCoherence, cityCoherenceTagline } from './cityCoherence';
import { defaultSave } from './save';
import { vocabulary } from './intercepts';
import { LORE } from './lore';
import { ACHIEVEMENTS } from './achievements';
import type { SaveData } from './save';

const fresh = (): SaveData => defaultSave();

describe('cityCoherenceTagline (bands)', () => {
  it('grey sleep at exactly 0', () => {
    expect(cityCoherenceTagline(0)).toBe('THE CITY SLEEPS IN GREY');
  });
  it('a few lights below 0.34', () => {
    expect(cityCoherenceTagline(0.01)).toBe('A FEW LIGHTS REMEMBER');
    expect(cityCoherenceTagline(0.33)).toBe('A FEW LIGHTS REMEMBER');
  });
  it('neon blooms in the middle band', () => {
    expect(cityCoherenceTagline(0.34)).toBe('NEON BLOOMS AS THE CITY REMEMBERS');
    expect(cityCoherenceTagline(0.66)).toBe('NEON BLOOMS AS THE CITY REMEMBERS');
  });
  it('almost whole in the upper band', () => {
    expect(cityCoherenceTagline(0.67)).toBe('THE CITY IS ALMOST WHOLE');
    expect(cityCoherenceTagline(0.99)).toBe('THE CITY IS ALMOST WHOLE');
  });
  it('the longest day at 1', () => {
    expect(cityCoherenceTagline(1)).toBe('THE LONGEST DAY · THE CITY IS WHOLE');
  });
});

describe('cityCoherence (save-derived)', () => {
  it('a fresh save reads ~0% and the GREY tagline', () => {
    const c = cityCoherence(fresh());
    expect(c.frac).toBe(0);
    expect(c.pct).toBe(0);
    expect(c.tagline).toBe('THE CITY SLEEPS IN GREY');
  });

  it('rises with decryption', () => {
    const s = fresh();
    const before = cityCoherence(s).frac;
    s.decryptedWords = vocabulary().slice(0, Math.ceil(vocabulary().length / 2));
    const after = cityCoherence(s).frac;
    expect(after).toBeGreaterThan(before);
    expect(after).toBeLessThan(1);
  });

  it('rises with lore remembered', () => {
    const s = fresh();
    const before = cityCoherence(s).frac;
    s.stillpointLore = LORE.slice(0, 3).map((l) => l.id);
    expect(cityCoherence(s).frac).toBeGreaterThan(before);
  });

  it('rises with achievements', () => {
    const s = fresh();
    const before = cityCoherence(s).frac;
    s.achievements = ACHIEVEMENTS.slice(0, 5).map((a) => a.id);
    expect(cityCoherence(s).frac).toBeGreaterThan(before);
  });

  it('rises with each arc milestone independently', () => {
    const base = cityCoherence(fresh()).frac;
    const boss = fresh(); boss.lifeBoss = 1;
    const choice = fresh(); choice.stillpointChoice = 'catch';
    const win = fresh(); win.lifeWins = 1;
    expect(cityCoherence(boss).frac).toBeGreaterThan(base);
    expect(cityCoherence(choice).frac).toBeGreaterThan(base);
    expect(cityCoherence(win).frac).toBeGreaterThan(base);
  });

  it('is monotonic — adding any input never lowers the fraction', () => {
    const s = fresh();
    let prev = cityCoherence(s).frac;
    s.decryptedWords = vocabulary().slice(0, 4);
    let next = cityCoherence(s).frac; expect(next).toBeGreaterThanOrEqual(prev); prev = next;
    s.stillpointLore = LORE.slice(0, 2).map((l) => l.id);
    next = cityCoherence(s).frac; expect(next).toBeGreaterThanOrEqual(prev); prev = next;
    s.achievements = ACHIEVEMENTS.slice(0, 2).map((a) => a.id);
    next = cityCoherence(s).frac; expect(next).toBeGreaterThanOrEqual(prev); prev = next;
    s.lifeWins = 1;
    next = cityCoherence(s).frac; expect(next).toBeGreaterThanOrEqual(prev);
  });

  it('a fully-restored save reads 100% + THE LONGEST DAY', () => {
    const s = fresh();
    s.decryptedWords = vocabulary();
    s.stillpointLore = LORE.map((l) => l.id);
    s.achievements = ACHIEVEMENTS.map((a) => a.id);
    s.lifeBoss = 9; s.lifeWins = 9; s.stillpointChoice = 'catch';
    const c = cityCoherence(s);
    expect(c.frac).toBe(1);
    expect(c.pct).toBe(100);
    expect(c.tagline).toBe('THE LONGEST DAY · THE CITY IS WHOLE');
  });

  it('is bounded — over-filled inputs never exceed 1 / 100', () => {
    const s = fresh();
    s.decryptedWords = [...vocabulary(), ...vocabulary()]; // duplicated, more than the vocab size
    s.stillpointLore = [...LORE.map((l) => l.id), 'extra-a', 'extra-b'];
    s.achievements = [...ACHIEVEMENTS.map((a) => a.id), 'extra-1', 'extra-2'];
    s.lifeBoss = 99; s.lifeWins = 99; s.stillpointChoice = 'fall';
    const c = cityCoherence(s);
    expect(c.frac).toBeLessThanOrEqual(1);
    expect(c.pct).toBeLessThanOrEqual(100);
  });
});
