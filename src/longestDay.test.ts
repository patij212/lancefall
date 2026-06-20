import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { vocabulary } from './intercepts';
import { grantLongestDayRewards } from './longestDay';
import { SHIPS } from './ships';

describe('grantLongestDayRewards', () => {
  it('grants nothing until 100%', () => {
    const s = defaultSave();
    expect(grantLongestDayRewards(s)).toEqual([]);
    expect(s.unlockedTrails).not.toContain('dawn');
  });
  it('at 100% grants trail+palette+achievement+lastkey for every ship, once', () => {
    const s = defaultSave();
    s.decryptedWords = [...vocabulary()];
    const granted = grantLongestDayRewards(s);
    expect(granted.length).toBeGreaterThan(0);
    expect(s.unlockedTrails).toContain('dawn');
    expect(s.unlockedThemes).toContain('decrypted');
    expect(s.achievements).toContain('longestday-read');
    for (const ship of SHIPS) expect(s.unlockedShipSkins).toContain(`${ship.id}:lastkey`);
    // idempotent: a second call grants nothing new
    expect(grantLongestDayRewards(s)).toEqual([]);
  });
});
