// @vitest-environment happy-dom
// Visual-layer assertions (design §9). No save coupling.

import { describe, it, expect } from 'vitest';
import { AVATAR_VISUALS, AVATAR_IDS, avatarVisual, renderAvatar, DEFAULT_AVATAR } from './registry';

const ids = (svg: string): Set<string> => {
  const out = new Set<string>();
  for (const m of svg.matchAll(/\sid="([^"]+)"/g)) out.add(m[1]);
  return out;
};
const refs = (svg: string): string[] => {
  const out: string[] = [];
  for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) out.push(m[1]);
  for (const m of svg.matchAll(/href="#([^"]+)"/g)) out.push(m[1]);
  return out;
};
const animCount = (svg: string): number => (svg.match(/<animate(Transform|Motion)?[\s>]/g) || []).length;

describe('roster shape', () => {
  it('has exactly 25 avatars with unique ids', () => {
    expect(AVATAR_VISUALS.length).toBe(25);
    expect(new Set(AVATAR_IDS).size).toBe(25);
  });

  it('has 8 free avatars, all tier I', () => {
    const free = AVATAR_VISUALS.filter((a) => a.group === 'free');
    expect(free.length).toBe(8);
    expect(free.every((a) => a.tier === 1)).toBe(true);
  });

  it('tier distribution is 8 / 15 / 2', () => {
    const byTier = (t: number) => AVATAR_VISUALS.filter((a) => a.tier === t).length;
    expect([byTier(1), byTier(2), byTier(3)]).toEqual([8, 15, 2]);
  });

  it('every avatar has a non-empty name, accent, motion, unlockHint', () => {
    for (const a of AVATAR_VISUALS) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.accent).toMatch(/^#[0-9a-f]{3,8}$/i);
      expect(a.motion.length).toBeGreaterThan(0);
      expect(a.unlockHint.length).toBeGreaterThan(0);
    }
  });

  it('DEFAULT_AVATAR exists', () => {
    expect(avatarVisual(DEFAULT_AVATAR)).toBeDefined();
  });
});

describe('renderAvatar — structure & accessibility', () => {
  it('returns a parseable <svg> with role="img" + <title> for every avatar', () => {
    const parser = new DOMParser();
    for (const id of AVATAR_IDS) {
      const svg = renderAvatar(id);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('role="img"');
      expect(svg).toContain('<title>');
      expect(svg).toContain('<desc>');
      const doc = parser.parseFromString(svg, 'image/svg+xml');
      expect(doc.querySelector('parsererror')).toBeNull();
      expect(doc.documentElement.localName).toBe('svg');
    }
  });

  it('falls back to the default avatar for an unknown id (no throw)', () => {
    const svg = renderAvatar('does-not-exist');
    expect(svg.startsWith('<svg')).toBe(true);
    const def = renderAvatar(DEFAULT_AVATAR);
    // same scene content (uid differs only by id, which is identical here)
    expect(svg).toContain('<title>THE LANCE</title>');
    expect(def).toContain('<title>THE LANCE</title>');
  });
});

describe('uid namespacing (24 medallions on one grid must not collide)', () => {
  it('two renders with different uids share no id', () => {
    for (const id of AVATAR_IDS) {
      const A = ids(renderAvatar(id, { uid: 'AAA' }));
      const B = ids(renderAvatar(id, { uid: 'BBB' }));
      expect(A.size).toBeGreaterThan(0);
      for (const x of A) expect(B.has(x)).toBe(false);
    }
  });

  it('every url(#…)/href="#…" reference resolves to an id defined in the same svg', () => {
    for (const id of AVATAR_IDS) {
      for (const variant of ['full', 'tile'] as const) {
        const svg = renderAvatar(id, { variant });
        const defined = ids(svg);
        for (const r of refs(svg)) {
          expect(defined.has(r), `${id}/${variant} references #${r} which is not defined`).toBe(true);
        }
      }
    }
  });
});

describe('variants', () => {
  it('animated:false emits no <animate*> tags, for every avatar', () => {
    for (const id of AVATAR_IDS) {
      expect(animCount(renderAvatar(id, { animated: false })), id).toBe(0);
    }
  });

  it('tile variant is lightweight (animation count ≤ the full form)', () => {
    for (const id of AVATAR_IDS) {
      const full = animCount(renderAvatar(id, { variant: 'full' }));
      const tile = animCount(renderAvatar(id, { variant: 'tile' }));
      expect(tile, id).toBeLessThanOrEqual(full);
    }
  });

  it('full animated form actually animates (sanity: lance has motion)', () => {
    expect(animCount(renderAvatar('lance', { variant: 'full' }))).toBeGreaterThan(0);
  });
});
