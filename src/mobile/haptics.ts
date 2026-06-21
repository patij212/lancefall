// Mobile haptics — thin navigator.vibrate wrappers, gated by the user setting AND device
// capability. A NO-OP on desktop (no navigator.vibrate), exactly like gamepad rumble is a
// no-op without a pad — so call sites stay unconditional and desktop is provably unaffected.

let enabled = true;

/** Mirror the settings.haptics flag (called from applySettings). */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

function buzz(pattern: number | number[]): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported — silently ignore */
  }
}

/** Short, crisp cues — never long enough to feel buzzy. */
export const haptics = {
  dash: () => buzz(10), // a light tick when a dash launches
  hit: () => buzz(35), // a firmer thud when a hit lands on the player
  parry: () => buzz([14, 20, 14]), // a satisfying double-pulse on a clean parry
};
