import { describe, it, expect } from 'vitest';
import { ONBOARDING, ONBOARDING_STEPS, hintFor, beatTeachState, BEAT_HINT_TEXT, FIRST_DASH_PROMPT } from './onboarding';
import type { OnboardTrigger } from './onboarding';
import { ONBOARD } from './tune';

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

describe('Grid B — first-run dash teaching', () => {
  it('the prominent first prompt teaches the core verb (hold + release = dash)', () => {
    const lower = FIRST_DASH_PROMPT.toLowerCase();
    expect(FIRST_DASH_PROMPT.length).toBeGreaterThan(0);
    expect(lower).toContain('hold');
    expect(lower).toContain('release');
    expect(lower).toContain('dash');
  });

  it('the no-fail opening grace is a positive, bounded wall-clock window', () => {
    // a pure time gate — long enough to learn the dash, short enough not to trivialise the run
    expect(ONBOARD.firstRunGrace).toBeGreaterThan(0);
    expect(ONBOARD.firstRunGrace).toBeLessThanOrEqual(8);
  });
});
