# Shield tracking lag — design

**Date:** 2026-06-21
**Status:** approved (brainstorm) → ready for plan

## Problem

A lone shielded **darter** or **orbiter** that the spear keeps clanging off can stall a
wave indefinitely. A wave only advances once it is empty, so a single evasive shielded
enemy holds up the whole run.

The cause is the shield itself. Today it **teleports** to face the player every frame
(`src/enemies.ts`, the `if (e.shielded)` block after the per-kind update):

```ts
if (e.shielded) e.shieldAngle = Math.atan2(p.y - e.y, p.x - e.x);
```

A shielded enemy blocks any dash whose **start-point** falls inside a ±`SHIELD.arcHalf`
(0.8 rad ≈ 92°) frontal cone (`shieldBlocks`, `src/collision.ts`). Because the shield
re-aims instantly, the only counterplay is a **through-skewer** — dashing *past* the enemy
so the start-point ends up outside the cone. That is genuinely hard to line up against a
constantly-circling orbiter or a shield that snaps, so a lone straggler becomes a
soft-lock for a human player. (The arc was already narrowed once, ±1.05 → ±0.8, for being
"too hard" — so the arc lever is delicate.)

## Decision

Give the shield **permanent rotational inertia**. Instead of snapping, `shieldAngle`
rotates toward the player at a capped angular rate. When the player moves laterally faster
than the shield can turn, a flank opens — strafe / circle into it and the dash lands.
Stand still and poke head-on, it still clangs.

This applies to **every** shielded enemy, always — not just stragglers. There is no
straggler-count detection, grace timer, shield-drop, or close-in behavior. The lag alone
removes the stall, and is how the mechanic should work: the shield punishes a lazy head-on
dash but yields to footwork.

## The change

### 1. Rate-limited tracking (the one behavioral edit)

In `src/enemies.ts`, replace the instant snap with a capped rotation toward the target,
using the frame `dt`:

```ts
if (e.shielded) {
  const target = Math.atan2(p.y - e.y, p.x - e.x);
  e.shieldAngle = rotateToward(e.shieldAngle, target, SHIELD.trackRate * dt);
}
```

`rotateToward(current, target, maxDelta)` is a pure helper: wrap `target - current` to
[-π, π], clamp to ±`maxDelta`, add, and re-wrap. If a shared bounded-turn helper already
exists for the **WARDEN** `facing` (bounded-turn heading toward the player), reuse it
instead of adding a duplicate.

### 2. Spawn initialization

In `World.spawnEnemy` (`src/world.ts`), a shielded enemy's `shieldAngle` is currently set
to a hardcoded `0`. Initialize it to **face the player at spawn** so a fresh shield does
not start with a phantom gap (a free flank) or visibly swing in from due-east:

```ts
e.shieldAngle = e.shielded ? Math.atan2(this.player.y - y, this.player.x - x) : 0;
```

### 3. Tune constant

Add to `SHIELD` in `src/tune.ts`:

```ts
trackRate: 2.0, // rad/s — max angular speed the frontal shield can re-aim (tracking lag)
```

Start at **2.0 rad/s** (a ~1.6 s half-turn — clearly visible lag). Tuning range ≈ 1.4–2.6,
settled by the verification pass below.

## What does NOT change

- `src/collision.ts` (`shieldBlocks` / `withinArc`) — unchanged; reads `e.shieldAngle`.
- `src/game.ts` spear block (`shieldBlocks(e.shieldAngle, …)`) and afterimage-ghost block —
  unchanged; both respect the lag automatically.
- `src/render.ts` shield-arc draw — unchanged; **the arc lagging behind the player IS the
  telegraph** the player reads to time the kill. No new VFX.
- `SHIELD.arcHalf` stays 0.8 — do not stack a second nerf on top of the lag.

## Tuning target / success criteria

`SHIELD.trackRate` is the single dial. Geometry anchors it: at the orbiter's 240 px orbit
the player's 340 px/s strafe gives ≈1.4 rad/s of bearing change; closer engagements give
more. So a `trackRate` near/under that band lets the player open the 0.8 rad cone by
moving.

Verify with the autoplay bot (`tools/balance-node.mjs` / the `__heatSweep` harness):

1. **Lone shielded orbiter is reliably killable** — the documented Arena staller no longer
   soft-locks. (Optionally add a focused single-orbiter-straggler micro-benchmark:
   time-to-clear, or ARMORED-clang count, before vs after.)
2. **Arena clear-rate at Heat 0–3 rises** vs the current baseline (a laggy shield also lets
   more of the bot's through-skewers actually land, so clangs drop).
3. **No Boss-Rush regression** (shields are darter/orbiter only; bosses unaffected, but
   confirm the sweep numbers hold).

Dial `trackRate` within ~1.4–2.6 against these. Bias toward the forgiving end if a lone
orbiter still resists — the explicit intent is "lag enough for the player to down it."

## Determinism

Pure `dt`-arithmetic, no `world.rng` draw. The loop is fixed-timestep (`FIXED_DT`), so the
Daily stays bit-identical for every player. Ghost replays are recorded **position traces**
(`src/ghost.ts`: render-only overlay, never touches the sim) → unaffected. No save-version
bump (no persisted field changes).

## Tests

- Unit test for `rotateToward` (or the reused WARDEN helper): clamps a large delta to
  `maxDelta`, converges exactly when within `maxDelta`, wraps across the ±π seam, both
  rotation directions.
- Full `vitest` suite stays green (collision / determinism / enemy-role tests).
- Bot sweep per the success criteria above.

## Files touched

- `src/tune.ts` — add `SHIELD.trackRate`.
- `src/enemies.ts` — rate-limited shield tracking (+ `rotateToward` import/helper).
- `src/world.ts` — spawn `shieldAngle` faces the player.
- `src/vec.ts` (or existing helper module) — `rotateToward`, if no WARDEN helper to reuse.
- a `*.test.ts` — `rotateToward` unit test.
