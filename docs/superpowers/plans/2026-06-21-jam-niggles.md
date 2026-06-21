# Pre-Jam Niggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six pre-submission issues in LANCEFALL — tutorial auto-skip, Solstice first-boss timing, Boss Rush ciphers, a bigger/central HUD option, the sparse wave opening, and edge-camping zoner enemies.

**Architecture:** Six independent, mostly-localized changes. Four are pure/low-risk (tutorial state machine, one mode constant, additive settings + CSS). Two are game-feel/balance changes (wave pacing constants, enemy steering) that are rng-free and therefore Daily-safe. No save-version bump is needed anywhere (the two new fields live on the separately-persisted, field-sanitized `Settings` blob).

**Tech Stack:** Vite + vanilla TypeScript, Canvas2D, Web Audio, Vitest. Tests are colocated `*.test.ts`. Single file: `npx vitest run src/<name>.test.ts`. Whole suite: `npx vitest run`. Production build: `npm run build`. Dev: `npm run dev`. Minified preview (catches rolldown-only boot bugs): `npm run build && npx vite preview`.

## Global Constraints

- **Determinism is sacred.** The seeded Daily (`seedKind:'date'`) and Weekly (`'week'`) must stay bit-identical for every player on the same seed. NO fix may add a `world.rng` draw on any player-action-timed path. Every change in this plan is rng-free (positions / velocities / timers / settings only) — verify each touched branch draws no `world.rng`.
- **Stored ghosts are recorded position traces, not seed re-sims** (`src/ghost.ts:1-7`). Enemy-behavior and spawn-timing changes (Tasks 5, 6) therefore do NOT desync saved ghosts or duels — no replay-compat version bump is required.
- **No SAVE_VERSION bump.** The two new fields (`bossRushCiphers`, `hudLayout`) live on `Settings`, which is persisted under its own key and coerced field-by-field in `sanitizeSettings` — an old blob missing a field just gets the default. Do NOT touch `SAVE_VERSION` or `migrateSave`.
- **Hot shared files.** `ui.ts`, `style.css`, and `game.ts` may be concurrently edited by other agents. `git status` before editing; if the tree is dirty with another agent's work, stage only your own hunks (content-filtered `git apply --cached` from the repo root). `ui.ts` is CRLF — use the Edit tool, never `gawk`.
- **UI has zero unit coverage.** `ui.ts`, `src/panels/*`, and `style.css` are not unit-tested. Verify UI/CSS changes with `npm run build` + `tsc --noEmit` + a minified `vite preview` and the DEV `__lf` hook / Playwright — not unit tests.
- **Run the full suite green before every commit** (`npx vitest run`, ~1400+ tests). One commit per task; conventional commit messages prefixed `lancefall`.

---

### Task 1: Tutorial advances only on action (remove the sandbox time auto-advance)

The first-run DASH SANDBOX advances each teaching beat on a per-step time `cap` and a 90s `SANDBOX_MAX_TIME` backstop, even when the player does nothing. Every beat already has a real action-based completion trigger, so we delete the time machinery entirely and let the explicit SKIP button (`ui.ts` → `onSkipSandbox`/`finishSandbox`; also ESC/P) remain the only non-action escape.

**Files:**
- Modify: `src/sandbox.ts` (`SandboxStepDef`, `SANDBOX_STEPS`, `SANDBOX_MAX_TIME`, `SandboxState`, `newSandbox`, `triggerMet`, `stepSandbox`, `sandboxComplete`, doc comments)
- Test: `src/sandbox.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: unchanged public API — `newSandbox()`, `stepSandbox(s, dt, ev)`, `sandboxComplete(s)`, `currentStep(s)`, `sandboxProgress(s)`. `game.ts` calls these unchanged; it reads none of the removed symbols (`SANDBOX_MAX_TIME`/`totalTime`/`cap`) — verified by grep, only `src/sandbox.ts` and its test reference them.

- [ ] **Step 1: Rewrite the two "no-fail safety" tests to assert the NEW guarantee**

In `src/sandbox.test.ts`, replace the whole `describe('deep sandbox — no-fail safety', …)` block (the two `it(...)` cases that currently assert cap-based auto-advance) with:

```ts
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
```

- [ ] **Step 2: Run the rewritten tests — confirm they FAIL against current code**

Run: `npx vitest run src/sandbox.test.ts`
Expected: the first new test FAILS (current code auto-advances on the cap, so `currentStep(s).step` becomes `'done'`/complete instead of staying `'charge'`).

- [ ] **Step 3: Make `done` advance on `tick`**

In `src/sandbox.ts` `triggerMet`, change the `tick` case from returning `false` to `true`:

```ts
    case 'tick':
      return true; // the 'done' close-out has no action to perform — advance on the next frame
