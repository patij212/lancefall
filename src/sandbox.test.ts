import { describe, it, expect } from 'vitest';
import {
  newSandbox,
  stepSandbox,
  sandboxComplete,
  currentStep,
  sandboxText,
  shouldShowSandbox,
  sandboxBeatTargets,
  SANDBOX_STEPS,
  type SandboxStep,
  type SandboxEvents,
} from './sandbox';

const NONE: SandboxEvents = {
  beganCharge: false, dashed: false, skewer: false, reached: false,
  heavyDash: false, comboDash: false, grazed: false, parried: false, onBeatDash: false,
};
const DT = 1 / 60;

/** Fire each beat's success trigger in order; returns the final state after the whole teach. */
function walkAllTriggers(): ReturnType<typeof newSandbox> {
  let s = newSandbox();
  s = stepSandbox(s, DT, { ...NONE, beganCharge: true }); // charge  → release
  s = stepSandbox(s, DT, { ...NONE, dashed: true }); //      release → reach
  s = stepSandbox(s, DT, { ...NONE, reached: true }); //     reach   → heavy
  s = stepSandbox(s, DT, { ...NONE, heavyDash: true }); //   heavy   → combo
  s = stepSandbox(s, DT, { ...NONE, comboDash: true }); //   combo   → graze
  s = stepSandbox(s, DT, { ...NONE, grazed: true }); //      graze   → parry
  s = stepSandbox(s, DT, { ...NONE, parried: true }); //     parry   → rhythm
  s = stepSandbox(s, DT, { ...NONE, onBeatDash: true }); //  rhythm  → done
  for (let i = 0; i < 400 && !s.done; i++) s = stepSandbox(s, DT, NONE); // done caps out
  return s;
}

describe('deep sandbox — the 7-beat curriculum', () => {
  it('runs charge → release → reach → heavy → combo → graze → parry → rhythm → done, in order', () => {
    const ids = SANDBOX_STEPS.map((d) => d.step);
    expect(ids).toEqual(['charge', 'release', 'reach', 'heavy', 'combo', 'graze', 'parry', 'rhythm', 'done']);
  });

  it('starts on the charge step, not done', () => {
    const s = newSandbox();
    expect(currentStep(s).step).toBe('charge');
    expect(sandboxComplete(s)).toBe(false);
  });

  it('each beat advances ONLY on its own success trigger', () => {
    let s = newSandbox();
    // charge needs beganCharge (a stray dash does nothing)
    s = stepSandbox(s, DT, { ...NONE, dashed: true });
    expect(currentStep(s).step).toBe('charge');
    s = stepSandbox(s, DT, { ...NONE, beganCharge: true });
    expect(currentStep(s).step).toBe('release');
    // release needs a dash
    s = stepSandbox(s, DT, { ...NONE, dashed: true });
    expect(currentStep(s).step).toBe('reach');
    // reach needs the FAR mark (a near skewer / plain dash doesn't satisfy it)
    s = stepSandbox(s, DT, { ...NONE, dashed: true, skewer: true });
    expect(currentStep(s).step).toBe('reach');
    s = stepSandbox(s, DT, { ...NONE, reached: true });
    expect(currentStep(s).step).toBe('heavy');
    // heavy needs a HEAVY dash (a plain dash doesn't)
    s = stepSandbox(s, DT, { ...NONE, dashed: true });
    expect(currentStep(s).step).toBe('heavy');
    s = stepSandbox(s, DT, { ...NONE, heavyDash: true });
    expect(currentStep(s).step).toBe('combo');
    // combo needs a multi-skewer dash
    s = stepSandbox(s, DT, { ...NONE, skewer: true });
    expect(currentStep(s).step).toBe('combo');
    s = stepSandbox(s, DT, { ...NONE, comboDash: true });
    expect(currentStep(s).step).toBe('graze');
    // graze needs a near-miss
    s = stepSandbox(s, DT, { ...NONE, grazed: true });
    expect(currentStep(s).step).toBe('parry');
    // parry needs a deflect
    s = stepSandbox(s, DT, { ...NONE, parried: true });
    expect(currentStep(s).step).toBe('rhythm');
    // rhythm needs an on-beat dash (a plain dash doesn't)
    s = stepSandbox(s, DT, { ...NONE, dashed: true });
    expect(currentStep(s).step).toBe('rhythm');
    s = stepSandbox(s, DT, { ...NONE, onBeatDash: true });
    expect(currentStep(s).step).toBe('done');
  });

  it('walking every trigger completes the lesson exactly once', () => {
    const s = walkAllTriggers();
    expect(s.done).toBe(true);
    expect(sandboxComplete(s)).toBe(true);
  });

  it('is idempotent once done (no further mutation)', () => {
    let s = walkAllTriggers();
    const snapshot = { ...s };
    s = stepSandbox(s, DT, { ...NONE, onBeatDash: true, parried: true, comboDash: true });
    expect(s).toEqual(snapshot);
  });
});

