// src/intel.test.ts
import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import { INTERCEPTS, interceptWords } from './intercepts';
import { bossIntel, BOSS_TRANSMISSION, INTEL_DAMAGE, INTEL_TELL } from './intel';

function decryptIntercept(save: ReturnType<typeof defaultSave>, id: string) {
  const ic = INTERCEPTS.find((i) => i.id === id)!;
  save.decryptedWords.push(...interceptWords(ic));
}

describe('bossIntel', () => {
  it('zero bonuses until the boss transmission is fully decrypted', () => {
    const s = defaultSave();
    const r = bossIntel(s, 'warden');
    expect(r.decrypted).toBe(false);
    expect(r.damageBonus).toBe(0);
    expect(r.tellBonus).toBe(0);
  });
  it('grants the fixed bonuses once the mapped transmission is complete', () => {
    const s = defaultSave();
    decryptIntercept(s, BOSS_TRANSMISSION.warden!);
    const r = bossIntel(s, 'warden');
    expect(r.decrypted).toBe(true);
    expect(r.damageBonus).toBe(INTEL_DAMAGE);
    expect(r.tellBonus).toBe(INTEL_TELL);
  });
  it('maps all six bosses to a real transmission id', () => {
    for (const id of Object.values(BOSS_TRANSMISSION)) {
      expect(INTERCEPTS.some((i) => i.id === id)).toBe(true);
    }
  });
  it('is a pure read (does not mutate save)', () => {
    const s = defaultSave();
    const before = JSON.stringify(s);
    bossIntel(s, 'sovereign');
    expect(JSON.stringify(s)).toBe(before);
  });
});
