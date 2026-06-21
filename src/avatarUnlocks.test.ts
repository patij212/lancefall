import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { unlockedAvatarIds, isAvatarUnlocked } from './avatarUnlocks';
import { vocabulary } from './intercepts';
import { AVATAR_IDS } from './render/avatars';

const FREE = ['lance', 'ring', 'beat', 'fall', 'graze', 'comet', 'skyline', 'chevron'];

describe('avatarUnlocks', () => {
  it('a fresh save unlocks exactly the 8 free sigils', () => {
    const got = unlockedAvatarIds(defaultSave());
    expect([...got].sort()).toEqual([...FREE].sort());
  });

  it('the default avatar (lance) is always unlocked', () => {
    expect(isAvatarUnlocked('lance', defaultSave())).toBe(true);
  });

  it('felling a boss unlocks its crest', () => {
    const s = { ...defaultSave(), killsByKind: { warden: 1 } };
    expect(isAvatarUnlocked('warden', s)).toBe(true);
    expect(isAvatarUnlocked('weaver', s)).toBe(false);
  });

  it("THE CHOICE unlocks the Sovereign crest + the Stillpoint sigil", () => {
    const s = { ...defaultSave(), stillpointChoice: 'catch' as const };
    expect(isAvatarUnlocked('sovereign', s)).toBe(true);
    expect(isAvatarUnlocked('choice', s)).toBe(true);
  });

  it('pilot feats unlock by their counters', () => {
    expect(isAvatarUnlocked('heat', { ...defaultSave(), maxHeat: 5 })).toBe(true);
    expect(isAvatarUnlocked('heat', { ...defaultSave(), maxHeat: 4 })).toBe(false);
    expect(isAvatarUnlocked('daybreak', { ...defaultSave(), lifeDaybreaks: 50 })).toBe(true);
    expect(isAvatarUnlocked('lastbreath', { ...defaultSave(), lifeLastBreath: 25 })).toBe(true);
    expect(isAvatarUnlocked('solstice', { ...defaultSave(), winsByMode: { longestday: 1 } })).toBe(true);
  });

  it('decryption unlocks the cipher sigils', () => {
    const vocab = vocabulary();
    const quarter = { ...defaultSave(), decryptedWords: vocab.slice(0, Math.ceil(vocab.length * 0.25)) };
    expect(isAvatarUnlocked('codebreaker', quarter)).toBe(true);
    expect(isAvatarUnlocked('remember', quarter)).toBe(false);
    const all = { ...defaultSave(), decryptedWords: [...vocab] };
    expect(isAvatarUnlocked('remember', all)).toBe(true);
  });

  it('the Vigil sigil unlocks while holding the Vigil', () => {
    expect(isAvatarUnlocked('vigil', { ...defaultSave(), vigilSince: 3 })).toBe(true);
    expect(isAvatarUnlocked('vigil', defaultSave())).toBe(false); // vigilSince -1 by default
  });

  it('only ever returns ids that exist in the registry', () => {
    const valid = new Set(AVATAR_IDS);
    const everything = {
      ...defaultSave(),
      maxHeat: 7, lifeDaybreaks: 99, lifeLastBreath: 99, ngPlusLevel: 2,
      stillpointChoice: 'fall' as const,
      killsByKind: { warden: 1, weaver: 1, beacon: 1, mirrorblade: 1, hollow: 1, sovereign: 1 },
    };
    for (const id of unlockedAvatarIds(everything)) expect(valid.has(id)).toBe(true);
    expect(isAvatarUnlocked('eternal', everything)).toBe(true); // ngPlus + all six
  });
});
