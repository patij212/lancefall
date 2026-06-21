# Tutorial Movement Teach — Combo-Beat Rework (design)

**Date:** 2026-06-21
**Status:** approved (brainstorming) → ready for implementation plan

## Problem

The first-run DASH SANDBOX teaches 9 beats (charge · release · reach · heavy · combo · graze · parry · rhythm · bossparry), but **none of them teaches W/A/S/D movement**. A new player can finish the whole tutorial without ever learning that the ship drifts independently of the dash. With Task 1 (2026-06-21) the sandbox now advances **only** on the player's action (or SKIP) — there is no longer a time fallback — so a skill the player never learns can become a wall later.

## Goal

Teach W/A/S/D "drift" movement inside the existing tutorial by **reworking the COMBO beat** so that lining up a row of enemies requires repositioning. Movement and the combo lesson are taught together, in one beat, without adding to the 9-beat count.

## Background — the movement model (grounding facts, verified in code)

- **Dash = free-aim at the mouse.** `fireDash` launches toward `aimAngle = atan2(aimY - p.y, aimX - p.x)` ([player.ts:45](../../src/player.ts), [player.ts:118](../../src/player.ts)); `aim` is the mouse position ([input.ts:203](../../src/input.ts)). So a player can already hit an off-angle enemy by aiming — movement is **not** needed to *hit*.
- **W/A/S/D = "drift" repositioning.** A separate continuous acceleration from `input.moveX/moveY` ([input.ts:195-200](../../src/input.ts) → [player.ts:73-92](../../src/player.ts)), with friction + a speed cap. Independent of the dash.
- **The sandbox allows drift.** `stepSandboxFrame` calls `updatePlayer(sw.player, this.input.state, …)` every frame ([game.ts:555](../../src/game.ts)), so W/A/S/D works on the throwaway world.
- **Each beat re-centres the player** to a fixed anchor `(0.28·width, 0.5·height)`, velocity zeroed ([game.ts:505-507](../../src/game.ts)) — predictable geometry.
- **Combo dummies are static.** `setupSandboxBeat` spawns them as `drifter` enemies at `player + (dx,dy)` ([game.ts:513-525](../../src/game.ts)); the sandbox never ticks enemy AI, so the row stays exactly where placed.
- **The combo trigger already fits.** The skewer detector tallies `sandboxDashKills` per dash and fires `comboDash` at **≥2** ([game.ts:617-629](../../src/game.ts) onward). We do **not** change the trigger.

## The mechanic — geometry self-gates movement

A dash is a ray from the player toward the cursor. Three points on a single line that does **not** pass through the player cannot all lie on one ray from the player — so from off the line, a single dash hits **at most one** of the three. Therefore, placing the combo row on a line offset from the start anchor makes "skewer ≥2" reachable **only** after the player drifts onto that line. The existing `comboDash` (≥2) trigger becomes a movement gate **with no new completion logic** — purely a consequence of where the dummies sit.

## Design

### Geometry — a diagonal row

The 3 combo dummies sit on a **diagonal line** (≈30–45° off horizontal), positioned so that:

1. From the start anchor, the straight-ahead dash clips **at most one** dummy (the line is genuinely off-axis — verified by an assertion, see Testing).
2. Reaching the line's axis requires a **diagonal drift** (two movement keys, e.g. W+D), reinforcing that movement is 8-directional rather than a single key.
3. The whole layout stays **on-screen** from the `(0.28·width, 0.5·height)` anchor, and the row is **clearable in one charged dash** along its axis (span within `TUNE.dash.maxLen`).

Exact angle, offsets, and spacing are **tuning** to be finalized in the plan against the three constraints above. Replaces the current dead-ahead row `[{dx:200,dy:0},{dx:310,dy:0},{dx:420,dy:0}]` in `sandboxBeatTargets('combo')`.

### Cueing (full) — the new requirement must be unmistakable

