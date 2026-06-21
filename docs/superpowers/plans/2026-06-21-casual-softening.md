# Casual Mode Softening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CASUAL mode gentler on three axes — enemy movement speed, bullet speed, and bullet count — for chaff and bosses, by a "Medium" margin (~15% slower, ~25% fewer), with zero impact on any other mode.

**Architecture:** Three optional, default-1 `RunConfig` scalars (`enemySpeedScale`, `bulletSpeedScale`, `fireCadenceMul`). `enemySpeedScale` is read from `cfg` at the chaff spawn site. `bulletSpeedScale` + `fireCadenceMul` live on `World` (set from `cfg` at run start) and are applied at two chokepoints: `World.spawnBullet` scales bullet velocity (covers chaff + boss bullets for free); fire-*cadence* timer resets are multiplied by `world.fireCadenceMul` (chaff + boss, frequency timers only).

**Tech Stack:** TypeScript, Vite, Vitest. Headless balance bot: `node tools/balance-node.mjs` (`--modes=casual`).

## Global Constraints

- **Determinism:** all three fields default to 1 ⇒ every non-Casual mode is byte-identical to today (Daily/Weekly seeds + leaderboards unaffected). Casual is random + off-board (`rules.ranked:false`). Changes are pure arithmetic — NO new `world.rng` draw.
- **No save/schema change:** `World` fields are runtime-only; no `Enemy` field; no `SAVE_VERSION` bump.
- **Only fire-FREQUENCY timers get `fireCadenceMul`.** NEVER multiply a lethal window, telegraph/lock windup, or beam phase (those would make a fight *more* dangerous or blur a tell).
- **`speedBonus` stays `0` for Casual** — the new scales own the speed reduction; do not stack two mechanisms.
- **Accepted side effect:** the riposte/reflect player orb (`game.ts` ~`fb.friendly = true`) is spawned via `spawnBullet`, so in Casual it also flies ~15% slower. This is negligible and harmless (slower *offense* in the easy mode) — leave it; do not special-case the chokepoint.
- **Shared-tree discipline:** `modes.ts`, `world.ts`, `game.ts`, `enemies.ts`, `tune.ts`, and some `bosses/*.ts` are being live-edited by other agents. NEVER `git add` a shared file wholesale — stage only your own hunks via content-filtered `git apply --cached` run from the **repo root** (`C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground`), patch paths prefixed `lancefall/...`. New test files can be added by exact path.

---

### Task 0: Capture the pre-change bot baseline

Record Casual (the target) and a non-Casual regression guard on the untouched tree. No edits, no commit.

**Files:** none (read-only runs).

- [ ] **Step 1: Casual baseline (a Heat spread)**

