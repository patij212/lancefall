# THE LAST LANCE — MASTER BUILD PLAN ("Remember the Fall")

> Final, build-ready synthesis of the design drafts + the four adversarial reviews (determinism, perf, accessibility, feel). Every reviewer-flagged risk is already resolved in the spec below — where a reviewer found a hole, the plan closes it. This is the document the next 5 phases execute against. All line refs are real (verified against the live tree). All numbers are concrete and live in `tune.ts`.

---

## 1. NORTH STAR + KILLER HOOK

LANCEFALL is a flawless, soulless arcade machine; THE LAST LANCE gives it a soul through exactly **ONE new dial — COHERENCE (0..1)** — a single eased scalar, earned by dashing the dead kingdom's memory back *on the beat*, that simultaneously drives a **global gray→neon saturation wash over the entire frame** (the dead gray static of fallen Lancefall resolving in real time into its gleaming neon City — bullets, enemies, spear and all), a **lone drone blooming into a full choir** (the same number, sole owner of the drone), and a **terse, earned narrator** that names what is happening. Falter — take hits, break the chain, go still — and the color drains and the world collapses back toward oblivion. Nothing in this layer ever gates play or touches the seeded sim. **The win condition is a single ~6-second muted GIF in which a stranger watches the gray dead world flood into neon as the spear dances — and instantly *gets it*.**

---

## 2. INVARIANTS BLOCK (non-negotiable; enforce in every phase + every review)

- **DETERMINISM RULE (stated precisely).** Anything that affects the world-simulation outcome must draw ONLY from `world.rng` (the seeded director/spawn stream, game.ts:239) or a stream deterministically derived from `this.seed` (`world.dropRng` game.ts:242, `hsRng` game.ts:258, the daily-mutator picker game.ts:246). **Cosmetic / personal / meta state — Coherence (value, visual, tier, focusPulse), the beat clock + grade + all beat rewards, the narrator, themes/trails, THE CHOICE, NG+, Memory Fragments, the Echo vignette — must (a) be read from plain values / `SaveData` / `Settings`, never from any `Rng`, and (b) NEVER call `.next()/.range()/.int()/.pick()/.weighted()` on `world.rng`/`world.dropRng`/`hsRng`, and never advance them.** If a cosmetic system needs randomness it allocates its OWN `createRng(constSeed)` (xor-mask distinct from `0x1f83d9ab`, `0x5bd1e995`, `0xc0ffee`) or uses `Math.random()`. The discriminator for "is this a seeded run" is **`this.mode.seedKind === 'date'`** (game.ts:238) — NOT `id==='daily'` (futureproofs any new seeded mode).
- **OFFLINE-FIRST.** No new network calls. The live Cloudflare Worker / leaderboard is untouched. Everything ships and runs from `npm run dev` with no backend.
- **GREEN-BEFORE-COMMIT GATE.** Before every commit: `npx vitest run` (≥230 existing + all new tests green — target **~280+** after Phase 5), `npx tsc --noEmit` clean (no `any` in new modules), `npm run build` clean, and a manual in-browser smoke with **zero console errors/warnings**. No commit if any of these is red.
- **NEW PURE MODULES FULLY UNIT-TESTED.** `coherence.ts`, `beat.ts`, `narrator.ts`, `stillpoint.ts` are pure (no DOM, no `ctx`, no rng-stream access, mutate-in-place / return-pure) and ship co-located `*.test.ts` with the case lists below.
- **`tune.ts` IS THE SINGLE SOURCE OF TRUTH** for every number. New knob blocks: `COHERENCE`, `COHERENCE_AUDIO`, `BEAT`. No magic numbers in `coherence.ts`/`beat.ts`/`render.ts`/`audio.ts` — every constant imports from `tune.ts`. `FIXED_DT = 1/60`, `MAX_SUBSTEPS = 5` unchanged.
- **ONE SAVE-SCHEMA BUMP PER CHANGE via `migrate.ts`.** The entire meta-layer is ONE additive v4→v5 bump (§8). `SAVE_VERSION = 5`; the single chokepoint `return { ...base, ...data, version: SAVE_VERSION }` (migrate.ts:27) default-fills every new field from `defaultSave()`. No second bump anywhere in this plan.
- **RESTORE OWNER SAVE after any in-browser test.** After any manual browser run, restore the owner's localStorage `lancefall.save` to: **`highScore: 46472`, `bestCombo: 31`, `handle: ''`** (plus the rest of `defaultSave()` defaults the owner had). Do not commit a test-polluted save.
- **ACCESSIBILITY-GATE EVERY NEW VISUAL.** Every new visual respects `reduceFlashing`, `reduceMotion`, `colorblind`, and the new `clarity` flag, per the per-visual gate table in §4. New cosmetic-randomness/visual swings are capped, not just frozen. The narrator reaches screen-reader users via `aria-live`.
- **NARRATOR NEVER BLOCKS THE LOOP.** Narrator triggers fire only from `frame()` / event callbacks (never inside `step(FIXED_DT)`); it surfaces via the existing non-blocking `ui.toast()` / `ui.announce()` DOM surfaces (ui.ts:960 / ui.ts:972); it owns its own rng. Sim-side events are *latched as flags* in `step()` and *consumed* in `frame()`.

---

## 3. THE COHERENCE FORMULA — final (`src/coherence.ts`, pure, unit-tested)

**DESIGN-CONFLICT RESOLUTION (feel review C1, perf review item 7, determinism review H2).** The drafts shipped TWO incompatible coherence designs ("Spec A" = `CoherenceState` on `world`, updated in `step()`; "Spec B" = a `Game` field updated in `frame()`). **Spec A is CUT. Spec B is law.** Coherence is a `Game`-owned, `frame()`-updated, `realDt`-eased scalar — derived (not event-accumulated) from combo/comboTimer/killsThisDash + beat kicks. It NEVER lives on `world`, NEVER updates inside `step()`, and is therefore structurally incapable of perturbing `world.rng`. There is exactly ONE eased value computed per frame.

### 3.1 `coherence.ts` API (pure; imports only `./tune`)

```ts
// src/coherence.ts — cosmetic ONE-VALUE bus. PURE. No ctx/DOM/rng-stream. Game owns it.
import { COHERENCE as CO } from './tune';

export interface CoherenceState {
  value: number;       // eased 0..1 — the ONLY scalar render + audio read
  target: number;      // gameplay-derived goal (recomputed each frame, pure)
  focusPulse: number;  // 0..1 decaying Perfect-dash "focus snap" envelope
  tier: number;        // 0..6 combo tier (audio root transpose; mirrors COMBO_TIERS)
}

export function newCoherence(): CoherenceState { return { value: 0, target: 0, focusPulse: 0, tier: 0 }; }
export function resetCoherence(c: CoherenceState): void { c.value = 0; c.target = 0; c.focusPulse = 0; c.tier = 0; }

const clamp01 = (x: number) => x < 0 ? 0 : x > 1 ? 1 : x;

/** Pure target from cosmetic, rng-free run state. combo dominates but is NOT the only input. */
export function coherenceTarget(combo: number, comboTimer: number, killsThisDash: number,
                                lastBreathActive: number): number {
  const comboT = 1 - Math.exp(-combo / CO.comboHalf);           // soft-knee toward 1
  const dashT  = Math.min(1, killsThisDash / CO.dashChainFull);  // hot-dash chain bonus
  let t = CO.floor + (1 - CO.floor) * (comboT * CO.comboWeight + dashT * CO.dashWeight);
  if (comboTimer <= 0) t = CO.floor;                            // chain dead → collapse to gray
  if (lastBreathActive > 0) t *= CO.lastBreathDim;              // THE HUSH (gated in render, see §4)
  return clamp01(t);
}

/** Ease value→target on real dt. Asymmetric: blooms fast, decays slow. Frame-rate-stable. */
export function tickCoherence(c: CoherenceState, dt: number): void {
  const rate = c.target > c.value ? CO.riseRate : CO.fallRate;
  c.value += (c.target - c.value) * Math.min(1, rate * dt);
  c.focusPulse = Math.max(0, c.focusPulse - dt / CO.focusPulseDecay);
}

/** A graded on-beat dash kicks the bus + (perfect) lights the focus-snap. The ONLY beat reward. */
export function coherenceBeatKick(c: CoherenceState, perfect: boolean): void {
  c.value = clamp01(c.value + (perfect ? CO.perfectKick : CO.onbeatKick));
  if (perfect) c.focusPulse = 1;
}

/** Monotone non-decreasing combo→tier index (audio transpose). Reuses COMBO_TIERS cut points. */
export function comboTier(combo: number): number {
  const cuts = CO.tierCombo; let t = 0;
  for (let i = 0; i < cuts.length; i++) if (combo >= cuts[i]) t = i + 1;
  return t;
}
```

### 3.2 The exact `COHERENCE` block for `tune.ts` (insert after the `CLUTCH` block, ~tune.ts:301)

