import { describe, it, expect } from 'vitest';
import {
  ALL_SKINS,
  PORTED_KINDS,
  skinsForKind,
  defaultSkinId,
  skinById,
  canUnlockSkin,
  type SkinRarity,
} from './skins';

const RARITIES: SkinRarity[] = ['common', 'rare', 'epic', 'legendary'];
// the achievement that gates each rarity (mirrors achievements.ts + the handoff)
const RARITY_ACH: Record<SkinRarity, string | null> = {
  common: null,
  rare: 'survivor',
  epic: 'gauntlet',
  legendary: 'regicide',
};

describe('skins registry', () => {
  it('ports the 5 heroes + 5 bosses + 9 mini-enemies, each with 4 rarities', () => {
    // Phase 1 heroes + Phase 2a bosses + Phase 2b minis (the Champion/elite is an
    // overlay flag, not an EnemyKind, so it is intentionally not in this per-kind
    // dispatch/save list; hollow_echo / sovereign_core are summon sub-kinds, never
    // picker-equipped, so they are excluded too).
    expect(PORTED_KINDS).toEqual([
      'darter', 'orbiter', 'lancer', 'seeker', 'warden',
      'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign',
      'splitter', 'mini', 'bloomer', 'bomber', 'wisp', 'drifter', 'shade', 'brooder', 'herald',
    ]);
    expect(ALL_SKINS).toHaveLength(PORTED_KINDS.length * 4);
    for (const kind of PORTED_KINDS) {
      const takes = skinsForKind(kind);
      expect(takes).toHaveLength(4);
      expect(takes.map((s) => s.rarity)).toEqual(RARITIES); // in rarity order
    }
  });

  it('every skin is valid: unique id, correct kind, draw fn, and the right gate per rarity', () => {
    const ids = new Set<string>();
    for (const skin of ALL_SKINS) {
      expect(ids.has(skin.id)).toBe(false); // unique
      ids.add(skin.id);
      expect(PORTED_KINDS).toContain(skin.kind);
      expect(typeof skin.draw).toBe('function');
      expect(skin.name.length).toBeGreaterThan(0);
      expect(skin.unlockAch).toBe(RARITY_ACH[skin.rarity]);
    }
  });

  it('the Common take of each kind IS the kind default id (the biomech baseline)', () => {
    for (const kind of PORTED_KINDS) {
      const common = skinsForKind(kind).find((s) => s.rarity === 'common');
      expect(common).toBeTruthy();
      expect(common!.id).toBe(defaultSkinId(kind));
      expect(common!.unlockAch).toBeNull(); // free
    }
  });

  it('defaultSkinId is the conventional `<kind>-default` and resolves to a real skin', () => {
    for (const kind of PORTED_KINDS) {
      const id = defaultSkinId(kind);
      expect(id).toBe(`${kind}-default`);
      const def = skinById(id);
      expect(def).not.toBeNull();
      expect(def!.kind).toBe(kind);
      expect(def!.rarity).toBe('common');
    }
  });

  it('skinById returns null for an unknown / un-ported id', () => {
    expect(skinById('does-not-exist')).toBeNull();
    // hollow_echo / sovereign_core are summon sub-kinds — never ported / picker-equipped
    expect(skinById('hollow_echo-legendary')).toBeNull();
    expect(skinById('sovereign_core-default')).toBeNull();
    expect(skinById('')).toBeNull();
  });
});

describe('canUnlockSkin gating', () => {
  it('Common is always unlocked, even with zero achievements', () => {
    const common = skinsForKind('darter').find((s) => s.rarity === 'common')!;
    expect(canUnlockSkin(common, [])).toBe(true);
  });

  it('Rare needs `survivor`; Epic needs `gauntlet`; Legendary needs `regicide`', () => {
    const rare = skinsForKind('orbiter').find((s) => s.rarity === 'rare')!;
    const epic = skinsForKind('lancer').find((s) => s.rarity === 'epic')!;
    const legendary = skinsForKind('seeker').find((s) => s.rarity === 'legendary')!;

    expect(canUnlockSkin(rare, [])).toBe(false);
    expect(canUnlockSkin(rare, ['survivor'])).toBe(true);

    expect(canUnlockSkin(epic, ['survivor'])).toBe(false);
    expect(canUnlockSkin(epic, ['gauntlet'])).toBe(true);

    expect(canUnlockSkin(legendary, ['gauntlet', 'survivor'])).toBe(false);
    expect(canUnlockSkin(legendary, ['regicide'])).toBe(true);
  });

  it('a full achievement set unlocks every ported skin', () => {
    const all = ['survivor', 'gauntlet', 'regicide'];
    for (const skin of ALL_SKINS) expect(canUnlockSkin(skin, all)).toBe(true);
  });
});

describe('skin draw contract (smoke — no crash, no sim mutation)', () => {
  // a stand-in 2D context that records nothing but accepts every call a skin makes.
  function stubCtx(): CanvasRenderingContext2D {
    const noop = () => {};
    const grad = { addColorStop: noop };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(target, prop) {
        if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => grad;
        if (prop === 'save' || prop === 'restore' || prop === 'beginPath' || prop === 'closePath') return noop;
        if (prop in target) return target[prop as string];
        // any unknown method → noop; any unknown property read → 0
        return typeof prop === 'string' && /^[a-z]/.test(prop) ? noop : 0;
      },
      set() {
        return true;
      },
    };
    return new Proxy({} as Record<string, unknown>, handler) as unknown as CanvasRenderingContext2D;
  }

  const opts = {
    reduceFlashing: false,
    colorblind: false,
    combo: 0,
    caScale: 0,
    reduceMotion: false,
    clarity: false,
    beatRing: false,
    beatPhase: 0,
    slingshot: false,
    firstLight: 0,
    cipherAssist: false,
  };

  it('every skin draws at every LOD without throwing, for telegraph on/off', () => {
    const lods = ['full', 'mid', 'far'] as const;
    for (const skin of ALL_SKINS) {
      for (const lod of lods) {
        for (const tele of [0, 1]) {
          const e = {
            kind: skin.kind,
            x: 0,
            y: 0,
            vx: 1,
            vy: 0.3,
            color: '#22d3ee',
            angle: 0.5,
            telegraph: tele,
            isBoss: false,
            elite: false,
            hitFlash: 0,
            spawnTime: 3,
          } as unknown as Parameters<typeof skin.draw>[1];
          const before = JSON.stringify(e);
          expect(() => skin.draw(stubCtx(), e, 22, { rimColor: '#bff', flash: false, opts, lod, t: 2 })).not.toThrow();
          // cosmetic-only guarantee: the skin must not mutate the enemy
          expect(JSON.stringify(e)).toBe(before);
        }
      }
    }
  });
});
