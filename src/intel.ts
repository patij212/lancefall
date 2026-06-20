// src/intel.ts — DECRYPTION INTEL. Fully decrypting a boss's transmission grants a real run
// advantage vs THAT boss: +damage and a tell-readability emphasis. PURE save read (no rng, no
// sim). The CALLER applies the effect ONLY in non-seeded modes (seeded Daily/Weekly stay
// bit-identical for everyone) — this module just reports the numbers.
import type { SaveData } from './save';
import type { EnemyKind } from './types';
import { INTERCEPTS, isInterceptComplete } from './intercepts';

export const BOSS_TRANSMISSION: Partial<Record<EnemyKind, string>> = {
  warden: 'int-warden', weaver: 'int-weaver', beacon: 'int-beacon',
  mirrorblade: 'int-mirror', hollow: 'int-hollow', sovereign: 'int-crown',
};

export const INTEL_DAMAGE = 0.12; // +12% damage vs a decrypted boss
export const INTEL_TELL = 0.25;   // telegraph reads ~25% earlier/stronger (render-side)

export interface BossIntel { decrypted: boolean; damageBonus: number; tellBonus: number; }

export function bossIntel(save: SaveData, kind: EnemyKind): BossIntel {
  const id = BOSS_TRANSMISSION[kind];
  const ic = id ? INTERCEPTS.find((i) => i.id === id) : undefined;
  const decrypted = !!ic && isInterceptComplete(save, ic);
  return {
    decrypted,
    damageBonus: decrypted ? INTEL_DAMAGE : 0,
    tellBonus: decrypted ? INTEL_TELL : 0,
  };
}