```ts
// COHERENCE — the SOUL dial. ONE eased 0..1 value, a Game field, updated in frame() on realDt.
// Drives the global gray→neon wash (render) + the lone-drone→choir bloom & root transpose
// (audio). Cosmetic & personal: consumes NO rng (Daily-safe). Single source of truth.
export const COHERENCE = {
  // ── target shaping (pure read of combo/dash/clutch) ──
  floor: 0.06,           // gray-static baseline when the chain is dead
  comboHalf: 14,         // combo at which the soft-knee reaches ~63% (1 - e^-1)
  comboWeight: 0.70,     // share of target from combo
  dashChainFull: 5,      // killsThisDash that maxes the hot-dash contribution
  dashWeight: 0.30,      // share of target from a hot dash-chain
  lastBreathDim: 0.35,   // multiply target during LAST BREATH (THE HUSH; softened by a11y, §4)
  // ── easing (blooms fast, collapses gently) ──
  riseRate: 4.5,         // value→target lerp rate/s when rising
  fallRate: 1.1,         // …when falling
  // ── beat focus-snap (the ONLY beat reward feeds these two) ──
  perfectKick: 0.18,     // bus jump on a Perfect on-beat dash
  onbeatKick: 0.06,      // smaller jump for a Good on-beat dash
  focusPulseDecay: 0.5,  // seconds for focusPulse 1→0
  focusSnapLift: 0.35,   // added to the wash strength at peak focusPulse
  // ── render wash ──
  satFloor: 0.12,        // minimum saturation multiplier at coherence 0 (never fully gray, readability)
  washGain: 0.88,        // saturation lift from full coherence (satFloor..satFloor+washGain)
  cityGlowBase: 0.10,    // bottom neon city-glow band alpha at coherence 0
  cityGlowGain: 0.55,    // …added at coherence 1
  windowThreshold: 0.55, // coherence above which skyline window-lights appear
  exposureBase: 0.70,    // background exposure floor
  exposureGain: 0.30,    // exposure added by full coherence
  vignetteDeepen: 0.40,  // how much LOW coherence deepens the vignette (world closing in)
  trailDim: 0.40,        // ink-trail ghost dimmer floor at coherence 0
  // ── accessibility caps ──
  flashCap: 0.85,        // max coherence-driven brightness swing under reduceFlashing
  clarityFloor: 0.85,    // min gameplay-layer alpha under Clarity (play layer never dims below this)
  // ── combo → audio tier (monotone; reuses COMBO_TIERS cut points game.ts:66) ──
  tierCombo: [10, 20, 35, 50, 75, 100], // combo thresholds → tier 1..6
} as const;
```

> `tierCombo` reuses the existing `COMBO_TIERS` cut points (game.ts:66) so the audio transpose lands on the SAME milestones as the on-screen RAMPAGE/FRENZY announcements and `comboColor()` ramp.

### 3.3 Ownership + update site (Game field, frame(), realDt)

- Field: `private coherence = newCoherence();` beside `this.world` (game.ts:87). Reset via `resetCoherence(this.coherence)` in the run-reset region (game.ts:239–242), beside the existing stream re-seeds.
- Update (per display frame): in `frame()` **between `this.updateCamera(realDt)` (game.ts:664) and `this.renderer.render(...)` (game.ts:665)**:
  ```ts
  const w = this.world;
  this.coherence.tier   = comboTier(w.combo);
  this.coherence.target = coherenceTarget(w.combo, w.comboTimer, w.player.killsThisDash, w.clutch.lastBreathActive);
  tickCoherence(this.coherence, realDt);
  ```
- The beat kick (`coherenceBeatKick`) is the ONLY other writer; it is called from the beat-grade site (§5), which is moved out of the substep loop (determinism H1). `coherence` is a `Game` field, so it can never enter the seeded sim.

### 3.4 `coherence.test.ts` — unit-test list (16 cases)

| # | it | asserts |
|---|---|---|
| 1 | `newCoherence is zero` | `{value:0,target:0,focusPulse:0,tier:0}`; `resetCoherence` ⇒ `toEqual(newCoherence())` |
| 2 | `target floor when chain dead` | `coherenceTarget(0,0,0,0) === COHERENCE.floor`; `comboTimer<=0` forces floor regardless of combo |
| 3 | `target rises with combo (soft-knee, saturating)` | monotone non-decreasing over combo 0..200; bounded `≤1` |
| 4 | `hot dash-chain lifts target` | `coherenceTarget(10,1,5,0) > coherenceTarget(10,1,0,0)`; caps at `dashChainFull` |
| 5 | `LAST BREATH dims target` | `coherenceTarget(40,1,0,1) === coherenceTarget(40,1,0,0) * COHERENCE.lastBreathDim` |
| 6 | `target clamps to [0,1]` | extreme inputs never exceed 1 or drop below 0 |
| 7 | `ease rises fast` | from 0, one `tickCoherence(c,1/60)` with target 1 ⇒ `0<value<1`; ~1s ⇒ within 0.05 of target |
| 8 | `ease falls slow (asymmetric)` | rise to a value then drop target; fall covers less ground per dt than an equal rise (`fallRate<riseRate`) |
| 9 | `ease is frame-rate stable` | 2× (dt/2) steps ≈ 1× (dt) step within 1e-3 |
| 10 | `beat kick perfect > good` | perfect kick == `perfectKick`, good == `onbeatKick`, perfect lights `focusPulse=1` |
| 11 | `good kick does not set focusPulse` | `coherenceBeatKick(c,false)` leaves `focusPulse` unchanged at 0 |
| 12 | `focusPulse decays to 0` | after `focusPulseDecay` seconds of ticks ⇒ `focusPulse===0`, never negative |
| 13 | `kick clamps at 1` | many perfect kicks ⇒ `value===1` exactly |
| 14 | `comboTier monotone + cut points` | non-decreasing over 0..120; `comboTier(9)=0,(10)=1,(100)=6`; `tier ≤ tierCombo.length` |
| 15 | `value stays in [0,1] throughout a scripted run` | kick/tick/target sequence never leaves `[0,1]` for value or focusPulse |
| 16 | `determinism: identical sequence ⇒ identical state` | two fresh states fed the same scripted (target,dt,kick) schedule ⇒ `toEqual`; no `Math.random`/Date/global reads |

---

## 4. THE ONE BUS — render wash + audio bloom, driven by ONE value

**The single scalar is `this.coherence.value`** (eased, `frame()`, `realDt`). It has exactly two readers; neither mutates it. **Per perf review item 3, the plumbing is SPLIT:** the *render* half is pushed **every frame** (cheap field writes); the *audio* half rides the **existing 0.4s throttle** (NOT 0.1s — the cadence change is rejected; `setTargetAtTime` time-constants already smooth over seconds, and 0.1s would flood ~130 param events/sec for zero perceptual gain).

### 4.1 RENDER HALF — the global gray→neon wash (the GIF, per feel review's highest-leverage fix)

The feel review's decisive note: a faint background-only skyline at ≤0.5 alpha behind the bullet-hell **fails the 6-second-GIF test** and is collinear with combo. The fix the plan adopts: **the primary read is a global saturation post-pass over the WHOLE composited frame + a foreground neon city-glow band**, with the parallax skyline demoted to a supporting echo.

**Plumbing (render.ts).** Mirror the `biomeTint`/`setBiomeTint` pattern (render.ts:48,59). Add:
```ts
private coherence = 0; private focusPulse = 0;
private reduceMotionR = false; private clarityR = false; private colorblindR = false; private reduceFlashingR = false;
private quality = 1;                          // perf-adaptive (see §perf wiring)
private towers: { x: number; w: number; band: 0|1|2 }[] = [];
private washLUT: string[] = [];               // precomputed neon-tint colors, keyed by quantized coherence
setCoherence(c: number, focus: number): void { this.coherence = c; this.focusPulse = focus; this.rebuildWashIfNeeded(); }
setQuality(q: number): void { this.quality = q; }
```

1. **Global saturation post-pass (PRIMARY, the unmistakable read).** Applied in `present()` (render.ts:~1157), AFTER the buffer→screen blit and BEFORE the vignette. The whole frame (bullets, enemies, spear, city) is pushed from near-grayscale at low coherence to full saturation at high coherence. Canvas2D has no native saturation filter on a 2D context draw, so use the cheapest equivalent: a **single full-screen overlay pass** that desaturates by compositing a luminance-matched gray copy over the frame at alpha `(1 - sat)`, where `sat = COHERENCE.satFloor + COHERENCE.washGain * C`. Implementation: draw the screen buffer once more through the existing scratch `tint` canvas with `globalCompositeOperation='saturation'` (supported on the offscreen 2D context) at the wash level, OR — the guaranteed-portable path — a `'color'`/`'saturation'` composite of a gray fill. **One full-screen draw, no per-pixel JS, no allocation** (the gray is a constant fill; the composite op does the work on the GPU-backed canvas). Under `reduceFlashing`, `C` is capped at `flashCap`; under `clarity`, `sat` is floored so the play layer never desaturates below readability.
2. **Foreground neon city-glow band (the ANCHOR the eye lands on).** A luminous neon band along the bottom ~14% of the screen, alpha `COHERENCE.cityGlowBase + COHERENCE.cityGlowGain * C`, color `this.biomeTint?.[1] ?? this.theme.accent`. Drawn in `present()` screen-space after the wash. This is the "City of Lancefall" edge resolving — bright, foreground, unmissable in a compressed GIF.
3. **Parallax skyline (SUPPORTING echo).** `drawSkyline(C, exposure)` inserted in `drawBackground` between the nebula loop (render.ts:294) and the starfield (render.ts:296). **Perf-critical (perf review item 1):** towers are static geometry; render each parallax band to an **offscreen buffer keyed by a quantized coherence bucket** (mirror the `glowCache` Map at render.ts:38), then per-frame blit ~3 `drawImage` calls at the drift offset with one `globalAlpha`. The `mixHex(gray→neon)` results go into `washLUT` (quantized ~32 steps, rebuilt only in `setCoherence` on bucket change), NEVER per-tower-per-frame. Window-lights are gated by `quality` (skip when `quality<1`) and `reduceFlashing`; tower count halves when `quality<=0.4`.
4. **Combo auto-exposure + vignette-deepen.** `exposure = heat * (COHERENCE.exposureBase + COHERENCE.exposureGain * C)` (reuse the existing `heat = 1 + min(combo,40)*0.012` at render.ts:275) applied as one `globalAlpha` across nebula+skyline+stars (fold the per-star `*heat` into `exposure`). Vignette-deepen is a **`globalAlpha` multiply on the existing base-vignette fill** (`*= 1 - COHERENCE.vignetteDeepen*(1-C)`) — **NOT** a second `createRadialGradient` (perf review item 4). Gated off under `reduceFlashing` and `reduceMotion`.
5. **Ink-ribbon trail brightening.** Multiply the existing ghost-`blaze` whiten + streak alpha (render.ts:1036–1063, drawParticlesBelow) by `(COHERENCE.trailDim + (1-COHERENCE.trailDim)*C)`. **The combo-tier spear line (render.ts:1018–1031, `comboColor`) is NOT touched** — it stays the combo signal. No new draw calls, no allocation, no extra ghosts.

