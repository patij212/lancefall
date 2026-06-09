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

/** The hint to show if `trigger` fires while at `step` (else null). */
export function hintFor(step: number, trigger: OnboardTrigger): OnboardHint | null {
  const h = ONBOARDING[step];
  return h && h.trigger === trigger ? h : null;
}
