import { describe, it, expect } from 'vitest';
import { ONBOARDING, ONBOARDING_STEPS, hintFor, beatTeachState, BEAT_HINT_TEXT } from './onboarding';
import type { OnboardTrigger } from './onboarding';

describe('onboarding sequence', () => {
  it('steps are 0..N-1 in order with distinct triggers in sequence', () => {
    ONBOARDING.forEach((h, i) => expect(h.step).toBe(i));
    expect(ONBOARDING_STEPS).toBe(ONBOARDING.length);
  });

  it('only the current step’s trigger advances; others are ignored', () => {
    // at step 0 only "start" matches
    expect(hintFor(0, 'start')?.step).toBe(0);
    expect(hintFor(0, 'kill')).toBeNull();
    expect(hintFor(0, 'dash')).toBeNull();
    // at step 1 only "dash" matches
    expect(hintFor(1, 'dash')?.step).toBe(1);
    expect(hintFor(1, 'comboBreak')).toBeNull();
  });

  it('walking the triggers in order completes the sequence exactly once', () => {
    const order: OnboardTrigger[] = ['start', 'dash', 'kill', 'comboBreak'];
    let step = 0;
    const shown: string[] = [];
    for (const t of order) {
      const h = hintFor(step, t);
      if (h) {
        shown.push(h.text);
        step++;
      }
    }
    expect(step).toBe(ONBOARDING_STEPS);
    expect(shown.length).toBe(ONBOARDING_STEPS);
    // past the end, nothing more fires
    expect(hintFor(step, 'kill')).toBeNull();
  });
});

describe('C5 beatTeachState (teach dash-on-the-beat)', () => {
  it('shows the ring + hint for the first runs, then retires at the cap', () => {
    expect(beatTeachState(0, 3, 3)).toEqual({ ring: true, hint: true });
    expect(beatTeachState(2, 3, 3)).toEqual({ ring: true, hint: true });
    expect(beatTeachState(3, 3, 3)).toEqual({ ring: false, hint: false }); // retired at the cap
    expect(beatTeachState(10, 3, 3)).toEqual({ ring: false, hint: false });
  });
  it('the hint text is non-empty and mentions the beat', () => {
    expect(BEAT_HINT_TEXT.length).toBeGreaterThan(0);
    expect(BEAT_HINT_TEXT.toLowerCase()).toContain('beat');
  });
});
