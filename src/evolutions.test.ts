import { describe, it, expect } from 'vitest';
import {
  EVOLUTIONS,
  availableEvolutions,
  evoApplier,
  describeEvolutions,
  rollDraftCards,
  isEvolution,
} from './evolutions';
import type { EvolutionId } from './evolutions';
import { deriveStats } from './perks';
import type { PerkStacks } from './perks';
import { createRng } from './rng';

// stacks that satisfy each evolution's requirements
const REQ_STACKS: Record<EvolutionId, PerkStacks> = {
  impaler: { longreach: 3, pierce: 2 },
  supernova: { chain: 3, nova: 2 },
  perpetual: { siphon: 2, timethief: 1 },
  wraith: { afterimage: 2, longreach: 2 },
  inferno: { grazeburn: 2, slipstream: 1 },
  juggernaut: { secondwind: 2, chain: 1 },
};

describe('evolutions', () => {
  it('all ids are unique and self-consistent', () => {
    const ids = Object.keys(EVOLUTIONS) as EvolutionId[];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(EVOLUTIONS[id].id).toBe(id);
      expect(EVOLUTIONS[id].evolved).toBe(true);
      expect(EVOLUTIONS[id].requires.length).toBeGreaterThan(0);
    }
  });

  it('is unavailable until requirements are met', () => {
    expect(availableEvolutions({}, [])).toEqual([]);
    // one short on each requirement still fails
    expect(availableEvolutions({ longreach: 3, pierce: 1 }, []).map((e) => e.id)).not.toContain('impaler');
    expect(availableEvolutions({ longreach: 3, pierce: 2 }, []).map((e) => e.id)).toContain('impaler');
  });

  it('does not offer an evolution already taken', () => {
    const stacks = REQ_STACKS.impaler;
    expect(availableEvolutions(stacks, []).map((e) => e.id)).toContain('impaler');
    expect(availableEvolutions(stacks, ['impaler']).map((e) => e.id)).not.toContain('impaler');
  });

  it('every evolution materially changes the stat block', () => {
    for (const id of Object.keys(EVOLUTIONS) as EvolutionId[]) {
      const stacks = REQ_STACKS[id];
      const base = deriveStats(stacks);
      const evolved = deriveStats(stacks, undefined, undefined, evoApplier([id]));
      expect(evolved).not.toEqual(base);
    }
  });

  it('IMPALER stacks +2 dash damage on top of perks', () => {
    const stacks = REQ_STACKS.impaler;
    const base = deriveStats(stacks); // pierce 2 => dashDamage 3
    const evolved = deriveStats(stacks, undefined, undefined, evoApplier(['impaler']));
    expect(evolved.dashDamage).toBe(base.dashDamage + 2);
  });

  it('evoApplier composes multiple evolutions', () => {
    const stacks: PerkStacks = { ...REQ_STACKS.impaler, ...REQ_STACKS.juggernaut };
    const both = deriveStats(stacks, undefined, undefined, evoApplier(['impaler', 'juggernaut']));
    const base = deriveStats(stacks);
    expect(both.dashDamage).toBe(base.dashDamage + 2 /*impaler*/ + 1 /*juggernaut*/);
    expect(both.staminaSegments).toBe(base.staminaSegments + 2);
  });

  it('rollDraftCards leads with an evolution when one is available', () => {
    const rng = createRng(123);
    const cards = rollDraftCards(rng, REQ_STACKS.supernova, [], 3);
    expect(cards.length).toBe(3);
    expect(isEvolution(cards[0])).toBe(true);
    expect((cards[0] as { id: string }).id).toBe('supernova');
    // the remaining slots are ordinary perks
    expect(cards.slice(1).every((c) => !isEvolution(c))).toBe(true);
  });

  it('rollDraftCards offers only perks when no evolution is ready', () => {
    const rng = createRng(7);
    const cards = rollDraftCards(rng, {}, [], 3);
    expect(cards.length).toBe(3);
    expect(cards.every((c) => !isEvolution(c))).toBe(true);
  });

  it('rollDraftCards never re-offers a taken evolution', () => {
    const rng = createRng(99);
    const cards = rollDraftCards(rng, REQ_STACKS.inferno, ['inferno'], 3);
    expect(cards.every((c) => !(isEvolution(c) && c.id === 'inferno'))).toBe(true);
  });

  it('describeEvolutions lists names in order', () => {
    expect(describeEvolutions([])).toBe('');
    expect(describeEvolutions(['impaler', 'wraith'])).toBe('IMPALER, WRAITH');
  });
});
