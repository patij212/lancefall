# THE LAST LANCE — Mobile / Touch Playability

**Date:** 2026-06-21
**Status:** Design approved, ready for planning
**Goal:** Make LANCEFALL genuinely playable on any phone (Android / iOS) via touch, **without altering the desktop experience in any way**.

---

## 1. Problem

Mobile touch gameplay "doesn't work almost at all" today. Root causes (confirmed in `src/input.ts`):

1. **Aim and dash are fused.** The right half of the canvas is an absolute "aim" touch that *also* sets `dashHeld = true`; releasing it fires a dash. You cannot reposition aim without committing a dash, so the core loop fights the player.
2. **Half the verbs are unreachable.** PARRY, OVERDRIVE and pause have **no touch gesture at all** — they only exist on keyboard / mouse / gamepad.
3. **No discoverability.** The move stick is invisible (no rendered ring), so a player doesn't know where or how to control anything.
4. **Menus are desktop-shaped.** The title/cockpit composition is scale-to-fit *for desktop* (`ui.ts`); on a small landscape phone it is cramped, and notch/safe-area insets are ignored.

## 2. Non-negotiable constraint — total desktop isolation

> Desktop play must be **completely unaffected**. No mobile-related element, listener, DOM node, or CSS effect may ever exist on desktop.

Everything below is gated behind a single detection result. Desktop never enters the mobile code path, never receives the `lf-mobile` class, and therefore *cannot* render a mobile element. This constraint outranks every other design goal; when in doubt, isolate harder.

## 3. Architecture

### 3.1 Approach (chosen)

A **self-contained mobile layer**, mounted only on touch devices, that feeds the existing per-frame input snapshot and is gated by a single class on `<html>`.

Alternatives rejected:
- **Extend `InputManager` + `@media (pointer: coarse)` CSS** — media queries leak onto touch-laptops (fine pointer + touchscreen), which would render mobile UI on a desktop-class device. Violates §2.
- **Canvas-drawn controls** — keeps the DOM clean but reimplements buttons/labels/a11y on the canvas and fights the DOM-based menu pass. More code, worse accessibility.

### 3.2 New files (all mobile-only)

| File | Responsibility |
|------|----------------|
| `src/mobile/detect.ts` | `isMobile(settings)` truth table + `applyMobileClass()`. Pure + a thin DOM apply. |
| `src/mobile/controls.ts` | `MobileControls` — builds the DOM overlay (two floating sticks + 3 buttons + rotate hint), owns touch listeners, resolves them into an `InputState`-shaped patch each frame. Self-contained; constructed only when `isMobile()` is true. |
| `src/mobile/assist.ts` | Pure aim-assist magnetism: `applyAssist(aim, threats, mode) → aim`. Reuses the bot's threat-target selection. |
| `src/mobile/haptics.ts` | `vibrate(pattern)` wrapper around `navigator.vibrate`, gated on the setting + capability. No-op when unsupported. |
| `src/mobile/pwa.ts` | Manifest link injection, service-worker registration, `requestFullscreen` on first interaction, `screen.orientation.lock('landscape')` (best-effort). |
| `public/manifest.webmanifest` | PWA manifest (name, icons, `display: fullscreen`, `orientation: landscape`). |
| `public/sw.js` | Minimal cache-first service worker for the built bundle (offline launch). |
| `src/mobile/*.test.ts` | Unit tests (see §10). |

### 3.3 Modified files (minimal, gated)

| File | Change |
|------|--------|
| `index.html` | `<link rel="manifest">` + apple-touch meta tags. (Inert on desktop.) |
| `src/main.ts` | After boot, `if (isMobile(settings)) mountMobile(game)`. The single mount point. |
| `src/game.ts` | (a) call `applyMobileClass()` in/near `applySettings` (mirrors the `reduce-motion` toggle at game.ts:405); (b) merge the `MobileControls` input patch into the frame snapshot **after** `input.poll()`; (c) one `&& !run.usedStrongAssist` on the leaderboard submit gate (game.ts:3421). |
| `src/save.ts` | Add validated settings fields (§9). Additive — no `SAVE_VERSION` bump required (new optional fields default safely, exactly like `tutorialHints`). |
| `src/panels/settings.ts` | A **mobile-only** "TOUCH" settings group (hidden unless `isMobile()`). |
| `src/style.css` | One appended block, every rule scoped under `.lf-mobile` (or `html.lf-mobile`). No existing rule edited. |

### 3.4 Data flow (the seam that keeps the sim untouched)

