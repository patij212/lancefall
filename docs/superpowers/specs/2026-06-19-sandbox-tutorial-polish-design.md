# SANDBOX & TUTORIAL POLISH

> The deep 7-beat sandbox teaches the right things; this pass makes each beat *legible and
> rewarding* and stops the contextual hints from stacking. Four independent items, all cosmetic
> or UI — no `world.rng`, no growth of `render.ts`/`skins.ts`, the seeded run untouched.

## 1. Aim & target cues (game.ts sandbox methods only, via particles)
- Each frame on a dummy-target beat, emit a **throttled pulsing ring** around every active target
  so "hit this" is unmistakable. Colour-coded: cyan (normal mark), **gold** (the far `reach` mark),
  **steel/grey** (the `heavy` blocker — which also renders shielded). Throttle to ~3–4 Hz via a
  timer field so it pulses, not spams.
- On **beat entry**, a one-shot directional `→` floatText by the player aimed at the marks
  (skipped for bullet beats — the incoming shot is its own cue). Cosmetic; throwaway world.

## 2. Progress + beat-complete feel
- **Pip row** in the sandbox overlay (`◦◦●◦◦…`), one pip per TEACHING beat (charge…rhythm; the
  `done` close-out is excluded). Backed by a pure `sandboxProgress(state)` in `sandbox.ts`
  returning `{ index, total, done }`; `ui.setSandboxProgress(index, total)` renders/uses it, called
  on each step change. TDD'd.
- On each **beat advance** (next.stepIndex > prev): a quick **✓ flourish** (floatText + ring + a
  soft audio tick) at the player; the per-beat recentre gets a **blink-in ring** so the snap reads
  as a deliberate reset, not a glitch.
- On the **final `done` beat**, a subtle overlay note: *"Replay anytime in Settings ▸ Replay
  tutorial."* via `ui.setSandboxNote(text)` (cleared on every other beat).

## 3. HEAVY / overcharge feedback (the `heavy` beat)
- A pure `overchargeCue(charge, overcharge)` in `sandbox.ts` → `'none' | 'hold' | 'armed'`:
  `'hold'` once charge is full but the overcharge hasn't armed, `'armed'` once
  `isHeavyArmed(overcharge)`. TDD'd (uses `TUNE.dash.heavyOverchargeTime` via `isHeavyArmed`).
- On the heavy beat, drive it off the live player each frame: `'hold'` → a gold pulse ring + the
  overlay sub-note **"KEEP HOLDING → HEAVY"**; `'armed'` → **"HEAVY READY — release!"** So the
  player discovers the overcharge instead of capping out. Particles + the note line; no render.ts.

## 4. Contextual hints — timing & copy
- Route the act-two `teach()` (verb/enemy/boss) through a **small spaced queue**: enqueue the
  `TeachHit`, show one at a time with a ~few-second gap (mirrors the jargon-gloss queue), and mark
  `taught` + persist only **when actually shown** (so an un-shown tail can still teach next time).
  Stops several first-sightings in one wave from stacking. Tighten any clipped copy.
- The queue lives next to `teach()` in game.ts; `tutorialHints` off still suppresses everything.

## Structure
- Pure + tested: `sandboxProgress`, `overchargeCue` in `sandbox.ts` (extend `sandbox.test.ts`).
- Cosmetics: sandbox-only methods in game.ts (`stepSandboxFrame`/`setupSandboxBeat` + a small
  ring-pulse timer + the teach queue). Particles only; reads the throwaway world; no rng.
- UI: `ui.ts` overlay gains a pip row + a note line + two setters; small CSS. No render.ts change.

## Verification
- `npx tsc --noEmit` clean; `npx vitest run` green (+ pure tests for `sandboxProgress`/`overchargeCue`);
  `determinism.test.ts` green.
- Headless `__lf` walkthrough (dev server) confirming: target rings appear per beat, pips advance,
  the ✓ flourish fires on each advance, the overcharge cue flips hold→armed on the heavy beat, and
  the teach queue shows act-two hints one-at-a-time. Then a prod boot-smoke; deploy; live boot.
- Shared tree: a concurrent cipher card-agent is live-editing `cipherDecode.*` — commit ONLY my
  files; never wholesale-add a shared file.
