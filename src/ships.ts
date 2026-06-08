// Ship roster — the meta-progression layer. Each ship is a distinct playstyle
// (a stat profile applied to the base RunStats before perks), unlocked by
// spending shards earned across runs. No new mechanics — just feel.

import type { RunStats } from './perks';

export interface ShipDef {
  id: string;
  name: string;
  desc: string;
  accent: string;
  unlockShards: number;
  /** mutate the base stat block (runs before perks) */
  apply: (s: RunStats) => void;
}

export const SHIPS: ShipDef[] = [
  {
    id: 'lance',
    name: 'LANCE',
    desc: 'Balanced. The standard blade — 3 stamina, even handling.',
    accent: '#22d3ee',
    unlockShards: 0,
    apply: () => {},
  },
  {
    id: 'glaive',
    name: 'GLAIVE',
    desc: 'Glass cannon. Long dash, wide spear, +speed — but only 2 stamina.',
    accent: '#ec4899',
    unlockShards: 1200,
    apply: (s) => {
      s.dashLenMul *= 1.35;
      s.dashHitboxRadius += 6;
      s.staminaSegments = 2;
      s.maxSpeed *= 1.08;
      s.accel *= 1.1;
    },
  },
  {
    id: 'bastion',
    name: 'BASTION',
    desc: 'Tank. 4 stamina and fast regen — but a shorter dash and slower drift.',
    accent: '#34d399',
    unlockShards: 3000,
    apply: (s) => {
      s.staminaSegments = 4;
      s.regenPerSec += 28;
      s.regenDelay *= 0.7;
      s.dashLenMul *= 0.85;
      s.maxSpeed *= 0.85;
    },
  },
  {
    id: 'tempest',
    name: 'TEMPEST',
    desc: 'Nimble. Fast drift + acceleration and quick regen, with a slightly shorter dash.',
    accent: '#818cf8',
    unlockShards: 2000,
    apply: (s) => {
      s.maxSpeed *= 1.2;
      s.accel *= 1.3;
      s.regenPerSec += 18;
      s.dashLenMul *= 0.92;
    },
  },
  {
    id: 'phantom',
    name: 'PHANTOM',
    desc: 'Knife-edge. Huge dash, fastest regen, +speed — but a SINGLE stamina segment.',
    accent: '#f472b6',
    unlockShards: 4500,
    apply: (s) => {
      s.staminaSegments = 1;
      s.regenPerSec += 70;
      s.regenDelay *= 0.4;
      s.dashLenMul *= 1.6;
      s.dashHitboxRadius += 6;
      s.maxSpeed *= 1.18;
      s.accel *= 1.15;
    },
  },
];

export function shipById(id: string): ShipDef {
  return SHIPS.find((s) => s.id === id) ?? SHIPS[0];
}
