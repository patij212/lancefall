// SURVIVAL — the ARMOR hit-buffer decision (v6 §7). Pure + total, mirroring clutch.ts:
// a would-be-lethal hit is offered to the per-run shield buffer BEFORE LAST BREATH.
// No rng, no state beyond the shield count, so it is trivially deterministic + tested.

import type { ModeRules } from './modes';

/** Offer a lethal hit to the ARMOR buffer. Survives (and spends one shield) iff any
 *  shield remains; otherwise the hit passes through to LAST BREATH / revive / death. */
export function consumeShield(shields: number): { survived: boolean; shields: number } {
  return shields > 0 ? { survived: true, shields: shields - 1 } : { survived: false, shields };
}

/** Restore one shield on a boss clear, capped at the run maximum (never overfills). */
export function regenShield(shields: number, max: number): number {
  return Math.min(max, shields + 1);
}

/** The ARMOR shield count a run actually STARTS with, given the derived base (already
 *  Heat-stripped) and the selected mode's rules: NIGHTMARE sudden death strips the cushion
 *  to zero (the true one-hit veteran tier); CASUAL grants its accessibility cushion on top.
 *  The single source of truth shared by the run (game.start) and the loadout preview
 *  (ui.paintArmorPips), so the pip count the player SEES can never drift from what a run
 *  hands them. Pure + total; mirrors the start-of-run assignment order (strip, then grant). */
export function runShields(base: number, rules?: ModeRules): number {
  let s = Math.max(0, base);
  if (rules?.suddenDeath) s = 0;
  s += rules?.casualShields ?? 0;
  return s;
}
