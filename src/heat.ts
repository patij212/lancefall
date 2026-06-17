// HEAT ascension ladder — a Hades-style prestige difficulty selectable before a
// run. Each level stacks concrete modifiers and grants a score multiplier, so
// pushing heat is the veteran's "one more run" score-chase. Pure data + appliers:
//   • applyHeatStats(s, level)  — RunStats effects, fed through World.postApply.
//   • applyHeatConfig(cfg,level) — director effects on a CLONE of the RunConfig.
// Heat 0 is a true no-op (heat is opt-in, zero cost at 0).

import type { RunStats } from './perks';
import type { RunConfig } from './modes';

export const MAX_HEAT = 7;

export interface HeatLevel {
  level: number;
  name: string;
  accent: string;
  scoreMul: number; // multiplied into RunStats.scoreMul
  shardMul: number; // multiplied into RunStats.shardMul — a GENTLE curve (flatter than scoreMul) so veterans earn meta currency faster without trivializing the meta-tree pacing
  enemySpeedAdd: number; // added to RunConfig.speedBonus
  spawnMulMod: number; // multiplied into RunConfig.spawnMul (<1 = denser)
  bossIntervalMod: number; // multiplied into RunConfig.bossInterval (<1 = sooner)
  revivesLost: number; // subtracted from RunStats.reviveTokens (floor 0)
  shieldsLost: number; // subtracted from RunStats.baseShields — ARMOR §7 (floor 0)
  grazeRadiusMod: number; // multiplied into RunStats.grazeRadius (<1 = tighter)
  desc: string;
}

export const HEAT_LEVELS: HeatLevel[] = [
  { level: 0, name: 'COLD', accent: '#67e8f9', scoreMul: 1, shardMul: 1, enemySpeedAdd: 0, spawnMulMod: 1, bossIntervalMod: 1, revivesLost: 0, shieldsLost: 0, grazeRadiusMod: 1, desc: 'Standard rules. No bonus.' },
  { level: 1, name: 'WARM', accent: '#5beaff', scoreMul: 1.15, shardMul: 1.08, enemySpeedAdd: 0.05, spawnMulMod: 1, bossIntervalMod: 1, revivesLost: 0, shieldsLost: 0, grazeRadiusMod: 1, desc: 'A touch faster. +15% score, +8% shards.' },
  { level: 2, name: 'HEATED', accent: '#86efac', scoreMul: 1.3, shardMul: 1.16, enemySpeedAdd: 0.1, spawnMulMod: 0.95, bossIntervalMod: 1, revivesLost: 0, shieldsLost: 0, grazeRadiusMod: 1, desc: 'Faster, denser. +30% score, +16% shards.' },
  { level: 3, name: 'SCORCHED', accent: '#fde047', scoreMul: 1.5, shardMul: 1.25, enemySpeedAdd: 0.15, spawnMulMod: 0.9, bossIntervalMod: 1, revivesLost: 0, shieldsLost: 0, grazeRadiusMod: 0.92, desc: 'Tighter graze window. +50% score, +25% shards.' },
  { level: 4, name: 'BLAZING', accent: '#fbbf24', scoreMul: 1.75, shardMul: 1.4, enemySpeedAdd: 0.2, spawnMulMod: 0.85, bossIntervalMod: 0.88, revivesLost: 1, shieldsLost: 0, grazeRadiusMod: 0.88, desc: 'Bosses sooner, −1 revive. +75% score, +40% shards.' },
  { level: 5, name: 'SEARING', accent: '#fb923c', scoreMul: 2.1, shardMul: 1.6, enemySpeedAdd: 0.25, spawnMulMod: 0.8, bossIntervalMod: 0.8, revivesLost: 1, shieldsLost: 1, grazeRadiusMod: 0.84, desc: 'Relentless, −1 ARMOR. +110% score, +60% shards.' },
  { level: 6, name: 'INFERNO', accent: '#f97316', scoreMul: 2.55, shardMul: 1.85, enemySpeedAdd: 0.32, spawnMulMod: 0.74, bossIntervalMod: 0.72, revivesLost: 2, shieldsLost: 1, grazeRadiusMod: 0.79, desc: 'Brutal pace, −1 ARMOR. +155% score, +85% shards.' },
  { level: 7, name: 'MELTDOWN', accent: '#ef4444', scoreMul: 3.2, shardMul: 2.2, enemySpeedAdd: 0.4, spawnMulMod: 0.68, bossIntervalMod: 0.65, revivesLost: 3, shieldsLost: 2, grazeRadiusMod: 0.74, desc: 'No ARMOR, no mercy. +220% score, +120% shards. Good luck.' },
];

export function heatLevel(level: number): HeatLevel {
  return HEAT_LEVELS[Math.max(0, Math.min(MAX_HEAT, Math.floor(level)))];
}

/** RunStats effects — applied in the postApply capstone slot. */
export function applyHeatStats(s: RunStats, level: number): void {
  const h = heatLevel(level);
  s.scoreMul *= h.scoreMul;
  s.shardMul *= h.shardMul; // playtest (Nick): "Heat should scale shards too" — rides under the in-run ×6 cap (perks.ts) since postApply runs before it
  s.grazeRadius *= h.grazeRadiusMod;
  s.reviveTokens = Math.max(0, s.reviveTokens - h.revivesLost);
  s.baseShields = Math.max(0, s.baseShields - h.shieldsLost);
}

/** Director effects — returns a CLONE of the RunConfig with heat folded in. */
export function applyHeatConfig(cfg: RunConfig, level: number): RunConfig {
  const h = heatLevel(level);
  const c: RunConfig = { ...cfg };
  c.speedBonus += h.enemySpeedAdd;
  c.spawnMul *= h.spawnMulMod;
  c.bossInterval *= h.bossIntervalMod;
  return c;
}

export function heatScoreMul(level: number): number {
  return heatLevel(level).scoreMul;
}

export function heatShardMul(level: number): number {
  return heatLevel(level).shardMul;
}

export function describeHeat(level: number): string {
  const h = heatLevel(level);
  return level > 0 ? `HEAT ${level} · ${h.name}` : '';
}
