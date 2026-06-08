// Perk EVOLUTIONS — the build-defining capstones. When you've stacked the right
// perks high enough, a fusion upgrade unlocks and is offered (a guaranteed slot)
// in the next draft. Evolutions are additive — they keep the source perks and
// stack a dramatic bonus on top, applied LAST in deriveStats. Taking one is a
// once-per-run payoff, the thing a build is *aiming* for.

import { PERKS, rollDraft } from './perks';
import type { PerkId, PerkDef, PerkStacks, PerkGlyph, RunStats } from './perks';
import type { Rng } from './rng';

export type EvolutionId =
  | 'impaler'
  | 'supernova'
  | 'perpetual'
  | 'wraith'
  | 'inferno'
  | 'juggernaut';

export interface EvolutionDef {
  id: EvolutionId;
  name: string;
  desc: string;
  /** what it fuses, shown on the card so players know what they're building toward */
  from: string;
  accent: string;
  glyph: PerkGlyph;
  evolved: true; // discriminant vs PerkDef
  requires: { id: PerkId; stacks: number }[];
  apply: (s: RunStats) => void;
}

export const EVOLUTIONS: Record<EvolutionId, EvolutionDef> = {
  impaler: {
    id: 'impaler',
    name: 'IMPALER',
    desc: 'Your spear impales a long, wide line — almost nothing survives a pass.',
    from: 'Long Lance + Heavy Lance',
    accent: '#f97316',
    glyph: 'impaler',
    evolved: true,
    requires: [
      { id: 'longreach', stacks: 3 },
      { id: 'pierce', stacks: 2 },
    ],
    apply: (s) => {
      s.dashDamage += 3;
      s.dashHitboxRadius += 12;
      s.dashLenMul += 0.35;
    },
  },
  supernova: {
    id: 'supernova',
    name: 'SUPERNOVA',
    desc: 'Dash shockwaves and chain blasts merge into devastating supernovae.',
    from: 'Chain Reaction + Nova Dash',
    accent: '#facc15',
    glyph: 'supernova',
    evolved: true,
    requires: [
      { id: 'chain', stacks: 3 },
      { id: 'nova', stacks: 2 },
    ],
    apply: (s) => {
      s.chainRadius += 60;
      s.chainDmg += 1;
      s.dashNovaRadius += 75;
    },
  },
  perpetual: {
    id: 'perpetual',
    name: 'PERPETUAL',
    desc: 'Dash-kills overflow your stamina and bend time — chain forever.',
    from: 'Siphon + Time Thief',
    accent: '#10b981',
    glyph: 'perpetual',
    evolved: true,
    requires: [
      { id: 'siphon', stacks: 2 },
      { id: 'timethief', stacks: 1 },
    ],
    apply: (s) => {
      s.killStaminaRefund += 40;
      s.timeThiefStamina += 60;
      s.timeThiefExtra += 0.12;
      s.regenPerSec += 20;
    },
  },
  wraith: {
    id: 'wraith',
    name: 'WRAITH',
    desc: 'Your afterimage lingers as a long-lived wraith that scythes the field.',
    from: 'Afterimage + Long Lance',
    accent: '#a855f7',
    glyph: 'wraith',
    evolved: true,
    requires: [
      { id: 'afterimage', stacks: 2 },
      { id: 'longreach', stacks: 2 },
    ],
    apply: (s) => {
      s.afterimageSec += 1.1;
      s.dashHitboxRadius += 6;
    },
  },
  inferno: {
    id: 'inferno',
    name: 'INFERNO',
    desc: 'Grazing erupts into a spreading inferno and your combo refuses to die.',
    from: 'Graze Burn + Slipstream',
    accent: '#fb7185',
    glyph: 'inferno',
    evolved: true,
    requires: [
      { id: 'grazeburn', stacks: 2 },
      { id: 'slipstream', stacks: 1 },
    ],
    apply: (s) => {
      s.grazeBurnDmg += 2;
      s.grazeBurnRadius += 90;
      s.grazeComboBonus += 0.5;
      s.comboWindowBonus += 1.5;
    },
  },
  juggernaut: {
    id: 'juggernaut',
    name: 'JUGGERNAUT',
    desc: 'A bottomless tank — more stamina, faster regen, and a heavier, blast-happy spear.',
    from: 'Second Wind + Chain Reaction',
    accent: '#22d3ee',
    glyph: 'juggernaut',
    evolved: true,
    requires: [
      { id: 'secondwind', stacks: 2 },
      { id: 'chain', stacks: 1 },
    ],
    apply: (s) => {
      s.staminaSegments += 2;
      s.regenPerSec += 18;
      s.dashDamage += 1;
      s.chainRadius += 30;
    },
  },
};

export type DraftCard = PerkDef | EvolutionDef;

export function isEvolution(c: DraftCard): c is EvolutionDef {
  return 'evolved' in c;
}

/** Evolutions whose perk requirements are met and not yet taken this run. */
export function availableEvolutions(stacks: PerkStacks, taken: EvolutionId[]): EvolutionDef[] {
  return (Object.keys(EVOLUTIONS) as EvolutionId[])
    .filter((id) => !taken.includes(id))
    .filter((id) => EVOLUTIONS[id].requires.every((r) => (stacks[r.id] ?? 0) >= r.stacks))
    .map((id) => EVOLUTIONS[id]);
}

/** Build the apply-callback that stacks all taken evolutions onto a stat block. */
export function evoApplier(taken: EvolutionId[]): (s: RunStats) => void {
  return (s) => {
    for (const id of taken) EVOLUTIONS[id].apply(s);
  };
}

/** Human-readable list of taken evolutions, e.g. "IMPALER, SUPERNOVA". */
export function describeEvolutions(taken: EvolutionId[]): string {
  return taken.map((id) => EVOLUTIONS[id].name).join(', ');
}

/** Roll a draft. If an evolution is available it claims one guaranteed slot
 *  (the big payoff should never be missed); the rest are normal perks. */
export function rollDraftCards(
  rng: Rng,
  stacks: PerkStacks,
  takenEvolutions: EvolutionId[],
  size = 3,
): DraftCard[] {
  const evos = availableEvolutions(stacks, takenEvolutions);
  if (evos.length === 0) return rollDraft(rng, stacks, size);

  // pick one available evolution at random
  const evo = evos[Math.floor(rng.next() * evos.length)];
  const perks = rollDraft(rng, stacks, Math.max(1, size - 1));
  // evolution always leads the draft so it reads as special
  return [evo, ...perks];
}

// re-export so callers can grab a perk def without importing perks too
export { PERKS };
