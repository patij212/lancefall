// DASH SANDBOX — the no-fail onboarding screen.
//
// A teaching state shown to brand-new players the very FIRST time they press DESCEND,
// BEFORE the real run begins. It teaches the game's depth one beat at a time on a
// throwaway world the player cannot die on, then hands off to the EXISTING start(cfg)
// path with a clean, fully-seeded world. Seven beats, each demonstrating a real
// mechanic and advancing ONLY on genuine success:
//
//   1 charge   — HOLD to charge (the longer you hold, the farther you fly)
//   2 release  — RELEASE to dash
//   3 reach    — charge DEPTH: a full charge reaches a far mark
//   4 heavy    — hold PAST full to OVERCHARGE a HEAVY thrust through armour
//   5 combo    — skewer SEVERAL in one dash
//   6 graze    — skim a shot to refill stamina
//   7 parry    — deflect a shot (and counter)
//   8 rhythm   — dash ON THE BEAT → COHERENCE (the City wakes, the guard widens)
//   + done     — close-out
//
// This module is PURE: step progression, the completion predicate, per-beat target
// layout, and the gating/skip logic are plain functions with NO DOM, NO audio, and —
// most importantly — NO rng. The seeded run's determinism is sacred; nothing here
// draws from (or even reads) any rng stream, so the subsequent start(cfg) seeds the
// world EXACTLY as it does today (the Daily stays bit-identical). The Game wires these
// to a dedicated throwaway World so this.world (the real run) is never touched until
// start() resets it; the Game computes each success boolean below from that world.

// The ONLY import — a pure tune-reading predicate (no rng) used by the HEAVY-beat cue below.
import { isHeavyArmed } from './dash';

/** The scripted teach steps, in order. Each step is gated by a TRIGGER the player
 *  must satisfy to advance; a per-step time cap auto-advances so the screen can
 *  never stall (no-fail also means no-stuck). */
export type SandboxStep =
  | 'charge' | 'release' | 'reach' | 'heavy' | 'combo' | 'graze' | 'parry' | 'rhythm' | 'done';

/** What unblocks the current step — the success the Game detects on the throwaway world:
 *  beganCharge (started charging) · dashed (committed a dash) · reached (skewered the FAR
 *  mark, only possible on a long charge) · heavyDash (a dash with the overcharge armed) ·
 *  comboDash (a single dash skewering ≥2) · grazed (a near-miss) · parried (a deflect) ·
 *  onBeatDash (a dash graded on-beat) · tick (the closing beat — cap-only). */
export type SandboxTrigger =
  | 'beganCharge' | 'dashed' | 'reached' | 'heavyDash' | 'comboDash' | 'grazed' | 'parried' | 'onBeatDash' | 'tick';

export interface SandboxStepDef {
  step: SandboxStep;
  /** the DOM-overlay instruction text for this step (the short, bold action line) */
  text: string;
  /** optional deeper sub-explanation shown under the instruction (the WHY/HOW) — used for the
   *  beats that need more than a one-liner (parry, rhythm). The Game surfaces it on the note line. */
  sub?: string;
  /** the trigger that advances PAST this step */
  advanceOn: SandboxTrigger;
  /** seconds before this step auto-advances regardless (no-fail safety) */
  cap: number;
}

// Generous per-step caps: each beat advances the instant its success fires (usually
// far sooner), and a player who's stuck on one beat is never trapped — it caps out
// and moves on. An engaged player walks the whole teach in ~25–40s; the caps only
// matter when someone freezes (and SKIP is always available).
export const SANDBOX_STEPS: readonly SandboxStepDef[] = [
  { step: 'charge', text: 'HOLD to charge your spear — the longer you hold, the farther you fly.', advanceOn: 'beganCharge', cap: 6 },
  { step: 'release', text: 'RELEASE to dash forward and spear the mark.', advanceOn: 'dashed', cap: 6 },
  { step: 'reach', text: 'Charge FULLY, then release — a long charge is a long dash. Reach the far mark.', advanceOn: 'reached', cap: 7 },
  { step: 'heavy', text: 'Hold PAST full to OVERCHARGE — a HEAVY thrust smashes through armour. Break the shielded one.', advanceOn: 'heavyDash', cap: 8 },
  { step: 'combo', text: 'Line them up — spear SEVERAL in one dash to build a COMBO.', advanceOn: 'comboDash', cap: 7 },
  { step: 'graze', text: 'Skim a shot WITHOUT being hit to refill stamina — dance close, you cannot be hurt here.', advanceOn: 'grazed', cap: 8 },
  {
    step: 'parry',
    text: 'PARRY the incoming shot — right-click / K',
    sub: 'A parry sweeps your aim arc: it deflects shots AND counter-strikes anything in front of you. Whiff it and you’re briefly open, so read the shot — and on-beat parries chain a streak.',
    advanceOn: 'parried',
    cap: 7,
  },
  {
    step: 'rhythm',
    text: 'DASH ON THE BEAT — release as the ring snaps shut',
    sub: 'On-beat dashes (and parries) build COHERENCE: the City of Lancefall lights from grey to neon, the music blooms, and your parry guard widens. Off-beat still works — landing on the beat is the reward.',
    advanceOn: 'onBeatDash',
    cap: 9,
  },
  { step: 'done', text: 'You hold the lance. Descend.', advanceOn: 'tick', cap: 1.5 },
] as const;

