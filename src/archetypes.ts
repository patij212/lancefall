// BUILD ARCHETYPES — an optional pre-run pick that makes the perk draft
// goal-directed. Choosing an archetype softly up-weights the perks that define
// that build, so a coherent build comes together instead of pure RNG. The weight
// map is threaded into rollDraftCards and applied as a no-extra-rng reorder, so
// it never desyncs Daily seeds. Picking FREESTYLE = uniform (unchanged behavior).

import type { PerkId } from './perks';

export type ArchetypeId = 'none' | 'impaler' | 'chain' | 'flow' | 'bulwark';

export interface Archetype {
  id: ArchetypeId;
  name: string;
  desc: string;
  accent: string;
  /** perk → bias weight (higher = offered more often). Absent perks weight 1. */
  weights: Partial<Record<PerkId, number>>;
}

export const ARCHETYPES: Archetype[] = [
  { id: 'none', name: 'FREESTYLE', desc: 'No bias — draft whatever the run offers.', accent: '#8b8d97', weights: {} },
  { id: 'impaler', name: 'IMPALER', desc: 'Reach + power. Builds toward the IMPALER fusion.', accent: '#f97316', weights: { longreach: 3, pierce: 3, nova: 1.6 } },
  { id: 'chain', name: 'DETONATOR', desc: 'Explosions everywhere. Builds toward SUPERNOVA.', accent: '#facc15', weights: { chain: 3, nova: 3, afterimage: 1.6 } },
  { id: 'flow', name: 'SLIPSTREAM', desc: 'Endless dashing. Builds toward PERPETUAL.', accent: '#10b981', weights: { siphon: 3, timethief: 3, secondwind: 2 } },
  { id: 'bulwark', name: 'BULWARK', desc: 'Defense + grazing. Builds toward AEGIS.', accent: '#60a5fa', weights: { reflect: 3, grazeburn: 2.4, secondwind: 2, slipstream: 2 } },
];

export function archetypeById(id: string): Archetype {
  return ARCHETYPES.find((a) => a.id === id) ?? ARCHETYPES[0];
}