```

- [ ] **Step 4: Delete the time-based auto-advance from `stepSandbox` and `sandboxComplete`**

In `src/sandbox.ts` `stepSandbox`, remove the `totalTime` accumulation, the cap term, and the time-ceiling completion:

```ts
export function stepSandbox(s: SandboxState, dt: number, ev: SandboxEvents): SandboxState {
  if (s.done) return s;
  const next: SandboxState = { ...s };
  next.stepTime += dt;
  if (ev.skewer) next.skewers += 1;

  const def = currentStep(next);
  if (triggerMet(def, ev)) {
    next.stepIndex += 1;
    next.stepTime = 0;
  }

  // Complete only by walking past the final step (action-gated) — no time ceiling.
  if (next.stepIndex >= SANDBOX_STEPS.length) next.done = true;
  return next;
}
```

In `sandboxComplete`, drop the `totalTime` term:

```ts
export function sandboxComplete(s: SandboxState): boolean {
  return s.done || s.stepIndex >= SANDBOX_STEPS.length;
}
```

- [ ] **Step 5: Remove the now-dead `cap` / `SANDBOX_MAX_TIME` / `totalTime` machinery**

In `src/sandbox.ts`:
- In `interface SandboxStepDef`, delete the `cap: number;` field and its doc comment.
- In `SANDBOX_STEPS`, delete the `cap: <number>,` line from each of the 10 step entries (charge, release, reach, heavy, combo, graze, parry, rhythm, bossparry, done).
- Delete the `export const SANDBOX_MAX_TIME = 90;` declaration and its doc comment.
- In `interface SandboxState`, delete the `totalTime: number;` field and its comment; in `newSandbox()` remove `totalTime: 0,`.
- Update the stale doc comments that promise auto-advance: the `SandboxStep` type comment ("a per-step time cap auto-advances so the screen can never stall"), the `SANDBOX_STEPS` comment block ("Generous per-step caps…"), and the `stepSandbox` JSDoc ("A step advances when its trigger fires OR its per-step cap elapses…") — reword to state advancement is strictly action-gated and SKIP is the only non-action escape.

- [ ] **Step 6: Run the sandbox tests — confirm all PASS**

Run: `npx vitest run src/sandbox.test.ts`
Expected: PASS. (The `walkAllTriggers`/`sandboxProgress` tests still pass: the trailing `NONE` loop now completes `done` on its first iteration via `tick→true`.)

- [ ] **Step 7: Full suite + build**

Run: `npx vitest run` then `npm run build`
Expected: all green; build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/sandbox.ts src/sandbox.test.ts
git commit -m "fix(lancefall): tutorial advances only on action — remove sandbox time auto-advance"
```

---

### Task 2: Solstice first boss arrives at 30s (2-minute showcase)

SOLSTICE PROTOCOL's first boss is gated by its `bossInterval` (`Director.bossTimer` is seeded from it and is the only first-boss gate). It is currently `38`; lower to `30` so a judge meets the cipher boss early. The density swell and per-boss music are keyed off *remaining* time to the boss, so they self-align — no other edit needed.

**Files:**
- Modify: `src/modes.ts` (the `longestday` config, `bossInterval`)
- Test: `src/modes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new — only a data value changes.

- [ ] **Step 1: Add a regression test pinning the showcase timing**

In `src/modes.test.ts`, ensure `modeById` is imported from `'./modes'` (add it to the existing import if absent), then add:

```ts
it('SOLSTICE first boss lands early for the 2-minute showcase', () => {
  expect(modeById('longestday').bossInterval).toBe(30);
});
```

- [ ] **Step 2: Run it — confirm it FAILS**

Run: `npx vitest run src/modes.test.ts`
Expected: FAIL — `bossInterval` is currently `38`.

- [ ] **Step 3: Lower the constant**

In `src/modes.ts`, in the `longestday` (SOLSTICE PROTOCOL) config, change `bossInterval: 38` to `bossInterval: 30`. Leave every other field unchanged.

- [ ] **Step 4: Run it — confirm it PASSES**

Run: `npx vitest run src/modes.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite + build**