/** Absolute backstop (seconds) on the whole sandbox — pure defence-in-depth above the
 *  sum of the per-step caps, so the per-step caps are what drive normal completion and
 *  this only ever matters if the step machine were somehow wedged. */
export const SANDBOX_MAX_TIME = 90;

/** A spawn position (offset from the player) for a beat's dummy target, plus optional
 *  flags the Game reads when spawning (a SHIELDED blocker only a HEAVY dash breaks). */
export interface SandboxTarget {
  /** offset from the player, in px */
  dx: number;
  dy: number;
  /** an armoured blocker — only a HEAVY (overcharged) dash kills it (the 'heavy' beat) */
  shielded?: boolean;
}

/** The dummy targets to spawn for a given beat (pure, no rng → identical every time).
 *  Beats that teach with bullets or the beat clock (graze / parry / rhythm) and the
 *  close-out spawn no dummies. The Game positions these relative to the player. */
export function sandboxBeatTargets(step: SandboxStep): SandboxTarget[] {
  switch (step) {
    case 'charge':
    case 'release':
      return [{ dx: 210, dy: -10 }]; // one near mark for the core verb
    case 'reach':
      // far — well beyond a short dash, but inside a full charge's reach (TUNE.dash.maxLen 560)
      return [{ dx: 470, dy: 0 }];
    case 'heavy':
      return [{ dx: 240, dy: 0, shielded: true }]; // a blocker the HEAVY thrust phases through
    case 'combo':
      // collinear, dead ahead — a single straight dash skewers all three (a vertical spread
      // would let a forward dash miss the flankers, stranding the beat on its cap).
      return [{ dx: 200, dy: 0 }, { dx: 310, dy: 0 }, { dx: 420, dy: 0 }];
    default:
      return []; // graze / parry / rhythm / done — bullets or the beat, not dummies
  }
}

/** The running sandbox state. Plain data — the Game owns one of these while in the
 *  'sandbox' state and feeds it sim events each step. No rng, no DOM. */
export interface SandboxState {
  /** index into SANDBOX_STEPS */
  stepIndex: number;
  /** seconds elapsed on the CURRENT step (drives the per-step cap) */
  stepTime: number;
  /** seconds elapsed over the whole sandbox (drives SANDBOX_MAX_TIME) */
  totalTime: number;
  /** dummy skewers landed so far (cosmetic running tally) */
  skewers: number;
  /** latched once complete so the hand-off to start() fires exactly once */
  done: boolean;
}

export function newSandbox(): SandboxState {
  return { stepIndex: 0, stepTime: 0, totalTime: 0, skewers: 0, done: false };
}

/** The current step definition (clamped so an over-run index is safe). */
export function currentStep(s: SandboxState): SandboxStepDef {
  const i = Math.max(0, Math.min(SANDBOX_STEPS.length - 1, s.stepIndex));
  return SANDBOX_STEPS[i];
}

/** Per-step success signals observed this sim step (all booleans; pure inputs the Game
 *  computes from the throwaway world). `skewer` is the generic "hit a dummy this frame"
 *  used only for the running tally; the BEAT triggers are the specific successes. */