**Tower precompute** (`initTowers()` called from `resize()` after `initStars()`, render.ts:~88, uses `Math.random()` ONLY, never `world.rng`; never regenerated per-frame — perf M1).

### 4.2 AUDIO HALF — the lone drone blooming into a choir (sole owner of the drone)

**AUDIO-COLLISION RESOLUTION (feel review item 3).** `setIntensity` (audio.ts:663–671) ALREADY crossfades the same four `drone[]` gains + opens the same `droneFilter` from wave-intensity. Two controllers stomping the same nodes via `setTargetAtTime` makes the bloom stutter. **Resolution: Coherence becomes the SOLE owner of the drone bloom + filter.** `setIntensity` is **gutted** — it no longer writes `drone[]` gains or `droneFilter.frequency`; it keeps ONLY its `musicHeat`/arp-density role (the `playStep` gating at audio.ts:706–721). The drone crossfade + filter bloom move entirely into the new `setCoherence(value, tier)`. One controller per knob.

Add to `AudioEngine`: `private rootMul = 1;`, `private choirVoices: { osc: OscillatorNode; gain: GainNode }[] = [];`, a static `private static CHOIR_SEMIS = [0,7,12,16,19] as const;` (hoisted out of any loop — perf item 4). New method `setCoherence(c, tier)`:

```ts
setCoherence(c: number, tier: number): void {
  const ctx = this.ctx;
  if (!ctx || !this.droneOn || !this.droneFilter) return;     // early-return mirrors setIntensity guard (audio.ts:666) — no resurrection after teardown
  const t = ctx.currentTime; const k = Math.min(1, Math.max(0, c));
  const CA = COHERENCE_AUDIO;
  // (a) ROOT TRANSPOSE by combo tier (drone + PENTA + bass + arp + choir shift together)
  const mul = Math.pow(2, (CA.tierSemis[Math.min(tier, CA.tierSemis.length - 1)]) / 12);
  if (mul !== this.rootMul) {
    this.rootMul = mul;
    const base = [55, 82.5, 110, 165];
    this.drone.forEach((v, i) => v.osc.frequency.setTargetAtTime(base[i]! * mul, t, CA.transposeGlide));
  }
  // (b) LONE-DRONE → 4-VOICE bloom (sole owner of these gains now)
  const g = [0.16, k > 0.30 ? 0.10*k : 0.0001, k > 0.50 ? 0.09*k : 0.0001, k > 0.72 ? 0.07*k : 0.0001];
  this.drone.forEach((v, i) => v.gain.gain.setTargetAtTime(g[i]!, t, CA.droneGlide));
  this.droneFilter.frequency.setTargetAtTime(700 + k * CA.filterBloom, t, CA.filterGlide);
  // (c) CHOIR/BELL pad blooms past onset
  this.setChoir(Math.max(0, (k - CA.choirOnset) / (1 - CA.choirOnset)));
}
```

`setChoir(level)` lazily builds 5 persistent `{osc,gain}` voices (triangle, `CHOIR_SEMIS` stacked add9 on `110*rootMul`, detune via `Math.random()` — cosmetic, never `world.rng`), routed through `droneFilter`→`musicBus` (inherits ducking + the music-volume slider for free), crossfaded by gain. Read `rootMul` in `playStep` so the melodic layer transposes too: `bassNote(t, 110*this.rootMul, …)`, `bassNote(t, 146.83*this.rootMul, …)`, arp `freq = base*(bossArp?bossArpMul:1)*this.rootMul`. **Teardown in `stopDrone()` (audio.ts:~855):** ramp each choir gain→0.0001, `osc.stop(t+0.6)`, `onended` disconnect, `choirVoices=[]`, `rootMul=1` — mirrors the bossVoices teardown (audio.ts:810–822). This closes the perf review's node-leak finding.

`COHERENCE_AUDIO` block for `tune.ts`:
```ts
export const COHERENCE_AUDIO = {
  tierSemis: [0, 2, 3, 5, 7, 9, 12], // semitone transpose per tier 0..6 (A-minor-pentatonic-safe)
  transposeGlide: 0.25,
  droneGlide: 0.5,
  filterBloom: 3200,                 // Hz added to the 700 base lowpass at coherence 1
  filterGlide: 0.5,
  choirOnset: 0.6,                   // coherence below which the choir is silent
  choirGain: 0.10,                   // total choir bus gain at full bloom (under the limiter)
  choirGlide: 0.6,
} as const;
```

### 4.3 Insertion points (cite real sites) + a11y gates + tune knobs

- **Render push (per frame):** `this.renderer.setCoherence(this.coherence.value, this.coherence.focusPulse)` in `frame()` at game.ts:664, right after the `tickCoherence` call. Render reads `this.coherence`/`this.focusPulse` fields only.
- **Audio push (throttled 0.4s):** `this.audio.setCoherence(this.coherence.value, this.coherence.tier)` folded into the existing throttle block at **game.ts:637** (beside `this.audio.setIntensity(...)`).
- **RenderOpts extension (single union, both halves — accessibility cross-cutting fix A):** extend `RenderOpts` (render.ts:24–29, currently only `reduceFlashing,colorblind,combo,caScale`) with the **union**: `reduceMotion, clarity, beatPhase, rhythmAssist, visualMetronome, beatTrailBright`. Set ALL of them once in the render-opts object at game.ts:665–670. At the top of `render()`, mirror to renderer fields: `this.reduceMotionR/clarityR/colorblindR/reduceFlashingR = opts.…`. (`coherence`/`focusPulse` arrive via `setCoherence`, not RenderOpts.)
- **A11y gates (per §4 table below):** every wash/glow/skyline/exposure/vignette/trail read branches on these fields. **Colorblind (cross-cutting fix C):** the "accent is colorblind-safe" premise is FALSE (`accent` is user-selectable: cyan/orange/green/pink/mono). Under `colorblind`, coherence encodes via **luminance + tower height/outline**, never raw hue: `drawSkyline` and the city-glow use a gray→white luminance ramp; the global wash already encodes via saturation (luminance-preserving), which is colorblind-robust by construction.
- **tune knobs:** all magnitudes above live in `COHERENCE` / `COHERENCE_AUDIO`.

**Per-visual accessibility gate table (every new visual; all gaps from the a11y audit closed):**

