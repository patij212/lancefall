# Shield Tracking Lag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a shielded darter/orbiter's frontal shield rotational inertia so it can no longer snap to face the player — letting footwork (strafe/circle) open a flank, so a lone shielded straggler can always be cornered instead of stalling the wave.

**Architecture:** Replace the one instant-snap write of `e.shieldAngle` (`src/enemies.ts`) with a rate-limited turn toward the player, capped at a new `SHIELD.trackRate` rad/s, via a pure `rotateToward` helper added to `src/vec.ts`. Seed `shieldAngle` to face the player at spawn (`src/world.ts`). Every consumer (spear block, afterimage-ghost block, the rendered arc) already *reads* `e.shieldAngle`, so they need no edits — the lagging arc the player sees becomes the built-in tell for when the kill is open.

**Tech Stack:** TypeScript, Vite, Vitest. Headless balance bot: `tools/balance-node.mjs` (Node, runs the real `.ts` sim via Vite `ssrLoadModule` + the shared brain in `tools/bot-core.mjs`).

## Global Constraints

- **Determinism:** the change must draw ZERO `world.rng`. Use only `dt` + angle math. The sim is fixed-timestep (`FIXED_DT`); the Daily must stay bit-identical for every player. (Ghost replays are pure position traces — `src/ghost.ts` — and are unaffected.)
- **No save-version bump:** no persisted field changes.
- **`SHIELD.arcHalf` stays `0.8`** — do NOT stack a second nerf; `trackRate` is the only new lever.
- **Shield applies to `darter` + `orbiter` only** (set in `spawnEnemy`); bosses/other chaff are untouched.
- **Blast radius (already grep-verified — `e.shieldAngle` has one writer + spawn init):** writer = the `if (e.shielded)` block in `updateEnemy` (`src/enemies.ts`); readers (no edits needed) = `src/game.ts:2023` (spear), `src/game.ts:2125` (afterimage ghost), `src/render.ts:927` (arc). `rotateToward` is new (no existing callers); `SHIELD.trackRate` is new. Risk: LOW. Per the repo `CLAUDE.md`, attempt `impact()` / `detect_changes()` if GitNexus is available; the index is currently stale/never-built, so fall back to this documented blast radius and proceed.

---

### Task 0: Capture the pre-change bot baseline

Record the autopilot's numbers on the **untouched** tree so Task 3 can prove the change is non-regressing. No code edits, no commit.

**Files:** none (read-only run).

- [ ] **Step 1: Run the Arena sweep (the mode where the shielded straggler stalls)**

Run:
```bash
node tools/balance-node.mjs --modes=arena --heats=0,1,2,3 --runs=30
```
Record the per-Heat clear-rate / median-wave line of the output. (Documented prior baseline for sanity: Arena ≈ 4–17% H0–3, `docs/BOT_PLAYTEST_2026-06-20.md`.)

- [ ] **Step 2: Run the Boss-Rush sweep (the regression guard)**

Run:
```bash
node tools/balance-node.mjs --modes=bossrush --heats=0,1,2,3 --runs=30
```
Record the per-Heat win-rate. (Documented prior baseline: Boss Rush ≈ 67–100%.)

- [ ] **Step 3: Paste both result blocks into a scratch note**

Keep them in the chat / a scratch file as `BASELINE`. These are the numbers Task 3 compares against. No commit.

---

### Task 1: `rotateToward` pure helper

A bounded-turn primitive: rotate an angle toward a target by at most `maxDelta`, taking the shortest way around the ±π seam. Reuses the existing, tested `angleDiff` + `clamp` in the same module.

**Files:**
- Modify: `src/vec.ts` (add `rotateToward` after `angleDiff`, ~line 49)
- Test: `src/vec.test.ts` (add a `describe('rotateToward', …)` block; extend the import)

**Interfaces:**
- Consumes: `angleDiff(a, b)`, `clamp(v, lo, hi)` — both already exported from `src/vec.ts`.
- Produces: `export function rotateToward(current: number, target: number, maxDelta: number): number`

- [ ] **Step 1: Write the failing test**

Add to `src/vec.test.ts`. First extend the import on line 2–13 to include `rotateToward`:

```ts
import {
  len,
  dist,
  norm,
  clampLen,
  lerp,
  clamp,
  angleDiff,
  rotateToward,
  easeOutQuad,
  easeOutCubic,
  easeOutBack,
} from './vec';
```

Then append this block at the end of the file:

