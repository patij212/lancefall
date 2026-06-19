// Permanent meta-progression. Shards earned across runs buy lasting upgrades —
// the "one more run" engine. Nodes apply to the base RunStats BEFORE ship/perks
// (deriveStats order: base → meta → ship → perks).

import type { RunStats } from './perks';

export type MetaLevels = Partial<Record<string, number>>;

export interface MetaNode {
  id: string;
  name: string;
  desc: string;
  maxLevel: number;
  baseCost: number;
  costMul: number;
  apply: (s: RunStats, level: number) => void;
}

export const META_NODES: MetaNode[] = [
  { id: 'recovery', name: 'Quick Recovery', desc: '+8 stamina regen / sec per level', maxLevel: 5, baseCost: 120, costMul: 1.55, apply: (s, l) => { s.regenPerSec += 8 * l; } },
  { id: 'reach', name: 'Long Reach', desc: '+4% dash length per level', maxLevel: 5, baseCost: 120, costMul: 1.55, apply: (s, l) => { s.dashLenMul += 0.04 * l; } },
  { id: 'edge', name: 'Keen Edge', desc: '+1.5 spear width per level', maxLevel: 4, baseCost: 160, costMul: 1.6, apply: (s, l) => { s.dashHitboxRadius += 1.5 * l; } },
  { id: 'grazer', name: 'Grazer', desc: '+3 graze radius per level', maxLevel: 5, baseCost: 130, costMul: 1.5, apply: (s, l) => { s.grazeRadius += 3 * l; } },
  { id: 'momentum', name: 'Momentum', desc: '+3% move speed per level', maxLevel: 5, baseCost: 120, costMul: 1.5, apply: (s, l) => { s.maxSpeed *= 1 + 0.03 * l; s.accel *= 1 + 0.03 * l; } },
  { id: 'memory', name: 'Combo Memory', desc: '+0.1s combo window per level', maxLevel: 5, baseCost: 150, costMul: 1.55, apply: (s, l) => { s.comboWindowBonus += 0.1 * l; } },
  { id: 'ironwill', name: 'Iron Will', desc: '-12% dash regen lockout per level', maxLevel: 3, baseCost: 180, costMul: 1.7, apply: (s, l) => { s.regenDelay *= Math.pow(0.88, l); } },
  { id: 'scavenger', name: 'Scavenger', desc: '+5% score per level', maxLevel: 5, baseCost: 180, costMul: 1.6, apply: (s, l) => { s.scoreMul += 0.05 * l; } },
  { id: 'treasure', name: 'Treasure Hunter', desc: '+12% shards earned per level', maxLevel: 5, baseCost: 200, costMul: 1.6, apply: (s, l) => { s.shardMul += 0.12 * l; } },
  { id: 'fortune', name: 'Fortune', desc: 'Perk drafts offer a 4th card', maxLevel: 1, baseCost: 900, costMul: 2, apply: (s) => { s.draftSize = 4; } },
  { id: 'headstart', name: 'Head Start', desc: 'Begin each run with a random perk', maxLevel: 2, baseCost: 700, costMul: 2.2, apply: (s, l) => { s.startPerks += l; } },
  { id: 'secondchance', name: 'Second Chance', desc: 'Revive once per run on death', maxLevel: 1, baseCost: 1500, costMul: 2, apply: (s, l) => { s.reviveTokens += l; } },
  // ── PARRY branch — the second verb's permanent guard upgrades (overhaul P2) ──
  { id: 'parryReach', name: 'Long Guard', desc: '+14 parry reach per level', maxLevel: 5, baseCost: 140, costMul: 1.55, apply: (s, l) => { s.parryReach += 14 * l; } },
  { id: 'parryWide', name: 'Wide Guard', desc: '+0.27rad parry width per level', maxLevel: 5, baseCost: 150, costMul: 1.55, apply: (s, l) => { s.parryHalfAngle += 0.27 * l; } },
  { id: 'parryRecover', name: 'Quick Recover', desc: '-0.03s parry recovery per level', maxLevel: 5, baseCost: 160, costMul: 1.6, apply: (s, l) => { s.parryRecover += 0.03 * l; } },
  { id: 'parryStreak', name: 'Streak Memory', desc: '+0.4s parry-streak window per level', maxLevel: 5, baseCost: 170, costMul: 1.6, apply: (s, l) => { s.parryStreakWindow += 0.4 * l; } },
  { id: 'parryPerfect', name: 'Perfect Frame', desc: '+0.025s perfect-frame window per level', maxLevel: 3, baseCost: 600, costMul: 2, apply: (s, l) => { s.parryPerfectWindow += 0.025 * l; } },
];

export function metaNode(id: string): MetaNode | undefined {
  return META_NODES.find((n) => n.id === id);
}

/** Shard cost to buy the NEXT level of a node (given its current level). */
export function nodeCost(node: MetaNode, currentLevel: number): number {
  return Math.round(node.baseCost * Math.pow(node.costMul, currentLevel));
}

/** A closure that applies all owned meta levels to a RunStats block. */
export function metaApplyFor(levels: MetaLevels): (s: RunStats) => void {
  return (s: RunStats) => {
    for (const node of META_NODES) {
      const l = levels[node.id] ?? 0;
      if (l > 0) node.apply(s, l);
    }
  };
}