describe('deep sandbox — no-fail safety', () => {
  it('every step auto-advances on its cap when no trigger fires (no-stuck), completing the sandbox', () => {
    let s = newSandbox();
    // never fire a single trigger — only the per-step caps drive it to completion
    let frames = 0;
    for (; frames < 100000 && !s.done; frames++) s = stepSandbox(s, DT, NONE);
    expect(s.done).toBe(true);
  });

  it('the closing beat advances by cap only (tick never satisfies a trigger)', () => {
    // drive to the 'done' step, then confirm a no-trigger tick still finishes it via the cap
    let s = newSandbox();
    for (let i = 0; i < 8; i++) {
      // fire whatever the current beat needs to step forward fast
      const ev = { ...NONE, beganCharge: true, dashed: true, reached: true, heavyDash: true, comboDash: true, grazed: true, parried: true, onBeatDash: true };
      s = stepSandbox(s, DT, ev);
    }
    expect(currentStep(s).step).toBe('done');
    for (let i = 0; i < 400 && !s.done; i++) s = stepSandbox(s, DT, NONE);
    expect(s.done).toBe(true);
  });
});

describe('deep sandbox — per-beat copy reads clearly', () => {
  const text = (step: SandboxStep) => SANDBOX_STEPS.find((d) => d.step === step)!.text.toLowerCase();
  it('the overlay text names the mechanic each beat teaches', () => {
    expect(text('charge')).toContain('hold');
    expect(text('release')).toContain('release');
    expect(text('reach')).toContain('charge'); // charge depth — "long charge, long dash"
    expect(text('heavy')).toMatch(/heavy|overcharge/);
    expect(text('combo')).toContain('combo');
    expect(text('graze')).toMatch(/graze|skim/);
    expect(text('parry')).toContain('parry');
    expect(text('rhythm')).toContain('beat');
  });
  it('sandboxText reflects the current step', () => {
    const s = newSandbox();
    expect(sandboxText(s)).toBe(currentStep(s).text);
  });
});

describe('deep sandbox — per-beat target layouts (pure, deterministic, no rng)', () => {
  it('charge/release present one near mark', () => {
    expect(sandboxBeatTargets('charge')).toEqual(sandboxBeatTargets('release'));
    expect(sandboxBeatTargets('charge').length).toBe(1);
  });
  it('reach is a single FAR mark (further than the near mark)', () => {
    const near = sandboxBeatTargets('charge')[0];
    const far = sandboxBeatTargets('reach');
    expect(far.length).toBe(1);
    expect(Math.abs(far[0].dx)).toBeGreaterThan(Math.abs(near.dx));
  });
  it('heavy presents one SHIELDED blocker', () => {
    const t = sandboxBeatTargets('heavy');
    expect(t.length).toBe(1);
    expect(t[0].shielded).toBe(true);
  });
  it('combo presents a cluster of three', () => {
    expect(sandboxBeatTargets('combo').length).toBe(3);
  });
  it('graze/parry/rhythm/done spawn no dummies (they use bullets / the beat)', () => {
    for (const step of ['graze', 'parry', 'rhythm', 'done'] as SandboxStep[]) {
      expect(sandboxBeatTargets(step)).toEqual([]);
    }
  });
  it('is identical on every call (no rng)', () => {
    expect(sandboxBeatTargets('combo')).toEqual(sandboxBeatTargets('combo'));
  });
});

describe('sandbox first-run gating + skip (pure)', () => {
  it('shows for a brand-new player, never for a returning one', () => {
    expect(shouldShowSandbox(false, false)).toBe(true);
    expect(shouldShowSandbox(true, false)).toBe(false);
  });
  it('reduce-motion skips the animated teach even on a first run', () => {
    expect(shouldShowSandbox(false, true)).toBe(false);
    expect(shouldShowSandbox(true, true)).toBe(false);
  });
});