```ts
describe('rotateToward', () => {
  it('clamps a large turn to maxDelta, shortest direction', () => {
    expect(rotateToward(0, 1.5, 0.1)).toBeCloseTo(0.1);   // target ahead
    expect(rotateToward(0, -1.5, 0.1)).toBeCloseTo(-0.1); // target behind → short way is negative
  });

  it('lands exactly on target when the gap is within maxDelta', () => {
    expect(rotateToward(0, 0.05, 0.1)).toBeCloseTo(0.05);
  });

  it('takes the short way across the ±π seam', () => {
    // from 3.0 rad toward -3.0 rad, the short hop is +across π (~+0.283), not -6
    expect(rotateToward(3.0, -3.0, 0.1)).toBeCloseTo(3.1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/vec.test.ts -t rotateToward`
Expected: FAIL — `rotateToward is not a function` (and a TS/import error for the unknown export).

- [ ] **Step 3: Implement `rotateToward`**

In `src/vec.ts`, add directly after the `angleDiff` function (after line 49):

```ts
/** Rotate `current` toward `target` by at most `maxDelta` radians, the shortest way
 *  around the ±π seam. Bounded-turn tracking (e.g. a shield with rotational inertia). */
export function rotateToward(current: number, target: number, maxDelta: number): number {
  return current + clamp(angleDiff(current, target), -maxDelta, maxDelta);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/vec.test.ts -t rotateToward`
