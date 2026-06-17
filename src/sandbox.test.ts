import { describe, it, expect } from 'vitest';
import {
  newSandbox,
  stepSandbox,
  sandboxComplete,
  currentStep,
  sandboxText,
  shouldShowSandbox,
  dummyLayout,
  SANDBOX_STEPS,
  SANDBOX_MAX_TIME,
  type SandboxEvents,
} from './sandbox';

const NONE: SandboxEvents = { beganCharge: false, dashed: false, skewer: false };
const DT = 1 / 60;

/** Drive the sandbox feeding `ev` only on the frame each step's trigger should fire.
 *  Returns the final state after walking the whole scripted teach. */
function walkAllTriggers(): ReturnType<typeof newSandbox> {
  let s = newSandbox();
  // step 0 'charge' → beganCharge
  s = stepSandbox(s, DT, { ...NONE, beganCharge: true });
  // step 1 'release' → dashed
  s = stepSandbox(s, DT, { ...NONE, dashed: true });
  // step 2 'chain' → skewer
  s = stepSandbox(s, DT, { ...NONE, skewer: true });
  // step 3 'done' advances only by cap — tick it out
  for (let i = 0; i < 200 && !s.done; i++) s = stepSandbox(s, DT, NONE);
  return s;
}

describe('sandbox step progression (pure)', () => {
  it('starts on the charge step, not done', () => {
    const s = newSandbox();
    expect(currentStep(s).step).toBe('charge');
    expect(sandboxComplete(s)).toBe(false);
    expect(s.skewers).toBe(0);
  });

  it('advances each step only when its trigger fires', () => {
    let s = newSandbox();
    // a no-op tick does NOT advance the charge step
    s = stepSandbox(s, DT, NONE);
    expect(currentStep(s).step).toBe('charge');
    // beganCharge advances to release
    s = stepSandbox(s, DT, { ...NONE, beganCharge: true });
    expect(currentStep(s).step).toBe('release');
    // a stray skewer does NOT satisfy the release (dashed) trigger
    s = stepSandbox(s, DT, { ...NONE, skewer: true });
    expect(currentStep(s).step).toBe('release');
    // a dash advances to chain
    s = stepSandbox(s, DT, { ...NONE, dashed: true });
    expect(currentStep(s).step).toBe('chain');
  });

  it('walking every trigger completes the lesson with skewers counted', () => {
    const s = walkAllTriggers();
    expect(s.done).toBe(true);
    expect(sandboxComplete(s)).toBe(true);
    expect(s.skewers).toBeGreaterThanOrEqual(1);
  });

  it('per-step cap auto-advances when no trigger fires (no-stuck)', () => {
    let s = newSandbox();
    const cap = SANDBOX_STEPS[0].cap;
    // tick just past the first step's cap with NO trigger — it must advance anyway
    const frames = Math.ceil(cap / DT) + 2;
    for (let i = 0; i < frames; i++) s = stepSandbox(s, DT, NONE);
    expect(currentStep(s).step).not.toBe('charge');
  });

  it('the absolute time ceiling completes the sandbox no matter what', () => {
    let s = newSandbox();
    // never fire a trigger; only the SANDBOX_MAX_TIME backstop ends it
    for (let i = 0; i < 10000 && !s.done; i++) s = stepSandbox(s, DT, NONE);
    expect(s.done).toBe(true);
    expect(s.totalTime).toBeGreaterThanOrEqual(SANDBOX_MAX_TIME - DT);
  });

  it('is idempotent once done (no further mutation)', () => {
    let s = walkAllTriggers();
    const snapshot = { ...s };
    s = stepSandbox(s, DT, { ...NONE, skewer: true, dashed: true });
    expect(s).toEqual(snapshot);
  });

  it('exposes step text for the DOM overlay', () => {
    const s = newSandbox();
    expect(sandboxText(s)).toBe(currentStep(s).text);
    expect(sandboxText(s).toLowerCase()).toContain('hold');
  });
});

describe('sandbox first-run gating + skip (pure)', () => {
  it('shows for a brand-new player, never for a returning one', () => {
    expect(shouldShowSandbox(false, false)).toBe(true); // seenSandbox=false → show
    expect(shouldShowSandbox(true, false)).toBe(false); // seenSandbox=true  → skip
  });

  it('reduce-motion skips the animated teach even on a first run', () => {
    expect(shouldShowSandbox(false, true)).toBe(false);
    expect(shouldShowSandbox(true, true)).toBe(false);
  });
});

describe('sandbox dummy layout (pure, deterministic)', () => {
  it('returns a fixed set of inert targets (no rng → identical every call)', () => {
    expect(dummyLayout()).toEqual(dummyLayout());
    expect(dummyLayout().length).toBeGreaterThanOrEqual(1);
  });
});
