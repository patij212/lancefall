# Mobile Touch — Core Gameplay Implementation Plan (Plan A of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LANCEFALL genuinely playable on a phone via touch — twin floating sticks, a tap-vs-hold dash, on-screen PARRY/OVERDRIVE/PAUSE, and optional aim-assist — inside a self-contained mobile layer that leaves desktop byte-for-byte unchanged.

**Architecture:** A single `isMobile()` gate toggles one `html.lf-mobile` class and mounts a self-contained `MobileControls` DOM overlay. The overlay owns all touch and writes a normal `InputState` onto the shared input snapshot after `input.poll()`, so the simulation never knows mobile exists. Aim-assist is a pure function applied to the resolved aim. Strong-assist runs withhold the online score submit (client-side only).

**Tech Stack:** Vite + vanilla TypeScript, Canvas 2D, Vitest. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-06-21-mobile-touch-playability-design.md`

**Scope of Plan A:** detection + isolation, settings fields, the controls overlay (sticks + buttons), the input seam, aim-assist, leaderboard withhold, isolation/regression tests. **Plan B** (follow-up) covers the menu/HUD mobile CSS pass, safe-area insets, rotate hint, haptics, first-run tutorial, and fullscreen + PWA.

## Global Constraints

- **Total desktop isolation (outranks everything).** On desktop, no `html.lf-mobile` class, no overlay DOM, no new listeners, no CSS effect. Every mobile rule in `style.css` is scoped under `html.lf-mobile`. The overlay is only constructed when `isMobile()` is true.
- **Additive save fields only** — new `Settings` fields default safely via `sanitizeSettings`; **no `SAVE_VERSION` bump** (mirrors how `tutorialHints` was added).
- **No Worker / leaderboard schema changes** — strong-assist runs withhold the existing client submit; nothing server-side changes.
- **Landscape-primary** — controls are laid out for landscape (portrait handling is Plan B).
- **The simulation only ever consumes `InputState`** (`src/types.ts:209`). Do not add mobile branches inside `world.step` / `game.step`.
- **Line endings:** `ui.ts`, `style.css`, `game.ts` are CRLF. Use the Edit/Write tools (never tools that rewrite line endings).
- **TypeScript strict** — no `any` leaks; match the existing validate-with-default style in `sanitizeSettings`.
- Run a single test file with `npx vitest run <path>`; the full suite with `npm test`. Typecheck with `npm run build` (or `npx tsc --noEmit`).

---

## File Structure

**New files**
- `src/mobile/detect.ts` — `isMobile()` truth table + `applyMobileClass()`. Pure logic + one DOM apply.
- `src/mobile/detect.test.ts` — detection truth table.
- `src/mobile/assist.ts` — pure aim-assist magnetism.
- `src/mobile/assist.test.ts` — assist math.
- `src/mobile/controls.ts` — `MobileControls` overlay (DOM + touch) and its pure helpers (`resolveStick`, `classifyDash`).
- `src/mobile/controls.test.ts` — stick + dash-gesture helpers.

**Modified files**
- `src/save.ts` — add 5 validated `Settings` fields.
- `src/save.test.ts` (or `sanitizeSettings`'s existing test file) — field validation.
- `src/input.ts` — remove the superseded in-`InputManager` touch handlers.
- `src/game.ts` — class toggle in `applySettings`, the post-`poll()` input seam + assist, the strong-assist submit-gate `&&`, and `usedStrongAssist` run tracking.
- `src/main.ts` — the single mobile mount point.
- `src/panels/settings.ts` — a mobile-only TOUCH group.
- `src/style.css` — one appended `html.lf-mobile`-scoped block.

---

## Task 1: Detection module (`isMobile` + isolation switch)

**Files:**
- Create: `src/mobile/detect.ts`
- Test: `src/mobile/detect.test.ts`

**Interfaces:**
- Produces:
  - `export type InputMode = 'auto' | 'touch' | 'desktop'`
  - `export interface PointerProbe { coarse: boolean; noHover: boolean; touch: boolean }`
  - `export function probePointer(): PointerProbe`
  - `export function isMobile(mode: InputMode, probe?: PointerProbe): boolean`
  - `export function applyMobileClass(active: boolean): void`

- [ ] **Step 1: Write the failing test**

```ts
// src/mobile/detect.test.ts
import { describe, it, expect } from 'vitest';
import { isMobile, applyMobileClass, type PointerProbe } from './detect';

const phone: PointerProbe = { coarse: true, noHover: true, touch: true };
const laptop: PointerProbe = { coarse: false, noHover: false, touch: true }; // touch-laptop
const desktop: PointerProbe = { coarse: false, noHover: false, touch: false };

describe('isMobile', () => {
  it('auto: a phone (coarse + no-hover + touch) is mobile', () => {
    expect(isMobile('auto', phone)).toBe(true);
  });
  it('auto: a touch-laptop (fine pointer / hover) is NOT mobile', () => {
    expect(isMobile('auto', laptop)).toBe(false);
  });
  it('auto: a plain desktop is NOT mobile', () => {
    expect(isMobile('auto', desktop)).toBe(false);
  });
  it('force touch overrides any probe', () => {
    expect(isMobile('touch', desktop)).toBe(true);
  });
  it('force desktop overrides any probe', () => {
    expect(isMobile('desktop', phone)).toBe(false);
  });
});

