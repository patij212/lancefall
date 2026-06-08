// In-run perk draft (Slay-the-Spire style). Every few waves the player picks
// 1 of 3 random perks. Perks STACK — that's the snowball. All effects are
// derived purely from a stack-count record so the result is deterministic and
// testable.

import { TUNE } from './tune';
import type { Rng } from './rng';

export type PerkId =
  | 'longreach'
  | 'secondwind'
  | 'grazeburn'
  | 'chain'
  | 'afterimage'
  | 'timethief'
  | 'shardcache';

export interface PerkDef {
  id: PerkId;
  name: string;
  desc: string;
  accent: string;
  /** simple shape keyword for the card glyph */
  glyph: 'lance' | 'cell' | 'graze' | 'burst' | 'ghost' | 'clock' | 'gem';
  maxStacks: number;
}

export const PERKS: Record<PerkId, PerkDef> = {
  longreach: {
    id: 'longreach',
    name: 'Long Lance',
    desc: '+25% dash length and a wider spear.',
    accent: '#22d3ee',
    glyph: 'lance',
    maxStacks: 3,
  },
  secondwind: {
    id: 'secondwind',
    name: 'Second Wind',
    desc: '+1 stamina segment and faster regen.',
    accent: '#34d399',
    glyph: 'cell',
    maxStacks: 2,
  },
  grazeburn: {
    id: 'grazeburn',
    name: 'Graze Burn',
    desc: 'Grazing scorches the nearest enemy and doubles graze stamina.',
    accent: '#fbbf24',
    glyph: 'graze',
    maxStacks: 2,
  },
  chain: {
    id: 'chain',
    name: 'Chain Reaction',
    desc: 'Dash-kills detonate, damaging nearby enemies.',
    accent: '#ec4899',
    glyph: 'burst',
    maxStacks: 3,
  },
  afterimage: {
    id: 'afterimage',
    name: 'Afterimage',
    desc: 'Your dash trail lingers as a damaging ghost after you land.',
    accent: '#a855f7',
    glyph: 'ghost',
    maxStacks: 2,
  },
  timethief: {
    id: 'timethief',
    name: 'Time Thief',
    desc: 'Big dash-chains extend slow-mo and instantly refill stamina.',
    accent: '#818cf8',
    glyph: 'clock',
    maxStacks: 2,
  },
  shardcache: {
    id: 'shardcache',
    name: 'Shard Cache',
    desc: 'A burst of bonus score. (No perks left to offer.)',
    accent: '#8b8d97',
    glyph: 'gem',
    maxStacks: 99,
  },
};

export type PerkStacks = Partial<Record<PerkId, number>>;

export interface RunStats {
  maxSpeed: number;
  accel: number;
  dashLenMul: number;
  dashHitboxRadius: number;
  staminaSegments: number;
  regenPerSec: number;
  regenDelay: number;
  killStaminaRefund: number;
  grazeRadius: number;
  grazeStaminaRefund: number;
  grazeComboBonus: number; // extra seconds added to combo timer on graze
  grazeBurnDmg: number; // 0 = no graze damage
  grazeBurnRadius: number;
  chainRadius: number; // 0 = no chain explosion
  chainDmg: number;
  afterimageSec: number; // 0 = none
  timeThiefExtra: number; // extra slow-mo seconds on big chains
  timeThiefStamina: number; // instant stamina on big chains
}

/** Derive the full run stat block from base TUNE + ship profile + perk stacks.
 *  Order: base → ship (mutates base) → perks (stack on top). Pure. */
export function deriveStats(stacks: PerkStacks, shipApply?: (s: RunStats) => void): RunStats {
  const s: RunStats = {
    maxSpeed: TUNE.player.maxSpeed,
    accel: TUNE.player.accel,
    dashLenMul: 1,
    dashHitboxRadius: TUNE.dash.hitboxRadius,
    staminaSegments: TUNE.stamina.segments,
    regenPerSec: TUNE.stamina.regenPerSec,
    regenDelay: TUNE.stamina.regenDelay,
    killStaminaRefund: TUNE.stamina.killRefund,
    grazeRadius: TUNE.graze.radius,
    grazeStaminaRefund: TUNE.stamina.grazeRefund,
    grazeComboBonus: 0,
    grazeBurnDmg: 0,
    grazeBurnRadius: 0,
    chainRadius: 0,
    chainDmg: 0,
    afterimageSec: 0,
    timeThiefExtra: 0,
    timeThiefStamina: 0,
  };

  if (shipApply) shipApply(s);

  const lr = stacks.longreach ?? 0;
  s.dashLenMul += 0.25 * lr;
  s.dashHitboxRadius += 5 * lr;

  const sw = stacks.secondwind ?? 0;
  s.staminaSegments += sw;
  s.regenPerSec += 12 * sw;

  const gb = stacks.grazeburn ?? 0;
  if (gb > 0) {
    s.grazeBurnDmg = gb;
    s.grazeBurnRadius = 60 + 30 * (gb - 1);
    s.grazeStaminaRefund *= 2;
    s.grazeComboBonus = 0.5 * gb;
  }

  const ch = stacks.chain ?? 0;
  if (ch > 0) {
    s.chainRadius = 70 + 22 * (ch - 1);
    s.chainDmg = 1;
  }

  const ai = stacks.afterimage ?? 0;
  if (ai > 0) s.afterimageSec = 0.35 + 0.15 * (ai - 1);

  const tt = stacks.timethief ?? 0;
  if (tt > 0) {
    s.timeThiefExtra = 0.08 + 0.04 * (tt - 1);
    s.timeThiefStamina = 40;
  }

  return s;
}

export function applyPerk(stacks: PerkStacks, id: PerkId): void {
  stacks[id] = (stacks[id] ?? 0) + 1;
}

function isEligible(stacks: PerkStacks, id: PerkId): boolean {
  if (id === 'shardcache') return false;
  return (stacks[id] ?? 0) < PERKS[id].maxStacks;
}

/** Offer up to 3 distinct perks not yet maxed; fill with Shard Cache if short. */
export function rollDraft(rng: Rng, stacks: PerkStacks): PerkDef[] {
  const eligible = (Object.keys(PERKS) as PerkId[]).filter((id) => isEligible(stacks, id));
  // Fisher–Yates shuffle using the seeded rng
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  const out: PerkDef[] = eligible.slice(0, 3).map((id) => PERKS[id]);
  while (out.length < 3) out.push(PERKS.shardcache);
  return out;
}
