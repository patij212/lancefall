// POWER-UP DROPS — temporary, build-agnostic power spikes dropped by bosses and
// elite Champions. One is active at a time (a new pickup replaces the current),
// and the effect rides the existing stat pipeline via a single applier in the
// World's postApply/capstone slot, so it composes cleanly with perks/relics/heat.
// Pure: the buff math + the timed-state machine live here and are unit-tested.

import type { RunStats } from './perks';
import type { PowerupKind } from './types';

export interface PowerupDef {
  kind: PowerupKind;
  name: string;
  color: string;
  blurb: string;
  duration: number; // seconds
  apply: (s: RunStats) => void;
}

export const POWERUPS: Record<PowerupKind, PowerupDef> = {
  overreach: {
    kind: 'overreach', name: 'OVERREACH', color: '#22d3ee', blurb: 'huge spear reach',
    duration: 9,
    apply: (s) => { s.dashHitboxRadius *= 2.4; s.dashLenMul += 0.5; },
  },
  haste: {
    kind: 'haste', name: 'HASTE', color: '#34d399', blurb: 'speed + cheap dashes',
    duration: 9,
    apply: (s) => { s.maxSpeed *= 1.55; s.accel *= 1.6; s.regenPerSec *= 2.5; s.regenDelay *= 0.4; s.dashCostMul *= 0.6; },
  },
  frenzy: {
    kind: 'frenzy', name: 'FRENZY', color: '#ff3b6b', blurb: 'carnage: +damage, kill-fuel, chains',
    duration: 9,
    apply: (s) => {
      s.dashDamage += 3;
      s.killStaminaRefund += 18;
      s.chainRadius = Math.max(s.chainRadius, 90);
      s.chainDmg = Math.max(s.chainDmg, 1);
    },
  },
  greed: {
    kind: 'greed', name: 'GREED', color: '#fbbf24', blurb: 'double score + shards',
    duration: 10,
    apply: (s) => { s.scoreMul *= 2; s.shardMul *= 2; },
  },
  aegis: {
    kind: 'aegis', name: 'AEGIS', color: '#a78bfa', blurb: 'grazing keeps you alive',
    duration: 10,
    apply: (s) => { s.grazeRadius *= 1.9; s.grazeStaminaRefund += 10; s.grazeComboBonus += 0.45; },
  },
};

export const POWERUP_KINDS: PowerupKind[] = ['overreach', 'haste', 'frenzy', 'greed', 'aegis'];

export interface PowerupState {
  active: PowerupKind | null;
  timer: number; // seconds remaining
  total: number; // duration of the active buff (for the HUD bar)
}

export function makePowerup(): PowerupState {
  return { active: null, timer: 0, total: 0 };
}

export function resetPowerup(p: PowerupState): void {
  p.active = null;
  p.timer = 0;
  p.total = 0;
}

/** Advance the active buff. Returns true on the frame it expires. */
export function tickPowerup(p: PowerupState, dt: number): boolean {
  if (!p.active) return false;
  p.timer -= dt;
  if (p.timer <= 0) {
    p.active = null;
    p.timer = 0;
    p.total = 0;
    return true;
  }
  return false;
}

/** Activate a buff (replacing any current one). */
export function activatePowerup(p: PowerupState, kind: PowerupKind): void {
  p.active = kind;
  p.timer = POWERUPS[kind].duration;
  p.total = POWERUPS[kind].duration;
}

/** Apply the active buff's stat effect (no-op when none). For the stat pipeline. */
export function applyPowerup(p: PowerupState, s: RunStats): void {
  if (p.active) POWERUPS[p.active].apply(s);
}

/** Pick a random drop kind (uses the seeded world rng so the Daily stays fair). */
export function rollPowerup(rng: { int: (a: number, b: number) => number }): PowerupKind {
  return POWERUP_KINDS[rng.int(0, POWERUP_KINDS.length - 1)];
}
