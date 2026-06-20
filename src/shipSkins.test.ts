import { describe, it, expect } from 'vitest';
import { SHIP_SKINS, shipSkinById, shipSkinName, canUnlockShipSkin, drawShipSkin } from './shipSkins';
import { SHIPS } from './ships';
import { achievementById } from './achievements';

const SHIP_IDS = SHIPS.map((s) => s.id);

describe('ship-skin registry', () => {
  it('defines the four sets in order, each with a name + tagline', () => {
    expect(SHIP_SKINS.map((s) => s.id)).toEqual(['encryption', 'key', 'firstlight', 'lastkey']);
    const ids = new Set<string>();
    for (const def of SHIP_SKINS) {
      expect(ids.has(def.id)).toBe(false); // unique
      ids.add(def.id);
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.tag.length).toBeGreaterThan(0);
      expect(typeof def.unlockShards).toBe('number');
      expect(def.unlockShards).toBeGreaterThanOrEqual(0);
    }
  });

  it('shipSkinById resolves a known set and returns null for none/unknown', () => {
    expect(shipSkinById('encryption')?.name).toBe('THE ENCRYPTION');
    expect(shipSkinById('firstlight')?.name).toBe('FIRST LIGHT');
    expect(shipSkinById('none')).toBeNull(); // 'none' is the plain hull — not a skin def
    expect(shipSkinById('nope')).toBeNull();
    expect(shipSkinById('')).toBeNull();
  });

  it('the achievement-gated set names a REAL achievement', () => {
    for (const def of SHIP_SKINS) {
      if (def.unlockAch) expect(achievementById(def.unlockAch)).toBeDefined();
    }
    // FIRST LIGHT is the victory cosmetic, gated on the Sovereign kill
    expect(shipSkinById('firstlight')?.unlockAch).toBe('regicide');
  });
});

describe('shipSkinName — per-ship individual names', () => {
  it('names every ship × set distinctly and non-empty (18 total)', () => {
    const seen = new Set<string>();
    for (const set of SHIP_SKINS) {
      for (const shipId of SHIP_IDS) {
        const nm = shipSkinName(shipId, set.id);
        expect(nm.length).toBeGreaterThan(0);
        expect(seen.has(nm)).toBe(false); // every one of the 18 is unique
        seen.add(nm);
      }
    }
    expect(seen.size).toBe(SHIP_SKINS.length * SHIP_IDS.length); // 4 sets x 6 ships
  });

  it('returns the specific artifact name for a known (ship, set)', () => {
    expect(shipSkinName('lance', 'key')).toBe('KEYSTONE');
    expect(shipSkinName('phantom', 'key')).toBe('HAIRLINE');
    expect(shipSkinName('reaver', 'firstlight')).toBe('BLOOD DAWN');
  });

  it('falls back to the set name for an unknown ship, and "" for none/unknown sets', () => {
    expect(shipSkinName('mystery-ship', 'encryption')).toBe('THE ENCRYPTION');
    expect(shipSkinName('lance', 'none')).toBe('');
    expect(shipSkinName('lance', 'bogus')).toBe('');
  });
});

describe('canUnlockShipSkin gating (mirrors canUnlockTrail)', () => {
  it('a shard skin unlocks once you reach its threshold', () => {
    const enc = shipSkinById('encryption')!;
    expect(canUnlockShipSkin(enc, 0, [])).toBe(false);
    expect(canUnlockShipSkin(enc, enc.unlockShards - 1, [])).toBe(false);
    expect(canUnlockShipSkin(enc, enc.unlockShards, [])).toBe(true);
    expect(canUnlockShipSkin(enc, enc.unlockShards + 9999, [])).toBe(true);
  });

  it('an achievement skin ignores shards and needs only its achievement', () => {
    const fl = shipSkinById('firstlight')!;
    expect(canUnlockShipSkin(fl, 9_999_999, [])).toBe(false); // shards never matter
    expect(canUnlockShipSkin(fl, 0, ['regicide'])).toBe(true);
    expect(canUnlockShipSkin(fl, 0, ['someOtherAch'])).toBe(false);
  });
});

describe('ship-skin draw contract (smoke — every set × ship, no crash)', () => {
  // a stand-in 2D context that accepts every call a skin draw makes (same pattern as skins.test.ts)
  function stubCtx(): CanvasRenderingContext2D {
    const noop = () => {};
    const grad = { addColorStop: noop };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(target, prop) {
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => grad;
        if (prop in target) return target[prop as string];
        return typeof prop === 'string' && /^[a-z]/.test(prop) ? noop : 0;
      },
      set() {
        return true;
      },
    };
    return new Proxy({} as Record<string, unknown>, handler) as unknown as CanvasRenderingContext2D;
  }

  it('every set draws on every ship at reduceMotion on/off without throwing', () => {
    for (const set of SHIP_SKINS) {
      for (const shipId of SHIP_IDS) {
        for (const reduceMotion of [false, true]) {
          expect(() => drawShipSkin(set.id, shipId, stubCtx(), 18, 2.4, { reduceMotion })).not.toThrow();
        }
      }
    }
  });

  it('an unknown / "none" set is a no-op (draws nothing, never throws)', () => {
    expect(() => drawShipSkin('none', 'lance', stubCtx(), 18, 1, { reduceMotion: false })).not.toThrow();
    expect(() => drawShipSkin('bogus', 'reaver', stubCtx(), 18, 1, { reduceMotion: true })).not.toThrow();
  });
});

describe('lastkey ship skin', () => {
  it('is registered, achievement-gated by longestday-read, and named per ship', () => {
    const def = shipSkinById('lastkey')!;
    expect(def).toBeTruthy();
    expect(def.unlockAch).toBe('longestday-read');
    expect(canUnlockShipSkin(def, 0, [])).toBe(false);
    expect(canUnlockShipSkin(def, 0, ['longestday-read'])).toBe(true);
    expect(shipSkinName('lance', 'lastkey')).not.toBe('');
  });
});