Movement is brand-new at this beat and there is no timeout fallback (a confused player otherwise waits on SKIP), so the beat carries strong, layered guidance:

- **Guide line** — a faint dotted trail drawn through the 3 dummies along their axis (a row of cosmetic `sw.particles` dots, refreshed on the existing cue tick, `sandboxCueTimer`), so the line the player must align to is visible.
- **MOVE cue** — a pulsing directional cue at/near the player pointing toward the nearest point on the line (a `sw.particles.floatText`/arrow reading e.g. `MOVE ↗` or `W/A/S/D`), replacing/augmenting the generic `AIM →` cue for this beat only.
- **Per-target rings** — the existing pulsing rings on each dummy ([game.ts:592](../../src/game.ts)) are kept.
- **Contextual nudge** — in `stepSandboxFrame`, for `step === 'combo'`, if a dash on this beat skewers exactly one (`sandboxDashKills === 1` after a fresh dash), flip the note via `setSandboxNote` to: *"Almost — line up with the row, then dash across."* This reacts to the most common near-miss with the exact fix.

### Copy

In `SANDBOX_STEPS` (the `combo` entry):
- **text** (main action line): *"The row's off to the side — MOVE (W/A/S/D) to line it up, then dash through it."*
- **sub** (the why/how): *"Killing without pausing climbs your combo multiplier and charges OVERDRIVE. Your dash flies straight, so drift onto the row's line first — then one dash spears the whole chain."*

(Exact wording may be tightened in the plan; it MUST name W/A/S/D and the "line up / get onto the line" idea. The per-beat-copy tests assert the mechanic is named.)

### Trigger — unchanged

`advanceOn: 'comboDash'` (≥2 in one dash) is kept as-is. SKIP (and ESC/P) remain the manual escape.

## Implementation surface

- `src/sandbox.ts` — new diagonal offsets in `sandboxBeatTargets('combo')`; updated `text`/`sub` on the `combo` `SANDBOX_STEPS` entry.
- `src/game.ts` — in `setupSandboxBeat`/`stepSandboxFrame`: the guide-line dots + the MOVE cue (combo-only branch of the existing cue code), and the 1-skewer contextual nudge.
- No new modules, no new save fields, no settings.

## Determinism / safety

**Zero risk.** The sandbox runs on a separate, non-seeded throwaway world (`createRng(0x5A4D_B0C5)`, [game.ts:475](../../src/game.ts)); it never touches `this.world`, the seeded rng, waves, scoring, or save state. Cues are cosmetic particles. The Daily stays bit-identical. No SAVE_VERSION change.

## Testing

- **Geometry (the load-bearing assertion):** `sandboxBeatTargets('combo')` returns 3 marks that are (a) collinear (one line) and (b) **not** collinear with the origin `(0,0)` — i.e. the player's start point is off the row's line, which is what forces movement. Add this; it is the regression guard for the whole feature.
- **Existing combo trigger still holds:** the `'each beat advances ONLY on its own success trigger'` test (combo advances on `comboDash`, not a stray skewer) is unchanged and must stay green.
- **Copy:** extend the per-beat-copy test so `combo` text/sub name the movement mechanic (matches `/move|w\/?a\/?s\/?d/i` and the line-up idea).
- **No-stuck invariant (from Task 1) preserved:** with no trigger fired the sandbox still stays on `combo` and never auto-advances.
- UI/particle cueing has no unit coverage — verify the guide line + MOVE cue + nudge visually in the running sandbox (Settings ▸ Replay tutorial → DESCEND).

## Out of scope (YAGNI)

- No separate/early movement-primer beat (folded into combo per decision).
- No new "reach-out-of-range" or dodge beats.
- No change to the dash/aim model, the trigger, or any other beat.
- No new setting or toggle.

## Open tuning (settle in the plan)

- Exact diagonal angle, the 3 offsets, and spacing (against the on-screen / one-dash-clear / off-axis constraints).
- The precise MOVE-cue glyph/text and the guide-line dot density.