describe('applyMobileClass', () => {
  it('toggles the html.lf-mobile class', () => {
    applyMobileClass(true);
    expect(document.documentElement.classList.contains('lf-mobile')).toBe(true);
    applyMobileClass(false);
    expect(document.documentElement.classList.contains('lf-mobile')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/mobile/detect.test.ts`
Expected: FAIL — cannot resolve `./detect`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/mobile/detect.ts
// Mobile/touch detection + the single isolation switch. Desktop NEVER enters the mobile
// path: isMobile() is false on any device whose PRIMARY pointer is fine / hover-capable
// (mouse, trackpad, touch-laptop), so no mobile element can ever mount on desktop. A
// touch-laptop player can still opt in via inputMode:'touch'.

export type InputMode = 'auto' | 'touch' | 'desktop';

export interface PointerProbe {
  coarse: boolean;
  noHover: boolean;
  touch: boolean;
}

function mm(q: string): boolean {
  try {
    return window.matchMedia(q).matches;
  } catch {
    return false;
  }
}

/** Read the live device pointer characteristics. Separated from isMobile() so tests can
 *  inject a probe without stubbing matchMedia. */
export function probePointer(): PointerProbe {
  return {
    coarse: mm('(pointer: coarse)'),
    noHover: mm('(hover: none)'),
    touch: typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0,
  };
}

/** Should this device get the touch UI? `auto` derives from the primary pointer; the two
 *  Force modes are explicit overrides for edge cases and tests. */
export function isMobile(mode: InputMode, probe: PointerProbe = probePointer()): boolean {
  if (mode === 'touch') return true;
  if (mode === 'desktop') return false;
  return probe.coarse && probe.noHover && probe.touch;
}

/** Toggle the one class every mobile CSS rule is scoped under — mirrors the existing
 *  reduce-motion toggle in game.ts applySettings. Safe to call any time. */
export function applyMobileClass(active: boolean): void {
  try {
    document.documentElement.classList.toggle('lf-mobile', active);
  } catch {
    /* no DOM (non-browser test env) */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/mobile/detect.test.ts`
Expected: PASS (5 + 1 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/mobile/detect.ts src/mobile/detect.test.ts
git commit -m "feat(lancefall): mobile detection gate + lf-mobile isolation switch"
```

---

## Task 2: Settings fields (input mode, assist, haptics, mirror, scale)

**Files:**
- Modify: `src/save.ts` — `Settings` (after `:254`), `defaultSettings` (`:362`), `sanitizeSettings` (`:434`)
- Test: `src/save.test.ts` (create if absent; otherwise append to the existing settings test)

**Interfaces:**
- Consumes: `InputMode` from `./mobile/detect`.
- Produces: `Settings.inputMode: InputMode`, `Settings.assistMode: 'off'|'subtle'|'strong'`, `Settings.haptics: boolean`, `Settings.mirrorTouch: boolean`, `Settings.touchScale: 's'|'m'|'l'`.

- [ ] **Step 1: Write the failing test**

```ts
// src/save.test.ts  (append if the file exists)
import { describe, it, expect } from 'vitest';
import { defaultSettings, sanitizeSettings } from './save';

describe('settings — touch fields', () => {
  it('defaults are safe', () => {
    const d = defaultSettings();
    expect(d.inputMode).toBe('auto');
    expect(d.assistMode).toBe('subtle');
    expect(d.haptics).toBe(true);
    expect(d.mirrorTouch).toBe(false);
    expect(d.touchScale).toBe('m');
  });
  it('sanitize keeps valid values and rejects junk', () => {
    const s = sanitizeSettings({ inputMode: 'touch', assistMode: 'strong', haptics: false, mirrorTouch: true, touchScale: 'l' });
    expect(s.inputMode).toBe('touch');
    expect(s.assistMode).toBe('strong');
    expect(s.haptics).toBe(false);
    expect(s.mirrorTouch).toBe(true);
    expect(s.touchScale).toBe('l');
    const bad = sanitizeSettings({ inputMode: 'xx', assistMode: 9, touchScale: 'huge' });
    expect(bad.inputMode).toBe('auto');
    expect(bad.assistMode).toBe('subtle');
    expect(bad.touchScale).toBe('m');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/save.test.ts`
Expected: FAIL — `inputMode` etc. are `undefined`.

- [ ] **Step 3: Write minimal implementation**

Add the import at the top of `src/save.ts` (near the other type imports):

```ts
import type { InputMode } from './mobile/detect';
```

Add to the `Settings` interface (after `keymap: KeyBindings;` at `:254`):

```ts
  // ── mobile / touch (only meaningful on a touch device; inert on desktop) ──
  inputMode: InputMode; // 'auto' detection override
  assistMode: 'off' | 'subtle' | 'strong'; // touch aim-assist; 'strong' is off-board
  haptics: boolean; // navigator.vibrate feedback
  mirrorTouch: boolean; // left-handed mirror of the control layout
  touchScale: 's' | 'm' | 'l'; // on-screen control size
```

Add to the `defaultSettings()` return object (after `keymap: defaultKeyBindings(),` at `:382`):

```ts
    inputMode: 'auto',
    assistMode: 'subtle',
    haptics: true,
    mirrorTouch: false,
    touchScale: 'm',
```

Add to the `sanitizeSettings()` return object (after the `keymap: { ... }` block, before the closing `};` at `:459`):

```ts
    inputMode: oneOf(r.inputMode, ['auto', 'touch', 'desktop'] as const, d.inputMode),
    assistMode: oneOf(r.assistMode, ['off', 'subtle', 'strong'] as const, d.assistMode),
    haptics: bool(r.haptics, d.haptics),
    mirrorTouch: bool(r.mirrorTouch, d.mirrorTouch),
    touchScale: oneOf(r.touchScale, ['s', 'm', 'l'] as const, d.touchScale),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/save.test.ts`
Expected: PASS. Also run `npm run build` to confirm the `InputMode` import resolves.

- [ ] **Step 5: Commit**

```bash
git add src/save.ts src/save.test.ts
git commit -m "feat(lancefall): additive touch settings (input mode, assist, haptics, mirror, scale)"
```

---

## Task 3: Aim-assist (pure magnetism)

**Files:**
- Create: `src/mobile/assist.ts`
- Test: `src/mobile/assist.test.ts`

**Interfaces:**
- Produces:
  - `export type AssistMode = 'off' | 'subtle' | 'strong'`
  - `export interface AssistTarget { x: number; y: number; radius: number; active: boolean }`
  - `export interface AssistEnemies { forEachActive(cb: (e: AssistTarget) => void): void }` — structurally satisfied by `Pool<Enemy>`.
  - `export interface AssistResult { x: number; y: number; usedStrong: boolean }`
  - `export function applyAssist(aimX: number, aimY: number, px: number, py: number, enemies: AssistEnemies, mode: AssistMode): AssistResult`

- [ ] **Step 1: Write the failing test**

```ts
// src/mobile/assist.test.ts
import { describe, it, expect } from 'vitest';
import { applyAssist, type AssistEnemies, type AssistTarget } from './assist';

function enemiesOf(list: Array<{ x: number; y: number; radius?: number }>): AssistEnemies {
  const arr: AssistTarget[] = list.map((e) => ({ x: e.x, y: e.y, radius: e.radius ?? 10, active: true }));
  return { forEachActive: (cb) => arr.forEach(cb) };
}
const none: AssistEnemies = { forEachActive: () => {} };

describe('applyAssist', () => {
  it('off is identity', () => {
    const r = applyAssist(100, 0, 0, 0, enemiesOf([{ x: 50, y: 50 }]), 'off');
    expect(r).toEqual({ x: 100, y: 0, usedStrong: false });
  });
  it('no enemies → identity, never flags strong', () => {
    const r = applyAssist(100, 0, 0, 0, none, 'strong');
    expect(r.x).toBeCloseTo(100); expect(r.y).toBeCloseTo(0); expect(r.usedStrong).toBe(false);
  });
  it('subtle nudges aim toward an in-cone enemy but not all the way', () => {
    // aim straight right (+x); enemy slightly below the aim line, well within the cone
    const r = applyAssist(100, 0, 0, 0, enemiesOf([{ x: 100, y: 40 }]), 'subtle');
    expect(r.y).toBeGreaterThan(0);     // pulled toward the enemy
    expect(r.y).toBeLessThan(40);       // but not snapped onto it
    expect(r.usedStrong).toBe(false);
  });
  it('subtle ignores an enemy outside the cone (behind the player)', () => {
    const r = applyAssist(100, 0, 0, 0, enemiesOf([{ x: -100, y: 0 }]), 'subtle');
    expect(r.x).toBeCloseTo(100); expect(r.y).toBeCloseTo(0);
  });
  it('strong snaps hard onto the target and flags the run', () => {
    const r = applyAssist(100, 0, 0, 0, enemiesOf([{ x: 0, y: 100 }]), 'strong');
    expect(r.y).toBeGreaterThan(60);    // strongly rotated toward straight-down target
    expect(r.usedStrong).toBe(true);
  });
  it('preserves aim distance (rotates, not retargets length)', () => {
    const r = applyAssist(100, 0, 0, 0, enemiesOf([{ x: 0, y: 50 }]), 'subtle');
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(100, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/mobile/assist.test.ts`
Expected: FAIL — cannot resolve `./assist`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/mobile/assist.ts
// Pure aim-assist magnetism for touch. Given the player's manual aim point and the live
// enemies, return a (possibly) nudged aim point. PURE & deterministic — no rng, no clock —
// so replays/ghosts that record the resolved aim stay bit-identical.

export type AssistMode = 'off' | 'subtle' | 'strong';

export interface AssistTarget {
  x: number;
  y: number;
  radius: number;
  active: boolean;
}

/** Structurally satisfied by Pool<Enemy> (forEachActive). */
export interface AssistEnemies {
  forEachActive(cb: (e: AssistTarget) => void): void;
}

export interface AssistResult {
  x: number;
  y: number;
  usedStrong: boolean;
}

const DEG = Math.PI / 180;
// coneCos = cos(half-angle): an enemy counts only if its bearing is within the cone of aim.
// Subtle = a tight forward cone, gentle blend. Strong = whole-screen lock, hard blend.
const CFG = {
  subtle: { coneCos: Math.cos(40 * DEG), range: 460, blend: 0.4 },
  strong: { coneCos: -1, range: 1000, blend: 0.9 },
} as const;

function pickTarget(
  px: number,
  py: number,
  ax: number,
  ay: number,
  enemies: AssistEnemies,
  coneCos: number,
  range: number,
): AssistTarget | null {
  let best: AssistTarget | null = null;
  let bestScore = Infinity;
  enemies.forEachActive((e) => {
    if (!e.active) return;
    const dx = e.x - px;
    const dy = e.y - py;
    const d = Math.hypot(dx, dy);
    if (d < 1 || d > range) return;
    const dot = (dx / d) * ax + (dy / d) * ay; // cos(angle between aim dir and enemy bearing)
    if (dot < coneCos) return; // outside the cone
    // lower is better: nearer + bigger + more-aligned wins
    const score = d - e.radius * 6 - dot * 80;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  });
  return best;
}

export function applyAssist(
  aimX: number,
  aimY: number,
  px: number,
  py: number,
  enemies: AssistEnemies,
  mode: AssistMode,
): AssistResult {
  if (mode === 'off') return { x: aimX, y: aimY, usedStrong: false };
  const cfg = CFG[mode];
  const aimAng = Math.atan2(aimY - py, aimX - px);
  const aimDist = Math.max(1, Math.hypot(aimX - px, aimY - py));
  const t = pickTarget(px, py, Math.cos(aimAng), Math.sin(aimAng), enemies, cfg.coneCos, cfg.range);
  if (!t) return { x: aimX, y: aimY, usedStrong: false };
  const tgtAng = Math.atan2(t.y - py, t.x - px);
  let delta = tgtAng - aimAng;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  const ang = aimAng + delta * cfg.blend;
  return {
    x: px + Math.cos(ang) * aimDist,
    y: py + Math.sin(ang) * aimDist,
    usedStrong: mode === 'strong',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/mobile/assist.test.ts`
Expected: PASS (6 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/mobile/assist.ts src/mobile/assist.test.ts
git commit -m "feat(lancefall): pure aim-assist magnetism (subtle/strong)"
```

---

## Task 4: Control resolver helpers (stick vector + dash gesture)

**Files:**
- Create: `src/mobile/controls.ts` (helpers only this task; the overlay class arrives in Task 5)
- Test: `src/mobile/controls.test.ts`

**Interfaces:**
- Produces:
  - `export function resolveStick(startX: number, startY: number, curX: number, curY: number, dead: number, full: number): { x: number; y: number }`
  - `export type DashGesture = 'charging' | 'tap' | 'released'`
  - `export function classifyDash(heldMs: number, movedPx: number, tapMaxMs: number, tapMaxPx: number): DashGesture`

- [ ] **Step 1: Write the failing test**

```ts
// src/mobile/controls.test.ts
import { describe, it, expect } from 'vitest';
import { resolveStick, classifyDash } from './controls';

describe('resolveStick', () => {
  it('is neutral inside the deadzone', () => {
    expect(resolveStick(0, 0, 3, 0, 8, 60)).toEqual({ x: 0, y: 0 });
  });
  it('is a unit-ish vector past full', () => {
    const v = resolveStick(0, 0, 120, 0, 8, 60); // way past full → clamped magnitude 1
    expect(v.x).toBeCloseTo(1); expect(v.y).toBeCloseTo(0);
  });
  it('scales linearly between dead and full', () => {
    const v = resolveStick(0, 0, 30, 0, 8, 60); // 30/60 = 0.5 magnitude
    expect(v.x).toBeCloseTo(0.5, 2);
  });
});

describe('classifyDash', () => {
  it('a short, still touch is a tap', () => {
    expect(classifyDash(80, 4, 160, 12)).toBe('tap');
  });
  it('a long hold that ended is a charged release', () => {
    expect(classifyDash(420, 30, 160, 12)).toBe('released');
  });
  it('a short but far-travelled touch is a release (it aimed), not a tap', () => {
    expect(classifyDash(90, 40, 160, 12)).toBe('released');
  });
});
```

(`classifyDash` here is the *ended-touch* classifier; the live "still held → charging" state is handled in the overlay in Task 5.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/mobile/controls.test.ts`
Expected: FAIL — `resolveStick` / `classifyDash` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/mobile/controls.ts
// Touch control overlay for mobile. PURE helpers live at the top (unit-tested); the
// MobileControls class (DOM + listeners) follows in a later task. The overlay owns ALL
// touch on mobile and writes a normal InputState — the sim never sees mobile.

/** Resolve a floating stick to a -1..1 vector: neutral within `dead` px of origin, clamped
 *  to magnitude 1 at/after `full` px, linear in between. */
export function resolveStick(
  startX: number,
  startY: number,
  curX: number,
  curY: number,
  dead: number,
  full: number,
): { x: number; y: number } {
  const dx = curX - startX;
  const dy = curY - startY;
  const l = Math.hypot(dx, dy);
  if (l <= dead) return { x: 0, y: 0 };
  const m = Math.min(1, l / full);
  return { x: (dx / l) * m, y: (dy / l) * m };
}

export type DashGesture = 'charging' | 'tap' | 'released';

/** Classify an ENDED lance touch: a quick, near-stationary touch is a tap-dash; anything
 *  longer or that travelled (i.e. the player was aiming) is a charged release. */
export function classifyDash(heldMs: number, movedPx: number, tapMaxMs: number, tapMaxPx: number): DashGesture {
  return heldMs <= tapMaxMs && movedPx <= tapMaxPx ? 'tap' : 'released';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/mobile/controls.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mobile/controls.ts src/mobile/controls.test.ts
git commit -m "feat(lancefall): touch control resolver helpers (stick + dash gesture)"
```

---

## Task 5: The `MobileControls` overlay (DOM + touch → InputState)

**Files:**
- Modify: `src/mobile/controls.ts` (append the class)
- Modify: `src/style.css` (append a `html.lf-mobile`-scoped block)

**Interfaces:**
- Consumes: `resolveStick`, `classifyDash` (Task 4); `InputState` from `../types`; `applyAssist`, `AssistMode` from `./assist`; `el` from `../panels/dom`.
- Produces:
  - `export interface MobileOptions { mirror: boolean; scale: 's' | 'm' | 'l'; assist: AssistMode }`
  - `export interface MobileControls { setActive(playing: boolean): void; setOptions(o: MobileOptions): void; applyTo(state: InputState, px: number, py: number, enemies: import('./assist').AssistEnemies): boolean; destroy(): void }` — `applyTo` returns `usedStrong` (true if strong assist influenced aim this frame).
  - `export function mountMobileControls(canvas: HTMLCanvasElement, root: HTMLElement, opts: MobileOptions): MobileControls`

**Design notes (read before coding):**
- The overlay mounts a single `.lf-touch` DOM root in `root` (the `#ui-root`). It holds two visual rings (`pointer-events:none`) and three buttons (`pointer-events:auto`). The rings are positioned at the live touch points.
- Touch is captured on `canvas` (full-screen, behind the DOM buttons). A finger landing on a DOM button is captured by the button — it never reaches the canvas — so buttons and the lance zone never conflict even though both sit on the right.
- Left half = MOVE (floating stick from first touch). Right half = LANCE (floating stick; aim while held = charging; release = dash; quick still tap = tap-dash).
- `setActive(false)` sets the root `display:none` so menu DOM is fully tappable when not playing.
- `applyTo` writes onto the shared `InputState` AFTER `input.poll()`. It ORs the button edges and overrides move/aim/dash only while the relevant touch is active (so a paired bluetooth keyboard/gamepad still works).
- Mirror swaps which screen half is move vs lance and flips the button column to the left edge (CSS class `mirror`).

- [ ] **Step 1: Write the class (no separate unit test — covered by Task 4 helpers + Task 10 integration/Playwright)**

Append to `src/mobile/controls.ts`:

```ts
import type { InputState } from '../types';
import { applyAssist, type AssistEnemies, type AssistMode } from './assist';
import { el } from '../panels/dom';

export interface MobileOptions {
  mirror: boolean;
  scale: 's' | 'm' | 'l';
  assist: AssistMode;
}

export interface MobileControls {
  setActive(playing: boolean): void;
  setOptions(o: MobileOptions): void;
  /** Fold the live touch state onto the shared InputState. Returns usedStrong for this frame. */
  applyTo(state: InputState, px: number, py: number, enemies: AssistEnemies): boolean;
  destroy(): void;
}

const DEAD = 9;
const FULL = 64;
const TAP_MS = 160;
const TAP_PX = 12;
const SCALE_PX = { s: 86, m: 104, l: 124 } as const;

export function mountMobileControls(
  canvas: HTMLCanvasElement,
  root: HTMLElement,
  opts: MobileOptions,
): MobileControls {
  let options = opts;

  // ── DOM overlay ────────────────────────────────────────────────────────────
  const moveRing = el('div', { class: 'lf-stick lf-move' });
  const lanceRing = el('div', { class: 'lf-stick lf-lance' });
  const moveKnob = el('div', { class: 'lf-knob' });
  const lanceKnob = el('div', { class: 'lf-knob' });
  moveRing.append(moveKnob);
  lanceRing.append(lanceKnob);
  const parryBtn = el('button', { class: 'lf-tbtn lf-parry', type: 'button', 'aria-label': 'Parry' }, 'PARRY');
  const overBtn = el('button', { class: 'lf-tbtn lf-over', type: 'button', 'aria-label': 'Overdrive' }, 'OVER');
  const pauseBtn = el('button', { class: 'lf-tbtn lf-pause', type: 'button', 'aria-label': 'Pause' }, 'II');
  const overlay = el('div', { class: 'lf-touch' }, moveRing, lanceRing, parryBtn, overBtn, pauseBtn) as HTMLElement;
  applyOptionClasses();
  overlay.style.display = 'none';
  root.appendChild(overlay);

  // ── live touch state ───────────────────────────────────────────────────────
  let moveId = -1, moveSX = 0, moveSY = 0, moveCX = 0, moveCY = 0;
  let lanceId = -1, lanceSX = 0, lanceSY = 0, lanceCX = 0, lanceCY = 0;
  let lanceDownAt = 0, lanceMoved = 0;
  // one-shot edges (consumed in applyTo)
  let tapEdge = false, releaseEdge = false, lanceHeld = false;
  let parryEdge = false, overEdge = false, pauseEdge = false;
  let active = false;

  const now = () => (typeof performance !== 'undefined' ? performance.now() : 0);

  function rectXY(t: Touch): { x: number; y: number } {
    const r = canvas.getBoundingClientRect();
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  // mirror swaps which half is "move": default move=left, mirror move=right
  function isMoveZone(x: number, w: number): boolean {
    const left = x < w / 2;
    return options.mirror ? !left : left;
  }

  function onStart(e: TouchEvent): void {
    if (!active) return;
    e.preventDefault();
    const w = canvas.getBoundingClientRect().width;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const p = rectXY(t);
      if (isMoveZone(p.x, w)) {
        if (moveId === -1) { moveId = t.identifier; moveSX = moveCX = p.x; moveSY = moveCY = p.y; }
      } else if (lanceId === -1) {
        lanceId = t.identifier; lanceSX = lanceCX = p.x; lanceSY = lanceCY = p.y;
        lanceDownAt = now(); lanceMoved = 0; lanceHeld = true;
      }
    }
    paint();
  }
  function onMove(e: TouchEvent): void {
    if (!active) return;
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const p = rectXY(t);
      if (t.identifier === moveId) { moveCX = p.x; moveCY = p.y; }
      else if (t.identifier === lanceId) {
        lanceMoved = Math.max(lanceMoved, Math.hypot(p.x - lanceSX, p.y - lanceSY));
        lanceCX = p.x; lanceCY = p.y;
      }
    }
    paint();
  }
  function onEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === moveId) moveId = -1;
      else if (t.identifier === lanceId) {
        const g = classifyDash(now() - lanceDownAt, lanceMoved, TAP_MS, TAP_PX);
        if (g === 'tap') tapEdge = true; else releaseEdge = true;
        lanceId = -1; lanceHeld = false;
      }
    }
    paint();
  }

  canvas.addEventListener('touchstart', onStart, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  canvas.addEventListener('touchend', onEnd, { passive: false });
  canvas.addEventListener('touchcancel', onEnd, { passive: false });

  parryBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); parryEdge = true; }, { passive: false });
  overBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); overEdge = true; }, { passive: false });
  pauseBtn.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); pauseEdge = true; }, { passive: false });

  function paint(): void {
    const s = SCALE_PX[options.scale];
    place(moveRing, moveKnob, moveId !== -1, moveSX, moveSY, moveCX, moveCY, s);
    place(lanceRing, lanceKnob, lanceId !== -1, lanceSX, lanceSY, lanceCX, lanceCY, s);
  }
  function place(ring: HTMLElement, knob: HTMLElement, on: boolean, sx: number, sy: number, cx: number, cy: number, size: number): void {
    ring.style.display = on ? 'block' : 'none';
    if (!on) return;
    ring.style.width = ring.style.height = `${size}px`;
    ring.style.left = `${sx - size / 2}px`;
    ring.style.top = `${sy - size / 2}px`;
    const k = resolveStick(sx, sy, cx, cy, DEAD, FULL);
    knob.style.left = `${size / 2 + k.x * (size / 2 - 16) - 16}px`;
    knob.style.top = `${size / 2 + k.y * (size / 2 - 16) - 16}px`;
  }

  function applyOptionClasses(): void {
    overlay.classList.toggle('mirror', options.mirror);
    overlay.dataset.scale = options.scale;
  }

  return {
    setActive(playing: boolean): void {
      active = playing;
      overlay.style.display = playing ? 'block' : 'none';
      if (!playing) { moveId = lanceId = -1; lanceHeld = false; paint(); }
    },
    setOptions(o: MobileOptions): void { options = o; applyOptionClasses(); paint(); },
    applyTo(state: InputState, px: number, py: number, enemies: AssistEnemies): boolean {
      // MOVE override (only while a move touch is down)
      if (moveId !== -1) {
        const m = resolveStick(moveSX, moveSY, moveCX, moveCY, DEAD, FULL);
        state.moveX = m.x; state.moveY = m.y;
      }
      // LANCE aim + dash
      let usedStrong = false;
      if (lanceId !== -1) {
        // aim toward the stick direction at a fixed reach; charging while held
        const k = resolveStick(lanceSX, lanceSY, lanceCX, lanceCY, DEAD, FULL);
        const len = Math.hypot(k.x, k.y);
        const dirX = len > 0.001 ? k.x / len : 1;
        const dirY = len > 0.001 ? k.y / len : 0;
        let ax = px + dirX * 300, ay = py + dirY * 300;
        const a = applyAssist(ax, ay, px, py, enemies, options.assist);
        ax = a.x; ay = a.y; usedStrong = a.usedStrong;
        state.aimX = ax; state.aimY = ay;
        state.dashHeld = true;
      }
      if (tapEdge) { state.dashTapped = true; tapEdge = false; }
      if (releaseEdge) { state.dashReleased = true; releaseEdge = false; }
      // BUTTON edges (OR with whatever poll() set — usually false on mobile)
      if (parryEdge) { state.parryPressed = true; parryEdge = false; }
      if (overEdge) { state.overdrivePressed = true; overEdge = false; }
      if (pauseEdge) { state.pausePressed = true; pauseEdge = false; }
      return usedStrong;
    },
    destroy(): void {
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
      canvas.removeEventListener('touchcancel', onEnd);
      overlay.remove();
    },
  };
}
```

- [ ] **Step 2: Append the scoped CSS to `src/style.css`** (every rule under `html.lf-mobile`)

```css
/* ── MOBILE TOUCH CONTROLS — only ever present when html.lf-mobile is set ── */
html.lf-mobile .lf-touch {
  position: fixed;
  inset: 0;
  z-index: 40;
  pointer-events: none; /* the layer is transparent; only buttons opt back in */
  touch-action: none;
}
html.lf-mobile .lf-stick {
  position: absolute;
  display: none;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.05);
}
html.lf-mobile .lf-move { border-color: rgba(34, 211, 238, 0.55); background: rgba(34, 211, 238, 0.08); }
html.lf-mobile .lf-lance { border-color: rgba(245, 182, 66, 0.6); background: rgba(245, 182, 66, 0.08); }
html.lf-mobile .lf-knob {
  position: absolute;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
}
html.lf-mobile .lf-move .lf-knob { background: rgba(34, 211, 238, 0.9); }
html.lf-mobile .lf-lance .lf-knob { background: rgba(245, 182, 66, 0.92); }
html.lf-mobile .lf-tbtn {
  position: absolute;
  pointer-events: auto;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 2px solid rgba(167, 139, 250, 0.55);
  background: rgba(167, 139, 250, 0.12);
  color: #e8eefc;
  font: 700 11px/1 'Rajdhani', sans-serif;
  letter-spacing: 0.06em;
}
html.lf-mobile .lf-parry { right: 14px; bottom: 46%; }
html.lf-mobile .lf-over { right: 14px; bottom: 64%; border-color: rgba(245, 215, 138, 0.5); background: rgba(245, 215, 138, 0.1); }
html.lf-mobile .lf-pause { right: 16px; top: 14px; width: 44px; height: 44px; border-color: rgba(255, 255, 255, 0.3); background: rgba(255, 255, 255, 0.06); }
html.lf-mobile .lf-touch.mirror .lf-parry,
html.lf-mobile .lf-touch.mirror .lf-over { right: auto; left: 14px; }
html.lf-mobile .lf-touch.mirror .lf-pause { right: auto; left: 16px; }
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: compiles clean (no unused-symbol or type errors). The class is not yet wired in — that's Task 7.

- [ ] **Step 4: Commit**

```bash
git add src/mobile/controls.ts src/style.css
git commit -m "feat(lancefall): MobileControls overlay (floating sticks + verb buttons)"
```

---

## Task 6: Remove the superseded touch handlers from `InputManager`

**Files:**
- Modify: `src/input.ts` — delete the touch virtual-stick fields (`:49-58`), the `touchstart/move/end/cancel` listeners (`:146-151`), `onTouch` / `onTouchEnd` (`:153-190`), and the "touch overrides" block in `poll()` (`:206-221`). Keep `isCoarse`.
- Test: `src/input.test.ts` (existing) must still pass.

**Why:** the new overlay owns ALL touch. Two touch systems would fight. Desktop is unaffected — it never fired these (no touch events). This keeps a single source of touch truth.

- [ ] **Step 1: Run the existing input tests (baseline green)**

Run: `npx vitest run src/input.test.ts`
Expected: PASS (capture the current behavior before editing).

- [ ] **Step 2: Delete the touch members**

Remove from the class body (`src/input.ts:49-57`):

```ts
  // touch virtual sticks
  private moveTouchId = -1;
  private moveTX = 0;
  private moveTY = 0;
  private moveTStartX = 0;
  private moveTStartY = 0;
  private aimTouchId = -1;
  private aimTX = 0;
  private aimTY = 0;
```

Remove the listener registrations (`:146-150`):

```ts
    // touch
    this.canvas.addEventListener('touchstart', (e) => this.onTouch(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this.onTouch(e), { passive: false });
    this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    this.canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
```

Remove the whole `onTouch` and `onTouchEnd` methods (`:153-190`).

Remove the "touch overrides" block inside `poll()` (`:206-221`):

```ts
    // touch overrides
    if (this.moveTouchId !== -1) { /* … */ }
    if (this.aimTouchId !== -1) { /* … */ }
```

In `clearHeld()` remove the two touch resets (`:272-273`):

```ts
    this.moveTouchId = -1;
    this.aimTouchId = -1;
```

Keep `isCoarse` and its assignment in the constructor.

- [ ] **Step 3: Typecheck + run input tests**

Run: `npm run build && npx vitest run src/input.test.ts`
Expected: compiles clean; input tests PASS unchanged (keyboard/mouse/gamepad paths untouched).

- [ ] **Step 4: Commit**

```bash
git add src/input.ts
git commit -m "refactor(lancefall): drop legacy in-InputManager touch (superseded by mobile overlay)"
```

---

## Task 7: Wire the overlay into the game (mount + class + input seam)

**Files:**
- Modify: `src/main.ts` — mount gating (the single entry point).
- Modify: `src/game.ts` — `applySettings` class toggle; the post-`poll()` seam; expose a hook to mount; track `usedStrongAssist` per run; `setActive` on state changes.

**Interfaces:**
- Consumes: `isMobile`, `applyMobileClass` (Task 1); `mountMobileControls`, `MobileControls` (Task 5).
- Produces: `game.mountMobile(root: HTMLElement)` (called from `main.ts` with the `#ui-root` element); `Game.mobile: MobileControls | null`; `Game.runUsedStrongAssist: boolean`.

**Design notes:**
- `uiRoot` is **not** stored on `Game` (the constructor passes it to `new UI(uiRoot, …)`). So `mountMobile` takes the root as a parameter; `main.ts` already holds the `#ui-root` element and passes it. `this.canvas` **is** a field (`game.ts:118`).
- `main.ts` calls `game.mountMobile(uiRoot)` after `game.boot()`, only when `isMobile(settings.inputMode)` — so the overlay never exists on desktop.
- In `applySettings(s)`, after the existing `reduce-motion` toggle (`:405`), set `applyMobileClass(isMobile(s.inputMode))` and push options to `this.mobile?.setOptions(...)`.
- After `this.input.poll(...)` (`:1557`), drive the overlay from a `controlling` gate (playing AND no popup pending) so it never overlaps the perk-draft / run-event / pause modals.
- A touch **PAUSE** already exists as a UI callback (`onPause`, `game.ts:254`). The overlay's PAUSE button writes `state.pausePressed` (consumed exactly like the keyboard pause), so it works independently — but during the Plan B HUD pass, **reconcile** so the player sees only one pause affordance.

- [ ] **Step 1: Add the mount hook + fields in `game.ts`**

Near the top imports of `src/game.ts`:

```ts
import { isMobile, applyMobileClass } from './mobile/detect';
import { mountMobileControls, type MobileControls } from './mobile/controls';
```

Add fields to the `Game` class (near the other private fields):

```ts
  mobile: MobileControls | null = null;
  private runUsedStrongAssist = false;
```

Add the mount method (public, called from `main.ts`):

```ts
  /** Mount the touch overlay. Called from main.ts ONLY when isMobile() — desktop never
   *  constructs it, so no mobile DOM/listener can exist there. `root` is the #ui-root. */
  mountMobile(root: HTMLElement): void {
    if (this.mobile) return;
    this.mobile = mountMobileControls(this.canvas, root, {
      mirror: this.settings.mirrorTouch,
      scale: this.settings.touchScale,
      assist: this.settings.assistMode,
    });
  }
```

- [ ] **Step 2: Class toggle + option sync in `applySettings`**

In `applySettings(s: Settings)` (`game.ts:392`), right after the existing line:

```ts
    document.documentElement.classList.toggle('reduce-motion', s.reduceMotion);
```

add:

```ts
    applyMobileClass(isMobile(s.inputMode));
    this.mobile?.setOptions({ mirror: s.mirrorTouch, scale: s.touchScale, assist: s.assistMode });
```

- [ ] **Step 3: The input seam after `poll()`**

In `frame()` immediately after `this.input.poll(this.world.player.x, this.world.player.y);` (`game.ts:1557`):

```ts
    if (this.mobile) {
      // "controlling" = the player is actually flying the ship this frame: playing AND no
      // modal pending (perk draft / run event). Hidden otherwise so menu/modal DOM is tappable.
      const controlling = this.state === 'playing' && !this.pendingDraft && this.pendingEvent === null;
      this.mobile.setActive(controlling);
      if (controlling) {
        const strong = this.mobile.applyTo(this.input.state, this.world.player.x, this.world.player.y, this.world.enemies);
        if (strong) this.runUsedStrongAssist = true;
      }
    }
```

> Confirm `this.pendingDraft` / `this.pendingEvent` exist (they are read at `game.ts:1571`). If a `paused` value is part of `this.state`, the `=== 'playing'` check already excludes it.

- [ ] **Step 4: Reset the per-run flag on run start**

Find where a run begins (search for where `this.input.clearHeld()` runs at run start, ~`game.ts:855`/`:488`, and where score/run state resets). Add at the start-of-run reset:

```ts
    this.runUsedStrongAssist = false;
```

- [ ] **Step 5: Mount from `main.ts`**

In `src/main.ts`, after `game.boot();`:

```ts
  // Touch UI — mounted ONLY on a touch device. Desktop never enters this branch, so no
  // mobile element, listener, or class can exist there (see mobile/detect.ts).
  if (isMobile(loadSettings().inputMode)) game.mountMobile(uiRoot);
```

(`uiRoot` is the `#ui-root` element already resolved earlier in `main.ts`.)

Add the imports at the top of `main.ts`:

```ts
import { isMobile } from './mobile/detect';
import { loadSettings } from './save';
```

- [ ] **Step 6: Typecheck + full suite + dev smoke**

Run: `npm run build && npm test`
Expected: compiles; suite green (no regressions).
Then `npm run dev` and, in DevTools device-emulation (responsive, landscape, touch), confirm: move stick appears on left-drag, lance tap dashes, hold-aim-release dashes toward aim, PARRY/OVERDRIVE/PAUSE fire. (Manual; Playwright pass is Task 10.)

- [ ] **Step 7: Commit**

```bash
git add src/game.ts src/main.ts
git commit -m "feat(lancefall): mount touch overlay + feed InputState seam (mobile-gated)"
```

---

## Task 8: Strong-assist withholds the online submit

**Files:**
- Modify: `src/game.ts:3420-3421` — the leaderboard submit gate.
- Test: extend an existing game/modes test, or add `src/mobile/withhold.test.ts` testing the pure predicate.

**Interfaces:**
- Produces: `export function boardEligible(modeRanked: boolean, inChallenge: boolean, cipherOffBossRush: boolean, usedStrongAssist: boolean): boolean` (extract the gate to a tiny pure predicate for testability), in `src/mobile/withhold.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/mobile/withhold.test.ts
import { describe, it, expect } from 'vitest';
import { boardEligible } from './withhold';

describe('boardEligible', () => {
  it('a normal ranked run submits', () => {
    expect(boardEligible(true, false, false, false)).toBe(true);
  });
  it('strong-assist withholds even a ranked run', () => {
    expect(boardEligible(true, false, false, true)).toBe(false);
  });
  it('challenge/duel never submits', () => {
    expect(boardEligible(true, true, false, false)).toBe(false);
  });
  it('cipher-off boss rush never submits', () => {
    expect(boardEligible(true, false, true, false)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/mobile/withhold.test.ts`
Expected: FAIL — cannot resolve `./withhold`.

- [ ] **Step 3: Implement the predicate + wire it**

Create `src/mobile/withhold.ts`:

```ts
// The single source of truth for "may this run post to the online board?". Extracted so the
// strong-assist withhold (and the existing challenge / cipher-off rules) are unit-tested.
export function boardEligible(
  modeRanked: boolean,
  inChallenge: boolean,
  cipherOffBossRush: boolean,
  usedStrongAssist: boolean,
): boolean {
  if (inChallenge) return false;
  if (!modeRanked) return false;
  if (cipherOffBossRush) return false;
  if (usedStrongAssist) return false; // strong aim-assist runs are off-board (fairness)
  return true;
}
```

In `src/game.ts`, replace the existing gate (`:3421`):

```ts
    const cipherOffBossRush = this.mode.bossrush && !this.settings.bossRushCiphers;
    if (!this.inChallenge && modeRanked(this.mode) && !cipherOffBossRush) {
```

with:

```ts
    const cipherOffBossRush = this.mode.bossrush && !this.settings.bossRushCiphers;
    if (boardEligible(modeRanked(this.mode), this.inChallenge, cipherOffBossRush, this.runUsedStrongAssist)) {
```

Add the import to `game.ts`:

```ts
import { boardEligible } from './mobile/withhold';
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/mobile/withhold.test.ts && npm run build`
Expected: PASS; compiles.

- [ ] **Step 5: Commit**

```bash
git add src/mobile/withhold.ts src/mobile/withhold.test.ts src/game.ts
git commit -m "feat(lancefall): strong aim-assist runs withhold the online submit (off-board)"
```

---

## Task 9: Mobile-only TOUCH settings group

**Files:**
- Modify: `src/panels/settings.ts` — add a TOUCH section, rendered only when `isMobile(settings.inputMode)`.

**Interfaces:**
- Consumes: `isMobile` from `../mobile/detect`; the existing `toggle()` helper + `el()` + `deps.patch`.

**Design notes:** reuse the existing `toggle()` (for `haptics`, `mirrorTouch`) and a button-group like the density picker (for `assistMode` and `touchScale`). The whole section is wrapped in `if (isMobile(s.inputMode)) { ... }` so desktop never builds it. An `Input mode` button-group (auto/touch/desktop) lets a touch-laptop user opt in and a phone user force desktop.

- [ ] **Step 1: Add the TOUCH section builder**

In `buildSettingsPanel`, after the existing groups are assembled and before the panel root is returned, add:

```ts
  // ── TOUCH (mobile only — never built on desktop) ──
  const touchRows: HTMLElement[] = [];
  if (isMobile(s.inputMode)) {
    const btnGroup = <T extends string>(label: string, opts: readonly T[], cur: T, on: (v: T) => void) => {
      const wrap = el('div', { class: 'setting' }, el('span', {}, label));
      const btns: HTMLElement[] = [];
      opts.forEach((o) => {
        const b = el('button', { class: 'btn btn-ghost btn-sm' + (cur === o ? ' active' : '') }, o.toUpperCase());
        b.addEventListener('click', () => { on(o); btns.forEach((x) => x.classList.remove('active')); b.classList.add('active'); });
        btns.push(b); wrap.append(b);
      });
      return wrap;
    };
    touchRows.push(el('h3', { class: 'set-group' }, 'TOUCH'));
    touchRows.push(btnGroup('Aim assist', ['off', 'subtle', 'strong'] as const, s.assistMode, (v) => deps.patch({ assistMode: v })));
    touchRows.push(toggle('Mirror (left-handed)', s.mirrorTouch, (v) => deps.patch({ mirrorTouch: v })));
    touchRows.push(btnGroup('Control size', ['s', 'm', 'l'] as const, s.touchScale, (v) => deps.patch({ touchScale: v })));
    touchRows.push(toggle('Haptics', s.haptics, (v) => deps.patch({ haptics: v })));
    touchRows.push(btnGroup('Input mode', ['auto', 'touch', 'desktop'] as const, s.inputMode, (v) => deps.patch({ inputMode: v })));
  }
```

Append `...touchRows` into the panel's content container wherever the other sections are appended (match the existing `el('div', { class: 'settings-body' }, ...)` / append pattern in this file).

Add the import at the top of `src/panels/settings.ts`:

```ts
import { isMobile } from '../mobile/detect';
```

- [ ] **Step 2: Typecheck + dev check**

Run: `npm run build`
Expected: compiles. In dev device-emulation, open SETTINGS → the TOUCH group is present; on desktop it is absent.

- [ ] **Step 3: Commit**

```bash
git add src/panels/settings.ts
git commit -m "feat(lancefall): mobile-only TOUCH settings group (assist/mirror/size/haptics/input mode)"
```

---

## Task 10: Desktop-isolation regression test (the §2 guard)

**Files:**
- Create: `src/mobile/isolation.test.ts`

**Interfaces:**
- Consumes: `applyMobileClass`, `isMobile` (Task 1).

**Why:** lock in the non-negotiable: on desktop there is no `lf-mobile` class and the mobile bundle is inert. This test fails loudly if a future change makes the class appear under a desktop probe.

- [ ] **Step 1: Write the test**

```ts
// src/mobile/isolation.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { isMobile, applyMobileClass, type PointerProbe } from './detect';

const desktop: PointerProbe = { coarse: false, noHover: false, touch: false };
const phone: PointerProbe = { coarse: true, noHover: true, touch: true };

describe('desktop isolation', () => {
  beforeEach(() => applyMobileClass(false));

  it('a desktop probe never resolves to mobile', () => {
    expect(isMobile('auto', desktop)).toBe(false);
  });

  it('applying the class for a desktop result leaves the DOM clean', () => {
    applyMobileClass(isMobile('auto', desktop));
    expect(document.documentElement.classList.contains('lf-mobile')).toBe(false);
  });

  it('a phone probe does set the class (positive control)', () => {
    applyMobileClass(isMobile('auto', phone));
    expect(document.documentElement.classList.contains('lf-mobile')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/mobile/isolation.test.ts`
Expected: PASS.

- [ ] **Step 3: Full suite + typecheck + prod-boot sanity**

Run: `npm test && npm run build`
Expected: full suite green; build clean.

Then verify the **minified** prod build boots (the deploy gotcha from past sessions):

```bash
npm run build && npx vite preview --port 4400
```

Open the preview, confirm the title loads on desktop with **no** touch overlay and no `lf-mobile` class (DevTools: `document.documentElement.className`).

- [ ] **Step 4: Manual mobile pass (Playwright device emulation)**

Use the Playwright MCP (iPhone + Pixel landscape viewport, `hasTouch`) against `vite preview`:
- Boot → reach a run (tap PLAY/DESCEND).
- Left-drag → move ring appears, ship moves.
- Right quick-tap → tap-dash; right hold-aim-release → charged dash toward aim.
- Tap PARRY / OVERDRIVE / PAUSE → each fires.
- Game-over → restart works.
- With assist = strong, finish a ranked run → confirm no `/score` POST in the network panel; with subtle → confirm it posts.

- [ ] **Step 5: Commit**

```bash
git add src/mobile/isolation.test.ts
git commit -m "test(lancefall): desktop-isolation regression guard for the mobile layer"
```

---

## Self-Review — spec coverage (Plan A)

- Detection + Force overrides → **Task 1, 2, 9**.
- `html.lf-mobile` isolation + desktop-clean guarantee → **Task 1, 7, 10**.
- Move stick + lance tap/hold (fusion fix) → **Task 4, 5**.
- PARRY / OVERDRIVE / PAUSE buttons + mirror + scale → **Task 5, 9**.
- Input seam, sim untouched → **Task 7** (writes onto `InputState`; no `step` change).
- Aim-assist subtle/strong + determinism → **Task 3, 5**.
- Strong-assist off-board, no backend change → **Task 8**.
- Settings (inputMode/assistMode/haptics/mirrorTouch/touchScale), additive, no version bump → **Task 2, 9**.
- Legacy touch removed (single source of truth) → **Task 6**.
- Tests incl. desktop regression + manual device pass → **Task 1–4, 8, 10**.

**Deferred to Plan B:** menu/cockpit/HUD mobile CSS pass, `env(safe-area-inset-*)`, portrait rotate-hint, haptics firing (the `haptics.ts` calls on dash/hit/parry — the *setting* lands here in A, the *effect* in B), first-run touch tutorial, fullscreen + PWA + orientation lock.

## Notes / risks

- **Mount root:** `this.canvas` is a `Game` field (`:118`), but `uiRoot` is **not** stored — it is passed to `new UI(...)`. So `mountMobile(root)` takes it as a parameter and `main.ts` passes the `#ui-root` element it already holds.
- **`world.enemies` is `Pool<Enemy>`** — `applyTo` passes it straight to `applyAssist` (structural `forEachActive`). No allocation in the hot path.
- **`performance.now()`** is used for tap timing — fine at runtime; the pure `classifyDash`/`resolveStick` helpers (the tested logic) take plain numbers, so determinism of the *sim* is unaffected (assist writes a resolved aim; tap timing only gates an edge, exactly like the old `dashTapEdge`).
- **CRLF** — `game.ts` / `style.css` / `input.ts` are CRLF; edit with Edit/Write only.
