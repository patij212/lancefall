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
  enemySpeedAdd: number; // added to RunConfig.speedBonus
  spawnMulMod: number; // multiplied into RunConfig.spawnMul (<1 = denser)
  bossIntervalMod: number; // multiplied into RunConfig.bossInterval (<1 = sooner)
  revivesLost: number; // subtracted from RunStats.reviveTokens (floor 0)
  grazeRadiusMod: number; // multiplied into RunStats.grazeRadius (<1 = tighter)
  desc: string;
}

export const HEAT_LEVELS: HeatLevel[] = [
  { level: 0, name: 'COLD', accent: '#67e8f9', scoreMul: 1, enemySpeedAdd: 0, spawnMulMod: 1, bossIntervalMod: 1, revivesLost: 0, grazeRadiusMod: 1, desc: 'Standard rules. No bonus.' },
  { level: 1, name: 'WARM', accent: '#5beaff', scoreMul: 1.15, enemySpeedAdd: 0.05, spawnMulMod: 1, bossIntervalMod: 1, revivesLost: 0, grazeRadiusMod: 1, desc: 'A touch faster. +15% score.' },
  { level: 2, name: 'HEATED', accent: '#86efac', scoreMul: 1.3, enemySpeedAdd: 0.1, spawnMulMod: 0.95, bossIntervalMod: 1, revivesLost: 0, grazeRadiusMod: 1, desc: 'Faster, denser. +30% score.' },
  { level: 3, name: 'SCORCHED', accent: '#fde047', scoreMul: 1.5, enemySpeedAdd: 0.15, spawnMulMod: 0.9, bossIntervalMod: 1, revivesLost: 0, grazeRadiusMod: 0.92, desc: 'Tighter graze window. +50% score.' },
  { level: 4, name: 'BLAZING', accent: '#fbbf24', scoreMul: 1.75, enemySpeedAdd: 0.2, spawnMulMod: 0.85, bossIntervalMod: 0.88, revivesLost: 1, grazeRadiusMod: 0.88, desc: 'Bosses sooner, −1 revive. +75% score.' },
  { level: 5, name: 'SEARING', accent: '#fb923c', scoreMul: 2.1, enemySpeedAdd: 0.25, spawnMulMod: 0.8, bossIntervalMod: 0.8, revivesLost: 1, grazeRadiusMod: 0.84, desc: 'Relentless. +110% score.' },
  { level: 6, name: 'INFERNO', accent: '#f97316', scoreMul: 2.55, enemySpeedAdd: 0.32, spawnMulMod: 0.74, bossIntervalMod: 0.72, revivesLost: 2, grazeRadiusMod: 0.79, desc: 'Brutal pace. +155% score.' },
  { level: 7, name: 'MELTDOWN', accent: '#ef4444', scoreMul: 3.2, enemySpeedAdd: 0.4, spawnMulMod: 0.68, bossIntervalMod: 0.65, revivesLost: 3, grazeRadiusMod: 0.74, desc: 'Maximum heat. +220% score. Good luck.' },
];

export function heatLevel(level: number): HeatLevel {
  return HEAT_LEVELS[Math.max(0, Math.min(MAX_HEAT, Math.floor(level)))];
}

/** RunStats effects — applied in the postApply capstone slot. */
export function applyHeatStats(s: RunStats, level: number): void {
  const h = heatLevel(level);
  s.scoreMul *= h.scoreMul;
  s.grazeRadius *= h.grazeRadiusMod;
  s.reviveTokens = Math.max(0, s.reviveTokens - h.revivesLost);
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

export function describeHeat(level: number): string {
  const h = heatLevel(level);
  return level > 0 ? `HEAT ${level} · ${h.name}` : '';
}