export interface SandboxEvents {
  beganCharge: boolean;
  dashed: boolean;
  skewer: boolean;
  /** skewered the FAR mark (only reachable on a long charge) — the 'reach' beat */
  reached: boolean;
  /** a dash with the overcharge armed (dashHeavy) — the 'heavy' beat */
  heavyDash: boolean;
  /** a single dash that skewered ≥2 — the 'combo' beat */
  comboDash: boolean;
  /** a bullet skimmed without a hit — the 'graze' beat */
  grazed: boolean;
  /** a successful deflect — the 'parry' beat */
  parried: boolean;
  /** a dash graded on-beat against the beat clock — the 'rhythm' beat */
  onBeatDash: boolean;
}

/** Does `ev` satisfy the trigger that advances PAST the given step? */
function triggerMet(def: SandboxStepDef, ev: SandboxEvents): boolean {
  switch (def.advanceOn) {
    case 'beganCharge':
      return ev.beganCharge;
    case 'dashed':
      return ev.dashed;
    case 'reached':
      return ev.reached;
    case 'heavyDash':
      return ev.heavyDash;
    case 'comboDash':
      return ev.comboDash;
    case 'grazed':
      return ev.grazed;
    case 'parried':
      return ev.parried;
    case 'onBeatDash':
      return ev.onBeatDash;
    case 'tick':
      return false; // 'done' advances only by its cap
  }
}

/** Advance the sandbox by one sim step. Pure transition: returns the NEXT state.
 *  A step advances when its trigger fires OR its per-step cap elapses; the whole
 *  sandbox completes when it walks past the last step or hits SANDBOX_MAX_TIME.
 *  Never touches rng/DOM — only arithmetic on the passed-in state + events. */
export function stepSandbox(s: SandboxState, dt: number, ev: SandboxEvents): SandboxState {
  if (s.done) return s;
  const next: SandboxState = { ...s };
  next.stepTime += dt;
  next.totalTime += dt;
  if (ev.skewer) next.skewers += 1;

  const def = currentStep(next);
  const advance = triggerMet(def, ev) || next.stepTime >= def.cap;
  if (advance) {
    next.stepIndex += 1;
    next.stepTime = 0;
  }

  // Complete: walked past the final step, or hit the absolute time ceiling.
  if (next.stepIndex >= SANDBOX_STEPS.length || next.totalTime >= SANDBOX_MAX_TIME) {
    next.done = true;
  }
  return next;
}

/** Completion predicate (mirrors the latch stepSandbox sets). */
export function sandboxComplete(s: SandboxState): boolean {
  return s.done || s.stepIndex >= SANDBOX_STEPS.length || s.totalTime >= SANDBOX_MAX_TIME;
}

// ── First-run gating + skip ──────────────────────────────────────────────────
// The sandbox is shown ONLY to a brand-new player (seenSandbox === false) and only
// when the player hasn't asked to reduce motion (we still always offer an explicit
// SKIP; reduce-motion just defaults to skipping the cinematic teach). Pure: a
// function of the save flag + a reduce-motion preference.

/** Should the sandbox be shown on this DESCEND?
 *  - seenSandbox already true → never (returning players go straight to the run).
 *  - reduceMotion true → skip the animated teach (still records it as seen). */
export function shouldShowSandbox(seenSandbox: boolean, reduceMotion: boolean): boolean {
  if (seenSandbox) return false;
  if (reduceMotion) return false;
  return true;
}

/** The instruction text to surface for the current sandbox state (DOM overlay). */
export function sandboxText(s: SandboxState): string {
  return currentStep(s).text;
}

/** Total teaching beats (everything but the `done` close-out) — the pip-row length. */
export const SANDBOX_TEACH_BEATS = SANDBOX_STEPS.filter((d) => d.step !== 'done').length;

/** Progress over the teaching beats for the overlay pip row. `index` is the current beat
 *  (0..total), saturating at `total` once the close-out is reached; `done` flags that. Pure. */
export function sandboxProgress(s: SandboxState): { index: number; total: number; done: boolean } {
  const total = SANDBOX_TEACH_BEATS;
  return { index: Math.min(s.stepIndex, total), total, done: s.stepIndex >= total };
}

/** The HEAVY-beat teach state from the live charge/overcharge: `'none'` before full charge,
 *  `'hold'` at full while the overcharge is still building, `'armed'` once it's armed (release
 *  now for a HEAVY thrust). Pure — `isHeavyArmed` reads only TUNE, no rng. */
export function overchargeCue(charge: number, overcharge: number): 'none' | 'hold' | 'armed' {
  if (isHeavyArmed(overcharge)) return 'armed';
  if (charge >= 1 - 1e-6) return 'hold';
  return 'none';
}
