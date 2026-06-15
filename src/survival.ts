// SURVIVAL — the ARMOR hit-buffer decision (v6 §7). Pure + total, mirroring clutch.ts:
// a would-be-lethal hit is offered to the per-run shield buffer BEFORE LAST BREATH.
// No rng, no state beyond the shield count, so it is trivially deterministic + tested.

/** Offer a lethal hit to the ARMOR buffer. Survives (and spends one shield) iff any
 *  shield remains; otherwise the hit passes through to LAST BREATH / revive / death. */
export function consumeShield(shields: number): { survived: boolean; shields: number } {
  return shields > 0 ? { survived: true, shields: shields - 1 } : { survived: false, shields };
}

/** Restore one shield on a boss clear, capped at the run maximum (never overfills). */
export function regenShield(shields: number, max: number): number {
  return Math.min(max, shields + 1);
}