| New visual | reduceFlashing | reduceMotion | colorblind | clarity |
|---|---|---|---|---|
| Global saturation wash | cap `C` at `flashCap` | n/a (slow ease) | OK (saturation is luminance-preserving) | floor `sat` so play layer ≥ `clarityFloor` |
| Neon city-glow band | cap alpha (`C≤flashCap`) | n/a | luminance ramp (no hue dependence on coherence) | crisp solid band, alpha floor |
| Parallax skyline | freeze exposure=1, kill windows | `drift=0` (static) | gray→white luminance + height as primary channel | single binary silhouette band |
| Focus-snap | `fp=0` | `fp=0` (a sudden full-field swell reads as motion) | OK (luminance) | clamp lift so play layer ≥ `clarityFloor` |
| Auto-exposure | `exposure=1`, `flashCap` | vignette-deepen off | OK (luminance) | enforce play-layer floor at the layer-A/B draw wrap |
| Vignette-deepen | off | off | OK | off (would fight clarityFloor) |
| Ink-trail brighten | clamp `beatTrailBright=0` | OK (existing motion) | OK (no new hue) | fix trail brightness to a high-contrast constant |
| THE HUSH (LAST BREATH dim) | soften: clamp applied dim ≥ `flashCap`-derived floor | soften (it's a "time bends" moment) | OK | never dim play layer below `clarityFloor` |
| THE DROP (clutch/eruption/REMEMBER bloom) | cap rise at `flashCap` | cap | OK | clamp to `clarityFloor`-safe contrast |

> The single render-side gate expression `const fp = (this.reduceFlashingR || this.clarityR) ? 0 : this.focusPulse;` is used at EVERY focus-pulse read (the a11y audit required this be wired into the actual expression, not just described). THE HUSH and THE DROP — the two strongest luminance transients, both at high-tension moments — are softened under both `reduceFlashing` and `reduceMotion` and floored at `clarityFloor` on the play layer.

---

## 5. BEAT-GRADING SPEC (`src/beat.ts`, pure, unit-tested) — REWARD-ONLY

**SCOPE NARROWED (feel review TIER-A trim + determinism C3/H1).** The beat layer is a pure REWARD: off-beat loses NOTHING. The on-beat dash grants **exactly ONE thing — a coherence kick** (`coherenceBeatKick`). **CUT entirely:** dash reach bonus (all forms), the i-frame-grace top-up (a stealth difficulty change), the per-grade `BeatReward` bundle, the contracting beat-ring HUD, the `rhythmAssist`/`visualMetronome` toggles being *required*, and telegraph quantization. Determinism review C3 is moot because no beat reward touches the sim at all (no `p.iframe`, no reach, no `world.*`). The grade computation is moved OUT of the substep loop (H1): it is computed in `frame()` from a flag latched during `step()`.

> **OPTIONAL (Director-gated, ships only if Phase 3 review approves, default OFF):** a *visual-metronome pip* and *render-only telegraph beat-throb* may be added as opt-in, off-by-default `Settings` flags `visualMetronome`/`rhythmAssist`. They are feedback-only, render-only (read `opts.beatPhase`, never sim timing), and gated per the a11y table. They are NOT in the critical path and never required to win. See OPEN DECISION #3.

### 5.1 `beat.ts` pure API (no audio/DOM/rng)

```ts
// src/beat.ts — PURE rhythm clock + dash-release grading. NO ctx/DOM/rng.
import { BEAT } from './tune';
export type BeatGrade = 'perfect' | 'good' | 'off';

export interface BeatGrid { bpm: number; beatDur: number; barDur: number; sixteenthDur: number; beatsPerBar: number; }
export function makeGrid(bpm: number, beatsPerBar = 4): BeatGrid {
  const beatDur = 60 / bpm;
  return { bpm, beatDur, barDur: beatDur * beatsPerBar, sixteenthDur: beatDur / 4, beatsPerBar };
}

export function phase01(t: number, period: number): number {
  if (period <= 0) return 0; const m = ((t % period) + period) % period; return m / period;
}
export function signedNearest(t: number, period: number): number {
  if (period <= 0) return 0; const m = ((t % period) + period) % period; return m <= period/2 ? -m : period - m;
}

export class BeatClock {
  t = 0; grid: BeatGrid; synced = false;
  constructor(grid: BeatGrid) { this.grid = grid; }
  advance(dt: number): void { if (dt > 0) this.t += dt; }           // realDt — audio is slow-mo-immune
  reconcile(audioMusicTime: number, dt: number): void {
    if (!Number.isFinite(audioMusicTime)) return;
    if (!this.synced) { this.t = audioMusicTime; this.synced = true; return; }
    const drift = audioMusicTime - this.t;
    if (Math.abs(drift) > BEAT.reseedSnapTolerance) this.t = audioMusicTime;     // hard snap (tab refocus)
    else this.t += drift * Math.min(1, BEAT.reseedEase * dt);                    // ease toward truth
  }
  beatPhase(): number { return phase01(this.t, this.grid.beatDur); }
  barPhase(): number  { return phase01(this.t, this.grid.barDur); }
  signedBeatError(): number { return signedNearest(this.t, this.grid.beatDur); }
  beatError(): number { return Math.abs(this.signedBeatError()); }
  nextGridTime(): number { const s = this.grid.sixteenthDur; return Math.ceil((this.t + 1e-6) / s) * s; }
}

/** PURE grade. Unsynced ⇒ 'off' (no false rewards before the audio epoch is known). */
export function gradeRelease(beatErr: number, synced: boolean): BeatGrade {
  if (!synced) return 'off';
  const e = beatErr - BEAT.graceOnLanding;                 // forgive ~1 display-frame of poll quantization
  if (e <= BEAT.perfectWindow) return 'perfect';
  if (e <= BEAT.goodWindow) return 'good';
  return 'off';
}
```

### 5.2 Grading windows (concrete @ BPM=112; beatDur = 0.535714s)

| Grade | condition (after `graceOnLanding` subtraction) | meaning |
|---|---|---|
| **Perfect** | `beatErr - 0.06 ≤ 0.045` (raw ≤ 105ms) | "remembers cleanly" — `perfectKick = 0.18` coherence + `focusPulse=1` + on-grid snare |
| **Good** | `≤ 0.11` (raw ≤ 170ms) | `onbeatKick = 0.06` coherence (visual nudge, no snare) |
| **Off** | otherwise, or `!synced` | nothing gained, **nothing lost** — dash is byte-identical to today |

`BEAT` block for `tune.ts`:
```ts
export const BEAT = {
  perfectWindow: 0.045,      // ±45ms → Perfect
  goodWindow: 0.11,          // ±110ms → Good
  graceOnLanding: 0.06,      // pad ~1 display-frame of input.poll quantization (60–144Hz fairness)
  reseedSnapTolerance: 0.25, // pure-clock drift beyond this → hard snap to audio truth
  reseedEase: 6,             // per-second ease rate toward audio truth below the snap tolerance
} as const;
```

### 5.3 Perfect rewards (tied to real things — but only cosmetic ones)

- **+coherence kick:** `coherenceBeatKick(this.coherence, grade==='perfect')` — the ONE reward. Cosmetic, never rng.
- **focus-snap:** the perfect kick sets `focusPulse=1` → a brief whole-frame "snap into focus" bloom (gated, §4).
- **on-grid snare (Perfect only):** `audio.perfectDashSnare(snareCtxT)` scheduled at the quantized next grid step, gated `if (grade==='perfect' && !settings.reduceFlashing)`. New transient SFX (2 osc + 2 gain + 1 filter, `onended` disconnect, modeled on `whoosh` audio.ts:364, routed to `sfxBus`). `snareCtxT = audio.clock + (beat.nextGridTime() - beat.t)` (gap always in `[0, sixteenthDur)` → lands on the very next grid step, ≤134ms out).
- **NO reach, NO i-frame grace, NO trail-bright as a sim reward.** (`beatTrailBright` survives ONLY as a cosmetic per-dash brightness scalar fed to the ink-trail render multiply, clamped to 0 under `reduceFlashing`/`clarity`; it touches no sim state.)

### 5.4 Beat-ring HUD + assist/metronome (DEMOTED to opt-in, default off)

Per the feel review, the contracting beat-ring is CUT from the critical path. IF Phase 3 review approves the optional layer: a single `ctx.arc` ring (NO per-frame gradient — perf item 2) drawn in `present()` screen-space, ONLY when `settings.rhythmAssist || settings.visualMetronome`; radius from `beat.beatPhase()`; gray→neon by coherence (luminance/outline under colorblind); white flash on Perfect gated by `reduceFlashing`; static mid-radius under `reduceMotion`. The "ON BEAT" tick uses `w.particles.floatText` (rng-free — see C1). Default OFF means most players never see it; it is a read-aid, never an instruction. The drafts' `rhythmAssist`/`visualMetronome` add to `Settings` (unversioned — interface + `defaultSettings()` + a `buildSettings` toggle, no migration).

### 5.5 Audio-clock exposure (the ONLY audio change for the clock)

Add `private musicEpoch = 0;` near `nextNoteT` (audio.ts:39); set `this.musicEpoch = this.nextNoteT;` in `startMusic()` right after `this.nextNoteT = ctx.currentTime + 0.1` (audio.ts:680). Add getters: `get musicTime() { return this.ctx && this.musicTimer ? this.ctx.currentTime - this.musicEpoch : 0; }`, `get musicRunning() { return this.musicTimer !== 0; }`, `get clock() { return this.ctx?.currentTime ?? 0; }`. On run start, reset `this.beat = new BeatClock(makeGrid(112))` (or `beat.synced=false`) beside `audio.endCharge()` (game.ts:277) so a new run never grades against a stale epoch (perf/correctness M3).

### 5.6 Grade attach site (OUT of the substep loop — determinism H1)

In `step()`, the dash commit fires `ev.dashFired` (player.ts:149). **Do NOT grade inside `handlePlayerEvents` (game.ts:806) — that runs inside `step(FIXED_DT)`.** Instead, latch `this.dashFiredThisStep = true` when `ev.dashFired` (a `Game` flag, set in the `ev.dashFired` branch). In `frame()`, AFTER the substep loop, just before the coherence update (game.ts:664):
```ts
if (this.dashFiredThisStep) {
  this.beat.advance(realDt); // (advance/reconcile already done each frame; see below)
  const grade = gradeRelease(this.beat.beatError(), this.beat.synced);
  if (grade !== 'off') coherenceBeatKick(this.coherence, grade === 'perfect');
  if (grade === 'perfect' && !this.settings.reduceFlashing)
    this.audio.perfectDashSnare(this.audio.clock + (this.beat.nextGridTime() - this.beat.t));
  this.dashFiredThisStep = false;
}
```
Beat clock advance/reconcile run **every frame** in `frame()` (fold beside the throttled-audio block, advance unthrottled): `this.beat.advance(realDt); this.beat.reconcile(this.audio.musicTime, realDt);`. Excludes *denied* releases (the flag is only set in the committed `ev.dashFired` branch, not on `ev.denied`). **No `world.rng`/`dropRng` is read or advanced anywhere in this path.**

### 5.7 Telegraph quantization — candidates + verdict

**REJECTED for fire-timing; render-only throb is OPTIONAL (with the optional metronome layer, default off).** True telegraph fire-time quantization would require reading the wall-clock beat inside `step()`, which is non-deterministic across machines → Daily desync. Forbidden. The only safe form is a **render-only beat-throb of existing telegraph visuals** (`drawEnemy` reads `opts.beatPhase`), changing alpha only, never any `tune.ts` duration. Candidates and the DO-NOT-TOUCH timings (all must stay byte-identical): `BLOOMER.windup/ringCadence`, `BEACON.telegraphDur`, `SOVEREIGN.beamTelegraph`, `HOLLOW.syncTelegraph/syncWindow`, `LANCER.lockTime`, `DRIFTER_TUNE.lockTime`. Ships ONLY if OPEN DECISION #3 keeps the optional layer; otherwise cut.

### 5.8 `beat.test.ts` — unit-test list (13 cases)

`g = makeGrid(112)` ⇒ `beatDur≈0.535714, barDur≈2.142857, sixteenthDur≈0.133929`.
1. `makeGrid` derivations (all four to `toBeCloseTo`, `beatsPerBar===4`).
2. `phase01` basic + on-beat wrap (`phase01(bd,bd)≈0`, `phase01(bd/2,bd)≈0.5`).
3. `phase01` negative t (`phase01(-bd*0.25,bd)≈0.75`).
4. `barPhase` wraps cleanly at bar end (≈1 just before, ≈0 just after).
5. `signedNearest` sign convention (just-past `<0`, just-before `>0`, midpoint `≈bd/2`).
6. `beatError` symmetry + `≤ beatDur/2`.
7. Perfect boundary: `gradeRelease(0,true)='perfect'`, `(0.105,true)='perfect'` (edge), `(0.106,true)='good'`.
8. Good boundary: `(0.17,true)='good'` (edge), `(0.171,true)='off'`.
9. Off: `gradeRelease(beatDur/2,true)='off'`.
10. Unsynced gate: `gradeRelease(0,false)='off'`; `new BeatClock(g).synced===false`.
11. `reconcile` first-sync seeds exactly (`reconcile(1.234,0.016)` ⇒ `synced=true, t===1.234`).
12. `reconcile` hard-snap vs ease (drift>tol snaps; drift<tol eases strictly between).
13. `nextGridTime` quantize + determinism (gap always `[0,sixteenthDur)`; two clocks on identical dt sequences ⇒ identical `t`; no `Math.random`/Date/global reads).

---

## 6. FULL RE-NARRATION TABLE

**SCOPE (feel review):** rename ONLY what appears in the GIF or the win/loss moment — protect the frozen-id discipline, avoid churn. **Invariant:** every `id`/record-key/`level` int is frozen (save/determinism/RNG). Only display strings change. The HEAT→DEPTH, score→MEMORY, all ship renames, and all biome renames are **CUT** per the feel review (HEAT is a shipped, understood ladder whose fire metaphor would fight the descent metaphor; ship/biome names add nothing to the GIF and risk frozen-id surface for zero payoff). The framing renames REMEMBER EVERYTHING / THE LIGHT DIMS / ECHO OF THE FALL stay (they ARE the win/loss/daily moments). DESCENT DEPTH / 6 STRATA are reframed as **narrator framing only** (no const renames), preserving the HEAT and biome ids untouched.

### 6.1 The complete rename table

| Concept | id (unchanged) | old display | new display | file : const : line |
|---|---|---|---|---|
| Player ship (one nod only) | `lance` | `LANCE` | **THE LAST LANCE** | `ships.ts : SHIPS[0].name : 20` |
| — its desc | `lance` | `Balanced. The standard blade…` | **The last spear left standing when Lancefall fell. Even in every way — 3 stamina, true handling.** | `ships.ts : SHIPS[0].desc : 21` |
| Nova / ultimate (HUD init) | `overdrive` | `OVERDRIVE` | **REMEMBER** | `ui.ts : odLabel : 217` |
| Nova ready/idle (HUD live) | — | `OVERDRIVE READY [F]` / `OVERDRIVE` | **REMEMBER EVERYTHING [F]** / **REMEMBER** | `ui.ts : odLabel.textContent : 1033` |
| Nova recharge text | — | `RECHARGING ${n}s` | **FADING ${n}s** | `ui.ts : 1033` |
| Nova how-to rule | — | `rule('OVERDRIVE', …)` | **rule('REMEMBER EVERYTHING', …)** | `ui.ts : 606` |
| Nova float text | — | `OVERDRIVE +${bonus}` | **REMEMBER EVERYTHING +${bonus}** | `game.ts : floatText : 414` |
| Nova announce | — | `announce('OVERDRIVE', …)` | **announce('REMEMBER EVERYTHING', …)** | `game.ts : 425` |
| Death (loss, init) | — | `YOU FELL` | **THE LIGHT DIMS** | `ui.ts : goHead : 352` |
| Death (loss, live) | — | `YOU FELL` | **THE LIGHT DIMS** | `ui.ts : goHead.textContent : 911` |
| Death subtitle (loss) | — | `felled by ${deathCause}` | **the kingdom forgets a little more · ${deathCause}** | `ui.ts : goSub.textContent : 913` |
| Victory (win, init/live) | — | `VICTORY` | **THE LIGHT HOLDS** | `ui.ts : goHead : 352 / 911` |
| Victory announce | — | `announce('VICTORY!', …)` | **announce('REMEMBERED', …)** | `game.ts : 1600` |
| Daily mode name | `daily` | `DAILY` | **ECHO OF THE FALL** | `modes.ts : MODES[].name (daily, ~39)` |
| Daily mode desc | `daily` | `Today's seeded run — same for everyone.` | **One citizen's last memory of the fall — the same echo for everyone today.** | `modes.ts : MODES[].desc (daily, ~39)` |
| Daily HUD badge | `daily` | `◆ DAILY` | **◆ ECHO** | `ui.ts : dailyBadge : 202` |
| Daily title-list label | `daily` | `DAILY` | **ECHO OF THE FALL** | `ui.ts : mode-list literal : 735` |
| Daily caption | `daily` | `Daily Challenge · ${date}` | **Echo of the Fall · ${date}** | `ui.ts : 803` |
| Tagline | — | `thread death itself` | **remember the fall** | `ui.ts : title-tag : 243` |
| Wordmark | — | `LANCEFALL` | **LANCEFALL** (kept; tagline carries the soul) | `ui.ts : title-word : 242` |
| Ach `unleashed` desc | `unleashed` | "…OVERDRIVE…" | **Fire REMEMBER EVERYTHING.** | `achievements.ts : 53` |
| Ach `overcharged` desc | `overcharged` | "…OVERDRIVE…" | **Fire REMEMBER EVERYTHING at a full combo.** | `achievements.ts : 54` |
| Ach `daily` desc | `daily` | `Play a Daily Challenge.` | **Witness an Echo of the Fall.** | `achievements.ts : 43` |

> **CUT renames (do NOT touch):** all `HEAT_LEVELS[].name`/`.desc` + `describeHeat` "HEAT" literals (HEAT ladder stays), score→"MEMORY", the five non-hero ship names (`glaive/bastion/tempest/phantom/reaver`), all six `BIOMES[].name`, the dead `bossThemes.ts name` fields.

### 6.2 THE SIX dossiers (motive + epitaph) — `bestiary.ts : BESTIARY[].name/.blurb` (display-only; ids frozen)

| id (frozen) | new title | MOTIVE | EPITAPH | bestiary line |
|---|---|---|---|---|
| `warden` | **THE WARDEN · Keeper of the Gates** | Sworn to hold the gates, he barred them from the inside — duty curdled into contempt. | *"I only locked the doors you forgot to guard."* | 29 |
| `weaver` | **THE WEAVER · Spinner of the Lie** | Court chronicler who rewove the record until no one remembered the kingdom was worth saving. | *"I unspun every thread that held you."* | 30 |
| `beacon` | **THE BEACON · The Light That Lied** | Signal-keeper who let the call for aid go dark, so no help ever came. | *"I shone for everyone but you."* | 31 |
| `mirrorblade` | **THE MIRRORBLADE · Your Own Doubt** | Not a person — your doubt made flesh; it lunges as you do, in your own colour. | *"You were always going to falter. I'm the proof."* | 32 |
| `hollow` | **THE HOLLOW · What Grief Left** | The last mourner, emptied out by grief — untouchable until it remembers it was real. | *"There was nothing left in me to hold."* | 33 |
| `sovereign` | **THE SOVEREIGN · The Crown That Fell First** | The one who could have saved it and chose the crown instead; now warps gravity to stop you undoing it. | *"I was the kingdom. I chose to let it end."* | 34 |

> MIRRORBLADE renders in the player's chosen ship/trail colour — a render-time cosmetic palette read, never `world.rng`, and it does NOT restyle the swarm palette (preserves the colorblind swarm-readability invariant). Its `id`/`accent` data fields stay.

### 6.3 Framing renames (narrator-only; NO const renames)

- **REMEMBER EVERYTHING** = the renamed OVERDRIVE moment (above).
- **THE LIGHT DIMS** = the renamed death moment (above); the narrator's death bucket carries "the kingdom forgets a little more."
- **ECHO OF THE FALL** = the renamed Daily (above); the narrator/run-start surfaces one citizen vignette (§8.4).
- **DESCENT DEPTH** = narrator/flavor framing of the existing HEAT ladder. The HEAT const, `describeHeat`, and the UI "HEAT" literals are **unchanged**; the descent framing appears only in narrator lines (DEEP_DESCENT bucket) and the strata flavor. No id/const churn.
- **6 STRATA** = narrator/flavor framing of the existing biomes (COURT / EMBERWALL / LATTICE-VAULTS / BLOOMGARDENS / WARRENS / NULL). The `BIOMES[].name` consts are **unchanged**; the strata names appear only in the narrator's STRATA_ENTER bucket, keyed by `Game.biomeIndex` (game.ts:94). No id/const churn.

---

## 7. THE NARRATOR POOL — `src/narrator.ts` (pure, weighted, no-repeat)

**TRIMMED (feel review):** the dead world is mostly silent; restraint IS the soul. The full ~110-line draft is cut to a **~32-line spine**. **Removed buckets:** IDLE/LOW_COHERENCE entirely (a narrator that says "Move." is anti-soul; the visual collapse to gray IS the feedback), all "narrate-the-music" lines (the choir is *heard*, not captioned), all but one line per boss-approach/kill, the duplicate "city leans" lines, and the COMBO milestone spam (one line per tier, not five). Surfaces via `ui.toast()` (ambient) / `ui.announce()` (emphatic). **Screen-reader fix (a11y E):** the toast container gets `role="status" aria-live="polite"`; the announce container gets `role="alert"`/`aria-live="assertive"` (used sparingly) — this delivers the entire SOUL payload to SR users and surfaces coherence milestones non-visually via the HIGH/LOW lines that remain.

### The drafted line list (grouped by trigger — the kept ~32)

**RUN_START (pick from 2)** → announce
1. The city is gray. You remember it lit.
2. One lance. One descent. Begin.

**FIRST_KILL (1)** → toast
3. One. The dark notices.

**COMBO_X10 (1)** → announce
4. Ten. The streets begin to remember.

**COMBO_X25 (1)** → announce
5. Twenty-five. A whole street remembers.

**COMBO_X50 (1)** → announce
6. Fifty. The skyline burns awake.

**COMBO_X100 (1)** → announce
7. A hundred. Lancefall stands again.

**GRAZE_STREAK (1)** → toast
8. Inches. The city loves you for inches.

**TAKING_A_HIT (2)** → toast
9. The color drains. Get it back.
10. The city forgets a little. Remind it again.

**BOSS_APPROACH (1 per boss)** → announce
11. WARDEN: He held the walls, then chose the dark.
12. WEAVER: Find the true thread in all her lies.
13. BEACON: The light that lied still turns above.
14. MIRRORBLADE: It wears your colour. It is your doubt.
15. HOLLOW: Strike only when it remembers it's real.
16. SOVEREIGN: It could have saved everything. Make it answer.

**BOSS_KILL (1 per boss)** → announce
17. WARDEN: "I only locked the doors you forgot."
18. WEAVER: The threads fall slack. The story is yours now.
19. BEACON: The false light goes out for good.
20. MIRRORBLADE: Your doubt, face-down. You meant it more.
21. HOLLOW: You caught it in the one true moment.
22. SOVEREIGN: The crown is bare. You proved it could be saved.

**STRATA_ENTER (1 per stratum)** → toast
23. COURT: The throne-hall, gone gray. It started here.
24. EMBERWALL: The ramparts still burn at the breach.
25. LATTICE-VAULTS: The archives, locked. Everything sealed away.
26. BLOOMGARDENS: The royal gardens, gone to ruin and seed.
27. WARRENS: The undercity. Things hatch where light won't reach.
28. NULL: The edge of erasure. Memory runs out here.

**LAST_BREATH (1)** → announce
29. Not yet. The city isn't done with you.

**REMEMBER_EVERYTHING (1)** → announce
30. REMEMBER EVERYTHING.

**THE_LIGHT_DIMS / DEATH (2)** → announce
31. The light dims. The city forgets a little more.
32. Gray again. But you saw it lit.

**VICTORY (2)** → announce
33. The light holds. Lancefall remembers itself.
34. The crown is bare. The kingdom is yours to keep.

**DEEP_DESCENT (1, DEPTH framing)** → toast
35. Deeper. This is where the kingdom actually ended.

**HIGH_COHERENCE (1)** → toast (also serves the SR coherence-milestone surface)
36. The city remembers. Hold it here.

> (36 lines listed; "RUN_START pick from 2" + boss/strata sub-pools keep the spine flexible while staying ≪ the cut 110. If a phase wants 2 lines for COMBO tiers, add from the cut draft, but default ships these.)

### `narrator.ts` pure API

```ts
// src/narrator.ts — PURE weighted, no-immediate-repeat line picker. NO DOM. OWN rng.
import { createRng } from './rng';
export type Surface = 'toast' | 'announce';
export interface NarratorState { rng: ReturnType<typeof createRng>; last: Record<string, number>; cooldown: Record<string, number>; }
export function newNarrator(seed = 0x9e3779b1): NarratorState { return { rng: createRng(seed >>> 0), last: {}, cooldown: {} }; }
/** Pure pick: returns the chosen index for a bucket, never repeating the immediate-previous index. */
export function pickLine(n: NarratorState, bucket: string, poolLen: number): number {
  if (poolLen <= 1) return 0;
  let i = n.rng.int(0, poolLen);                  // OWN rng — never world.rng/dropRng/hsRng
  if (i === n.last[bucket]) i = (i + 1) % poolLen; // no immediate repeat
  n.last[bucket] = i; return i;
}
/** Pure cooldown gate for ambient (toast) buckets: returns true if allowed, and stamps. */
export function ambientReady(n: NarratorState, bucket: string, nowSec: number, gapSec: number): boolean {
  if ((n.cooldown[bucket] ?? -1e9) + gapSec > nowSec) return false;
  n.cooldown[bucket] = nowSec; return true;
}
```

The `Game` owns `private narrator = newNarrator();` and a thin `narrate(bucket: string, surface: Surface, pool: string[])` pass-through that calls `pickLine` then `ui.toast(...)`/`ui.announce(...)`. Triggers fire from `frame()` / event callbacks; sim-side milestones (combo-tier crossings, boss approach/kill, strata enter) are **latched as flags in `step()` and consumed in `frame()`** (never pick inside the substep — determinism H3). Ambient buckets (FIRST_KILL, GRAZE_STREAK, STRATA_ENTER, TAKING_A_HIT, DEEP_DESCENT, HIGH_COHERENCE) use `ambientReady` with a ≥6s gap so the narrator stays restrained (also prevents `aria-live` spam).

### `narrator.test.ts` — unit-test list (8 cases)

1. `pickLine never repeats the immediate previous index` (run 200 picks on a pool of 4 ⇒ no two consecutive equal).
2. `pickLine on pool length 1 returns 0` (no crash, no repeat logic).
3. `pickLine is deterministic for a fixed seed` (two `newNarrator(s)` ⇒ identical pick sequences).
4. `pickLine distributes across the pool` (over many picks every index appears).
5. `ambientReady gates within the gap` (second call inside gap ⇒ false; after gap ⇒ true).
6. `ambientReady stamps independently per bucket` (bucket A's cooldown doesn't gate bucket B).
7. `narrator uses its own rng` (a scripted `pickLine` sequence does not require/advance any external stream — asserted by isolation: module imports only `createRng`).
8. `purity` (no `Math.random`/Date/global mutation; same inputs ⇒ same outputs; calling never throws on empty/edge buckets).

---

## 8. THE STILLPOINT — hub, Fragments, THE CHOICE + NG+, ECHO, and the SINGLE v4→v5 bump

**SCOPE DECISION (feel review wanted the entire Stillpoint CUT; determinism/perf/a11y reviews approved it as safe IF gated).** The meta-layer is **deferred to Phase 5 and ships in a MINIMAL form**, behind the green gate, because none of it is visible in the GIF (the win condition). Phase 5 is the *only* phase that may touch save schema, and it ships the **smallest coherent slice**: the consolidated v4→v5 bump (so the data exists), the **ECHO vignette** (cheap, on-theme, daily), and **THE CHOICE** (one modal on Sovereign-kill, the single highest-payoff narrative beat). **Memory Fragments browser, the dossier/lore spend-economy, the frozen-Lance `hubMode` backdrop, and NG+ difficulty are SPEC'd here and gated behind OPEN DECISION #5** — they ship only if the director explicitly greenlights them after Phase 4. The save bump includes all fields regardless (one bump, never two), so a later greenlight needs no second migration.

### 8.1 Hub design (minimal)

The title screen is NOT rebuilt. The frozen-Lance backdrop is a **renderer-only `hubMode`** (mirrors `setBiomeTint`/`setCoherence`): when `state==='title'`, `renderer.setHubMode(true, { choice })` draws the existing skyline at a fixed coherence derived from `stillpointChoice` (gray rubble if `'none'`, lit neon City if `'catch'`, toppled-dark if `'fall'`) plus a single motionless ship-arrow (reusing `drawPlayer`'s arrow path) with a faint `bgT` hover bob (clamped off under `reduceMotion`). One new DOM node (`runStateLine` inserted after the tagline, ui.ts:299) shows pure reads of `save`: `NEMESIS · {bossName} ({n}×) · LONGEST COMBO · x{bestCombo} · DEEPEST DESCENT · wave {deepestWave}`. The hub backdrop runs through the SAME gated `drawSkyline` path (colorblind luminance ramp, reduceMotion no-drift, clarity binary). **`hubMode` ships only under OPEN DECISION #5.**

### 8.2 Memory Fragments (gated, OPEN DECISION #5)

Two rng-free earning channels evaluated at run-end from a plain `FragmentContext` (no rng): **Channel A** — one death-carry fragment per real death, chosen deterministically by progress count via a fixed `CARRY_FRAGMENTS` array (`nextCarryFragment(owned)` returns the first un-owned; the Nth death always yields the Nth fragment regardless of seed). **Channel B** — milestone fragments via pure predicates over run counters (`bossKills>=1`, `deepestWave>=10`, `bestComboRun>=25`, `sovereignDown`), pushed in `finishGameOver` exactly like `evalAchievements`. Fragments are a `string[]` set; a spend balance is `stillpointFragments.length - fragmentsSpent`. The MEMORIES browser (one nav button → a `buildCodex`-style panel) lets fragments unlock the six dossiers (`§6.2` text) + a lore catalog. All writes are plain array-pushes / counter mutations in `finishGameOver`/`playerDie` — never an `Rng` method (determinism M2).

### 8.3 THE CHOICE + NG+

**THE CHOICE (ships in Phase 5, the headline narrative beat).** On a true Sovereign-felling win (`w.sovereignDown`, set in `bossDeath` game.ts:1209) and `save.stillpointChoice==='none'`, `winRun()` (game.ts:1588) sets `pendingChoice`; after the victory cinematic, instead of going straight to `finishGameOver`, `ui.showChoice(cb)` presents a `.screen-dim` modal with two buttons. **CATCH THE STAR** (`stillpointChoice='catch'`) → win head **"THE LIGHT HOLDS"**, closing line *"You caught it. The light holds. The city remembers your name."*; the hub renders resolved (neon City, gold Lance). **LET IT FALL** (`stillpointChoice='fall'`) → win head **"THE LIGHT RELEASED"**, closing line *"You let it go. The fall completes — and is finally, mercifully over."*; the hub renders completed-fall (dark, toppled). The choice is cosmetic/personal — touches NO rng. Narration strings live in `stillpoint.ts` as pure display data.

**NG+ (gated, OPEN DECISION #5; determinism C2 fully closed).** NG+ difficulty rides the EXISTING deterministic Heat-cfg pipeline. **The gate is enforced at the `intensityMul` mutation site, not in prose, and discriminates on `seedKind === 'date'` (NOT `id==='daily'`)** — confirmed real: `intensityMul` is consumed at waves.ts:175 (`const I = intensity(this.t) * this.cfg.intensityMul`) and at game.ts:1517, both feeding the director that draws `world.rng` (game.ts:755). Effective cfg is built so `effCfg.intensityMul = (cfg.seedKind === 'date') ? cfg.intensityMul : cfg.intensityMul * ngPlusFactor` — so NG+ has **zero effect on any seeded run** and a given date-seed is bit-identical for all players regardless of their NG+ progress. NG+ adds zero new rng draws (it only reshapes the deterministic scalar for non-seeded modes). The narrator gains a loop-aware opener when `ngPlusActive && ngPlusLevel>=1`.

### 8.4 ECHO vignette (ships in Phase 5; determinism H4 closed)

`echoVignette(daySeed)` in `stillpoint.ts` allocates its OWN generator `createRng((daySeed ^ 0x5715e6c0) >>> 0)` — a mask distinct from `0x1f83d9ab`/`0x5bd1e995`/`0xc0ffee`, so it draws ZERO entropy from any sim stream. `daySeed = seedFromDate()` read as a plain value. It picks a citizen name + a one-line citizen sentence (pure display arrays) → deterministic per date, identical for everyone that day, never borrowing `world.rng`/`dropRng`. Surfaces in the daily caption (ui.ts:803) + a run-start `ui.announce` (non-blocking).

### 8.5 The SINGLE consolidated v4→v5 save-schema bump

- **`migrate.ts:12`** → `export const SAVE_VERSION = 5;` (the only constant to bump).
- **Transforms block (after migrate.ts:24)** → one comment, NO code: `// v4 → v5: added Stillpoint meta (fragments/lore/dossiers, fragmentsSpent, choice, ngPlusLevel/Active, nemesis, deepestWave). All purely additive → default-filled by the spread below; no explicit transform.`
- **migrate.ts:27 unchanged** → `return { ...base, ...data, version: SAVE_VERSION };` default-fills every new field from `defaultSave()`.
- **`save.ts` `SaveData` (after `handle`, line 53):** add the 9 fields with their types:
  ```ts
  stillpointFragments: string[];   // collected Memory Fragment ids (set; never a Set — JSON-safe)
  fragmentsSpent: number;          // count spent on lore/dossiers (available = length - spent)
  stillpointLore: string[];        // unlocked lore entry ids
  stillpointDossiers: string[];    // unlocked betrayer dossier ids (== boss EnemyKind)
  stillpointChoice: 'catch' | 'fall' | 'none';  // THE CHOICE on Sovereign kill
  ngPlusLevel: number;             // highest NG+ loop reached (mirrors maxHeat)
  ngPlusActive: boolean;           // NG+ queued for next run (mirrors selectedHeat split)
  nemesis: Record<string, number>; // killer-kind → death count (JSON-safe, like meta)
  deepestWave: number;             // deepest descent reached (hub run-state line)
  ```
- **`save.ts` `defaultSave()` (after `handle: ''`, line ~104):** add the 9 defaults:
  ```ts
  stillpointFragments: [], fragmentsSpent: 0, stillpointLore: [], stillpointDossiers: [],
  stillpointChoice: 'none', ngPlusLevel: 0, ngPlusActive: false, nemesis: {}, deepestWave: 0,
  ```
- **Determinism guarantees (enforce in Phase-5 review):** all sets are `string[]` (membership via `.includes`, never `Set`); `nemesis` is a `Record<string,number>` like `meta`; `stillpointChoice` is a string-literal union (`'none'` default mirrors `selectedArchetype:'none'`). Every v5 field is read-only into render/audio/UI; the only writes are plain assignments/array-pushes in `finishGameOver` (game.ts:1430–1481), `playerDie` (game.ts:1396–1428), and the unlock methods — none call any `Rng` method. `migrate.test.ts` gains a case asserting a v4 save round-trips to v5 with all 9 fields default-filled.

---

## 9. CUT LIST (hard cuts, restated + feel-review cuts)

**From the mission brief (protect the point of view):**
- NO full slingshot-tether dash rework (keep commit-on-release; only borrow Mirrorblade-as-you).
- NO ghost/duel/tournament/Worker-v2 social layer (the live Worker is untouched).
- NO new ship/enemy/boss/biome/perk/relic/mode (the body is over-served; the deficit is exclusively SOUL).
- NO authored rhythm mode / chart engine (on-beat is a REWARD layer over the procedural track, NEVER a gate).
- NO thermometer framing.

**From the design-conflict + determinism reviews:**
- **CUT Spec-A `coherence.ts`** (the `world.coherence` + in-`step()` event-accumulator design). Spec B (Game field, frame(), realDt) is the only owner.
- **CUT the beat-reward sprawl:** dash reach (all forms, incl. free-play true-len), the i-frame-grace top-up, the per-grade `BeatReward` bundle. The on-beat dash grants exactly ONE coherence kick. (Closes determinism C3 by elimination.)

**From the feel review (cut to protect the soul):**
- **CUT** the contracting beat-ring HUD from the critical path (demoted to opt-in, default off, OPEN DECISION #3).
- **CUT** telegraph quantization from the critical path (render-only throb is optional, tied to the same decision).
- **CUT** ~78 narrator lines (110 → ~32 spine); CUT the entire IDLE/LOW_COHERENCE bucket and all "narrate-the-music" lines.
- **CUT** HEAT→DEPTH, score→MEMORY, all five non-hero ship renames, all six biome renames (DEPTH/STRATA survive as narrator-only framing, no const churn).
- **DEFER + minimize** the Stillpoint meta-layer to Phase 5; ship only the v5 bump + ECHO vignette + THE CHOICE by default; Memory Fragments browser / dossier-lore economy / `hubMode` backdrop / NG+ ship only under OPEN DECISION #5.

**From the perf review:**
- **CUT** the 0.1s audio cadence (keep 0.4s). **CUT** per-tower `mixHex` string allocation (LUT + offscreen-cached bands). **CUT** any second `createRadialGradient` for the vignette (use `globalAlpha`). **CUT** any beat/coherence call to `burst/streaks/dust/graze/ring` inside `step()` (only `floatText` — closes determinism C1).
- **FLAGGED + designed:** GIF capture (perf review's scope hole) — see Phase 5 and OPEN DECISION #6.

---

## 10. PHASE-BY-PHASE BUILD + TEST SEQUENCE

Each phase ends **green + shippable** (vitest ≥230+new green, tsc clean, build clean, zero console errors, owner save restored). Adversarial review runs after Phases 2, 3, and 4. Commit order is one logical change per commit; branch off `main` (work happens on `master` per the repo, but non-trivial work uses a feature branch).

### PHASE 1 — Foundations: pure modules + tune blocks + plumbing (no behavior yet)
- **Scope:** land the pure `coherence.ts`, `beat.ts`, `narrator.ts` + their tests + the `COHERENCE`/`COHERENCE_AUDIO`/`BEAT` tune blocks. Add (unused) `Game` fields + `RenderOpts` union + `setCoherence`/`setQuality` setters + audio getters (`musicTime`/`musicRunning`/`clock`) + `musicEpoch`. No visible change.
- **Files touched:** `tune.ts`, `coherence.ts` (new), `coherence.test.ts` (new), `beat.ts` (new), `beat.test.ts` (new), `narrator.ts` (new), `narrator.test.ts` (new), `render.ts` (RenderOpts union + setters + fields, no draw), `audio.ts` (epoch + getters, no behavior), `game.ts` (fields + wiring stubs).
- **New tests:** `coherence.test.ts` (16), `beat.test.ts` (13), `narrator.test.ts` (8) = +37.
- **Commits:** (1) tune blocks; (2) coherence.ts + tests; (3) beat.ts + tests; (4) narrator.ts + tests; (5) RenderOpts union + setters; (6) audio getters + musicEpoch; (7) Game fields + frame() update of `this.coherence` (computed, not yet read by render/audio).
- **Review cadence:** none (foundational, fully unit-tested). Ends green + shippable (no visible change, all new tests pass).

### PHASE 2 — The audio bloom (lone drone → choir, sole drone ownership)
- **Scope:** `setCoherence(value, tier)` audio half; gut `setIntensity`'s drone/filter writes (keep `musicHeat`); choir voices + teardown; root transpose in `playStep`; `perfectDashSnare`. Wire the 0.4s throttle push at game.ts:637. The world begins to *sound* alive.
- **Files touched:** `audio.ts` (setCoherence, setChoir, perfectDashSnare, gut setIntensity drone writes, stopDrone teardown), `tune.ts` (already has COHERENCE_AUDIO), `game.ts` (throttle push + beat advance/reconcile + the §5.6 grade→`coherenceBeatKick`+snare in frame()).
- **New tests:** audio is not unit-tested (Web Audio), so add **guard/determinism unit tests** in a new `coherenceIntegration.test.ts`: assert `world.rng` draw-count is invariant whether `beat.synced` is true/false and whether grade is perfect/off (closes C1/H1 by test); assert `coherenceBeatKick` is the only beat writer. +3 cases.
- **Commits:** (1) gut setIntensity drone/filter writes; (2) setCoherence + setChoir + teardown; (3) playStep transpose; (4) perfectDashSnare; (5) game.ts beat advance/reconcile + grade kick + snare (frame(), out of step); (6) rng-invariance guard tests.
- **Review cadence:** **ADVERSARIAL REVIEW #1** (determinism focus: confirm no `world.rng` perturbation from beat/coherence; audio teardown no-leak; setIntensity no longer fights the bus). Ends green + shippable (audio blooms; no visuals yet).

### PHASE 3 — The render wash (gray → neon, the GIF)
- **Scope:** the global saturation post-pass + foreground neon city-glow band + offscreen-cached parallax skyline + auto-exposure + vignette-deepen + ink-trail brightening. Per-frame `setCoherence` render push at game.ts:664. `setQuality` wired into `adaptPerf` (game.ts:214/227) — the graceful-degradation fix. ALL a11y gates (the per-visual table) + `clarity` Settings field + `.clarity` doc-class + CSS block. **This phase produces the GIF.**
- **Files touched:** `render.ts` (present() wash + city-glow, drawSkyline offscreen cache + washLUT, drawBackground exposure, drawVignette globalAlpha deepen, drawPlayer/drawParticlesBelow trail multiply, initTowers, setQuality, all gate fields), `game.ts` (per-frame render push, setQuality in adaptPerf, clarity classList toggle, RenderOpts set), `save.ts` (Settings: add `clarity`), `ui.ts` (Clarity toggle row), `style.css` (`.clarity` block).
- **New tests:** render is canvas (not unit-tested); add a `washLUT`/`mixHex`/`clamp01` pure-helper test if extracted to a pure file (`render-helpers.test.ts`, +4). Manual GIF smoke is the acceptance test (the feel-review acceptance gate below).
- **Commits:** (1) pure render helpers (mixHex/clamp01/quantize) + tests; (2) setQuality wiring in adaptPerf; (3) offscreen skyline cache + washLUT; (4) global saturation wash + city-glow in present(); (5) exposure + vignette-deepen + trail brighten; (6) clarity Settings + doc-class + CSS + a11y gate wiring; (7) per-frame setCoherence push.
- **Review cadence:** **ADVERSARIAL REVIEW #2** (perf focus: frame budget under load, offscreen cache correctness, graceful degradation via setQuality; a11y focus: the per-visual gate table fully wired, clarityFloor enforced at the play-layer draw wrap, focusPulse gate in the actual expression). **Feel-review acceptance gate:** export a 6s GIF at coherence 0→1 with audio muted; if a stranger can't read "dead gray world coming alive," the wash failed — tune `satFloor`/`washGain`/`cityGlowGain` until it passes. Ends green + shippable (the GIF exists).

### PHASE 4 — The voice (re-narration + narrator wiring + SR)
- **Scope:** all §6 display renames (frozen ids), the six dossiers' bestiary text, the narrator `Game.narrate` pass-through + sim-event latching + trigger wiring + the ~32-line pools, `aria-live`/`role` on toast/announce containers (SR fix).
- **Files touched:** `ships.ts`, `ui.ts`, `game.ts` (renames + narrate pass-through + latched-flag triggers), `modes.ts`, `achievements.ts`, `bestiary.ts`, `narrator.ts` (pools as data), `ui.ts` (aria-live/role on the two containers).
- **New tests:** narrator pools are data; add a `narrator.test.ts` case asserting every bucket has ≥1 line and pools are non-empty (+1). Add an assertion that renames don't change any `id`/record-key (a `bestiary.test.ts`/`ships.test.ts` id-stability case, +2).
- **Commits:** (1) display renames (ships/ui/modes/achievements); (2) bestiary dossiers text; (3) narrator pools + Game.narrate; (4) sim-event latch flags + frame() triggers; (5) aria-live/role on toast+announce; (6) id-stability + pool tests.
- **Review cadence:** **ADVERSARIAL REVIEW #3** (determinism: narrator own-rng, triggers never in step(), no id changes; a11y: SR delivery of the SOUL payload). Ends green + shippable (the world now speaks, restrained).

### PHASE 5 — Meta + GIF capture (gated, save bump, the share)
- **Scope:** the single v4→v5 save bump (§8.5) + ECHO vignette + THE CHOICE modal (default ships). The GIF capture button + `MediaRecorder` pipeline (perf-safe). Memory Fragments browser / dossier-lore economy / `hubMode` / NG+ ship ONLY if OPEN DECISION #5 greenlit.
- **GIF capture (perf review scope hole, designed here):** a new `replay.ts` records the last ~6s via `canvas.captureStream(30)` + `MediaRecorder` (WebM/VP9), **post-run only** (debrief/victory screen), **never during the live loop**, downscaled (record from a reduced-DPR offscreen blit, not the 2880px backing store), aberration's 3× passes skipped during capture. A "SAVE REPLAY ⬇" button in the `.go-row` (ui.ts:360–368) triggers `onSaveReplay` → `URL.createObjectURL` + synthetic `<a download>` + toast. NO main-thread GIF encoder. (If a literal `.gif` is mandated, WebM→GIF conversion happens off-thread in a Worker, post-capture — OPEN DECISION #6.)
- **Files touched:** `migrate.ts`, `save.ts` (9 fields + defaults), `stillpoint.ts` (new: pure data + `echoVignette` own-rng + `nemesisOf` + `nextCarryFragment` + CHOICE narration), `stillpoint.test.ts` (new), `modes.ts`/`ui.ts`/`achievements.ts` (ECHO surfaces), `game.ts` (CHOICE trigger + nemesis/deepestWave writes + fragment earn if greenlit), `ui.ts` (showChoice modal + SAVE REPLAY button), `replay.ts` (new), `replay.test.ts` (new, pure ring-buffer logic).
- **New tests:** `stillpoint.test.ts` (echoVignette purity/determinism, nemesisOf, nextCarryFragment fixed-order, +8), `migrate.test.ts` v4→v5 round-trip (+1), `replay.test.ts` ring-buffer (+3). = +12.
- **Commits:** (1) v5 save bump + migrate test; (2) stillpoint.ts pure data + tests; (3) ECHO vignette surfaces; (4) THE CHOICE modal + trigger; (5) nemesis/deepestWave writes; (6) replay.ts + capture button; (7) [gated] Fragments/dossiers/hubMode/NG+ if greenlit.
- **Review cadence:** final green gate (all four review lenses spot-check). Ends green + shippable (the full game, the share button works).

---

## 11. OPEN DECISIONS FOR THE DIRECTOR (≤6; recommended default in **bold**)

1. **The hero-ship rename `LANCE → THE LAST LANCE`** — the only ship rename kept. Keep it as the single thematic nod, or leave `LANCE` untouched for zero churn? **DEFAULT: keep `THE LAST LANCE` (one nod, frozen id, trivial risk).**

2. **DESCENT / STRATA framing depth** — ship DEPTH/STRATA as narrator-only flavor (no const renames, HEAT/biome ids untouched), or go further and rename the HEAT ladder + biome display names too? **DEFAULT: narrator-only framing (the feel review's churn-vs-payoff argument wins; HEAT is a shipped, understood ladder).**

3. **The optional beat-ring HUD + visual-metronome + telegraph throb** — ship them as opt-in, off-by-default `Settings` flags (read-aids that teach timing), or cut them entirely so on-beat is felt only via the wash snap? **DEFAULT: cut from the critical path; ship the opt-in flags ONLY if Phase 3 review finds the wash-snap alone under-teaches the beat reward. Lean cut.**

4. **THE HUSH intensity** — how hard should LAST BREATH dim the world (`lastBreathDim`)? A strong dim sells the "time bends" gut-punch but is the strongest luminance transient (softened under a11y flags). **DEFAULT: `0.35` (strong but eased by `fallRate`, capped under reduceFlashing/reduceMotion, floored at `clarityFloor` on the play layer).**

5. **Stillpoint scope** — ship the full meta-layer (Memory Fragments browser + dossier/lore spend-economy + frozen-Lance `hubMode` backdrop + NG+ difficulty), or the minimal slice only (v5 bump + ECHO vignette + THE CHOICE)? The full layer is invisible in the GIF and the feel review wanted it cut entirely. **DEFAULT: minimal slice (ECHO + THE CHOICE). Greenlight Fragments/dossiers/hubMode/NG+ only if you want the meta-progression hook, after seeing Phase 4.**

6. **GIF capture format** — ship WebM/VP9 via `MediaRecorder` (off-thread, embeds on most platforms, zero main-thread cost), or require a true universal `.gif` (needs an off-thread WebM→GIF Worker conversion, more code, larger files)? **DEFAULT: WebM/VP9 (off-thread, perf-safe; most social platforms embed it). Add the GIF conversion Worker only if universal embedding is a hard requirement.**
