// Biomes — the run cycles through these stages over time. Each retints the
// nebula backdrop, biases the enemy mix, and applies a light modifier. Kept
// readable (no vision-reducing fog) per the design review.

import type { EnemyKind } from './types';

export interface Biome {
  id: string;
  name: string;
  accent: string;
  nebula: [string, string, string];
  /** multiplicative weight bias per enemy kind (1 = unchanged) */
  bias: Partial<Record<EnemyKind, number>>;
  speedMul: number; // light enemy/bullet speed modifier
  shieldBonus: number; // added to the shielded-variant chance
}

export const BIOME_DURATION = 70; // seconds per biome before cycling — locked to TUNE.director.bossInterval (keep aligned)

export const BIOMES: Biome[] = [
  {
    id: 'void', name: 'THE COURT', accent: '#22d3ee',
    nebula: ['#103040', '#241046', '#2e1030'], bias: {}, speedMul: 1, shieldBonus: 0,
  },
  {
    id: 'ember', name: 'THE EMBERWALL', accent: '#fb923c',
    nebula: ['#3a1810', '#3a1020', '#2a1428'], bias: { darter: 1.6, bomber: 1.6 }, speedMul: 1.08, shieldBonus: 0,
  },
  {
    id: 'lattice', name: 'THE VAULTS', accent: '#38bdf8',
    nebula: ['#0e2840', '#103048', '#142038'], bias: { orbiter: 1.7, lancer: 1.7 }, speedMul: 1, shieldBonus: 0.05,
  },
  {
    id: 'bloom', name: 'THE BLOOMGARDENS', accent: '#a855f7',
    nebula: ['#241040', '#1a3a20', '#2e1030'], bias: { splitter: 1.6, bloomer: 1.6, wisp: 1.6 }, speedMul: 1, shieldBonus: 0,
  },
  {
    id: 'warren', name: 'THE WARRENS', accent: '#a78bfa',
    nebula: ['#1a1030', '#0e2a2a', '#221838'], bias: { brooder: 2.0, shade: 1.5, drifter: 1.4 }, speedMul: 1, shieldBonus: 0,
  },
  {
    id: 'null', name: 'THE NULL', accent: '#94a3b8',
    nebula: ['#1a1f2a', '#15151a', '#202028'], bias: {}, speedMul: 1.12, shieldBonus: 0.12,
  },
];

export function biomeAt(time: number): { biome: Biome; index: number } {
  const index = Math.floor(time / BIOME_DURATION) % BIOMES.length;
  return { biome: BIOMES[index], index };
}
