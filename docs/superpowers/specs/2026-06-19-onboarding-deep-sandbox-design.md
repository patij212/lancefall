# DEEP SANDBOX — the no-fail onboarding that actually teaches the depth

> The first act-two pass shipped a tight sandbox (dash + one parry beat) and leaned on contextual
> one-liners for everything else. Owner verdict: it *rushes through and teaches nothing* of the
> real depth — no charge depth, no HEAVY overcharge, no rhythm/COHERENCE. This rebuilds the
> sandbox into a proper, no-fail, **7-beat** teach where each beat demonstrates its mechanic with
> real targets/bullets and advances only on genuine success. The contextual hints + `taught`/
> `tutorialHints`/replay plumbing already shipped stay — they're now reinforcement *after* the
> sandbox has actually taught the verb.

## Principles (unchanged from the existing sandbox)
- **Pure + rng-free `sandbox.ts`:** the step list, triggers, per-beat target layouts, and the
  completion predicate are plain functions — NO DOM, NO audio, NO rng. The seeded run's
  determinism is sacred; the deep sandbox still runs on a dedicated throwaway World on a fixed
  non-seeded rng, so `start(cfg)` seeds the real run exactly as today. The Daily stays bit-identical.
- **No-fail, no-stuck:** the player is unfailable for the whole teach (huge i-frames). Every beat
  advances the instant its success fires OR its per-step cap elapses; an absolute ceiling backstops
  the whole thing. An explicit SKIP + the existing `reduceMotion` auto-skip both remain.
- **a11y:** text drives every beat (the overlay is `aria-live`); the beat ring honours
  `reduceMotion`/`reduceFlashing`; audio honours the volume/mute settings. `reduceMotion` keeps its
  existing whole-sandbox auto-skip contract — motion-sensitive players rely on the contextual hints
  and can replay. (Known tradeoff; not changing the a11y contract here.)

## The 7 beats (8 steps + close-out)

Player spawns at ~0.32 width, centre height. All offsets are from the player, pure (no rng).

| Step | Teaches | Overlay text | Advances on (`SandboxTrigger`) | Throwaway-world setup |
|------|---------|--------------|-------------------------------|----------------------|
| `charge` | the charge half of the verb | "HOLD to charge your spear — the longer you hold, the farther you fly." | `beganCharge` | near dummy |
| `release` | the release/dash half | "RELEASE to dash forward and spear the mark." | `dashed` | (near dummy stays) |
| `reach` | **charge depth** | "Charge FULLY, then release — a long charge is a long dash. Reach the far mark." | `reached` (skewer the FAR mark) | one far dummy (out of short-dash range) |
| `heavy` | **HEAVY overcharge** | "Hold PAST full to OVERCHARGE — a HEAVY thrust that smashes through armour. Break the shielded one." | `heavyDash` (a dash with `dashHeavy`) | one shielded blocker |
| `combo` | **combo / chain** | "Line them up — spear SEVERAL in one dash to build a COMBO." | `comboDash` (a dash skewering ≥2) | a line of 3 dummies |
| `graze` | **graze economy** | "Skim a shot WITHOUT being hit to refill stamina — dance close, you can't be hurt here." | `grazed` (a near-miss) | slow drifting bullets |
| `parry` | **PARRY** | "PARRY the incoming shot (right-click / K) to deflect it — and counter." | `parried` | one slow telegraphed reflectable shot |
| `rhythm` | **rhythm / COHERENCE** | "Feel the pulse — DASH ON THE BEAT as the ring tightens. On-beat wakes the City and widens your guard." | `onBeatDash` (a graded on-beat dash) | beat ring + music bed; coherence blooms on success |
| `done` | close-out | "You hold the lance. Descend." | cap only (`tick`) | — |

## Where the work goes

**Pure `sandbox.ts` (TDD in `sandbox.test.ts`):**
- `SandboxStep` grows to the 8 steps above; `SandboxTrigger`/`SandboxEvents` gain
  `reached` / `heavyDash` / `comboDash` / `grazed` / `onBeatDash`. `triggerMet` switches over them.
- `SANDBOX_STEPS` gets the new defs with clear copy + generous per-step caps (~6–7s each, no-fail).
- `SANDBOX_MAX_TIME` raised to a true backstop (≥ the sum of caps) so per-step caps drive normal
  completion; the ceiling is pure defence-in-depth. The "no-stuck" test asserts the sandbox
  completes when fed no triggers (via step-cap exhaustion), not that the ceiling specifically ends it.
- A pure `sandboxBeatTargets(step)` returns the per-beat dummy targets
  (`{ dx, dy, shielded?, far? }[]`) so the Game spawns identically every time (no rng).

**`game.ts` — sandbox methods ONLY (`startSandbox` / `stepSandboxFrame`); never the real sim:**
- On each step change, (re)spawn that beat's targets/bullets from `sandboxBeatTargets` + the
  beat's bullet needs (graze drifters, the parry shot). Clear stale targets/bullets between beats.
- Compute each success boolean from the throwaway world each frame:
  - `dashed` = `ev.dashFired`; `skewer` = existing seg-circle hit; `reached` = a skewer of the far
    mark; `heavyDash` = `ev.dashFired && player.dashHeavy`; `comboDash` = a dash skewering ≥2
    (count skewers tagged to one `dashId`); `grazed` = a sandbox bullet passing within `grazeRadius`
    but not the hitbox; `parried` = `ev.parryFired`; `onBeatDash` = `gradeRelease(...) !== 'off'`
    against a beat clock advanced during the sandbox.
- On the `rhythm` beat: advance the pure beat clock, start the music bed (`audio`), and pass
  `beatRing: true` + the beat phase to the existing renderer; bloom coherence on an on-beat dash.
  All cosmetic; reads no `world.rng`.
- Keep the player unfailable (`iframe` topped up) so graze/parry beats can't kill.

**No changes to:** the contextual teaches, `taught`/`tutorialHints`/replay, `ui.ts` (beyond what
already shipped), `render.ts`, the real `step()`/seeded sim.

## Verification
- `npx tsc --noEmit` clean; `npx vitest run` green (extend `sandbox.test.ts` for every new
  step/trigger + the layouts + the no-stuck/idempotent invariants); `determinism.test.ts` green.
- Prod boot-smoke, then **walk the whole sandbox in a browser** (fresh save) confirming each of the
  7 beats spawns its setup, reads clearly, and advances only on genuine success — and that SKIP and
  the cap-driven no-stuck both still work.