Run:
```bash
node tools/balance-node.mjs --modes=casual --heats=0,1,2 --runs=30
```
Record the per-Heat line (survival modes show **Sovereign-down%** — that's the "did they reach + beat the ending" signal we expect to RISE).

- [ ] **Step 2: Regression-guard baseline (must stay unchanged after)**

Run:
```bash
node tools/balance-node.mjs --modes=arena,bossrush --heats=0,2 --runs=20
```
Record the numbers. These modes don't set the new fields, so they must be statistically unchanged at the end.

- [ ] **Step 3: Save both blocks as `BASELINE` in the chat/scratch.** No commit.

---

### Task 1: RunConfig fields + Casual values

Add the three optional scalars to the mode config type and set them on Casual. Nothing reads them yet, so this is a safe data-only step.

**Files:**
- Modify: `src/modes.ts` (the `RunConfig` interface; the `casual` config object)
- Test: `src/modes.test.ts` (add cases)

**Interfaces:**
- Produces: `RunConfig.enemySpeedScale?: number`, `RunConfig.bulletSpeedScale?: number`, `RunConfig.fireCadenceMul?: number` (all optional; absent ⇒ treated as 1 by consumers).

- [ ] **Step 1: Write the failing test**

Add to `src/modes.test.ts` (top: ensure `import { MODES, modeById } from './modes';` exists — it does):

```ts
describe('Casual softening scalars', () => {
  it('Casual carries the three softening scalars', () => {
    const casual = modeById('casual');
    expect(casual.enemySpeedScale).toBe(0.85);
    expect(casual.bulletSpeedScale).toBe(0.85);
    expect(casual.fireCadenceMul).toBe(1.35);
  });

  it('no OTHER mode sets them (absent ⇒ today behavior)', () => {
    for (const m of MODES) {
      if (m.id === 'casual') continue;
      expect(m.enemySpeedScale).toBeUndefined();
      expect(m.bulletSpeedScale).toBeUndefined();
      expect(m.fireCadenceMul).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modes.test.ts -t "Casual softening"`
Expected: FAIL — `expected undefined to be 0.85` (fields don't exist yet).

- [ ] **Step 3: Add the fields to the `RunConfig` interface**

In `src/modes.ts`, inside `interface RunConfig` (after the `flavor?: string;` field, before the closing `}`):

```ts
  /** §casual-softening — optional, default-1 difficulty scalars. ABSENT ⇒ ×1 ⇒ today's
   *  behavior (only Casual sets them). `enemySpeedScale` scales chaff movement speed at the
   *  spawn site; `bulletSpeedScale` scales EVERY bullet's velocity at World.spawnBullet
   *  (chaff + boss); `fireCadenceMul` (>1 = fire less often) multiplies fire-cadence timers
   *  (chaff + boss). Pure scalars — they never touch rng, so seeded modes (absent ⇒ ×1)
   *  stay bit-identical. */
  enemySpeedScale?: number;
  bulletSpeedScale?: number;
  fireCadenceMul?: number;
```

- [ ] **Step 4: Set the values on the Casual config**

In `src/modes.ts`, in the `casual` mode object, change its `rules` line to also carry the scalars. Replace:

```ts
    seedKind: 'random', intensityMul: 0.62, spawnMul: 1.4, bossInterval: 75, speedBonus: 0,
    shieldStart: 180, shieldMax: 0.2, shardMul: 1, perks: true, canFail: true, arena: false, bossrush: false,
    rules: { ranked: false, casualShields: 6 }, // off-board + 6 extra absorbs
```

with:

```ts
    seedKind: 'random', intensityMul: 0.62, spawnMul: 1.4, bossInterval: 75, speedBonus: 0,
    shieldStart: 180, shieldMax: 0.2, shardMul: 1, perks: true, canFail: true, arena: false, bossrush: false,
    // §casual-softening — gentler on three axes (Medium margin): ~15% slower enemies + bullets,
    // ~26% fewer bullets (fire less often). Stacks on the low intensity / sparse spawns / 6 ARMOR.
    enemySpeedScale: 0.85, bulletSpeedScale: 0.85, fireCadenceMul: 1.35,
    rules: { ranked: false, casualShields: 6 }, // off-board + 6 extra absorbs
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/modes.test.ts -t "Casual softening"`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit (stage only your hunks — `modes.ts` is shared)**

From the repo root, content-filter `modes.ts` to your two hunks (the interface fields + the casual values) and stage `modes.test.ts` by path:
```bash
cd "C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground"
git add lancefall/src/modes.test.ts
# stage only your modes.ts hunks (verify the diff shows ONLY the scalar additions, no foreign hunks):
git diff -- lancefall/src/modes.ts
git apply --cached <(git diff -- lancefall/src/modes.ts)   # if the whole modes.ts diff is yours; otherwise filter
git commit -m "feat(lancefall): Casual softening scalars on RunConfig (data only)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(If `modes.ts` has foreign hunks, build a filtered patch keeping only your two hunks and `git apply --cached` it — see the Concurrency note.)

---

### Task 2: Speed — enemy movement + all bullet velocity

Wire `bulletSpeedScale` + `fireCadenceMul` onto `World`, scale velocity in `spawnBullet`, set both from `cfg` at run start, and scale chaff movement at the spawn site. After this task, Casual enemies move ~15% slower and ALL bullets (chaff + boss) fly ~15% slower. (`fireCadenceMul` is wired but not yet read — that's Task 3/4.)

**Files:**
- Modify: `src/world.ts` (class fields; `spawnBullet`)
- Modify: `src/game.ts` (run-start wiring after `world.reset`; chaff spawn-site `sMul`)
- Test: `src/casualSoftening.test.ts` (new)

**Interfaces:**
- Consumes: `RunConfig.{bulletSpeedScale,fireCadenceMul,enemySpeedScale}` (Task 1).
- Produces: `World.bulletSpeedScale: number` (default 1), `World.fireCadenceMul: number` (default 1); `World.spawnBullet` now multiplies the incoming `vx,vy` by `this.bulletSpeedScale`.

- [ ] **Step 1: Write the failing test**

Create `src/casualSoftening.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { createRng } from './rng';

describe('casual softening — bullet speed chokepoint', () => {
  it('spawnBullet scales velocity by world.bulletSpeedScale', () => {
    const w = new World(createRng(1));
    w.reset(1280, 720);
    w.bulletSpeedScale = 0.5;
    const b = w.spawnBullet(100, 100, 200, -40, 6, '#fff', false)!;
    expect(b.vx).toBeCloseTo(100); // 200 * 0.5
    expect(b.vy).toBeCloseTo(-20); // -40 * 0.5
  });

  it('defaults to 1 (no change) on a fresh world', () => {
    const w = new World(createRng(1));
    w.reset(1280, 720);
    expect(w.bulletSpeedScale).toBe(1);
    expect(w.fireCadenceMul).toBe(1);
    const b = w.spawnBullet(0, 0, 300, 0, 6, '#fff', false)!;
    expect(b.vx).toBeCloseTo(300);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/casualSoftening.test.ts`
Expected: FAIL — `w.bulletSpeedScale` is `undefined` so `b.vx` is `NaN` (and `toBe(1)` fails).

- [ ] **Step 3: Add the two fields to `World`**

In `src/world.ts`, find the class field declarations near the top of `class World` (e.g. alongside `width`/`height` or the rng fields) and add:

```ts
  /** §casual-softening — runtime difficulty scalars set from the mode RunConfig at run
   *  start (game.ts). Default 1 ⇒ no change (every non-Casual mode + a bare test World).
   *  `bulletSpeedScale` scales spawnBullet velocity; `fireCadenceMul` (>1 = fire less
   *  often) multiplies enemy/boss fire-cadence timers. Pure scalars; no rng. */
  bulletSpeedScale = 1;
  fireCadenceMul = 1;
```

- [ ] **Step 4: Scale velocity in `spawnBullet`**

In `src/world.ts` `spawnBullet`, change:

```ts
    b.vx = vx;
    b.vy = vy;
```

to:

```ts
    b.vx = vx * this.bulletSpeedScale; // §casual-softening — slower bullets (×1 elsewhere)
    b.vy = vy * this.bulletSpeedScale;
```

- [ ] **Step 5: Set the world scalars from cfg at run start**

In `src/game.ts`, immediately after `this.world.reset(window.innerWidth, window.innerHeight);` (the run-start reset), add:

```ts
    // §casual-softening — push the mode's difficulty scalars onto the world (default 1
    // for every other mode). bulletSpeedScale is read in spawnBullet; fireCadenceMul at
    // enemy/boss fire-cadence resets. enemySpeedScale is read at the chaff spawn site below.
    this.world.bulletSpeedScale = cfg.bulletSpeedScale ?? 1;
    this.world.fireCadenceMul = cfg.fireCadenceMul ?? 1;
```

(Use `cfg` — the resolved mode after the daily-lockout fallback. `runCfg`/NG+ only override `intensityMul`.)

- [ ] **Step 6: Scale chaff movement at the spawn site**

In `src/game.ts`, the chaff spawn computation reads:

```ts
    const sMul = (enemySpeedMul(I) + cfg.speedBonus) * this.biomeSpeedMul;
```

Change it to:

```ts
    const sMul = (enemySpeedMul(I) + cfg.speedBonus) * this.biomeSpeedMul * (cfg.enemySpeedScale ?? 1); // §casual-softening
```

(Leave the `bMul` line exactly as-is — bullet speed is handled by the spawnBullet chokepoint, NOT here, to avoid double-scaling.)

- [ ] **Step 7: Run the new test + the determinism/fromkind guards**

Run: `npx vitest run src/casualSoftening.test.ts src/determinism.test.ts src/world.fromkind.test.ts`
Expected: PASS (the determinism + fromkind suites rely on the ×1 default and must stay green).

- [ ] **Step 8: Commit (stage only your hunks — all three files are shared)**

```bash
cd "C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground"
git add lancefall/src/casualSoftening.test.ts
# world.ts + game.ts: verify diffs are only your hunks, then stage (filter if foreign hunks present)
git diff -- lancefall/src/world.ts lancefall/src/game.ts
# stage only your hunks via filtered patch(es), then:
git commit -m "feat(lancefall): Casual softening — slower enemies + bullets (speed chokepoints)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Count — chaff fire less often

Multiply the chaff fire-*cadence* timer resets by `world.fireCadenceMul`. Only the frequency timers listed below — NOT lock/telegraph/lethal windows.

**Files:**
- Modify: `src/enemies.ts`
- Test: `src/casualSoftening.test.ts` (append)

**Interfaces:**
- Consumes: `World.fireCadenceMul` (Task 2); `updateEnemy`, `ORBITER` already imported in `enemies.ts`.

- [ ] **Step 1: Append the failing test**

Add to `src/casualSoftening.test.ts` (extend imports at the top to include `updateEnemy` from `./enemies` and `ORBITER` from `./tune`):

```ts
import { updateEnemy } from './enemies';
import { ORBITER } from './tune';

describe('casual softening — fire cadence (count)', () => {
  it('orbiter fire interval is stretched by world.fireCadenceMul', () => {
    const w = new World(createRng(1));
    w.reset(1280, 720);
    w.fireCadenceMul = 2;
    const e = w.spawnEnemy('orbiter', 600, 200, 1, 1, false)!;
    e.timer = 0.0001;            // about to fire
    updateEnemy(e, w, 0.001);    // timer crosses 0 → fires → resets to cadence * mul
    expect(e.timer).toBeCloseTo(ORBITER.fireCadence * 2, 4);
  });

  it('default cadence (mul 1) resets to the bare cadence', () => {
    const w = new World(createRng(1));
    w.reset(1280, 720);
    const e = w.spawnEnemy('orbiter', 600, 200, 1, 1, false)!;
    e.timer = 0.0001;
    updateEnemy(e, w, 0.001);
    expect(e.timer).toBeCloseTo(ORBITER.fireCadence, 4);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/casualSoftening.test.ts -t "fire cadence"`
Expected: FAIL — the first test gets `ORBITER.fireCadence` (×1) but expects `×2`.

- [ ] **Step 3: Apply `× world.fireCadenceMul` at the chaff cadence resets**

In `src/enemies.ts`, make each of these EXACT replacements (each target string is unique by its tune constant; do NOT touch the `lockTime` / `strikeTime` / `armTime` / telegraph variants):

| Find | Replace |
|---|---|
| `e.timer = ORBITER.fireCadence;` | `e.timer = ORBITER.fireCadence * world.fireCadenceMul;` |
| `e.timer = BLOOMER.ringCadence;` | `e.timer = BLOOMER.ringCadence * world.fireCadenceMul;` |
| `e.timer = BROODER.spawnEvery;` | `e.timer = BROODER.spawnEvery * world.fireCadenceMul;` |
| `e.timer = SEEKER_TUNE.fireCadence;` | `e.timer = SEEKER_TUNE.fireCadence * world.fireCadenceMul;` |
| `e.timer = LANCER.repositionTime;` | `e.timer = LANCER.repositionTime * world.fireCadenceMul;` |
| `e.timer = DRIFTER_TUNE.repositionTime;` | `e.timer = DRIFTER_TUNE.repositionTime * world.fireCadenceMul;` |
| `e.timer = SHADE_TUNE.strikeCadence;` | `e.timer = SHADE_TUNE.strikeCadence * world.fireCadenceMul;` |
| `e.timer = HERALD.repositionTime;` | `e.timer = HERALD.repositionTime * world.fireCadenceMul;` |
| `e.timer = HOLLOW.echoFireEvery;` | `e.timer = HOLLOW.echoFireEvery * world.fireCadenceMul;` |

(Each of `orbiter`/`bloomer`/`brooder`/`seeker`/`lancer`/`drifter`/`shade`/`herald`/`hollowEcho` already takes `world` as a parameter.)

- [ ] **Step 4: Run the test + full enemy/determinism guards**

Run: `npx vitest run src/casualSoftening.test.ts src/determinism.test.ts src/darter.test.ts src/enemyRoles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit (stage only your `enemies.ts` hunks)**

```bash
cd "C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground"
git add lancefall/src/casualSoftening.test.ts
git diff -- lancefall/src/enemies.ts   # verify only your 9 cadence edits; filter out foreign hunks (applyEdgePull etc.)
# stage only your hunks via filtered patch, then:
git commit -m "feat(lancefall): Casual softening — chaff fire less often (fewer bullets)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Count — bosses fire less often

Multiply the boss fire-*cadence* timer resets by `world.fireCadenceMul`. Frequency timers ONLY — never the beam phases (`telegraphDur`/`activeDur`/`offDur`/`beamTelegraph`/`beamActive`/`beamOff`), the spiral/nova *telegraph*, or lethal/lunge windows.

**Files:**
- Modify: `src/bosses/warden.ts`, `src/bosses/weaver.ts`, `src/bosses/beacon.ts`, `src/bosses/hollow.ts`, `src/bosses/sovereign.ts`
- (Mirrorblade: NO change — its fan is a per-lunge parting shot, no cadence timer; it gets bullet-speed softening via the Task 2 chokepoint only.)

**Interfaces:**
- Consumes: `World.fireCadenceMul` (Task 2). Every boss `update*` already takes `world`.

- [ ] **Step 1: warden.ts**

```
e.fireTimer += WARDEN.spiralBulletEvery * rate;   →  e.fireTimer += WARDEN.spiralBulletEvery * rate * world.fireCadenceMul;
e.fireTimer = WARDEN.fanGap;                       →  e.fireTimer = WARDEN.fanGap * world.fireCadenceMul;
e.fireTimer = WARDEN.fanRest;                      →  e.fireTimer = WARDEN.fanRest * world.fireCadenceMul;
```

- [ ] **Step 2: weaver.ts**

```
e.fireTimer += WEAVER.pinwheelEvery * rate;   →  e.fireTimer += WEAVER.pinwheelEvery * rate * world.fireCadenceMul;
e.fireTimer = WEAVER.ringEvery * rate;        →  e.fireTimer = WEAVER.ringEvery * rate * world.fireCadenceMul;
```

- [ ] **Step 3: beacon.ts** (leave `telegraphDur`/`activeDur`/`offDur` beam phases untouched)

```
e.fireTimer = BEACON.fanGap * rate;   →  e.fireTimer = BEACON.fanGap * rate * world.fireCadenceMul;
e.fireTimer = BEACON.fanRest;         →  e.fireTimer = BEACON.fanRest * world.fireCadenceMul;
```

- [ ] **Step 4: hollow.ts** (the ring cadence only; leave the sync telegraph/window + the parting fan)

```
e.fireTimer = HOLLOW.ringEvery * (enraged ? 0.7 : 1);   →  e.fireTimer = HOLLOW.ringEvery * (enraged ? 0.7 : 1) * world.fireCadenceMul;
```

- [ ] **Step 5: sovereign.ts** (leave beam telegraph/active/off + nova *telegraph* + the lazy `ringTimer` init/finale-refresh)

```
e.fireTimer = SOVEREIGN.fanGap;    →  e.fireTimer = SOVEREIGN.fanGap * world.fireCadenceMul;
e.fireTimer = SOVEREIGN.fanRest;   →  e.fireTimer = SOVEREIGN.fanRest * world.fireCadenceMul;
e.ringTimer = SOVEREIGN.exposeRingEvery * (finale ? 1 / SOVEREIGN.finaleFireMul : 1);   →  e.ringTimer = SOVEREIGN.exposeRingEvery * (finale ? 1 / SOVEREIGN.finaleFireMul : 1) * world.fireCadenceMul;
e.fireTimer += SOVEREIGN.spiralEvery * rate;   →  e.fireTimer += SOVEREIGN.spiralEvery * rate * world.fireCadenceMul;
```

(Do NOT change `e.ringTimer = SOVEREIGN.exposeRingEvery;` — the two bare init/refresh lines — they only delay the FIRST ring; leaving them avoids the duplicate-string edit and is negligible.)

- [ ] **Step 6: Build + full suite**

Run: `npx vitest run` then `npx tsc --noEmit`
Expected: vitest all green. (tsc: any pre-existing errors from concurrent WIP files like `shareBlock.test.ts` are NOT yours — confirm none of YOUR files appear in tsc output.)

- [ ] **Step 7: Commit (boss files — check each diff for foreign hunks first)**

```bash
cd "C:/Users/patij212/Downloads/_Organised/Projects/Claudes playground"
git diff -- lancefall/src/bosses/warden.ts lancefall/src/bosses/weaver.ts lancefall/src/bosses/beacon.ts lancefall/src/bosses/hollow.ts lancefall/src/bosses/sovereign.ts
# stage only your one-line cadence edits per file (filter any foreign hunks), then:
git commit -m "feat(lancefall): Casual softening — bosses fire less often (fewer bullets)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Verify with the bot + finalize

Confirm Casual got gentler, nothing else moved, and the suite is green.

**Files:** possibly `src/modes.ts` (only if a value needs nudging).

- [ ] **Step 1: Casual sweep (post-change)**

Run:
```bash
node tools/balance-node.mjs --modes=casual --heats=0,1,2 --runs=30
```
Compare to Task 0 BASELINE. Expected: **Sovereign-down% rises** at each Heat (gentler ⇒ more players reach + beat the ending). A flat-or-up result is success; a drop signals a bug.

- [ ] **Step 2: Regression guard (post-change)**

Run:
```bash
node tools/balance-node.mjs --modes=arena,bossrush --heats=0,2 --runs=20
```
Compare to BASELINE. Expected: **unchanged** within sampling noise (these modes don't set the scalars ⇒ ×1).

- [ ] **Step 3: Full suite + type-check**

Run: `npx vitest run` and `npx tsc --noEmit`
Expected: vitest all green; tsc clean for your files.

- [ ] **Step 4: (Optional) nudge a value**

Only if Casual still feels too hard (Sovereign-down% barely moved) or trivially easy: adjust the relevant scalar in `src/modes.ts` (toward Heavy `0.78/0.78/1.6` or Light `0.90/0.90/1.18`), re-run Steps 1-2, and commit:
```bash
git commit -m "tune(lancefall): adjust Casual softening scalars (bot-verified)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 5: Report** the before/after Casual numbers, the unchanged regression numbers, and the final scalar values.

---

## Self-Review

**Spec coverage:**
- `enemySpeedScale` (chaff movement) → Task 1 (field) + Task 2 Step 6 (spawn-site). ✓
- `bulletSpeedScale` (all bullet speed, chaff + boss) → Task 1 + Task 2 Steps 3-5 (`spawnBullet` chokepoint + run-start wiring). ✓
- `fireCadenceMul` (count) → Task 1 + Task 2 (wired) + Task 3 (chaff sites) + Task 4 (boss sites). ✓
- "frequency timers only; leave lethal/telegraph/beam" → Task 3 table (no lock/strike/arm) + Task 4 explicit exclusions. ✓
- Mirrorblade = bullet-speed only (no cadence timer) → Task 4 note. ✓
- Determinism / default-1 / no-other-mode-impact → Global Constraints + Task 1 second test + Task 5 Step 2. ✓
- Accepted reflect-orb side effect → Global Constraints. ✓
- Verification (Casual up, non-Casual unchanged, suite green) → Tasks 0 & 5. ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases". Every edit shows exact find/replace; every command shows expected output. Tuning in Task 5 Step 4 is a bounded, verification-gated decision, not a placeholder. ✓

**Type consistency:** `RunConfig.{enemySpeedScale,bulletSpeedScale,fireCadenceMul}?: number` defined in Task 1, consumed in Tasks 2-4 with identical names. `World.{bulletSpeedScale,fireCadenceMul}: number` defined Task 2 Step 3, consumed in Task 2 Step 4 + Tasks 3-4. `enemySpeedScale` is read from `cfg` (NOT `world`) — consistent across Task 1 + Task 2 Step 6. ✓