```
per frame:
  base = input.poll(playerX, playerY)        // existing keyboard/mouse/gamepad/legacy-touch
  if (mobileActive)
    patch = mobileControls.sample(playerX, playerY)   // move, aim, dashHeld/Tapped/Released, parry, overdrive, pause
    aim   = assist.applyAssist(patch.aim, world.threats, assistMode)
    base  = merge(base, patch with aim)       // mobile overrides when a touch is active
  world.step(base, dt)                        // UNCHANGED — sees a normal InputState
```

The simulation only ever consumes an `InputState` (types.ts:209). It does not know mobile exists. This is what guarantees determinism (ghosts/duels/replays) is unaffected and what keeps the change surgical.

> The legacy in-canvas touch handlers in `input.ts` are **removed/neutralised** when the new overlay is active (the overlay owns all touch), so the two never fight. On desktop the legacy handlers are irrelevant (no touch events fire).

## 4. Detection — `isMobile(settings)`

```
inputMode = settings.inputMode  // 'auto' | 'touch' | 'desktop'
if inputMode === 'touch'   → true
if inputMode === 'desktop' → false
// auto:
coarse   = matchMedia('(pointer: coarse)').matches
noHover  = matchMedia('(hover: none)').matches
touch    = navigator.maxTouchPoints > 0
return coarse && noHover && touch
```

- A phone/tablet: coarse + no-hover + touch → **mobile**.
- A touch-laptop / touch monitor: primary pointer is `fine` / `hover: hover` → **desktop** (satisfies §2). The player may opt in via `inputMode: 'touch'`.
- The `Force desktop` / `Force touch` overrides exist for edge cases and testing.
- Detection is evaluated once at boot and on the Input-Mode setting change. `applyMobileClass()` toggles `html.lf-mobile` accordingly and mounts/unmounts the overlay.

## 5. Control scheme (landscape-primary)

Layout (default, right-handed). Mirror mode swaps left/right.

