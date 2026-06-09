import { describe, it, expect } from 'vitest';
import { ARCHETYPES, archetypeById } from './archetypes';
import { rollDraft } from './perks';
import { createRng } from './rng';

describe('archetypes', () => {
  it('has a FREESTYLE (none) default with no weights', () => {
    expect(archetypeById('none').weights).toEqual({});
    expect(archetypeById('bogus').id).toBe('none'); // unknown → default
  });

  it('the weightMap does NOT change rng consumption (Daily-safe)', () => {
    // two rolls from the same seed: one weighted, one not — the seeded stream must
    // be advanced identically, so a follow-up draw matches.
    const r1 = createRng(999);
    rollDraft(r1, {}, 3, archetypeById('impaler').weights);
    const after1 = r1.next();
    const r2 = createRng(999);
    rollDraft(r2, {}, 3);
    const after2 = r2.next();
    expect(after1).toBe(after2);
  });

  it('biases offers toward the archetype perks over many rolls', () => {
    // count how often "longreach" appears with vs without the IMPALER bias
    let withBias = 0;
    let without = 0;
    for (let seed = 0; seed < 200; seed++) {
      const a = rollDraft(createRng(seed), {}, 3, archetypeById('impaler').weights).map((p) => p.id);
      const b = rollDraft(createRng(seed), {}, 3).map((p) => p.id);
      if (a.includes('longreach')) withBias++;
      if (b.includes('longreach')) without++;
    }
    expect(withBias).toBeGreaterThan(without); // the bias genuinely favours it
  });

  it('every archetype weight references a real perk concept (non-empty except none)', () => {
    for (const a of ARCHETYPES) {
      if (a.id === 'none') continue;
      expect(Object.keys(a.weights).length).toBeGreaterThan(0);
    }
  });
});
