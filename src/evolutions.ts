// Perk EVOLUTIONS — the build-defining capstones. When you've stacked the right
// perks high enough, a fusion upgrade unlocks and is offered (a guaranteed slot)
// in the next draft. Evolutions are additive — they keep the source perks and
// stack a dramatic bonus on top, applied LAST in deriveStats. Taking one is a
// once-per-run payoff, the thing a build is *aiming* for.

import { PERKS, rollDraft } from './perks';
import type { PerkId, PerkDef, PerkStacks, PerkGlyph, RunStats } from './perks';
import { RELICS, RELIC_IDS } from './relics';
import type { RelicDef, RelicId } from './relics';
import type { Rng } from './rng';

export type EvolutionId =
  | 'impaler'
  | 'supernova'
  | 'perpetual'
  | 'wraith'
  | 'inferno'
  | 'juggernaut'
  | 'aegis';

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
      { id: 'longreach', stacks: 2 }, // normalized to a 4-pick fusion (was 5: longreach×3)
      { id: 'pierce', stacks: 2 },
    ],
    apply: (s) => {
      s.dashDamage += 2; // total ~5 with pierce — tank-buster without one-shotting every elite
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
      { id: 'chain', stacks: 2 }, // normalized to a 4-pick fusion (was 5: chain×3)
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
      { id: 'timethief', stacks: 2 }, // normalized to a 4-pick fusion (was 3: timethief×1)
    ],
    apply: (s) => {
      // strong stamina identity, but curbed so it isn't an infinite-dash / permanent-slowmo loop
      s.killStaminaRefund += 20;
      s.timeThiefStamina += 40;
      s.timeThiefExtra += 0.06;
      s.regenPerSec += 10;
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
      // worth its 4-pick cost: a long-lived ghost that also hits harder + wider
      s.afterimageSec += 1.1;
      s.dashHitboxRadius += 12;
      s.dashDamage += 1;
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
      { id: 'slipstream', stacks: 2 }, // normalized to a 4-pick fusion (was 3: slipstream×1)
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
      { id: 'chain', stacks: 2 }, // normalized to a 4-pick fusion (was 3: chain×1)
    ],
    apply: (s) => {
      s.staminaSegments += 2;
      s.regenPerSec += 18;
      s.dashDamage += 1;
      s.chainRadius += 30;
    },
  },
  aegis: {
    id: 'aegis',
    name: 'AEGIS',
    desc: 'A walking fortress — your dash sweeps a wide bullet-shattering wall, with deep stamina and a long graze reach.',
    from: 'Riposte + Second Wind',
    accent: '#60a5fa',
    glyph: 'aegis',
    evolved: true,
    requires: [
      { id: 'reflect', stacks: 2 },
      { id: 'secondwind', stacks: 2 },
    ],
    apply: (s) => {
      s.dashShatterRadius += 40;
      // the walking fortress shatters real boss fire: a generous per-dash budget so a
      // dash through a pattern actually opens a lane (still finite — not an eraser).
      s.dashShatterBossBudget += 4;
      s.staminaSegments += 1;
      s.regenPerSec += 15;
      s.grazeRadius += 20;
    },
  },
};

export type DraftCard = PerkDef | EvolutionDef | RelicDef;

export function isEvolution(c: DraftCard): c is EvolutionDef {
  return 'evolved' in c;
}

export function isRelic(c: DraftCard): c is RelicDef {
  return 'isRelic' in c;
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

/** Options for a draft roll. Tail param so features extend it without reordering
 *  positional args (archetype weightMap now; relics will add fields later). */
export interface DraftOpts {
  weightMap?: Partial<Record<PerkId, number>>;
  takenRelics?: RelicId[];
  relicChance?: number; // 0..1 chance to swap a perk slot for a cursed relic
}

/** Roll a draft. If an evolution is available it claims one guaranteed slot
 *  (the big payoff should never be missed); the rest are normal perks. A cursed
 *  relic may replace one perk slot. Relic rolling consumes a FIXED 2 rng calls
 *  (when relicChance is set) so it never desyncs Daily seeds. */
export function rollDraftCards(
  rng: Rng,
  stacks: PerkStacks,
  takenEvolutions: EvolutionId[],
  size = 3,
  opts: DraftOpts = {},
): DraftCard[] {
  const evos = availableEvolutions(stacks, takenEvolutions);
  let cards: DraftCard[];
  if (evos.length === 0) {
    cards = rollDraft(rng, stacks, size, opts.weightMap);
  } else {
    const evo = evos[Math.floor(rng.next() * evos.length)];
    const perks = rollDraft(rng, stacks, Math.max(0, size - 1), opts.weightMap);
    cards = [evo, ...perks]; // evolution always leads
  }

  // cursed relic offer — when relics are enabled (relicChance defined), ALWAYS
  // consume a fixed 2 rng calls so the seeded stream can never desync between
  // players regardless of their taken set / chance value (Daily determinism).
  if (opts.relicChance !== undefined) {
    const roll = rng.next();
    const idx = Math.floor(rng.next() * RELIC_IDS.length);
    const id = RELIC_IDS[idx];
    const taken = opts.takenRelics ?? [];
    const last = cards[cards.length - 1];
    if (opts.relicChance > 0 && roll < opts.relicChance && !taken.includes(id) && !isEvolution(last)) {
      cards[cards.length - 1] = RELICS[id]; // swap the last perk slot for the relic
    }
  }
  return cards;
}

// re-export so callers can grab a perk def without importing perks too
export { PERKS };
