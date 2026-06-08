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
  | 'pierce'
  | 'siphon'
  | 'slipstream'
  | 'nova'
  | 'reflect'
  | 'shardcache';

export type PerkGlyph =
  | 'lance'
  | 'cell'
  | 'graze'
  | 'burst'
  | 'ghost'
  | 'clock'
  | 'pierce'
  | 'siphon'
  | 'window'
  | 'nova'
  | 'reflect'
  | 'gem'
  // evolution glyphs
  | 'impaler'
  | 'supernova'
  | 'perpetual'
  | 'wraith'
  | 'inferno'
  | 'juggernaut'
  | 'aegis';

export interface PerkDef {
  id: PerkId;
  name: string;
  desc: string;
  accent: string;
  /** simple shape keyword for the card glyph */
  glyph: PerkGlyph;
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
  pierce: {
    id: 'pierce',
    name: 'Heavy Lance',
    desc: 'Your dash deals +1 damage — punch through tanky enemies in one pass.',
    accent: '#f97316',
    glyph: 'pierce',
    maxStacks: 2,
  },
  siphon: {
    id: 'siphon',
    name: 'Siphon',
    desc: 'Every dash-kill refunds stamina — chain forever.',
    accent: '#10b981',
    glyph: 'siphon',
    maxStacks: 2,
  },
  slipstream: {
    id: 'slipstream',
    name: 'Slipstream',
    desc: 'Your combo lingers longer before it decays.',
    accent: '#38bdf8',
    glyph: 'window',
    maxStacks: 2,
  },
  nova: {
    id: 'nova',
    name: 'Nova Dash',
    desc: 'Launching a dash detonates a shockwave around you.',
    accent: '#facc15',
    glyph: 'nova',
    maxStacks: 2,
  },
  reflect: {
    id: 'reflect',
    name: 'Riposte',
    desc: 'Your dash shatters enemy bullets in its path (boss shots excepted).',
    accent: '#60a5fa',
    glyph: 'reflect',
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
  dashDamage: number; // damage per dash-spear hit (base 1)
  comboWindowBonus: number; // extra seconds on the combo decay window
  dashNovaRadius: number; // 0 = no nova; shockwave radius on dash launch
  dashShatterRadius: number; // 0 = off; extra band around the spear that destroys enemy bullets
  // meta-progression / economy
  scoreMul: number; // score multiplier (base 1)
  shardMul: number; // shard-gain multiplier (base 1)
  draftSize: number; // perk cards offered per draft (base 3)
  reviveTokens: number; // revives available per run (base 0)
  startPerks: number; // random perks granted at run start (base 0)
}

/** Derive the full run stat block from base TUNE + permanent meta + ship + perks.
 *  Order: base → meta (permanent) → ship → perks → evolutions (capstone). Pure.
 *  Evolutions apply LAST so they can amplify perk-derived values. */
export function deriveStats(
  stacks: PerkStacks,
  shipApply?: (s: RunStats) => void,
  metaApply?: (s: RunStats) => void,
  evoApply?: (s: RunStats) => void,
): RunStats {
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
    dashDamage: 1,
    comboWindowBonus: 0,
    dashNovaRadius: 0,
    dashShatterRadius: 0,
    scoreMul: 1,
    shardMul: 1,
    draftSize: 3,
    reviveTokens: 0,
    startPerks: 0,
  };

  if (metaApply) metaApply(s); // permanent meta-progression foundation
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

  s.dashDamage += stacks.pierce ?? 0;
  s.killStaminaRefund += 20 * (stacks.siphon ?? 0);
  s.comboWindowBonus += 0.6 * (stacks.slipstream ?? 0);

  const nv = stacks.nova ?? 0;
  if (nv > 0) s.dashNovaRadius = 90 + 30 * (nv - 1);

  const rf = stacks.reflect ?? 0;
  if (rf > 0) s.dashShatterRadius = 22 + 14 * (rf - 1); // widens the bullet-shatter band per stack

  if (evoApply) evoApply(s); // evolutions are the capstone — built on top of perks

  return s;
}

export function applyPerk(stacks: PerkStacks, id: PerkId): void {
  stacks[id] = (stacks[id] ?? 0) + 1;
}

/** Human-readable build summary, e.g. "Long Lance×2, Chain Reaction×3". */
export function describeStacks(stacks: PerkStacks): string {
  const parts: string[] = [];
  for (const id of Object.keys(PERKS) as PerkId[]) {
    if (id === 'shardcache') continue;
    const n = stacks[id] ?? 0;
    if (n > 0) parts.push(n > 1 ? `${PERKS[id].name}×${n}` : PERKS[id].name);
  }
  return parts.join(', ');
}

function isEligible(stacks: PerkStacks, id: PerkId): boolean {
  if (id === 'shardcache') return false;
  return (stacks[id] ?? 0) < PERKS[id].maxStacks;
}

/** Offer `size` distinct perks not yet maxed; fill with Shard Cache if short. */
export function rollDraft(rng: Rng, stacks: PerkStacks, size = 3): PerkDef[] {
  const eligible = (Object.keys(PERKS) as PerkId[]).filter((id) => isEligible(stacks, id));
  // Fisher–Yates shuffle using the seeded rng
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  const out: PerkDef[] = eligible.slice(0, size).map((id) => PERKS[id]);
  while (out.length < size) out.push(PERKS.shardcache);
  return out;
}
