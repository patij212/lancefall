import { describe, it, expect } from 'vitest';
import { GLOSSES, GLOSS_COH_THRESHOLD, glossTriggers, type GlossId, type GlossWorldView } from './gloss';

const view = (over: Partial<GlossWorldView> = {}): GlossWorldView => ({
  grazeCount: 0,
  overdrive: { meter: 0, cooldown: 0 },
  player: { maxShields: 0 },
  ...over,
});

describe('gloss registry', () => {
  const SPEC_TERMS: GlossId[] = ['graze', 'overdrive', 'armor', 'coherence', 'fusion'];

  it('covers every spec term', () => {
    for (const id of SPEC_TERMS) expect(GLOSSES[id]).toBeTruthy();
    expect(Object.keys(GLOSSES).sort()).toEqual([...SPEC_TERMS].sort());
  });

  it('every gloss has a term, a one-line text, and a hex accent', () => {
    for (const id of Object.keys(GLOSSES) as GlossId[]) {
      const g = GLOSSES[id];
      expect(g.term.length).toBeGreaterThan(0);
      expect(g.term).toBe(g.term.toUpperCase());
      expect(g.text.length).toBeGreaterThan(10);
      expect(g.text).not.toContain('\n'); // a single line
      expect(g.accent).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('glossTriggers', () => {
  it('is empty at run start (nothing has happened yet)', () => {
    expect(glossTriggers(view(), 0)).toEqual([]);
  });

  it('fires graze the moment grazeCount goes positive', () => {
    expect(glossTriggers(view({ grazeCount: 1 }), 0)).toContain('graze');
    expect(glossTriggers(view({ grazeCount: 0 }), 0)).not.toContain('graze');
  });

  it('fires overdrive only when the meter is full AND off cooldown', () => {
    expect(glossTriggers(view({ overdrive: { meter: 1, cooldown: 0 } }), 0)).toContain('overdrive');
    // charged but still fading after a use → not ready, no gloss
    expect(glossTriggers(view({ overdrive: { meter: 1, cooldown: 3 } }), 0)).not.toContain('overdrive');
    expect(glossTriggers(view({ overdrive: { meter: 0.5, cooldown: 0 } }), 0)).not.toContain('overdrive');
  });

  it('fires armor whenever the run carries shield pips', () => {
    expect(glossTriggers(view({ player: { maxShields: 2 } }), 0)).toContain('armor');
    expect(glossTriggers(view({ player: { maxShields: 0 } }), 0)).not.toContain('armor');
  });

  it('fires coherence only once it climbs past the threshold', () => {
    expect(glossTriggers(view(), GLOSS_COH_THRESHOLD)).toContain('coherence');
    expect(glossTriggers(view(), GLOSS_COH_THRESHOLD - 0.01)).not.toContain('coherence');
  });

  it('never reports fusion (that path fires from the draft, not per-frame)', () => {
    const all = glossTriggers(view({ grazeCount: 9, overdrive: { meter: 1, cooldown: 0 }, player: { maxShields: 3 } }), 1);
    expect(all).not.toContain('fusion');
  });

  it('returns multiple ids in stable priority order when several conditions hold at once', () => {
    const all = glossTriggers(view({ grazeCount: 1, overdrive: { meter: 1, cooldown: 0 }, player: { maxShields: 1 } }), 1);
    expect(all).toEqual(['graze', 'overdrive', 'armor', 'coherence']);
  });
});
