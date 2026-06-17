// DASH SANDBOX (PERFECT_10_SPEC §1.2) — the no-fail onboarding screen.
//
// A ~5–8s teaching state shown to brand-new players the very FIRST time they press
// DESCEND, BEFORE the real run begins. It teaches the single core verb — HOLD to
// charge, RELEASE to spear — on inert dummy targets the player cannot die on, then
// hands off to the EXISTING start(cfg) path with a clean, fully-seeded world.
//
// This module is PURE: step progression, the completion predicate, target layout,
// and the gating/skip logic are plain functions with NO DOM, NO audio, and — most
// importantly — NO rng. The seeded run's determinism is sacred; nothing here draws
// from (or even reads) any rng stream, so the subsequent start(cfg) seeds the world
// EXACTLY as it does today. The Game wires these functions to a dedicated, throwaway
// sandbox World so this.world (the real run) is never touched until start() resets it.

/** The scripted teach steps, in order. Each step is gated by a TRIGGER the player
 *  must satisfy to advance; a per-step time cap auto-advances so the screen can
 *  never stall (no-fail also means no-stuck). */
export type SandboxStep = 'charge' | 'release' | 'chain' | 'done';

/** What unblocks the current step. 'charge' waits for the player to begin charging,
 *  'release' for a committed dash, 'chain'/'done' for a skewer (a dummy hit). */
export type SandboxTrigger = 'beganCharge' | 'dashed' | 'skewer' | 'tick';

export interface SandboxStepDef {
  step: SandboxStep;
  /** the DOM-overlay instruction text for this step */
  text: string;
  /** the trigger that advances PAST this step */
  advanceOn: SandboxTrigger;
  /** seconds before this step auto-advances regardless (no-fail safety) */
  cap: number;
}

// Tuned for a tight ~5–8s teach. Caps sum well under the spec's upper bound while
// each step still advances the instant its trigger fires (usually far sooner).
export const SANDBOX_STEPS: readonly SandboxStepDef[] = [
  { step: 'charge', text: 'HOLD to charge your spear', advanceOn: 'beganCharge', cap: 6 },
  { step: 'release', text: 'RELEASE to spear the target', advanceOn: 'dashed', cap: 6 },
  { step: 'chain', text: 'Nice — again! Skewer the next one', advanceOn: 'skewer', cap: 4.5 },
  { step: 'done', text: "You've got it. Descending…", advanceOn: 'tick', cap: 1.2 },
] as const;

/** Hard ceiling on the whole sandbox (seconds) — even if every trigger somehow
 *  stalls, the sandbox auto-completes by this time. Comfortably within the 5–8s
 *  feel target once triggers fire normally; this is the absolute backstop. */
export const SANDBOX_MAX_TIME = 9;

/** How many skewers complete the lesson (the spec's "after ~1–2 skewers"). */
export const SANDBOX_TARGET_SKEWERS = 2;

/** A single inert dummy target's spawn layout (relative to arena center). The Game
 *  spawns a harmless enemy kind here that fires nothing and can't hurt the player. */
export interface DummyLayout {
  /** offset from arena center, in px */
  dx: number;
  dy: number;
}

/** Two dummy targets flanking the player at center — one to spear, one to chain.
 *  Pure: a fixed layout, no rng, so the teach is identical every time. */
export function dummyLayout(): DummyLayout[] {
  return [
    { dx: 220, dy: -40 },
    { dx: 360, dy: 70 },
  ];
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
  /** dummy skewers landed so far */
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

/** Per-step events observed this sim step (all booleans; pure inputs). */
export interface SandboxEvents {
  beganCharge: boolean;
  dashed: boolean;
  skewer: boolean;
}

/** Does `ev` satisfy the trigger that advances PAST the given step? */
function triggerMet(def: SandboxStepDef, ev: SandboxEvents): boolean {
  switch (def.advanceOn) {
    case 'beganCharge':
      return ev.beganCharge;
    case 'dashed':
      return ev.dashed;
    case 'skewer':
      return ev.skewer;
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