Expected: PASS (3 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/vec.ts src/vec.test.ts
git commit -m "feat(lancefall): rotateToward — bounded-turn angle helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Apply shield tracking lag

Add the `SHIELD.trackRate` dial, swap the instant snap for a rate-limited turn in `updateEnemy`, and seed `shieldAngle` to face the player at spawn. Drive it with a failing integration test that proves the shield no longer snaps and still converges.

**Files:**
- Modify: `src/tune.ts` (add `trackRate` inside the `SHIELD` object, ~line 505)
- Modify: `src/enemies.ts` (imports on lines 4–5; the `if (e.shielded)` block at lines 100–103)
- Modify: `src/world.ts` (`spawnEnemy`, line 361)
- Test: `src/shieldLag.test.ts` (new)

**Interfaces:**
- Consumes: `rotateToward` (Task 1) from `src/vec.ts`; `SHIELD` from `src/tune.ts`; `updateEnemy(e, world, dt)` from `src/enemies.ts`; `World` from `src/world.ts`; `createRng` from `src/rng.ts`; `angleDiff` from `src/vec.ts`.
- Produces: `SHIELD.trackRate: number` (rad/s). No new exported functions.

- [ ] **Step 1: Write the failing integration test**

Create `src/shieldLag.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { createRng } from './rng';
import { updateEnemy } from './enemies';
import { angleDiff } from './vec';

const DT = 1 / 60;

// Spawn a shielded enemy, then jump the player ~90° around it. With a laggy shield the
// arc can't snap to the new bearing in one frame — that gap is what a strafing player
// exploits to land a dash. With the OLD instant-snap code the gap closes immediately and
// the first assertion fails.
describe('shield tracking lag', () => {
  it('does not snap the shield to the player in a single frame', () => {
    const w = new World(createRng(1));
    w.reset(1280, 720);
    w.player.x = 1000; w.player.y = 360;        // shield seeds facing "down" toward here
    const e = w.spawnEnemy('darter', 1000, 200, 1, 1, true)!;
    expect(e.shielded).toBe(true);
    w.player.x = 1160; w.player.y = 200;        // jump ~90° around the enemy
    const target = Math.atan2(w.player.y - e.y, w.player.x - e.x);
    updateEnemy(e, w, DT);
    // turned toward the player but still far from facing it (no instant snap)
    expect(Math.abs(angleDiff(e.shieldAngle, target))).toBeGreaterThan(1.0);
  });

  it('converges to face a held-still player given enough time', () => {
    const w = new World(createRng(1));
    w.reset(1280, 720);
    w.player.x = 1000; w.player.y = 360;
    const e = w.spawnEnemy('darter', 1000, 200, 1, 1, true)!;
    w.player.x = 1160; w.player.y = 200;
    for (let i = 0; i < 300; i++) {
      updateEnemy(e, w, DT);
      e.x = 1000; e.y = 200; e.vx = 0; e.vy = 0; // pin the enemy so the target bearing is constant
    }
    const target = Math.atan2(w.player.y - e.y, w.player.x - e.x);
    expect(Math.abs(angleDiff(e.shieldAngle, target))).toBeLessThan(0.05);
  });

  it('seeds the shield facing the player at spawn (no phantom gap)', () => {
    const w = new World(createRng(1));
    w.reset(1280, 720);
    w.player.x = 600; w.player.y = 600;
    const e = w.spawnEnemy('orbiter', 600, 200, 1, 1, true)!;
    const target = Math.atan2(w.player.y - e.y, w.player.x - e.x);
    expect(Math.abs(angleDiff(e.shieldAngle, target))).toBeLessThan(0.01);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/shieldLag.test.ts`
Expected: FAIL — the no-snap test fails (old code snaps, gap ≈ 0, not > 1.0) and the spawn-seed test fails (old code seeds `shieldAngle = 0`, not facing the player).

- [ ] **Step 3: Add the `trackRate` tune constant**

In `src/tune.ts`, inside the `SHIELD` object (after the `arcHalf` line, before the closing `} as const;` ~line 505):

```ts
export const SHIELD = {
  // v6 playtest (Nick): the old ±1.05 (~120°) cone + per-frame re-aim made a head-on
  // dash almost always clang — "armoured enemies too hard". Narrowed to ±0.8 (~92°) so
  // there's a real landing arc on the flanks while the shield still rewards a side/back
  // approach. arcHalf MUST equal the rendered arc half-width (render.ts:1011).
  arcHalf: 0.8, // radians (±) — a ~92° frontal block cone
  // The shield can no longer SNAP to face you — it re-aims at this max angular rate, so
  // footwork (strafe/circle faster than it can turn) opens a flank to dash through. This
  // is the cure for a lone shielded darter/orbiter stalling a wave: the laggy arc you see
  // is the tell for when the kill is open. Tuned so a lone orbiter is reliably down-able.
  trackRate: 2.0, // rad/s — max shield re-aim speed (tracking lag)
} as const;
```

(Keep the existing comment lines verbatim; only the two new comment lines + `trackRate` are added.)

- [ ] **Step 4: Wire the imports + rate-limited tracking in `enemies.ts`**

In `src/enemies.ts`, add `SHIELD` to the tune import (line 4) and `rotateToward` to the vec import (line 5):

```ts
import { ORBITER, SPLITTER, BLOOMER, LANCER, WISP, DRIFTER_TUNE, SHADE_TUNE, HOLLOW, SOVEREIGN, BROODER, HERALD, SEEKER_TUNE, ZONER, BOMBER, SHIELD } from './tune';
import { norm, clamp, rotateToward } from './vec';
```

Then replace the shield block (lines 100–103):

```ts
  // shield faces the player
  if (e.shielded) {
    e.shieldAngle = Math.atan2(p.y - e.y, p.x - e.x);
  }
```

with:

```ts
  // shield TRACKS the player but with rotational inertia — it can't snap, so footwork
  // (strafe/circle faster than it can re-aim) opens a flank to dash through. The laggy arc
  // is the tell. Pure (dt + angle math, no rng) so the seeded Daily stays bit-identical.
  if (e.shielded) {
    const target = Math.atan2(p.y - e.y, p.x - e.x);
    e.shieldAngle = rotateToward(e.shieldAngle, target, SHIELD.trackRate * dt);
  }
```

- [ ] **Step 5: Seed the spawn shield angle in `world.ts`**

In `src/world.ts`, replace line 361:

```ts
    e.shieldAngle = 0;
```

with (note `e.shielded` was set on the line above; use the `x, y` spawn params, not `e.x/e.y`, to avoid any field-ordering assumption):

```ts
    e.shieldAngle = e.shielded ? Math.atan2(this.player.y - y, this.player.x - x) : 0;
```

- [ ] **Step 6: Run the integration test to verify it passes**

Run: `npx vitest run src/shieldLag.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the full suite (determinism + collision + enemy-role regressions)**

Run: `npx vitest run`
Expected: PASS — all suites green (notably `src/determinism.test.ts`, `src/collision.test.ts`, `src/darter.test.ts`, `src/spawnReset.test.ts`).

- [ ] **Step 8: Type-check the build**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/tune.ts src/enemies.ts src/world.ts src/shieldLag.test.ts
git commit -m "feat(lancefall): shield tracking lag — out-maneuver a lone shielded straggler

The frontal shield on a darter/orbiter no longer snaps to face you; it re-aims at
SHIELD.trackRate rad/s, so strafing/circling opens a flank to dash through. Seeds the
shield facing the player at spawn. Pure dt math (Daily stays bit-identical; ghosts are
position traces, unaffected). Cures the lone-shielded-straggler wave stall.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Verify with the bot + tune `trackRate`

Confirm the change clears the stall without regressing the bot, then settle the dial. The autopilot beats shielded chaff via through-skewers (not strafe-juke), so a laggy shield lands MORE of its dashes → Arena should hold or improve; Boss-Rush must not regress. The human-cornerability claim is anchored by geometry + an optional manual feel-check.

**Files:**
- Possibly modify: `src/tune.ts` (`SHIELD.trackRate`) if tuning is needed.

- [ ] **Step 1: Re-run the Arena sweep (post-change)**

Run:
```bash
node tools/balance-node.mjs --modes=arena --heats=0,1,2,3 --runs=30
```
Compare to Task 0 BASELINE. Expected: clear-rate / median-wave **≥ baseline** at every Heat (the change removes clangs, so it cannot reasonably lower chaff clears). A drop signals a bug — investigate before continuing.

- [ ] **Step 2: Re-run the Boss-Rush sweep (regression guard)**

Run:
```bash
node tools/balance-node.mjs --modes=bossrush --heats=0,1,2,3 --runs=30
```
Compare to Task 0 BASELINE. Expected: win-rate within the baseline band (shields are darter/orbiter only; bosses are untouched, so this confirms no collateral).

- [ ] **Step 3: Geometry / feel check — is the lag "enough to down it"?**

Sanity-anchor `trackRate` against the orbiter (the headline staller, orbit radius 240, player `maxSpeed` 340):
- The player's bearing-rate around an enemy at distance `d` is `340 / d` rad/s (≈1.4 at 240px, ≈2.8 at 120px, ≈4.2 at 80px).
- At `trackRate = 2.0`, a player out-turns the shield once inside ~170px and decisively when close — the gap to clear is `arcHalf = 0.8` rad. A lone orbiter is corner-able by closing in and cutting across.

Optional manual feel-check (run the dev server, fight a lone shielded orbiter): `npm run dev`, then in DevTools spawn/observe via the `__lf` dev hook, or just play an Arena wave down to a lone shielded straggler and confirm a strafe-then-dash-through lands.

- [ ] **Step 4: Tune `trackRate` only if needed**

Decision rules (bias forgiving — the stated intent is "lag enough for the player to down it"):
- If a lone orbiter still resists / Arena clears flat-or-down at H0–1 → lower `trackRate` by 0.3 (toward the 1.4 floor) in `src/tune.ts`, re-run Steps 1–2.
- If shielded enemies feel like a total non-event AND you want to preserve some bite → raise toward 2.4 (the 2.6 ceiling), re-run Steps 1–2.
- Settle when: Arena ≥ baseline, Boss-Rush within band, and a lone orbiter is reliably down-able.

If a value other than 2.0 is chosen, commit it:
```bash
git add src/tune.ts
git commit -m "tune(lancefall): set SHIELD.trackRate to <value> (bot-verified)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Final confirmation**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: all green. Report the before/after Arena + Boss-Rush numbers and the final `trackRate`.

---

## Self-Review

**Spec coverage:**
- Rate-limited tracking (instant-snap → capped turn) → Task 2 Step 4. ✓
- Spawn init faces the player → Task 2 Step 5. ✓
- `SHIELD.trackRate` tune (start 2.0, range 1.4–2.6) → Task 2 Step 3, tuned in Task 3 Step 4. ✓
- `rotateToward` pure helper (reuse `angleDiff`+`clamp`; reuse a WARDEN helper if one existed — none does, so add to `vec.ts`) → Task 1. ✓
- "What does NOT change" (collision/game/render/`arcHalf`) → enforced by Global Constraints + no tasks touch them. ✓
- Determinism (no rng, fixed dt, ghosts unaffected, no save bump) → Global Constraints; guarded by the full-suite run (Task 2 Step 7). ✓
- Verification: lone orbiter killable + Arena up + no Boss-Rush regression → Tasks 0 & 3. ✓
- Tests: `rotateToward` unit test (Task 1), lag integration test (Task 2), full suite (Task 2 Step 7). ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to". Every code step shows complete code; every command shows expected output. ✓ (`trackRate` final value is a bounded, verification-settled decision, not a placeholder.)

**Type consistency:** `rotateToward(current, target, maxDelta): number` is defined identically in Task 1 and consumed in Task 2 Step 4. `SHIELD.trackRate: number` defined in Task 2 Step 3, consumed in Step 4. `updateEnemy(e, world, dt)` matches the existing signature. `e.shieldAngle` / `e.shielded` are existing `Enemy` fields. ✓
