// Progressive first-run onboarding. Instead of dumping all tips up front, hints
// surface contextually as the player performs each action for the first time:
// charge a dash, land a dash, then learn graze + combo decay. Pure + ordered —
// only the hint matching the CURRENT step's trigger advances the sequence, so the
// tips always appear in a sensible order regardless of exact timing.

export type OnboardTrigger = 'start' | 'dash' | 'kill' | 'comboBreak';

export interface OnboardHint {
  step: number;
  trigger: OnboardTrigger;
  text: string;
}

export const ONBOARDING: OnboardHint[] = [
  { step: 0, trigger: 'start', text: 'Hold to charge — release to DASH through enemies.' },
  { step: 1, trigger: 'dash', text: 'Skewer several enemies in one dash to build a COMBO.' },
  { step: 2, trigger: 'kill', text: 'Graze bullets — skim them without being hit — to refill stamina.' },
  { step: 3, trigger: 'comboBreak', text: 'Keep chaining: your combo decays if you stop killing.' },
];

export const ONBOARDING_STEPS = ONBOARDING.length;

/** Grid B — the very first prompt a brand-new player sees, surfaced as the BIG center
 *  callout (not just a toast) so the core verb can't be missed. Paired with a short
 *  no-fail opening grace (see ONBOARD.firstRunGrace) so they can practise without dying. */
export const FIRST_DASH_PROMPT = 'HOLD then RELEASE to DASH';

/** The hint to show if `trigger` fires while at `step` (else null). */
export function hintFor(step: number, trigger: OnboardTrigger): OnboardHint | null {
  const h = ONBOARDING[step];
  return h && h.trigger === trigger ? h : null;
}

/** C5 (v6 §1) — the dash-on-the-beat teaching nudge. */
export const BEAT_HINT_TEXT = 'Dash ON THE BEAT — release as the ring tightens to bloom the city.';

/** C5 — for a player's first few runs, auto-show the beat-ring and offer a one-time
 *  dash-on-beat hint (a soft nudge, NOT flipping the rhythmAssist default). Pure. */
export function beatTeachState(runs: number, capRing: number, capHint: number): { ring: boolean; hint: boolean } {
  return { ring: runs < capRing, hint: runs < capHint };
}
