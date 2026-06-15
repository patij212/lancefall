import { describe, it, expect } from 'vitest';
import { COMBO_TIERS, crossedComboTier } from './comboTiers';
import { COHERENCE } from './tune';

describe('COMBO_TIERS table', () => {
  it('single-sources its thresholds from COHERENCE.tierCombo', () => {
    expect(COMBO_TIERS.map((t) => t.at)).toEqual(COHERENCE.tierCombo);
  });

  it('is ordered low → high by threshold', () => {
    for (let i = 1; i < COMBO_TIERS.length; i++) {
      expect(COMBO_TIERS[i].at).toBeGreaterThan(COMBO_TIERS[i - 1].at);
    }
  });

  it('every tier has a name and a color', () => {
    for (const t of COMBO_TIERS) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('crossedComboTier', () => {
  const [t0, t1] = COHERENCE.tierCombo;

  it('returns null below the first threshold', () => {
    expect(crossedComboTier(0, 0)).toBeNull();
    expect(crossedComboTier(t0 - 1, 0)).toBeNull();
  });

  it('fires the first tier exactly at its threshold', () => {
    const t = crossedComboTier(t0, 0);
    expect(t).not.toBeNull();
    expect(t!.at).toBe(t0);
    expect(t!.name).toBe('RAMPAGE');
  });

  it('does not re-announce an already-latched tier', () => {
    // lastTierAnnounced === t0 means RAMPAGE already fired; combo still at t0
    expect(crossedComboTier(t0, t0)).toBeNull();
  });

  it('announces the next tier once the combo climbs past it', () => {
    const t = crossedComboTier(t1, t0);
    expect(t).not.toBeNull();
    expect(t!.at).toBe(t1);
  });

  it('announces only the TOP tier when a single step vaults past several', () => {
    // jump straight to the highest threshold from a cold combo — only LEGENDARY
    const top = COMBO_TIERS[COMBO_TIERS.length - 1];
    const t = crossedComboTier(top.at, 0);
    expect(t).not.toBeNull();
    expect(t!.at).toBe(top.at);
    expect(t!.name).toBe(top.name);
  });

  it('matches the original high→low first-match loop for every combo value', () => {
    // brute-force oracle mirroring the pre-extraction inlined loop
    const oracle = (combo: number, last: number) => {
      for (let i = COMBO_TIERS.length - 1; i >= 0; i--) {
        const t = COMBO_TIERS[i];
        if (combo >= t.at && t.at > last) return t;
      }
      return null;
    };
    const maxAt = COMBO_TIERS[COMBO_TIERS.length - 1].at;
    const lasts = [0, ...COHERENCE.tierCombo];
    for (let combo = 0; combo <= maxAt + 5; combo++) {
      for (const last of lasts) {
        expect(crossedComboTier(combo, last)).toBe(oracle(combo, last));
      }
    }
  });
});
