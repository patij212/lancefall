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
    name: 'THE LAST LANCE',
    desc: "The last spear left standing when Lancefall fell — the city's last key. Even in every way: 3 stamina, true handling.",
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
      s.staminaSegments = Math.max(1, s.staminaSegments - 1); // relative so a mutator floor (Glass Cannon) survives
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
      s.staminaSegments += 1; // relative tank bonus (won't erase a Glass Cannon floor)
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
      s.staminaSegments = Math.max(1, s.staminaSegments - 2); // knife-edge: base 3 → 1
      s.regenPerSec += 70;
      s.regenDelay *= 0.4;
      s.dashLenMul *= 1.6;
      s.dashHitboxRadius += 6;
      s.maxSpeed *= 1.18;
      s.accel *= 1.15;
    },
  },
  {
    id: 'reaver',
    name: 'REAVER',
    desc: 'Bloodthirsty. Dash-kills refund stamina and the bite is wide — but grazing barely helps and regen is slow. Live by the chain.',
    accent: '#ef4444',
    unlockShards: 3500,
    apply: (s) => {
      s.killStaminaRefund += 16; // dash-kills fuel the next dash — the snowball engine
      s.dashHitboxRadius += 4; // a wider bite to start the chain
      s.comboWindowBonus += 0.3; // aggression keeps the combo alive a touch longer
      s.grazeStaminaRefund *= 0.4; // grazing barely refunds — you must KILL to move
      s.regenPerSec *= 0.65; // sluggish passive regen between fights
    },
  },
];

export function shipById(id: string): ShipDef {
  return SHIPS.find((s) => s.id === id) ?? SHIPS[0];
}
