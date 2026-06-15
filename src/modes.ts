// Game modes. Every mode is data (a RunConfig) so the director + game read off
// it instead of a `daily` boolean. Endless/Daily/Nightmare are time-driven;
// Arena and Boss Rush are scripted and WINNABLE (a real victory state).

import type { EnemyKind } from './types';

// v6 §4 — declarative per-mode rules. Optional + additive: an absent `rules` block
// means today's behavior EXACTLY. Each flag hangs off ONE read site (events is wired
// here; oneLife/scoreFrame/suddenDeath/biomeLock/perkCadenceMul get their read sites
// in the mode-identity phase). Pure data — rides the Heat/mutator clone pipeline by
// reference (read-only; a future per-run-mutable rule must deep-clone at that point).
export interface ModeRules {
  events?: 'normal' | 'none' | 'curated';
  oneLife?: boolean;
  scoreFrame?: 'survival' | 'cleartime' | 'nohit';
  suddenDeath?: { afterBoss?: number; graceSeconds?: number };
  biomeLock?: number;
  perkCadenceMul?: number;
}

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
  cipherLock?: boolean; // ring-cipher bosses (Warden/Weaver/Beacon) armored until decoded — THE LONGEST DAY
  rules?: ModeRules; // v6 §4: optional declarative mode rules; absent = today's behavior
}

const ENDLESS: RunConfig = {
  id: 'endless', name: 'ENDLESS', desc: 'Survive as long as you can. The classic.',
  seedKind: 'random', intensityMul: 1, spawnMul: 1, bossInterval: 70, speedBonus: 0,
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
    seedKind: 'date', intensityMul: 1, spawnMul: 1, bossInterval: 70, speedBonus: 0,
    shieldStart: 110, shieldMax: 0.35, shardMul: 1, perks: true, canFail: true, arena: false, bossrush: false,
  },
  {
    id: 'nightmare', name: 'NIGHTMARE', desc: 'Faster, denser, deadlier. +75% shards.',
    seedKind: 'random', intensityMul: 1.35, spawnMul: 0.8, bossInterval: 55, speedBonus: 0.12,
    shieldStart: 55, shieldMax: 0.5, shardMul: 1.75, perks: true, canFail: true, arena: false, bossrush: false,
  },
  {
    id: 'bossrush', name: 'BOSS RUSH', desc: 'All six bosses, back to back. No chaff.',
    seedKind: 'random', intensityMul: 1, spawnMul: 1, bossInterval: 45, speedBonus: 0.06,
    shieldStart: 999, shieldMax: 0, shardMul: 1.3, perks: true, canFail: true, arena: false, bossrush: true,
  },
  {
    id: 'longestday', name: 'THE LONGEST DAY',
    desc: 'Every boss is a cipher. Break the code, bring the light back — to the longest day.',
    seedKind: 'random', intensityMul: 1.05, spawnMul: 1, bossInterval: 38, speedBonus: 0,
    shieldStart: 110, shieldMax: 0.35, shardMul: 1.25, perks: true, canFail: true, arena: false, bossrush: false,
    cipherLock: true,
  },
];

export function modeById(id: string): RunConfig {
  return MODES.find((m) => m.id === id) ?? ENDLESS;
}

/** v6 §5 — a short difficulty/reward brief derived purely from a RunConfig, for the
 *  title mode-cards. A display heuristic ONLY — keep OUT of tune.ts and any sim path. */
export function modeBrief(cfg: RunConfig): { tier: string; reward: string; note: string } {
  const d = cfg.intensityMul * (1 / cfg.spawnMul) * (1 + cfg.speedBonus);
  const tier = d >= 1.3 ? 'BRUTAL' : d >= 1.1 ? 'HARD' : 'STANDARD';
  const reward = `×${cfg.shardMul} shards`;
  const note = cfg.arena || cfg.bossrush ? 'WINNABLE' : cfg.cipherLock ? 'CIPHER' : cfg.seedKind === 'date' ? 'SEEDED' : '';
  return { tier, reward, note };
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
