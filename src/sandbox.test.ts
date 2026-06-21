import { describe, it, expect } from 'vitest';
import {
  newSandbox,
  stepSandbox,
  sandboxComplete,
  currentStep,
  sandboxText,
  shouldShowSandbox,
  sandboxBeatTargets,
  sandboxProgress,
  overchargeCue,
  SANDBOX_STEPS,
  type SandboxStep,
  type SandboxEvents,
} from './sandbox';
import { TUNE } from './tune';

const NONE: SandboxEvents = {
  beganCharge: false, dashed: false, skewer: false, reached: false,
  heavyDash: false, comboDash: false, grazed: false, parried: false, onBeatDash: false, bossBroke: false,
};
const DT = 1 / 60;

/** Fire each beat's success trigger in order; returns the final state after the whole teach. */
function walkAllTriggers(): ReturnType<typeof newSandbox> {
  let s = newSandbox();
  s = stepSandbox(s, DT, { ...NONE, beganCharge: true }); // charge   → release
  s = stepSandbox(s, DT, { ...NONE, dashed: true }); //      release  → reach
  s = stepSandbox(s, DT, { ...NONE, reached: true }); //     reach    → heavy
  s = stepSandbox(s, DT, { ...NONE, heavyDash: true }); //   heavy    → combo
  s = stepSandbox(s, DT, { ...NONE, comboDash: true }); //   combo    → graze
  s = stepSandbox(s, DT, { ...NONE, grazed: true }); //      graze    → parry
  s = stepSandbox(s, DT, { ...NONE, parried: true }); //     parry    → rhythm
  s = stepSandbox(s, DT, { ...NONE, onBeatDash: true }); //  rhythm   → bossparry
  s = stepSandbox(s, DT, { ...NONE, bossBroke: true }); //   bossparry→ done
  for (let i = 0; i < 400 && !s.done; i++) s = stepSandbox(s, DT, NONE); // done caps out
  return s;
}