Run: `npx vitest run` then `npm run build`
Expected: all green. (No existing test hardcodes SOLSTICE's `bossInterval`; the director first-boss test uses `TUNE.director.bossInterval`, a different value.)

- [ ] **Step 6: Commit**

```bash
git add src/modes.ts src/modes.test.ts
git commit -m "feat(lancefall): SOLSTICE first boss at 30s for the jam showcase window"
```

---

### Task 3: Boss Rush arms ciphers by default (with an off-board disable toggle)

Ring-ciphers (Warden/Weaver/Beacon armored-until-decoded) currently arm only in SOLSTICE (`mode.cipherLock`). Add a `bossRushCiphers` setting (default `true`) that arms them in BOSS RUSH too, with a GAMEPLAY toggle. Because Boss Rush is ranked by cleartime and ciphers slow kills, a cipher-OFF Boss Rush run is taken OFF the leaderboard (per the product decision).

**Files:**
- Modify: `src/save.ts` (`interface Settings`, `defaultSettings`, `sanitizeSettings`)
- Modify: `src/modes.ts` (new pure `bossRushCipherArmed` predicate)
- Modify: `src/game.ts` (cipher-arm site ~3742; ranked-submit gate ~3378)
- Modify: `src/panels/settings.ts` (GAMEPLAY-section toggle)
- Test: `src/settings.test.ts`, `src/modes.test.ts`

**Interfaces:**
- Consumes: `Settings.bossRushCiphers: boolean` (added here).
- Produces: `bossRushCipherArmed(cfg: RunConfig, bossRushCiphers: boolean): boolean` (exported from `src/modes.ts`) — `true` when a boss should spawn ring-cipher-armed: `cfg.cipherLock === true` OR (`cfg.bossrush === true` AND `bossRushCiphers`).

- [ ] **Step 1: Add the settings tests (default + sanitize)**

In `src/settings.test.ts`, inside `describe('sanitizeSettings', …)`, add:

```ts
it('defaults Boss Rush ciphers ON, and tolerates a missing/garbage flag', () => {
  expect(defaultSettings().bossRushCiphers).toBe(true);
  expect(sanitizeSettings({}).bossRushCiphers).toBe(true); // missing → default true
  expect(sanitizeSettings({ bossRushCiphers: 'yes' }).bossRushCiphers).toBe(true); // wrong type → default
  expect(sanitizeSettings({ bossRushCiphers: false }).bossRushCiphers).toBe(false); // explicit false round-trips
});
```

- [ ] **Step 2: Add the predicate test**

In `src/modes.test.ts`, ensure `bossRushCipherArmed` and `modeById` are imported from `'./modes'`, then add:

```ts
describe('bossRushCipherArmed', () => {
  it('SOLSTICE always armed (cipherLock), regardless of the Boss Rush setting', () => {
    expect(bossRushCipherArmed(modeById('longestday'), true)).toBe(true);
    expect(bossRushCipherArmed(modeById('longestday'), false)).toBe(true);
  });
  it('BOSS RUSH follows the setting', () => {
    expect(bossRushCipherArmed(modeById('bossrush'), true)).toBe(true);
    expect(bossRushCipherArmed(modeById('bossrush'), false)).toBe(false);
  });
  it('other modes never arm ring ciphers', () => {
    expect(bossRushCipherArmed(modeById('endless'), true)).toBe(false);
  });
});
```

- [ ] **Step 3: Run both — confirm they FAIL / do not compile**

Run: `npx vitest run src/settings.test.ts src/modes.test.ts`
Expected: FAIL (the field and the function do not exist yet).

- [ ] **Step 4: Add the `Settings` field**

In `src/save.ts` `interface Settings`, add after `hudScale`:

```ts
  bossRushCiphers: boolean; // arm Warden/Weaver/Beacon ring-ciphers in BOSS RUSH (off-board when disabled)
```

In `defaultSettings()`, add (next to `hudScale: 1,`):

```ts
    bossRushCiphers: true,
```

In `sanitizeSettings`'s returned object, add (next to the `hudScale` line):

```ts
    bossRushCiphers: bool(r.bossRushCiphers, d.bossRushCiphers),
```

- [ ] **Step 5: Add the pure predicate to `src/modes.ts`**

Add near `modeRanked` (after the `modeSeeded` export):

```ts
/** Should a spawning boss be wrapped in a ring-cipher (armored-until-decoded)? True for
 *  SOLSTICE (always, via cipherLock) and for BOSS RUSH when the player's bossRushCiphers
 *  setting is on. Pure — the caller still AND-gates on bossUsesRingCipher(kind). */
export function bossRushCipherArmed(cfg: RunConfig, bossRushCiphers: boolean): boolean {
  return cfg.cipherLock === true || (cfg.bossrush === true && bossRushCiphers);
}
```

- [ ] **Step 6: Wire the cipher-arm site in `src/game.ts`**

Add `bossRushCipherArmed` to the existing `'./modes'` import. Then change the arm line (currently `if (boss && this.mode.cipherLock && bossUsesRingCipher(boss.kind)) spawnCipherRing(w, boss, CIPHER.ringCount);`) to:

```ts
    if (boss && bossRushCipherArmed(this.mode, this.settings.bossRushCiphers) && bossUsesRingCipher(boss.kind)) {
      spawnCipherRing(w, boss, CIPHER.ringCount);
    }
```

- [ ] **Step 7: Take cipher-OFF Boss Rush off the leaderboard**

In `src/game.ts`, at the submit gate (currently `if (!this.inChallenge && modeRanked(this.mode)) {`), add the off-board guard:

```ts
    // Boss Rush is ranked by cleartime; a cipher-OFF run is faster, so it stays OFF the board
    // (only the default cipher-armed experience is comparable). Pure read of mode + setting.
    const cipherOffBossRush = this.mode.bossrush && !this.settings.bossRushCiphers;
    if (!this.inChallenge && modeRanked(this.mode) && !cipherOffBossRush) {
```

- [ ] **Step 8: Add the GAMEPLAY toggle**

In `src/panels/settings.ts`, in the `gameplay` section array, add a toggle (after the `Tutorial hints` toggle):

```ts
      toggle('Boss Rush ciphers', s.bossRushCiphers, (v) => deps.patch({ bossRushCiphers: v })),
```

- [ ] **Step 9: Run the unit tests + typecheck**

Run: `npx vitest run src/settings.test.ts src/modes.test.ts` then `npx tsc --noEmit`
Expected: PASS / no type errors.

- [ ] **Step 10: Full suite + build, then verify behavior**

Run: `npx vitest run` then `npm run build`. Expected: all green.
Manual verify (no unit coverage for the Game wiring): `npx vite preview`, start a BOSS RUSH run with the toggle ON → the first Warden spawns wrapped in cipher cores; toggle OFF → no ring; confirm the GAMEPLAY tab shows the new toggle.

- [ ] **Step 11: Commit**

```bash
git add src/save.ts src/modes.ts src/game.ts src/panels/settings.ts src/settings.test.ts src/modes.test.ts
git commit -m "feat(lancefall): Boss Rush arms ciphers by default; cipher-off runs go off-board"
```

---

### Task 4: Bigger HUD + a central layout option

The DOM HUD is pinned to the four screen corners and never auto-scales. Raise the `hudScale` slider ceiling (and nudge the default up) for "bigger", and add a `hudLayout: 'edges' | 'central'` setting that pulls the corners into an inward cluster via a root class — mirroring the existing a11y-class pattern. Pure presentation; no sim impact.

**Files:**
- Modify: `src/save.ts` (`interface Settings`, `defaultSettings`, `sanitizeSettings`)
- Modify: `src/ui.ts` (`applyHudLayout` + wire constructor + `patch`)
- Modify: `src/panels/settings.ts` (raise the HUD-scale slider max; add an EDGES/CENTRAL button group)
- Modify: `src/style.css` (a `.hud-central` override block)
- Test: `src/settings.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `Settings.hudLayout: 'edges' | 'central'` and a raised `hudScale` range (`0.8..1.8`, default `1.1`). The render side reads them only through `ui.ts` (a `--hud-scale` custom property + a `hud-central` class on the UI root).

- [ ] **Step 1: Update the settings tests for the new ceiling + enum**

In `src/settings.test.ts`:
- In `'clamps out-of-range numbers'`, change the hudScale expectation from `1.4` to `1.8`:
```ts
    expect(s.hudScale).toBe(1.8);
```
- In `'rejects invalid enum members'`, add a `hudLayout` case to the input and assertions:
```ts
    const s = sanitizeSettings({ particleDensity: 'ultra', dashStyle: 'rocket', soundtrack: 'metal', hudLayout: 'floating' });
    expect(s.particleDensity).toBe(d.particleDensity);
    expect(s.dashStyle).toBe(d.dashStyle);
    expect(s.soundtrack).toBe(d.soundtrack);
    expect(s.hudLayout).toBe(d.hudLayout); // 'floating' → default 'edges'
```
- Add a default assertion:
```ts
  it('defaults the HUD layout to edges', () => {
    expect(defaultSettings().hudLayout).toBe('edges');
  });
```

- [ ] **Step 2: Run — confirm FAIL**

Run: `npx vitest run src/settings.test.ts`
Expected: FAIL (ceiling still clamps to 1.4; `hudLayout` field missing).

- [ ] **Step 3: Add the `Settings` fields + raise the scale range**

In `src/save.ts` `interface Settings`, add after `hudScale` (and adjust the comment):

```ts
  hudScale: number; // 0.8..1.8
  hudLayout: 'edges' | 'central'; // HUD anchoring — spread to corners (default) or a compact inward cluster
```

In `defaultSettings()`, change `hudScale: 1,` to `hudScale: 1.1,` (a clearer baseline — the one change that affects every player's default HUD size) and add `hudLayout: 'edges',`.

In `sanitizeSettings`, change the hudScale line ceiling to `1.8` and add the enum:

```ts
    hudScale: num(r.hudScale, 0.8, 1.8, d.hudScale),
    hudLayout: oneOf(r.hudLayout, ['edges', 'central'] as const, d.hudLayout),
```

- [ ] **Step 4: Run the settings tests — confirm PASS**

Run: `npx vitest run src/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply the layout class from `ui.ts`**

In `src/ui.ts`, add a sibling to `applyHudScale`:

```ts
  private applyHudLayout(): void {
    this.root.classList.toggle('hud-central', this.settings.hudLayout === 'central');
  }
```

In the constructor, right after the existing `this.applyHudScale();` call, add:

```ts
    this.applyHudLayout();
```

In `patch`, after the existing `if (p.hudScale !== undefined) this.applyHudScale();`, add:

```ts
    if (p.hudLayout !== undefined) this.applyHudLayout();
```

- [ ] **Step 6: Add the `.hud-central` CSS override**

In `src/style.css`, after the six-corner HUD rules (after the `.shield-pip` block, ~line 2370+), add:

```css
/* ════════ CENTRAL HUD — pull the four corners into a compact inward cluster ════════
   Settings → VISUALS → HUD layout. Offsets scale with --hud-scale; max() self-clamps to the
   edge margin on narrow viewports so content can never push off-screen. Bottom anchors stay put,
   so DASH | DAYBREAK gauge | ARMOR read as one bottom band. Render-only — never touches the sim. */
.hud-central .hud-topleft  { left:  max(calc(22px * var(--hud-scale)), calc(50% - 300px * var(--hud-scale))); }
.hud-central .hud-topright { right: max(calc(22px * var(--hud-scale)), calc(50% - 300px * var(--hud-scale))); }
.hud-central .hud-botleft  { left:  max(calc(22px * var(--hud-scale)), calc(50% - 300px * var(--hud-scale))); }
.hud-central .hud-botright { right: max(calc(22px * var(--hud-scale)), calc(50% - 300px * var(--hud-scale))); }
```

(The `300px` inward offset is a tunable design dial — verify the cluster doesn't overlap the 300px bottom-center DAYBREAK gauge across 1280 / 1920 / 2560 widths and adjust if needed.)

- [ ] **Step 7: Add the HUD-scale ceiling bump + the EDGES/CENTRAL group to the settings panel**

In `src/panels/settings.ts`, in the `visuals` section, change the HUD-scale slider's `max` from `1.4` to `1.8`:

```ts
      slider('HUD scale', 0.8, 1.8, 0.05, s.hudScale, (v) => deps.patch({ hudScale: v })).row,
```

Build the layout button group (place it near the `trackWrap` builder, before the `sections` array):

```ts
  // HUD layout — EDGES (spread to the corners) vs CENTRAL (a compact inward cluster)
  const hudLayoutWrap = el('div', { class: 'setting' }, el('span', {}, 'HUD layout'));
  for (const id of ['edges', 'central'] as const) {
    const b = el('button', { class: 'btn btn-ghost btn-sm' + (s.hudLayout === id ? ' active' : '') }, id.toUpperCase());
    b.addEventListener('click', () => {
      deps.patch({ hudLayout: id });
      hudLayoutWrap.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
    });
    hudLayoutWrap.append(b);
  }
```

Then add `hudLayoutWrap` to the `visuals` section, right after the HUD-scale slider row:

```ts
    { id: 'visuals', name: 'VISUALS', el: sect('visuals',
      shakeS.row,
      slider('HUD scale', 0.8, 1.8, 0.05, s.hudScale, (v) => deps.patch({ hudScale: v })).row,
      hudLayoutWrap,
      chromaS.row, densityWrap) },
```

- [ ] **Step 8: Full suite + build + typecheck**

Run: `npx vitest run` then `npm run build` then `npx tsc --noEmit`
Expected: all green; no type errors.

- [ ] **Step 9: Verify the HUD visually**

`npx vite preview`, start any run. Open Settings → VISUALS: the HUD-scale slider reaches 1.8; the EDGES/CENTRAL buttons appear. Toggle CENTRAL → SCORE and COHERENCE pull toward the top-middle and DASH/ARMOR flank the bottom gauge; toggle EDGES → corners. Resize to ~1280 and ~2560 to confirm no overlap. (No unit coverage for `ui.ts` — this is the verification.)

- [ ] **Step 10: Commit**

```bash
git add src/save.ts src/ui.ts src/panels/settings.ts src/style.css src/settings.test.ts
git commit -m "feat(lancefall): bigger HUD scale + optional central HUD layout"
```

---

### Task 5: A fuller, better-paced wave opening

A run opens with one enemy and a ~2.6s gap, staying at 1-per-spawn for the whole first ~70s wave. Tighten the opening interval, add a small time-decaying opening burst (pure, no rng), and lift early concurrency headroom — so the arena fills sooner and spawns spread better. All changes are deterministic functions of intensity and elapsed time, keeping the Daily reproducible-for-all.

**Files:**
- Modify: `src/tune.ts` (`director` block: `spawnIntervalStart`, `maxConcurrentStart`, new `openingBurstSec`)
- Modify: `src/waves.ts` (`enemiesPerSpawn` signature + the call site)
- Test: `src/waves.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `enemiesPerSpawn(I: number, t?: number): number` — new optional second arg `t` (elapsed seconds, default `Infinity`). With `t < TUNE.director.openingBurstSec` it returns `base + 1`; otherwise `base` (back-compatible: a no-`t` call is unchanged).

- [ ] **Step 1: Add the opening-burst test**

In `src/waves.test.ts`, in `describe('spawn cadence', …)`, add:

```ts
  it('opens with a small burst that decays, then returns to base cadence (no rng)', () => {
    expect(enemiesPerSpawn(0, 0)).toBe(2); // opening: base 1 + burst 1
    expect(enemiesPerSpawn(0, TUNE.director.openingBurstSec)).toBe(1); // burst gone exactly at the cutoff
    expect(enemiesPerSpawn(0)).toBe(1); // no-t call unchanged (back-compat)
  });
```

- [ ] **Step 2: Run — confirm FAIL**

Run: `npx vitest run src/waves.test.ts`
Expected: FAIL (`enemiesPerSpawn` ignores a second arg today; `openingBurstSec` is undefined).

- [ ] **Step 3: Add the new director constant + retune the opening**

In `src/tune.ts`, in the `director` block:
- change `spawnIntervalStart: 2.6,` to `spawnIntervalStart: 1.9,`
- change `maxConcurrentStart: 4,` to `maxConcurrentStart: 6,`
- add a new line (e.g. after `enemiesPerSpawnMax: 3,`):
```ts
    openingBurstSec: 22, // for the first this-many seconds spawns release +1 enemy (a pure, rng-free opening pop so a run doesn't crawl out one-at-a-time)
```

- [ ] **Step 4: Add the burst to `enemiesPerSpawn`**

In `src/waves.ts`, replace `enemiesPerSpawn`:

```ts
export function enemiesPerSpawn(I: number, t = Infinity): number {
  const d = TUNE.director;
  const base = 1 + Math.floor(clamp(I, 0, 1.4) * d.enemiesPerSpawnMax);
  // opening pop: +1 enemy per spawn for the first openingBurstSec, then it decays back to base.
  // Pure fn of elapsed time — no rng — so two players on the same seed spawn identically (Daily safe).
  const burst = t < d.openingBurstSec ? 1 : 0;
  return base + burst;
}
```

- [ ] **Step 5: Pass elapsed time at the call site**

In `src/waves.ts` `updateEndless`, change the spawn-count line (currently `const n = Math.min(room, Math.round(enemiesPerSpawn(I) * sw));`) to:

```ts
          const n = Math.min(room, Math.round(enemiesPerSpawn(I, this.t) * sw));
```

- [ ] **Step 6: Run the wave tests — confirm PASS**

Run: `npx vitest run src/waves.test.ts`
Expected: PASS. The existing assertions stay green: `spawnInterval(0) ≈ spawnIntervalStart` (now 1.9); `enemiesPerSpawn(1) > enemiesPerSpawn(0)` (default `t=Infinity` → 4 > 1); `maxConcurrent(1) > maxConcurrent(0)`; and the D2/D3 determinism test (same seed → identical stream, run twice on the new code) is unchanged.

- [ ] **Step 7: Full suite + build**

Run: `npx vitest run` then `npm run build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/tune.ts src/waves.ts src/waves.test.ts
git commit -m "feat(lancefall): fuller wave opening — tighter cadence + decaying opening burst"
```

---

### Task 6: Stop zoner enemies camping the screen edge

Standoff zoners (LANCER, DRIFTER, HERALD, SEEKER) can rest off-screen and keep firing: edge-pull runs only in their mobile phase, the soft-clamp allows 60px of overshoot, and their retreat target is unbounded so a chased zoner steers into the wall. Three rng-free fixes: run edge-pull in every phase, tighten the soft-clamp, and clamp retreat targets inward.

**Files:**
- Modify: `src/enemies.ts` (the phase guard ~line 109; new `steerRetreat` helper; the four zoner retreat branches — lancer, herald, seeker, drifter)
- Modify: `src/game.ts` (the soft-clamp `m`, ~line 1857)
- Test: `src/zonerVerbs.test.ts`

**Interfaces:**
- Consumes: existing `applyEdgePull`, `STANDOFF_KINDS`, `ZONER` (`edgeMargin`, `edgePull`), and `clamp` (already imported in `enemies.ts`).
- Produces: `steerRetreat(e: Enemy, world: World, dx: number, dy: number, speed: number): void` — exported from `src/enemies.ts`; steers `e` toward `(e.x - dx, e.y - dy)` clamped into the `ZONER.edgeMargin` inset of the arena (so "retreat" means "into the arena", never into a wall). Pure — positions + arena size only, no rng.

- [ ] **Step 1: Add the two distinguishing tests**

In `src/zonerVerbs.test.ts`, add `steerRetreat` to the `'./enemies'` import, then append:

```ts
describe('zoner edge-camp prevention (pure, rng-free)', () => {
  it('steerRetreat falls back INTO the arena, never past the wall', () => {
    const world = { width: 1000, height: 600 } as World;
    const e = { x: 980, y: 300, vx: 0, vy: 0 } as Enemy; // hugging the right wall
    // player is to the LEFT, so a naive retreat target (e.x - dx) lands at 1380 — past the wall
    steerRetreat(e, world, -400, 0, 90);
    expect(e.vx).toBeLessThan(0); // velocity points INWARD (toward the clamped target inside the margin)
  });

  it('edge-pull nudges a telegraphing (phase 1) lancer inward — not just in phase 0', () => {
    const w = freshWorld(); // player parked far left at (200, 360)
    const e = w.spawnEnemy('lancer', w.width - 5, 360, 1, 1, false, false, 0)!; // explicit angle → no rng
    e.phase = 1; e.timer = LANCER.lockTime; e.vx = 0; e.vy = 0; // mid-telegraph at the wall
    const x0 = e.x;
    updateEnemy(e, w, DT);
    expect(e.x).toBeLessThan(x0); // WITHOUT the fix, phase-1 edge-pull is skipped and x stays put
  });
});
```

- [ ] **Step 2: Run — confirm both FAIL**

Run: `npx vitest run src/zonerVerbs.test.ts`
Expected: FAIL (`steerRetreat` is not exported; the phase-1 lancer does not move on current code).

- [ ] **Step 3: FIX A — run edge-pull in every phase**

In `src/enemies.ts` `updateEnemy`, change the guard (currently `if (e.phase === 0 && STANDOFF_KINDS.has(e.kind)) applyEdgePull(e, world);`) to:

```ts
  // keep standoff zoners off the walls in EVERY phase (was phase-0 only, which let a
  // telegraphing/firing zoner rest at the edge for ~1s with nothing pulling it back)
  if (STANDOFF_KINDS.has(e.kind)) applyEdgePull(e, world);
```

- [ ] **Step 4: FIX C — add the `steerRetreat` helper and use it in all four zoners**

In `src/enemies.ts`, add the helper next to `steerToward`:

```ts
/** A retreating zoner should fall back INTO the arena, not into a wall: clamp the retreat
 *  target to the inner edge margin. PURE — positions + arena size only, no rng. Exported for tests. */
export function steerRetreat(e: Enemy, world: World, dx: number, dy: number, speed: number): void {
  const m = ZONER.edgeMargin;
  const tx = clamp(e.x - dx, m, world.width - m);
  const ty = clamp(e.y - dy, m, world.height - m);
  steerToward(e, tx, ty, speed);
}
```

Then replace the retreat branch in each of the four zoners (the `if (dist < <RANGE> * 0.85) steerToward(e, e.x - dx, e.y - dy, sp);` line):
- in `lancer`: `if (dist < LANCER.range * 0.85) steerRetreat(e, world, dx, dy, sp);`
- in `herald`: `if (dist < HERALD.range * 0.85) steerRetreat(e, world, dx, dy, sp);`
- in `seeker`: `if (dist < SEEKER_TUNE.range * 0.85) steerRetreat(e, world, dx, dy, sp);`
- in `drifter`: `if (dist < DRIFTER_TUNE.range * 0.85) steerRetreat(e, world, dx, dy, sp);`

- [ ] **Step 5: FIX B — tighten the soft-clamp**

In `src/game.ts`, in the enemy soft-clamp (currently `const m = 60;`), change to:

```ts
      // soft-clamp so nobody flies off forever (24px: a hair of spawn overshoot, but inside the
      // on-screen player's reach so an enemy can never rest somewhere unhittable)
      const m = 24;
```

- [ ] **Step 6: Run the zoner tests — confirm PASS**

Run: `npx vitest run src/zonerVerbs.test.ts`
Expected: PASS. (The existing `applyEdgePull` and verb/determinism tests stay green — they call `applyEdgePull` directly and assert relative bullet properties + same-seed equality, not absolute positions.)

- [ ] **Step 7: Full suite + build**

Run: `npx vitest run` then `npm run build`
Expected: all green. If any pre-existing zoner test pins an absolute bullet x/y, update it (FIX A shifts firing positions slightly — deterministically).

- [ ] **Step 8: Verify in-game + re-run the bot sweep**

`npx vite preview`: in any time-driven run, chase a LANCER into a corner — it should peel back into the arena instead of parking off-screen. Then re-run the autopilot bot sweep (the `__heatSweep` harness / `tools/bot-core.mjs`) since zoner positions feed threat targeting; confirm Boss Rush / Arena win-rates are not regressed.

- [ ] **Step 9: Commit**

```bash
git add src/enemies.ts src/game.ts src/zonerVerbs.test.ts
git commit -m "fix(lancefall): zoners no longer camp the screen edge (edge-pull all phases + inward retreat + tighter clamp)"
```

---

## Self-Review

**Spec coverage** (the six in-scope issues; "Heat scales shards" was confirmed already-implemented and dropped per the user):
1. Tutorial auto-skip → Task 1. ✓
2. Solstice boss too late → Task 2. ✓
3. Boss Rush ciphers default + disable toggle → Task 3. ✓
4. Bigger/central HUD → Task 4. ✓
5. Sparse/slow wave opening → Task 5. ✓
6. Edge-camping zoners (lancer) → Task 6. ✓

**Type consistency:** `bossRushCipherArmed(cfg, bossRushCiphers)` is defined in Task 3 Step 5 and consumed in Step 6 with matching signature. `enemiesPerSpawn(I, t?)` is defined in Task 5 Step 4 and called with `(I, this.t)` in Step 5. `steerRetreat(e, world, dx, dy, speed)` is defined in Task 6 Step 4 and used identically in the four branches + tested in Step 1. `Settings.bossRushCiphers` and `Settings.hudLayout` are added to the interface, `defaultSettings`, and `sanitizeSettings` together.

**Determinism:** Tasks 5 and 6 shift the seeded stream's timing/positions but add no `world.rng` draw and use no wall-clock — the Daily stays reproducible-for-all, and ghosts (recorded traces) don't desync. Tasks 1–4 don't touch the sim at all.

**Sequencing:** Implement in order 1→6 — Tasks 1–4 are pure/low-risk and isolated; Tasks 5–6 are the game-feel batch (verify together with the bot sweep + a manual playtest).
