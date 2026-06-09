import { describe, it, expect } from 'vitest';
import { BESTIARY, CODEX_CATEGORIES } from './bestiary';
import { ENEMY_DEFS } from './tune';

describe('bestiary / codex', () => {
  it('has unique ids and complete entries', () => {
    const ids = BESTIARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of BESTIARY) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.blurb.length).toBeGreaterThan(10);
      expect(e.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(['enemy', 'special', 'boss']).toContain(e.cat);
    }
  });

  it('covers all 6 bosses', () => {
    const bosses = BESTIARY.filter((e) => e.cat === 'boss').map((e) => e.id);
    expect(bosses).toEqual(['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign']);
  });

  it('documents every spawnable enemy archetype in ENEMY_DEFS', () => {
    const documented = new Set(BESTIARY.map((e) => e.id));
    // every real enemy def (excluding boss-coupled internals) has a codex entry
    const internal = new Set(['hollow_echo', 'sovereign_core']);
    for (const kind of Object.keys(ENEMY_DEFS)) {
      if (internal.has(kind)) continue;
      expect(documented.has(kind)).toBe(true);
    }
  });

  it('every category label has at least one entry', () => {
    for (const { cat } of CODEX_CATEGORIES) {
      expect(BESTIARY.some((e) => e.cat === cat)).toBe(true);
    }
  });
});
