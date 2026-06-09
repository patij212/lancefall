import { describe, it, expect } from 'vitest';
import { defaultSave } from './save';
import type { SaveData } from './save';
import { LORE, loreById, fragmentBalance, loreUnlocked, canUnlockLore } from './lore';
import { fragmentsForRun } from './stillpoint';

function saveWith(over: Partial<SaveData>): SaveData {
  return { ...defaultSave(), ...over };
}

describe('lore — THE FALL (Memory Fragments)', () => {
  it('LORE table is well-formed (unique ids, non-empty text, positive costs)', () => {
    const ids = new Set(LORE.map((l) => l.id));
    expect(ids.size).toBe(LORE.length); // unique
    for (const l of LORE) {
      expect(l.title.trim().length).toBeGreaterThan(0);
      expect(l.text.trim().length).toBeGreaterThan(20);
      expect(l.cost).toBeGreaterThan(0);
    }
    expect(loreById('what-remains')).toBeTruthy();
    expect(loreById('nope')).toBeUndefined();
  });

  it('fragmentBalance = collected − spent, floored at 0', () => {
    expect(fragmentBalance(saveWith({ stillpointFragments: ['a', 'b', 'c'], fragmentsSpent: 1 }))).toBe(2);
    expect(fragmentBalance(saveWith({ stillpointFragments: ['a'], fragmentsSpent: 5 }))).toBe(0);
    expect(fragmentBalance(defaultSave())).toBe(0);
  });

  it('canUnlockLore respects balance, cost, and already-unlocked', () => {
    const id = 'first-light';
    const cost = loreById(id)!.cost;
    expect(canUnlockLore(saveWith({ stillpointFragments: Array(cost).fill('f') }), id)).toBe(true);
    expect(canUnlockLore(saveWith({ stillpointFragments: [] }), id)).toBe(false); // can't afford
    expect(
      canUnlockLore(saveWith({ stillpointFragments: Array(cost).fill('f'), stillpointLore: [id] }), id),
    ).toBe(false); // already remembered
    expect(loreUnlocked(saveWith({ stillpointLore: [id] }), id)).toBe(true);
  });

  it('fragmentsForRun: always carries one, milestones gated, deterministic', () => {
    const base = fragmentsForRun({ runOrdinal: 7, bossKills: 0, deepestWave: 0, bestComboRun: 0, sovereignDown: false });
    expect(base).toEqual(['run-7']);
    const full = fragmentsForRun({ runOrdinal: 9, bossKills: 2, deepestWave: 12, bestComboRun: 40, sovereignDown: true });
    expect(full).toContain('run-9');
    expect(full).toEqual(expect.arrayContaining(['m-firstboss', 'm-deep', 'm-combo', 'm-sovereign']));
    // pure: same ctx → same ids
    expect(fragmentsForRun({ runOrdinal: 3, bossKills: 1, deepestWave: 0, bestComboRun: 0, sovereignDown: false })).toEqual(
      ['run-3', 'm-firstboss'],
    );
  });

  it('the milestone fragments are enough (with carries) to remember everything eventually', () => {
    const total = LORE.reduce((n, l) => n + l.cost, 0);
    // a determined player earns 1 carry/run + 4 one-time milestones; total cost is finite + reasonable
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThan(40); // unlockable in a sane number of descents
  });
});