describe('deep sandbox — the curriculum', () => {
  it('runs charge → … → parry → rhythm → bossparry → done, in order', () => {
    const ids = SANDBOX_STEPS.map((d) => d.step);
    expect(ids).toEqual(['charge', 'release', 'reach', 'heavy', 'combo', 'graze', 'parry', 'rhythm', 'bossparry', 'done']);
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
    expect(currentStep(s).step).toBe('bossparry');
    // bossparry needs the guard broken (a stray parry doesn't finish it)
    s = stepSandbox(s, DT, { ...NONE, parried: true });
    expect(currentStep(s).step).toBe('bossparry');
    s = stepSandbox(s, DT, { ...NONE, bossBroke: true });
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

describe('deep sandbox — progresses ONLY on action (no time auto-advance)', () => {
  it('stays on the first beat forever when no trigger fires (no cap auto-advance)', () => {
    let s = newSandbox();
    // run far past the old 90s backstop (~12000 frames ≈ 200s) — with no trigger it must NOT move
    for (let i = 0; i < 12000; i++) s = stepSandbox(s, DT, NONE);
    expect(currentStep(s).step).toBe('charge');
    expect(sandboxComplete(s)).toBe(false);
    expect(s.done).toBe(false);
  });

  it('the closing beat finishes on the next tick once every beat is performed', () => {
    let s = newSandbox();
    const ev = { ...NONE, beganCharge: true, dashed: true, reached: true, heavyDash: true, comboDash: true, grazed: true, parried: true, onBeatDash: true, bossBroke: true };
    for (let i = 0; i < 9; i++) s = stepSandbox(s, DT, ev); // walk all 9 teaching beats → land on 'done'
    expect(currentStep(s).step).toBe('done');
    s = stepSandbox(s, DT, NONE); // one frame on the close-out ends it
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
    expect(text('combo')).toContain('move'); // the combo beat now teaches MOVEMENT to line up the row
    expect(text('graze')).toMatch(/graze|skim/);
    expect(text('parry')).toContain('parry');
    expect(text('rhythm')).toContain('beat');
  });
  it('sandboxText reflects the current step', () => {
    const s = newSandbox();
    expect(sandboxText(s)).toBe(currentStep(s).text);
  });

  it('every TEACHING beat carries a deeper sub-explanation (only the close-out has none)', () => {
    for (const d of SANDBOX_STEPS) {
      if (d.step === 'done') { expect(d.sub).toBeUndefined(); continue; }
      expect((d.sub ?? '').trim().length).toBeGreaterThan(20);
    }
  });
  it('the trickiest beats name their key idea in the sub', () => {
    const sub = (step: SandboxStep) => (SANDBOX_STEPS.find((d) => d.step === step)!.sub ?? '').toLowerCase();
    expect(sub('parry')).toMatch(/counter|riposte|streak|arc/); // deflect AND counter
    expect(sub('rhythm')).toMatch(/coherence|city/); // what on-beat DOES
    expect(sub('graze')).toMatch(/stamina/); // why you graze
    expect(sub('heavy')).toMatch(/invuln|phas|through|armour|armor/); // the heavy payoff
    expect(sub('combo')).toMatch(/combo|overdrive/);
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
  it('combo is a DIAGONAL row, off the player start axis (movement is required to line up)', () => {
    const t = sandboxBeatTargets('combo');
    expect(t.length).toBe(3);
    const [a, b, c] = t;
    // collinear: all three lie on ONE line, so a single dash CAN spear them once aligned
    const cross = (b.dx - a.dx) * (c.dy - a.dy) - (b.dy - a.dy) * (c.dx - a.dx);
    expect(Math.abs(cross)).toBeLessThan(1e-6);
    // ...but the player START (origin) is well OFF that line: the perpendicular distance from
    // (0,0) to the row's line must clear the dash hit-tolerance, so a straight dash from the
    // anchor cannot clip >=2 — the player MUST drift onto the line first.
    const abx = c.dx - a.dx, aby = c.dy - a.dy;
    const len = Math.hypot(abx, aby);
    const perp = Math.abs(-a.dx * aby - -a.dy * abx) / len; // dist from (0,0) to line a..c
    expect(perp).toBeGreaterThan(60);
    // ...and it is a DIAGONAL (both axes change meaningfully — not a flat row, not a column)
    expect(Math.abs(abx)).toBeGreaterThan(40);
    expect(Math.abs(aby)).toBeGreaterThan(40);
    // ...and it stays within ~150px of the anchor vertically (the anchor sits at 50% height), so
    // the whole row fits on short play windows instead of clipping off the top of the screen.
    for (const m of t) expect(Math.abs(m.dy)).toBeLessThan(160);
  });
  it('graze/parry/rhythm/done spawn no dummies (they use bullets / the beat)', () => {
    for (const step of ['graze', 'parry', 'rhythm', 'done'] as SandboxStep[]) {
      expect(sandboxBeatTargets(step)).toEqual([]);
    }
  });
  it('bossparry presents one BOSS target (the guard to break)', () => {
    const t = sandboxBeatTargets('bossparry');
    expect(t.length).toBe(1);
    expect(t[0].boss).toBe(true);
  });
  it('is identical on every call (no rng)', () => {
    expect(sandboxBeatTargets('combo')).toEqual(sandboxBeatTargets('combo'));
  });
});

describe('sandboxProgress — pip-row progress over the teaching beats', () => {
  it('excludes the done close-out from the total', () => {
    const total = SANDBOX_STEPS.filter((d) => d.step !== 'done').length;
    expect(sandboxProgress(newSandbox()).total).toBe(total);
    expect(sandboxProgress(newSandbox()).total).toBe(9); // charge…bossparry
  });
  it('starts at index 0, not done', () => {
    expect(sandboxProgress(newSandbox())).toEqual({ index: 0, total: 9, done: false });
  });
  it('advances the index one per beat and saturates + flags done on the close-out', () => {
    let s = newSandbox();
    const all = { ...NONE, beganCharge: true, dashed: true, reached: true, heavyDash: true, comboDash: true, grazed: true, parried: true, onBeatDash: true, bossBroke: true };
    s = stepSandbox(s, 1 / 60, all); // charge → release
    expect(sandboxProgress(s).index).toBe(1);
    for (let i = 0; i < 9; i++) s = stepSandbox(s, 1 / 60, all);
    const p = sandboxProgress(s);
    expect(p.index).toBe(p.total); // saturated at the end
    expect(p.done).toBe(true);
  });
});

describe('overchargeCue — the HEAVY teach state', () => {
  it('is none before full charge', () => {
    expect(overchargeCue(0, 0)).toBe('none');
    expect(overchargeCue(0.7, 0)).toBe('none');
  });
  it('is hold at full charge before the overcharge arms', () => {
    expect(overchargeCue(1, 0)).toBe('hold');
    expect(overchargeCue(1, TUNE.dash.heavyOverchargeTime * 0.5)).toBe('hold');
  });
  it('is armed once the overcharge passes the heavy threshold', () => {
    expect(overchargeCue(1, TUNE.dash.heavyOverchargeTime)).toBe('armed');
    expect(overchargeCue(1, TUNE.dash.heavyOverchargeTime + 1)).toBe('armed');
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
