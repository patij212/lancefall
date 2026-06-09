import { describe, it, expect } from 'vitest';
import { RELICS, RELIC_IDS, availableRelics, describeRelics } from './relics';
import type { RelicId } from './relics';
import { deriveStats } from './perks';
import { rollDraftCards, isRelic } from './evolutions';
import { createRng } from './rng';

describe('cursed relics', () => {
  it('every relic is self-consistent and double-edged-flagged', () => {
    for (const id of RELIC_IDS) {
      expect(RELICS[id].id).toBe(id);
      expect(RELICS[id].isRelic).toBe(true);
    }
  });

  it('availableRelics excludes taken; describeRelics lists names', () => {
    expect(availableRelics(['glassspear']).map((r) => r.id)).not.toContain('glassspear');
    expect(describeRelics(['glassspear', 'zealot'])).toBe('GLASS SPEAR, ZEALOT');
  });

  it('GLASS SPEAR doubles dash cost and extends reach', () => {
    const base = deriveStats({});
    const r = deriveStats({}, undefined, undefined, undefined, (s) => RELICS.glassspear.apply(s));
    expect(r.dashCostMul).toBeCloseTo(base.dashCostMul * 2);
    expect(r.dashLenMul).toBeGreaterThan(base.dashLenMul);
  });

  it('BERSERKER trades a stamina segment for damage; never below 1', () => {
    const r = deriveStats({}, undefined, undefined, undefined, (s) => RELICS.berserker.apply(s));
    const base = deriveStats({});
    expect(r.dashDamage).toBe(base.dashDamage + 2);
    expect(r.staminaSegments).toBe(Math.max(1, base.staminaSegments - 1));
    expect(r.staminaSegments).toBeGreaterThanOrEqual(1);
  });

  it('relic offer consumes a FIXED rng amount regardless of taken set (Daily-safe)', () => {
    // same seed, different taken sets → the seeded stream must end in the same place
    const a = createRng(555);
    rollDraftCards(a, {}, [], 3, { relicChance: 0.5, takenRelics: [] });
    const afterA = a.next();
    const b = createRng(555);
    rollDraftCards(b, {}, [], 3, { relicChance: 0.5, takenRelics: RELIC_IDS.slice() as RelicId[] });
    const afterB = b.next();
    expect(afterA).toBe(afterB);
  });

  it('relicChance=1 with no relics taken injects a relic into the draft', () => {
    let sawRelic = false;
    for (let seed = 0; seed < 30 && !sawRelic; seed++) {
      const cards = rollDraftCards(createRng(seed), {}, [], 3, { relicChance: 1, takenRelics: [] });
      if (cards.some(isRelic)) sawRelic = true;
    }
    expect(sawRelic).toBe(true);
  });

  it('relicChance=0 never injects a relic', () => {
    for (let seed = 0; seed < 20; seed++) {
      const cards = rollDraftCards(createRng(seed), {}, [], 3, { relicChance: 0 });
      expect(cards.some(isRelic)).toBe(false);
    }
  });
});
