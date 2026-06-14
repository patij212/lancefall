// Game modes. Every mode is data (a RunConfig) so the director + game read off
// it instead of a `daily` boolean. Endless/Daily/Nightmare are time-driven;
// Arena and Boss Rush are scripted and WINNABLE (a real victory state).

import type { EnemyKind } from './types';

export interface RunConfig {
  id: string;
  name: string;
  desc: string;
  seedKind: 'random' | 'date';
  intensityMul: number; // scales the endless intensity curve
  spawnMul: number; // multiplies spawn interval (smaller = denser)
  bossInterval: number; // seconds between bosses (time-driven modes)
  speedBonus: number; // flat add to enemy/bullet speed multipliers
  shieldStart: number; // seconds before shielded variants appear
  shieldMax: number; // max shielded chance
  shardMul: number; // mode shard multiplier (stacks with meta Treasure Hunter)
  perks: boolean; // perk drafts enabled
  canFail: boolean;
  arena: boolean; // scripted finite winnable gauntlet
  bossrush: boolean; // the bosses back-to-back
}

const ENDLESS: RunConfig = {
  id: 'endless', name: 'ENDLESS', desc: 'Survive as long as you can. The classic.',
  seedKind: 'random', intensityMul: 1, spawnMul: 1, bossInterval: 45, speedBonus: 0,
  shieldStart: 110, shieldMax: 0.35, shardMul: 1, perks: true, canFail: true, arena: false, bossrush: false,
};

export const MODES: RunConfig[] = [
  ENDLESS,
  {
    id: 'arena', name: 'ARENA', desc: '15 hand-built waves + 6 bosses. Clear it to WIN.',
    seedKind: 'random', intensityMul: 1, spawnMul: 1, bossInterval: 45, speedBonus: 0,
    shieldStart: 70, shieldMax: 0.35, shardMul: 1.1, perks: true, canFail: true, arena: true, bossrush: false,
  },
  {
    id: 'daily', name: 'ECHO OF THE FALL', desc: "One citizen's last memory of the fall — the same seed, the same echo, for everyone today.",
    seedKind: 'date', intensityMul: 1, spawnMul: 1, bossInterval: 45, speedBonus: 0,
    shieldStart: 110, shieldMax: 0.35, shardMul: 1, perks: true, canFail: true, arena: false, bossrush: false,
  },
  {
    id: 'nightmare', name: 'NIGHTMARE', desc: 'Faster, denser, deadlier. +75% shards.',
    seedKind: 'random', intensityMul: 1.35, spawnMul: 0.8, bossInterval: 35, speedBonus: 0.12,
    shieldStart: 55, shieldMax: 0.5, shardMul: 1.75, perks: true, canFail: true, arena: false, bossrush: false,
  },
  {
    id: 'bossrush', name: 'BOSS RUSH', desc: 'All six bosses, back to back. No chaff.',
    seedKind: 'random', intensityMul: 1, spawnMul: 1, bossInterval: 45, speedBonus: 0.06,
    shieldStart: 999, shieldMax: 0, shardMul: 1.3, perks: true, canFail: true, arena: false, bossrush: true,
  },
];

export function modeById(id: string): RunConfig {
  return MODES.find((m) => m.id === id) ?? ENDLESS;
}

export type ArenaWave =
  | { kind: 'wave'; budget: number; enemies: EnemyKind[] }
  | { kind: 'boss'; boss: EnemyKind };

/** The 15-wave Arena gauntlet (6 bosses, capped by the Sovereign). Each wave
 *  must be fully cleared to advance. */
export const ARENA_SCRIPT: ArenaWave[] = [
  { kind: 'wave', budget: 6, enemies: ['darter'] },
  { kind: 'wave', budget: 8, enemies: ['darter', 'orbiter'] },
  { kind: 'wave', budget: 10, enemies: ['darter', 'orbiter'] },
  { kind: 'boss', boss: 'warden' },
  { kind: 'wave', budget: 14, enemies: ['darter', 'orbiter', 'splitter'] },
  { kind: 'wave', budget: 16, enemies: ['darter', 'splitter', 'orbiter'] },
  { kind: 'wave', budget: 18, enemies: ['darter', 'orbiter', 'splitter', 'bloomer'] },
  { kind: 'boss', boss: 'weaver' },
  { kind: 'wave', budget: 20, enemies: ['darter', 'orbiter', 'splitter', 'bloomer'] },
  { kind: 'wave', budget: 22, enemies: ['orbiter', 'bloomer', 'splitter'] },
  { kind: 'wave', budget: 24, enemies: ['darter', 'orbiter', 'splitter', 'bloomer'] },
  { kind: 'boss', boss: 'beacon' },
  { kind: 'wave', budget: 24, enemies: ['darter', 'orbiter', 'lancer', 'bloomer'] },
  { kind: 'wave', budget: 26, enemies: ['drifter', 'lancer', 'herald'] },
  { kind: 'boss', boss: 'mirrorblade' },
  { kind: 'wave', budget: 28, enemies: ['drifter', 'shade', 'orbiter', 'bomber'] },
  { kind: 'wave', budget: 30, enemies: ['shade', 'drifter', 'splitter', 'bloomer'] },
  { kind: 'boss', boss: 'hollow' },
  { kind: 'wave', budget: 30, enemies: ['shade', 'drifter', 'herald', 'bomber'] },
  { kind: 'wave', budget: 32, enemies: ['drifter', 'seeker', 'bloomer', 'herald'] },
  { kind: 'boss', boss: 'sovereign' },
];

export const BOSSRUSH_SEQUENCE: EnemyKind[] = ['warden', 'weaver', 'beacon', 'mirrorblade', 'hollow', 'sovereign'];
