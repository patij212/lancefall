# Casual mode softening — design

**Date:** 2026-06-21
**Status:** approved (brainstorm) → ready for plan

## Problem

CASUAL is the accessibility mode — its job is to let anyone reach the ending (the
Sovereign + THE CHOICE). It's already eased (`intensityMul 0.62`, `spawnMul 1.4`, 6
ARMOR), but the per-request goal is to soften it further on three specific axes: lower
**enemy movement speed**, **bullet speed**, and **bullet count** by a reasonable margin —
for chaff **and** bosses.

## Why a new mechanism (not `speedBonus`)

`RunConfig.speedBonus` already flat-adds to both the enemy-speed and bullet-speed
multipliers for **chaff** (`game.ts`: `sMul`/`bMul` at the spawn site). But:
- Bosses hardcode `e.bulletMul = 1` and emit bullets with a raw `const sp = <BOSS>.speed`
  (not scaled by `speedBonus`), so `speedBonus` cannot slow boss bullets.
- The request explicitly includes bosses.

So instead of `speedBonus`, introduce dedicated, default-1 mode scalars applied at shared
chokepoints that cover chaff **and** bosses consistently.

## Decision

Three new **optional** `RunConfig` fields (absent / `undefined` ⇒ treated as `1` ⇒ today's
behavior, so ONLY Casual changes; every other mode, the Daily, and the leaderboards are
untouched). Each is mirrored onto `World` at run start and applied at exactly one kind of
chokepoint:

| Field (`RunConfig` + `World`) | Casual | Chokepoint | Effect |
|---|---|---|---|
| `enemySpeedScale` | `0.85` | chaff spawn site (`game.ts` `sMul`) | enemies move ~15% slower |
| `bulletSpeedScale` | `0.85` | `World.spawnBullet` (scales `vx,vy` once) | **every** bullet (chaff + boss) ~15% slower |
| `fireCadenceMul` | `1.35` | fire-**frequency** timer resets (chaff + boss) | fires ~26% less often → ~26% fewer bullets |

Net feel = the chosen "Medium" margin (~15% slower, ~25% fewer).

### 1. `bulletSpeedScale` — one chokepoint for all bullet speed

`World.spawnBullet(x, y, vx, vy, …)` is the single path every enemy/boss/hazard bullet
goes through. Scale the stored velocity by `this.bulletSpeedScale` there:

```ts
b.vx = vx * this.bulletSpeedScale;
b.vy = vy * this.bulletSpeedScale;
```

This slows boss bullets **for free** — no per-boss `const sp` edits. Safe cases:
- Orbiter mine spawns with `vx=vy=0` → `0 * 0.85 = 0` (still parked). ✓
- Reflected orbs (parry) and homing seekers recompute velocity downstream → only the
  initial speed is scaled, which is harmless. ✓
- The player's spear is NOT a bullet (not spawned via `spawnBullet`), so nothing
  player-side is slowed. (Verify no player-friendly projectile uses `spawnBullet`.)

### 2. `enemySpeedScale` — chaff movement

At the chaff spawn computation (`game.ts`, ~line 3696):

```ts
const sMul = (enemySpeedMul(I) + cfg.speedBonus) * this.biomeSpeedMul * (cfg.enemySpeedScale ?? 1);
```

This bakes into `e.speedMul` (used by every chaff steering call). Bosses move slowly by
design and set `e.speedMul = 1`; boss movement is intentionally left as-is (negligible, and
out of scope — the boss softening that matters is bullet speed + count, both covered).

### 3. `fireCadenceMul` — fewer bullets (chaff + boss)

Multiply the **fire-frequency** timer resets by `world.fireCadenceMul` (>1 ⇒ longer
interval ⇒ fires less often ⇒ fewer bullets). `World` exposes `fireCadenceMul` (default 1);
the enemy/boss update functions already receive `world`, so they read it directly (no spawn
plumbing, no `Enemy` field, no signature change).

**Apply ONLY to genuine fire-cadence timers.** Do NOT touch lethal windows, telegraph/lock
windups, or beam phases — stretching those would make the fight *more* dangerous or blur a
tell. Specifically:

