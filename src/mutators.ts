// Run MUTATORS — global modifiers that give a run a distinct mechanical identity.
// Two effect surfaces, both data-driven:
//   • apply(RunStats)   — stat effects, fed through World.mutatorApply (the Phase-0
//                         hook), so they land before ship/perks and perks stack on top.
//   • config(RunConfig) — director effects, applied to a CLONE of the RunConfig that
//                         the Director is configured with (spawn density, speed, …).
//   • eliteChanceMul / eliteMaxAdd — champion-spawn tuning the game reads directly.
// The Daily picks its mutators deterministically from the date seed (a SEPARATE
// PRNG stream so it never perturbs world.rng — daily runs stay identical for all).

import type { RunStats } from './perks';
import type { RunConfig } from './modes';
import { createRng } from './rng';

export type MutatorId =
  | 'doubleChampions'
  | 'glassCannon'
  | 'bulletStorm'
  | 'fogOfWar'
  | 'berserk'
  | 'windfall'
  | 'warlords';

export interface MutatorDef {
  id: MutatorId;
  name: string;
  desc: string;
  accent: string;
  apply?: (s: RunStats) => void;
  config?: (c: RunConfig) => void;
  eliteChanceMul?: number;
  eliteMaxAdd?: number;
}

export const MUTATORS: Record<MutatorId, MutatorDef> = {
  doubleChampions: {
    id: 'doubleChampions',
    name: 'CHAMPION TIDE',
    desc: 'Elites are far more common — up to four at once. Big bounties, big danger.',
    accent: '#fde047',
    eliteChanceMul: 1.9,
    eliteMaxAdd: 2,
  },
  glassCannon: {
    id: 'glassCannon',
    name: 'GLASS CANNON',
    desc: 'One stamina segment only — but score pours in ×1.6.',
    accent: '#fb7185',
    apply: (s) => {
      s.staminaSegments = 1;
      s.scoreMul *= 1.6;
    },
  },
  bulletStorm: {
    id: 'bulletStorm',
    name: 'BULLET STORM',
    desc: 'Denser waves and faster bullets. The screen fills with lead.',
    accent: '#38bdf8',
    config: (c) => {
      c.spawnMul *= 0.78;
      c.speedBonus += 0.15;
    },
  },
  fogOfWar: {
    id: 'fogOfWar',
    name: 'FOG OF WAR',
    desc: 'You can only see what is near you. Read the dark.',
    accent: '#94a3b8',
    apply: (s) => {
      s.fogRadius = 300;
    },
  },
  berserk: {
    id: 'berserk',
    name: 'BERSERK',
    desc: 'A huge combo window — it barely decays — but everything moves much faster.',
    accent: '#f97316',
    apply: (s) => {
      // a long-but-finite window (a real kill drought still breaks it) — the
      // forgiveness IS the reward, so no flat score bonus on top.
      s.comboWindowBonus += 5;
    },
    config: (c) => {
      c.speedBonus += 0.25;
    },
  },
  windfall: {
    id: 'windfall',
    name: 'WINDFALL',
    desc: 'Shards rain at triple rate. Fund the meta tree fast.',
    accent: '#34d399',
    apply: (s) => {
      s.shardMul *= 3;
    },
  },
  warlords: {
    id: 'warlords',
    name: 'WARLORDS',
    desc: 'The fallen muster without rest — bosses arrive far more often. +40% shards for holding the siege.',
    accent: '#ef4444',
    config: (c) => {
      c.bossInterval *= 0.6; // a relentless boss cadence woven through the run
    },
    apply: (s) => {
      s.shardMul *= 1.4;
    },
  },
};

const ALL_IDS = Object.keys(MUTATORS) as MutatorId[];

/** Deterministically pick the day's mutators from a date seed (separate stream). */
export function pickDailyMutators(seed: number): MutatorId[] {
  const rng = createRng((seed ^ 0x9e3779b9) >>> 0);
  const ids = ALL_IDS.slice();
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const count = rng.next() < 0.35 ? 2 : 1; // most days one, sometimes a spicy pair
  return ids.slice(0, count);
}

/** Compose the RunStats application for a set of mutators (fed to World.mutatorApply). */
export function buildMutatorApply(ids: MutatorId[]): (s: RunStats) => void {
  return (s) => {
    for (const id of ids) MUTATORS[id].apply?.(s);
  };
}

/** Return a CLONE of the RunConfig with all mutator director-effects applied. */
export function applyMutatorConfig(cfg: RunConfig, ids: MutatorId[]): RunConfig {
  const clone: RunConfig = { ...cfg };
  for (const id of ids) MUTATORS[id].config?.(clone);
  return clone;
}

/** Fold the champion-spawn tuning across a set of mutators. */
export function mutatorElite(ids: MutatorId[]): { chanceMul: number; maxAdd: number } {
  let chanceMul = 1;
  let maxAdd = 0;
  for (const id of ids) {
    chanceMul *= MUTATORS[id].eliteChanceMul ?? 1;
    maxAdd += MUTATORS[id].eliteMaxAdd ?? 0;
  }
  return { chanceMul, maxAdd };
}

/** Human-readable list, e.g. "GLASS CANNON, WINDFALL". */
export function describeMutators(ids: MutatorId[]): string {
  return ids.map((id) => MUTATORS[id].name).join(', ');
}