- **Left thumb — MOVE.** Floating analog stick: first touch in the left zone sets the ring origin; drag sets direction + magnitude (existing relative-stick math, given a visible ring and a ~64–80px radius). Feeds `moveX/moveY`.
- **Right thumb — LANCE (resolves the fusion).** Floating aim stick with a **tap-vs-hold split**:
  - **Tap** (down→up under a short time/*distance* threshold) → `dashTapped = true` once, aim = last stick direction. Instant min dash.
  - **Hold** (down, drag to aim, keep holding) → `dashHeld = true`, `aimX/aimY` track the stick direction continuously (charging).
  - **Release** after a hold → `dashReleased = true`. Fires the charged dash toward aim.
  - This maps 1:1 onto the existing dash semantics (`dashHeld` / `dashReleased` / `dashTapped`). The fix vs. today: aim is a **relative stick resolved on tap/release**, not an absolute touch that charges on contact.
- **PARRY button** (right edge, thumb arc) → `parryPressed`. Aims via the current/last lance aim, or the assist target if the lance thumb is lifted.
- **OVERDRIVE button** (right edge) → `overdrivePressed`. Rendered dim/dashed until charged.
- **PAUSE** (top corner, away from thumbs) → `pausePressed`.
- **Mirror mode** swaps the entire left/right arrangement.

Touch targets ≥ 56–64px (matches the title's 64px spec). All positions respect `env(safe-area-inset-*)`.

> Ergonomic note (accepted): the right thumb juggles Lance + Parry + Overdrive (left thumb is on Move). This is the standard mobile twin-stick layout; Parry/Overdrive are momentary, so a brief lift off the lance stick is acceptable.

## 6. Aim-assist

- **Off** — pure manual aim.
- **Subtle** (default on touch) — gentle cone magnetism: bias the resolved aim toward the nearest in-cone threat by a small factor; manual input still dominates. **Counts on the leaderboard** (mild enough to be fair; no backend change).
- **Strong** — near-lock onto the biggest threat (very forgiving). The run is flagged `usedStrongAssist = true` the moment Strong assist influences aim, and is **withheld from online submission** (the one `&&` added to game.ts:3421). No Worker/schema change; no separate board.

`applyAssist` is **pure** (aim, threat list, mode → aim) and reuses the bot's existing threat-selection logic. Because it runs inside the per-frame input resolution and writes a resolved `aimX/aimY`, replays/ghosts that record resolved input stay deterministic.

## 7. Menu & HUD mobile pass

- An appended `.lf-mobile`-scoped CSS block reflows the title/cockpit, loadout, perk-draft, game-over, and modal panels for small landscape screens (adds a mobile layout path alongside the desktop scale-to-fit composition in `ui.ts`).
- In-run HUD scales down and pulls inside `env(safe-area-inset-*)`.
- **Rotate hint:** when `html.lf-mobile` and the viewport is portrait, a full-screen "rotate your device" overlay covers the game (CSS-only, driven by an orientation media query scoped under `.lf-mobile`).
- No desktop rule is modified; the desktop composition is byte-for-byte unchanged.

## 8. Haptics, visuals, tutorial

- **Visuals:** the rendered stick rings + button glyphs (DOM in the overlay) make controls discoverable.
- **Haptics:** `navigator.vibrate` micro-pulses on dash-fire / hit-taken / clean-parry. Settings toggle `haptics` (default on); no-op where unsupported.
- **Tutorial:** a one-time first-mobile-run overlay ("◀ move · aim + release to lance · tap to dash · PARRY / OVERDRIVE"), gated on a `taught` flag (e.g. `'touch:intro'`, reusing the `save.taught: string[]` mechanism at save.ts:183). Dismissed on first input.

## 9. Settings additions

Add to `Settings` (save.ts:235), each with the existing validate-with-default pattern (cf. `bool(r.tutorialHints, d.tutorialHints)`):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `inputMode` | `'auto' \| 'touch' \| 'desktop'` | `'auto'` | Detection override (§4). |
| `assistMode` | `'off' \| 'subtle' \| 'strong'` | `'subtle'` | §6. (Only meaningful on touch.) |
| `haptics` | `boolean` | `true` | §8. |
| `mirrorTouch` | `boolean` | `false` | Left-handed mirror. |
| `touchScale` | `'s' \| 'm' \| 'l'` | `'m'` | Control size preset. |

A new **TOUCH** group in `panels/settings.ts` exposes these, **rendered only when `isMobile()`** so desktop never sees the controls. (Validation/persistence runs on all platforms — harmless, and keeps a saved preference if a device toggles modes.)

## 10. Testing

- **`detect.test.ts`** — `isMobile()` truth table: phone (coarse+no-hover+touch), touch-laptop (fine+hover), forced `'touch'`/`'desktop'`, no-touch desktop.
- **`controls.test.ts`** — tap vs. hold resolver: a short tap → `dashTapped` once, no lingering `dashHeld`; a hold → `dashHeld` then `dashReleased`; move-stick vector math; mirror swap.
- **`assist.test.ts`** — magnetism math is pure & deterministic; `off` is identity; `strong` flags `usedStrongAssist`.
- **Submit gate** — a unit/integration assertion that `usedStrongAssist` withholds `submitScore`, and that `subtle`/`off` still submit.
- **Desktop regression (the §2 guard)** — with detection forced desktop: no `html.lf-mobile` class, no overlay DOM mounted, `InputState` and existing input tests unchanged. Extend `src/input.test.ts` / `determinism.test.ts` as needed.
- **Manual** — Playwright device-emulation (iPhone + Android landscape) smoke: boot, reach a run, move/dash/parry/overdrive/pause, game-over, restart. Verify ghost replay still matches after an assisted run.

## 11. Build order (phases)

1. **Detection + isolation skeleton** — `detect.ts`, `html.lf-mobile`, empty overlay mount, settings `inputMode`, desktop-regression test. (Proves §2 before building anything visible.)
2. **Core controls** — `controls.ts`: move stick, lance tap/hold, the input-merge seam in `game.ts`. Playable loop.
3. **Buttons + verbs** — Parry / Overdrive / Pause, mirror mode, touch scale.
4. **Assist** — `assist.ts`, subtle/strong, submit-gate withhold.
5. **Menu & HUD pass** — scoped CSS, safe-area, rotate hint.
6. **Haptics + tutorial** — `haptics.ts`, first-run overlay.
7. **Fullscreen + PWA** — `pwa.ts`, manifest, service worker, orientation lock.
8. **Polish + device QA.**

Each phase is independently verifiable; §2 isolation is asserted by tests from phase 1 onward.

## 12. Out of scope (future)

- Portrait-first gameplay layout (landscape is primary; portrait shows the rotate hint).
- A separate online "touch" leaderboard (Strong assist simply withholds; no new board).
- Gesture controls (swipe-to-parry etc.) — buttons are more discoverable.
- Cloud-synced control customization.

## 13. Risks & open questions

- **Touch-laptop expectation.** `auto` treats them as desktop. Accepted; `Force touch` is the escape hatch. Documented in the TOUCH settings group.
- **Right-thumb crowding** (Lance + Parry + Overdrive). Mitigated by size presets + mirror; revisit if QA shows mis-taps, with Parry-on-left as the fallback.
- **iOS fullscreen / orientation lock** are partially unsupported; `pwa.ts` is best-effort and degrades to the rotate hint + manifest.
- **Service worker caching** can serve a stale bundle after deploy. Use a versioned cache name keyed to the build and a cache-first-then-update strategy; keep it minimal for v1.