- **Chaff (`enemies.ts`):** orbiter `fireCadence`, bloomer `ringCadence`, brooder
  `spawnEvery`, seeker `fireCadence` (the reposition→refire reset, NOT `lockTime`), lancer
  `repositionTime` (NOT `lockTime`), drifter `repositionTime` (NOT `lockTime`), shade
  `strikeCadence` (NOT `strikeTime`, the lethal window), herald `repositionTime` (NOT
  `lockTime`), hollow_echo `echoFireEvery`.
- **Bosses (`bosses/*.ts`):** the fan/ring/spiral/pinwheel cadence timers —
  warden `fanGap`/`fanRest` (+ spiral cadence), weaver `ringEvery`/`pinwheelEvery`, beacon
  `fanGap`/`fanRest` (NOT `telegraphDur`/`activeDur`/`offDur` beam phases), hollow
  `ringEvery`/`fanGap`, mirrorblade fan cadence (NOT lunge timers), sovereign
  `fanGap`/`fanRest` (+ spiral cadence; NOT beam telegraph/active/off, NOT nova spiral
  telegraph).

The plan enumerates each exact line; the implementer must read each boss file and apply the
rule (frequency = scale; lethal/telegraph/beam = leave).

## What does NOT change

- `speedBonus` stays `0` for Casual (the new scales fully own the speed reduction; not
  stacking two mechanisms).
- No other mode's config (all three fields absent ⇒ ×1).
- Boss movement speed, lethal-window durations, telegraph/beam phase timings.
- `Enemy` type / save schema (no new persisted field; `World` fields are runtime-only).

## Determinism / safety

All three fields default to `1`, so every non-Casual mode is bit-identical to today — the
Daily/Weekly seeds and the leaderboards are unaffected. Casual is a random, off-board mode
(`rules.ranked:false`), so altering its sim is safe. The changes are pure arithmetic (no new
`world.rng` draw). `World.spawnBullet` stays on the seeded path but multiplies by a constant
(×1 for seeded modes) → no seeded drift. Ghosts are position traces (unaffected).

## Tuning

`fireCadenceMul 1.35`, `enemySpeedScale 0.85`, `bulletSpeedScale 0.85` (the "Medium"
preset). Verification may nudge these; they are the single dials.

## Verification

- Headless bot Casual sweep: `node tools/balance-node.mjs --modes=casual --runs=30` (and a
  Heat spread). Sovereign-reach / Sovereign-down% should **rise** vs a pre-change baseline.
- Regression guard: a non-Casual sweep (e.g. `--modes=arena,bossrush`) must be **unchanged**
  (the fields are absent there ⇒ ×1).
- Full `vitest` suite green (determinism + `world.fromkind` + enemy-role tests — all rely on
  the ×1 defaults).
- Unit test: a focused test that `spawnBullet` scales velocity by `bulletSpeedScale`, and a
  mode test that Casual carries the three fields while other modes don't.

## Files touched

- `src/modes.ts` — add the 3 fields to `RunConfig` (+ `ModeRules` unaffected) and set them on
  the Casual config.
- `src/world.ts` — add 3 `World` fields (default 1); scale velocity in `spawnBullet`.
- `src/game.ts` — set `world.{enemySpeedScale,bulletSpeedScale,fireCadenceMul}` from `cfg` at
  run start; multiply `sMul` by `cfg.enemySpeedScale` at the chaff spawn site.
- `src/enemies.ts` — `× world.fireCadenceMul` at the listed chaff fire-cadence resets.
- `src/bosses/{warden,weaver,beacon,mirrorblade,hollow,sovereign}.ts` — `× world.fireCadenceMul`
  at the listed boss fire-cadence resets.
- `src/world.test.ts` / `src/modes.test.ts` (or a new `casualSoftening.test.ts`) — tests.

## Concurrency note

`enemies.ts`, `world.ts`, `game.ts`, `tune.ts` are being live-edited by other agents
(popup-interrupt, avatars). Implementation MUST stage only its own hunks (content-filtered
`git apply --cached` from the repo root), never a wholesale `git add` of these shared files.
