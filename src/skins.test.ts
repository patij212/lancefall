import { describe, it, expect } from 'vitest';
import {
  ALL_SKINS,
  PORTED_KINDS,
  skinsForKind,
  defaultSkinId,
  skinById,
  canUnlockSkin,
  skinUnlockHint,
  skinLockToast,
  type SkinRarity,
} from './skins';
import { achievementById } from './achievements';

const RARITIES: SkinRarity[] = ['common', 'rare', 'epic', 'legendary'];

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

  it('every skin is valid: unique id, correct kind, draw fn, and a resolvable gate', () => {
    const ids = new Set<string>();
    for (const skin of ALL_SKINS) {
      expect(ids.has(skin.id)).toBe(false); // unique
      ids.add(skin.id);
      expect(PORTED_KINDS).toContain(skin.kind);
      expect(typeof skin.draw).toBe('function');
      expect(skin.name.length).toBeGreaterThan(0);
      // Common is free (null gate); every non-common skin gates on a real achievement.
      if (skin.rarity === 'common') expect(skin.unlockAch).toBeNull();
      else {
        expect(skin.unlockAch).not.toBeNull();
        expect(achievementById(skin.unlockAch!)).toBeDefined();
      }
    }
  });

  it('one achievement per skin: every non-common skin has its OWN unique gate', () => {
    const gates = ALL_SKINS.filter((s) => s.rarity !== 'common').map((s) => s.unlockAch);
    expect(gates).toHaveLength(PORTED_KINDS.length * 3); // 19 kinds × rare/epic/legendary
    expect(new Set(gates).size).toBe(gates.length); // no two skins share a gate
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

  it('a non-common skin is gated by its OWN achievement (held → unlocked)', () => {
    const rare = skinsForKind('orbiter').find((s) => s.rarity === 'rare')!;
    const epic = skinsForKind('lancer').find((s) => s.rarity === 'epic')!;
    const legendary = skinsForKind('seeker').find((s) => s.rarity === 'legendary')!;

    // locked without the gate, unlocked once the skin's own achievement is held
    expect(canUnlockSkin(rare, [])).toBe(false);
    expect(canUnlockSkin(rare, [rare.unlockAch!])).toBe(true);
    // holding a DIFFERENT skin's gate is not enough (the old shared-tier behaviour is gone)
    expect(canUnlockSkin(epic, [rare.unlockAch!])).toBe(false);
    expect(canUnlockSkin(epic, [epic.unlockAch!])).toBe(true);
    expect(canUnlockSkin(legendary, [legendary.unlockAch!])).toBe(true);
  });

  it('holding every gate unlocks every ported skin', () => {
    const all = ALL_SKINS.map((s) => s.unlockAch).filter((x): x is string => x !== null);
    for (const skin of ALL_SKINS) expect(canUnlockSkin(skin, all)).toBe(true);
  });
});

describe('per-skin unlock copy', () => {
  it('Common reads Free; non-common reads its gating achievement name + desc', () => {
    const common = skinsForKind('lancer').find((s) => s.rarity === 'common')!;
    expect(skinUnlockHint(common)).toBe('Free');
    expect(skinLockToast(common)).toBe('Skin locked');

    for (const skin of ALL_SKINS) {
      if (skin.rarity === 'common') continue;
      const a = achievementById(skin.unlockAch!)!;
      const hint = skinUnlockHint(skin);
      expect(hint).toContain(a.name);
      expect(hint).toContain(a.desc);
      expect(skinLockToast(skin)).toBe(`Locked — ${hint}`);
    }
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
