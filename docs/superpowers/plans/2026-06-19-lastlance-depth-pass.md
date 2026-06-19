# THE LAST LANCE — Depth Pass (post-jam) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the eleven gaps from the adversarial review — chiefly by adding a real *second combat verb* (PARRY), reworking bosses to escalate by *behavior* instead of HP, and structurally fixing the balance outliers (PERPETUAL infinite-dash, PHANTOM dominance, TEMPEST filler, trap perks).

**Architecture:** The codebase already separates pure sim helpers (`dash.ts`, `sovereign.ts`, `cipher.ts`, `combat.ts`) from the stateful loop (`game.ts`) and the FSM (`player.ts`, `boss.ts`). Every change here follows that seam: new *pure, tested* helpers + thin wiring into the existing per-frame loop. No new RNG draws in any gameplay path (Daily determinism is load-bearing — see Global Constraints).

**Tech Stack:** Vite + vanilla TypeScript, Canvas 2D, Web Audio, Vitest. All gameplay constants live in `src/tune.ts`.

## Global Constraints

- **Determinism is sacred.** No gameplay code may call `world.rng` outside the existing seeded paths. New mechanics (PARRY reward, refund cap, boss telegraphs) must be pure arithmetic / counters (the existing enemy "verbs" use `subPhase % N`, never `rng`). After ANY change, run the full suite and update golden values only in `combat.test.ts` / `waves.test.ts` / `determinism.test.ts` if they shift — the determinism *property* (same seed → bit-identical) must still hold.
- **Ships + tune are LOCKED for the Solstice jam submission.** Part 3 (tuning hit-list) and any `ships.ts`/`tune.ts` value change is **post-submission** — do not alter the locked jam build. Land Part 3 only after the jam window closes.
- **Shared working tree.** `src/ui.ts`, `src/render.ts`, `src/style.css` are co-edited by a card-agent. `git status` before editing; stage only your own hunks (content-filtered `git apply --cached`). The repo uses the **parent** directory's `.git`.
- **`ui.ts` (4217 lines) and `render.ts` (2591 lines) have ~zero test coverage.** Verify UI/visual wiring via the DEV-only `__lf` hook or Playwright, never by asserting it works.
- **Save compatibility.** `SAVE_VERSION` is 8. The new `parry` keybinding rides the existing `keymap` save field (`setKeymap` already falls back to defaults for missing actions), so **no version bump** is required — but `migrate.ts` per-field validation must tolerate the new action (it defaults today).
- **Test commands:** full suite `npm test`; single file `npx vitest run src/<file>.test.ts`.

---

## Part 0 — Priority roadmap (all eleven, ranked by fun-per-hour ÷ effort)

Ranked so a limited budget buys the most felt improvement. "Fun" = review impact; "Effort" = rough size.

| Rank | Review gap (component) | Fix headline | Fun | Effort | Part |
|------|------------------------|--------------|:---:|:------:|------|
| 1 | Combat is one verb (#1) + beat has no teeth (#6) | **PARRY** second verb; parry-on-beat is the beat's first real mechanical reward | ★★★★★ | M | Part 1 |
| 2 | Bosses bulk HP, don't escalate; Sovereign scope≠climax; Hollow is a wait (#3) | **Behavior-phase rework** — universal enrage, Sovereign spiral-telegraph + live-fire expose + true finale, Hollow echo-sync | ★★★★★ | M–L | Part 2 |
| 3 | PERPETUAL infinite-dash; PHANTOM dominance; TEMPEST filler; trap perks (#2) | **Tuning hit-list** — per-dash refund cap, PHANTOM/TEMPEST reshape, Afterimage/Slipstream buffs | ★★★★ | S–M | Part 3 |
| 4 | "Soul" is cosmetic (#6) | Parry-on-beat (Part 1) + a high-coherence *gameplay* perk (optional dash-cost shave at tier ≥5) gives coherence teeth | ★★★★ | S | Part 4.1 |
| 5 | Half the enemy roster are chasers (#3) | Consolidate 6 chasers → 4 with sharper verbs; promote the saved budget to elite variants | ★★★ | M | Part 4.2 |
| 6 | Modes are difficulty knobs (#4) | Give 2 procedural modes a *structural* rule (Nightmare: roaming safe-zones; Solstice: bullet-time cipher) | ★★★ | M | Part 4.3 |
| 7 | Onboarding cliff after the sandbox (#8) | A 3-beat "act two" teacher (coherence, graze, parry) surfaced on first real run | ★★★ | S | Part 4.4 |
| 8 | Social layer is manual paste-codes (#9) | URL-encoded build/duel links + a populated default board seed | ★★ | M | Part 4.5 |
| 9 | HUD clutter on high-coherence runs (#8) | "Minimal HUD" toggle (hide non-essential meters) | ★★ | S | Part 4.6 |
| 10 | Narrative is a museum (#7) | One contextual narrator line keyed to *this* boss/death cause | ★★ | S | Part 4.7 |
| 11 | Untested god-files (#11) | Extract `gameLoop.ts` + a happy-dom smoke harness for `game.ts` win/loss FSM | ★★ | L | Part 4.8 |

Parts 1–3 are the headline work and are specified to task depth below. Part 4 items are scoped but lighter (one task each) — promote to full TDD specs when you pick them up.

---

## Part 1 — The Second Verb: PARRY

**Why PARRY (and not a hook / counter-dash / heavy):** The review's core combat complaint is *one verb* (charge-dash) with passive graze, and a beat layer with *no mechanical teeth*. PARRY answers both with one mechanic:

- It is a **defensive decision distinct from the offensive dash.** Dash = spend 100 stamina, move, kill, i-frames only while travelling. Parry = stand your ground, *read one threat*, spend (almost) no stamina, but commit to a recovery window if you whiff. It is the right tool exactly where dashing is wrong: cornered in sudden-death walls, holding a weak-point, or out of stamina.
- It **does not grant blanket i-frames** (that's dash's job). A parry only nullifies the bullets actually inside its arc — so it never becomes a second "pass through everything" button. Dashing stays the mobility/escape tool; parry is the precise deflect.
- **Parry-on-the-beat is the beat's first real reward.** A beat-timed parry doubles the payout and grants the only on-beat *stamina* refund in the game — finally giving the "dash on the beat" pitch mechanical consequence (review #1, #6).

Alternative considered: a TETHER/HOOK reposition verb (more novel, but a new entity + physics, and purely offensive — doesn't fix the defensive-option gap or the beat). Parry is the higher fun-per-hour, lower-risk prototype. Ship parry first; a hook can be a later evolution.

**Design (prototype values — all land in a new `PARRY` block in `tune.ts`):**
- Input: right-mouse (currently unbound — `input.ts:117` only handles `button === 0`), key `k`, gamepad **B (button 1)**. Rebindable via the existing keymap.
- A short **active window** (`active: 0.12s`) where a wedge in front of aim (`reach: 70px`, `halfAngle: 0.62rad`) deflects hostile bullets.
- A **recovery** (`recover: 0.22s`) after the active window during which you cannot dash or parry — the whiff risk.
- A **cooldown** (`cooldown: 0.5s`) from parry start before the next parry.
- On deflect (≥1 bullet in arc): destroy those bullets, refund `stamina: 28`, add `combo: 2`, `overdrive: 0.05`, kick coherence. **On the beat** (reuse `gradeRelease`): ×2 the stamina/combo/overdrive and a full `perfectKick` coherence bump.
- Boss bullets: a parry may deflect at most `bossBudget: 2` boss bullets (mirrors Riposte's capped boss-shatter so it can't trivialise a pattern).

### File Structure (Part 1)

- Create `src/parry.ts` — pure helpers: arc geometry + reward math (TDD'd in isolation, like `dash.ts`).
- Create `src/parry.test.ts` — unit tests for the helpers.
- Modify `src/tune.ts` — add the `PARRY` constant block.
- Modify `src/types.ts` — add parry fields to `Player` and `parryPressed` to `InputState`.
- Modify `src/input.ts` — add `parry` to `KeyBindings`, the right-mouse + `k` + gamepad-B edges, and `parryPressed` in `poll()`.
- Modify `src/player.ts` — `updateParry()` state advance + entry gate (mirrors the dash gate).
- Modify `src/game.ts` — call the deflect sweep during the active window, award rewards, emit juice.
- Modify `src/render.ts` — draw the parry arc + the on-beat flash (a11y-gated, like the existing beat ring).

---

### Task 1.1: PARRY tune block + pure arc/reward helpers

**Files:**
- Create: `src/parry.ts`
- Create: `src/parry.test.ts`
- Modify: `src/tune.ts` (add `PARRY` after the `perfectThread` block, ~line 71)

**Interfaces:**
- Produces: `export const PARRY` (in tune.ts); `parryArcContains(px, py, aim, bx, by): boolean`; `parryReward(onBeat: boolean): { stamina: number; combo: number; overdrive: number }`; `parryDeflectsBoss(boundBudget: number, used: number): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// src/parry.test.ts
import { describe, it, expect } from 'vitest';
import { parryArcContains, parryReward } from './parry';
import { PARRY } from './tune';

describe('parry arc', () => {
  const px = 0, py = 0, aim = 0; // facing +x
  it('catches a bullet dead ahead within reach', () => {
    expect(parryArcContains(px, py, aim, PARRY.reach - 5, 0)).toBe(true);
  });
  it('misses a bullet behind the player', () => {
    expect(parryArcContains(px, py, aim, -(PARRY.reach - 5), 0)).toBe(false);
  });
  it('misses a bullet beyond reach', () => {
    expect(parryArcContains(px, py, aim, PARRY.reach + 40, 0)).toBe(false);
  });
  it('misses a bullet outside the half-angle', () => {
    const r = PARRY.reach - 10;
    const a = PARRY.halfAngle + 0.2;
    expect(parryArcContains(px, py, aim, Math.cos(a) * r, Math.sin(a) * r)).toBe(false);
  });
});

describe('parry reward', () => {
  it('on-beat doubles the off-beat payout', () => {
    const off = parryReward(false);
    const on = parryReward(true);
    expect(on.stamina).toBe(off.stamina * 2);
    expect(on.combo).toBe(off.combo * 2);
    expect(on.overdrive).toBeCloseTo(off.overdrive * 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/parry.test.ts`
Expected: FAIL — `Cannot find module './parry'`.

- [ ] **Step 3: Add the PARRY tune block**

In `src/tune.ts`, immediately after the `perfectThread: { ... },` block (closes ~line 71), add inside `TUNE`:

```ts
  // PARRY — the second verb. A short, aim-directed deflect arc. Catches the bullets
  // INSIDE the arc only (no blanket i-frames — that's dash's job). Whiffing commits
  // you to a recovery window. On-beat parries double the payout — the beat's teeth.
  parry: {
    active: 0.12,      // s the deflect arc is live
    recover: 0.22,     // s after the window: no dash/parry (the whiff risk)
    cooldown: 0.5,     // s from parry start before another parry
    reach: 70,         // px wedge length in front of aim
    halfAngle: 0.62,   // rad half-width of the wedge (~71°)
    staminaReward: 28, // refund per successful parry (off-beat)
    comboReward: 2,    // combo added per successful parry (off-beat)
    overdriveReward: 0.05, // overdrive meter per parry (off-beat)
    bossBudget: 2,     // max BOSS bullets one parry may deflect
  },
```

- [ ] **Step 4: Implement the helpers**

```ts
// src/parry.ts
// Pure PARRY geometry + reward math. No state, no RNG — unit-tested like dash.ts.
import { PARRY } from './tune';

/** True if a bullet at (bx,by) lies inside the parry wedge cast from (px,py) toward `aim`. */
export function parryArcContains(px: number, py: number, aim: number, bx: number, by: number): boolean {
  const dx = bx - px;
  const dy = by - py;
  const dist = Math.hypot(dx, dy);
  if (dist > PARRY.reach || dist < 1e-6) return dist <= PARRY.reach; // origin-coincident counts as in-arc
  const ang = Math.atan2(dy, dx);
  let d = ang - aim;
  d = Math.atan2(Math.sin(d), Math.cos(d)); // shortest signed delta
  return Math.abs(d) <= PARRY.halfAngle;
}

/** Reward for a successful parry; on-beat doubles every component. */
export function parryReward(onBeat: boolean): { stamina: number; combo: number; overdrive: number } {
  const m = onBeat ? 2 : 1;
  return {
    stamina: PARRY.staminaReward * m,
    combo: PARRY.comboReward * m,
    overdrive: PARRY.overdriveReward * m,
  };
}

/** Whether this parry may still deflect a boss bullet given a per-parry budget. */
export function parryDeflectsBoss(boundBudget: number, used: number): boolean {
  return used < Math.min(boundBudget, PARRY.bossBudget);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/parry.test.ts`
Expected: PASS (all 6).

- [ ] **Step 6: Commit**

```bash
git add src/parry.ts src/parry.test.ts src/tune.ts
git commit -m "feat(lancefall): PARRY verb — pure arc + reward helpers + tune block"
```

---

### Task 1.2: Input — bind PARRY (right-mouse / k / gamepad-B)

**Files:**
- Modify: `src/types.ts` (add `parryPressed: boolean` to `InputState`)
- Modify: `src/input.ts:14-26` (KeyBindings + defaults), `:60-72` (state init), `:80-128` (edges), `:177-244` (poll), `:266-275` (setKeymap)

**Interfaces:**
- Produces: `InputState.parryPressed`; `KeyBindings.parry: string[]` (default `['k']`).

- [ ] **Step 1: Add the field to `InputState`**

In `src/types.ts`, add to the `InputState` interface beside `overdrivePressed`:

```ts
  parryPressed: boolean;
```

- [ ] **Step 2: Extend KeyBindings + defaults (`input.ts`)**

```ts
// in KeyBindings interface (input.ts:14)
  parry: string[];
// in defaultKeyBindings() (input.ts:20)
    parry: ['k'],
```

- [ ] **Step 3: Add the edge latch + state field**

In `input.ts`, beside `overdriveEdge` (line 37) add `private parryEdge = false;`. In the `state` initializer (line 60) add `parryPressed: false,`. In the keydown handler (after line 86) add:

```ts
      if (this.keymap.parry.includes(k)) this.parryEdge = true; // PARRY second verb
```

In the right-mouse path — extend the existing `mousedown` listener (input.ts:117) to handle button 2:

```ts
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // free RMB for parry
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) { this.parryEdge = true; this.anyEdge = true; }
    });
```

- [ ] **Step 4: Emit `parryPressed` in `poll()` and clear it**

In `poll()` beside the overdrive line (input.ts:236):

```ts
    s.parryPressed = this.parryEdge;
```

beside the reset block (input.ts:239): `this.parryEdge = false;`. In gamepad poll (input.ts:329-345) add a B-button edge (index 1):

```ts
        if (i === 1) this.parryEdge = true; // gamepad B → PARRY
```

and return it from `pollGamepad()` (add `parryEdge` to the returned object + the `gp.parryEdge` plumb in `poll`, mirroring `overdriveEdge` exactly). In `setKeymap` (input.ts:270) add `parry: pick(km?.parry, d.parry),`. In `clearHeld()` add `this.parryEdge = false;`.

- [ ] **Step 5: Build check**

Run: `npx vitest run` (type-level — the suite imports `InputState`; a missing field fails compile)
Expected: PASS (no behavior change yet; field is wired but unused).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/input.ts
git commit -m "feat(lancefall): bind PARRY to RMB / k / gamepad-B (rebindable)"
```

---

### Task 1.3: Player FSM — parry state advance + entry gate

**Files:**
- Modify: `src/types.ts` (add `parryTime`, `parryCooldown`, `parryActive` to `Player`)
- Modify: `src/player.ts:13-27` (PlayerEvents), `:51-116` (update body)

**Interfaces:**
- Consumes: `InputState.parryPressed`, `PARRY` from tune.
- Produces: `Player.parryActive: boolean` (read by game.ts to run the deflect sweep), `PlayerEvents.parryFired: boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// add to src/dash.test.ts or a new src/parryState.test.ts
import { describe, it, expect } from 'vitest';
import { updatePlayer, resetEvents, type PlayerEvents } from './player';
import { PARRY } from './tune';
// (reuse the test's existing makePlayer/makeInput/makeStats helpers; if none, mirror dash.test.ts setup)

it('a parry press opens the active window then enters recovery', () => {
  const p = makeIdlePlayer();
  const ev: PlayerEvents = {} as PlayerEvents; resetEvents(ev);
  const input = makeInput({ parryPressed: true });
  updatePlayer(p, input, 0.016, makeStats(), 800, 600, ev);
  expect(ev.parryFired).toBe(true);
  expect(p.parryActive).toBe(true);
  // advance past the active window
  input.parryPressed = false;
  updatePlayer(p, input, PARRY.active, makeStats(), 800, 600, ev);
  expect(p.parryActive).toBe(false);
  expect(p.parryCooldown).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/parryState.test.ts`
Expected: FAIL — `parryFired`/`parryActive` undefined.

- [ ] **Step 3: Extend types + events**

In `types.ts` `Player`: add `parryTime: number; parryCooldown: number; parryActive: boolean;` (init them to 0/0/false wherever `Player` objects are constructed — grep `phase: 'idle'`). In `player.ts` `PlayerEvents` add `parryFired: boolean;` and reset it in `resetEvents`.

- [ ] **Step 4: Add the parry advance + gate**

At the top of `updatePlayer` (after the iframe decay, ~player.ts:49) advance the timers:

```ts
  if (p.parryCooldown > 0) p.parryCooldown = Math.max(0, p.parryCooldown - dt);
  if (p.parryTime > 0) {
    p.parryTime = Math.max(0, p.parryTime - dt);
    p.parryActive = p.parryTime > TUNE.parry.recover; // active during the leading window, recovery after
  } else {
    p.parryActive = false;
  }
  const inParryLock = p.parryTime > 0; // can't dash/charge during active+recovery
```

Gate the parry entry — only from idle/drift, not mid-charge/dash, and not during lock/cooldown. Add this branch *before* the dash-input block (player.ts:75), inside the `else` (non-dashing) path:

```ts
    if (input.parryPressed && p.phase !== 'charging' && !inParryLock && p.parryCooldown <= 0) {
      p.parryTime = TUNE.parry.active + TUNE.parry.recover;
      p.parryActive = true;
      p.parryCooldown = TUNE.parry.cooldown;
      ev.parryFired = true;
    }
```

Then guard the dash-input block so a parry-lock suppresses dashing: wrap the existing `if (input.dashTapped ...)` chain so it only runs `if (!inParryLock)`.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/parryState.test.ts && npx vitest run src/dash.test.ts`
Expected: PASS (dash tests unaffected — parry only gates when `parryPressed`).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/player.ts src/parryState.test.ts
git commit -m "feat(lancefall): PARRY player state — active/recovery window + dash lockout"
```

---

### Task 1.4: Wire the deflect sweep + rewards into the frame loop

**Files:**
- Modify: `src/game.ts` (the player-update + bullet-collision region; near the graze sweep ~`game.ts:2273-2358` and the dash-hit resolve)

**Interfaces:**
- Consumes: `p.parryActive`, `parryArcContains`, `parryReward`, `parryDeflectsBoss`, the existing `gradeRelease`/coherence-kick + combo/overdrive charge calls already used for graze/perfect-thread.

- [ ] **Step 1: Add the deflect sweep (manual verification — game.ts is untested)**

After the player update, when `p.parryActive`, iterate hostile bullets via the existing spatial-hash broad-phase (the same one the graze sweep uses) and for each bullet inside `parryArcContains(p.x, p.y, p.angle, b.x, b.y)`:
- skip boss bullets once `parryDeflectsBoss(stats.dashShatterBossBudget || TUNE.parry.bossBudget, bossDeflected)` is false;
- release the bullet (same call the Riposte shatter uses);
- count `deflected++`.

After the sweep, **once per parry** (latch on `ev.parryFired` or a `p.parryRewarded` flag) if `deflected > 0`:

```ts
const onBeat = this.beat.gradeRelease(/* same args as dash-on-beat */) !== 'off';
const rw = parryReward(onBeat);
p.stamina = Math.min(maxStamina(stats.staminaSegments), p.stamina + rw.stamina);
this.addCombo(rw.combo);            // reuse the combo-charge path
this.overdrive.charge(rw.overdrive); // reuse OVERDRIVE meter charge
this.coherenceBeatKick(onBeat ? 'perfect' : 'good'); // teeth: on-beat parry = perfect kick
// juice (a11y-gated, localized — mirror perfectThread): ring at p, small trauma, snare tick
```

- [ ] **Step 2: Verify in the dev build**

Run the dev server; in the browser console use the `__lf` hook to spawn bullets and confirm a parry in front of them deflects + refunds stamina, that whiffing locks dashing for ~0.22s, and that an on-beat parry doubles the combo gain. (game.ts has no unit harness — this is the verification per Global Constraints.)

- [ ] **Step 3: Confirm determinism is intact**

Run: `npx vitest run src/determinism.test.ts`
Expected: PASS — parry adds no `world.rng` draw, so a replay with no parry input is bit-identical.

- [ ] **Step 4: Commit**

```bash
git add src/game.ts
git commit -m "feat(lancefall): PARRY deflect sweep + on-beat reward wired into the loop"
```

---

### Task 1.5: Render the parry arc + on-beat flash

**Files:** Modify `src/render.ts` (player draw region) — **co-edited file, stage only your hunk.**

- [ ] **Step 1:** Draw, while `p.parryActive`, a thin neon wedge (reach `TUNE.parry.reach`, half-angle `TUNE.parry.halfAngle`) around `p.angle`, alpha ramping over the active window. On a successful on-beat parry, a brief localized ring (reuse the perfect-thread ring), **gated by `reduceFlashing`**.
- [ ] **Step 2:** Verify via Playwright screenshot or the `__lf` hook (render.ts is untested).
- [ ] **Step 3:** Commit `git commit -m "feat(lancefall): render PARRY arc + a11y-gated on-beat ring"`.

---

### Task 1.6: HEAVY LANCE — full-charge (100%) dash damage + bite-in (Approach B)

**What it is:** A *full 100% charge* (the entire 0.45s wind-up, held throttled to 55% move speed) arms a HEAVY dash: bonus damage **and** a "bite-in" so it sticks a boss/elite instead of overshooting. Charge still sets distance, so a heavy sweeps the full 560px through chaff (multi-kill) but clamps its end-point to the contact (+ a small follow-through) on the first boss/elite hit — decoupling burst from travel (the precision fix).

**Why 100% (not a threshold):** charge *clamps and pins* at 1.0 once held full (`player.ts:92`), so "full charge" is a stable, holdable state — a deliberate commitment, not a timing window. **This makes a crisp "charge ready" tell mandatory** (Step 4) — the player must see the instant the heavy arms.

**Files:**
- Modify: `src/tune.ts` (`dash` block ~line 23), `src/dash.ts`, `src/dash.test.ts`
- Modify: `src/types.ts` (`Player`: `dashHeavy: boolean`, `dashBitIn: boolean`)
- Modify: `src/player.ts:138-185` (`fireDash` arms the flag)
- Modify: `src/game.ts` (dash-hit damage site + bite-in on heavy boss/elite connect)
- Modify: `src/render.ts` (the 100% "charge ready" tell — co-edited; stage own hunk)

**Interfaces:**
- Produces: `isFullCharge(charge): boolean`; `biteInTarget(fromX, fromY, hitX, hitY, follow): { toX, toY }`; `Player.dashHeavy`, `Player.dashBitIn`; `TUNE.dash.heavyChargeMin/heavyDamageBonus/heavyBiteInFollow`.

- [ ] **Step 1: Write the failing test**

```ts
// src/dash.test.ts (add)
import { isFullCharge, biteInTarget } from './dash';
import { TUNE } from './tune';

describe('heavy lance (full charge only)', () => {
  it('arms ONLY at a full 100% charge', () => {
    expect(isFullCharge(1.0)).toBe(true);
    expect(isFullCharge(0.99)).toBe(false); // 99% is not heavy
    expect(isFullCharge(0.5)).toBe(false);
  });
  it('bite-in stops just past the contact, not at full dash length', () => {
    const r = biteInTarget(0, 0, 100, 0, TUNE.dash.heavyBiteInFollow);
    expect(r.toX).toBeCloseTo(100 + TUNE.dash.heavyBiteInFollow);
    expect(r.toY).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/dash.test.ts` → FAIL (`isFullCharge` undefined).

- [ ] **Step 3: Add tune fields + pure helpers**

In `tune.ts` `dash` block add:

```ts
    heavyChargeMin: 1.0,   // ONLY a full 100% charge arms the HEAVY LANCE bonus
    heavyDamageBonus: 1,   // additive dash damage on a full-charge heavy (modest — stacks with pierce/IMPALER)
    heavyBiteInFollow: 30, // px a heavy dash continues past a boss/elite contact, then stops (no arena overshoot)
```

In `dash.ts`:

```ts
/** True only for a full (100%) charge — the HEAVY LANCE arm condition. */
export function isFullCharge(charge: number): boolean {
  return charge >= TUNE.dash.heavyChargeMin - 1e-6;
}

/** Clamp a heavy dash's end point to just past a boss/elite contact so it bites in
 *  instead of overshooting the arena. Returns the new (toX,toY). */
export function biteInTarget(
  fromX: number, fromY: number, hitX: number, hitY: number, follow: number,
): { toX: number; toY: number } {
  const dx = hitX - fromX, dy = hitY - fromY;
  const d = Math.hypot(dx, dy) || 1;
  const stop = d + follow;
  return { toX: fromX + (dx / d) * stop, toY: fromY + (dy / d) * stop };
}
```

- [ ] **Step 4: Arm the flag + render the "ready" tell**

In `fireDash` (`player.ts`, before `p.charge = 0` at line 182): `p.dashHeavy = isFullCharge(p.charge); p.dashBitIn = false;` (add the two fields to `Player` init sites, defaulting false). In `render.ts`, while charging, when `p.charge >= TUNE.dash.heavyChargeMin - 1e-6` lock the spear to a heavy neon glow (and emit a one-shot audio tick at the crossing — wire via a `PlayerEvents`/game hook). **a11y:** the glow must remain legible under `reduceFlashing` (steady glow, not a strobe).

- [ ] **Step 5: Apply bonus damage + bite-in (game.ts — manual verify; untested file)**

At the dash-hit damage site, damage `= stats.dashDamage + (p.dashHeavy ? TUNE.dash.heavyDamageBonus : 0)`. On a heavy dash's FIRST boss/elite connect (`p.dashHeavy && !p.dashBitIn`): `const t = biteInTarget(p.dashFromX, p.dashFromY, e.x, e.y, TUNE.dash.heavyBiteInFollow);` set `p.dashToX/Y = t.toX/toY`, set `p.dashBitIn = true`, and recompute `p.dashDuration` so the lerp finishes at the new (closer) end-point within ~1–2 frames (a snappy stick). Verify in dev: a full-charge heavy multi-kills chaff at full length, but sticks a Warden/Sovereign-core instead of flying past; a 99% dash does normal damage.

- [ ] **Step 6: Determinism + watch-item**

`npx vitest run src/dash.test.ts src/determinism.test.ts` → PASS (pure arithmetic; no new rng). **Balance watch:** confirm a heavy + pierce×2 + IMPALER + Warden-rear×3 burst is a *deserved* high-skill payoff, not a one-shot — tune `heavyDamageBonus` down if it trivialises late bosses.

- [ ] **Step 7: Commit** `feat(lancefall): HEAVY LANCE — full-charge dash bonus damage + boss bite-in`

---

## Part 2 — Boss behavior-phase reworks

**The thesis:** Difficulty today is HP × speed (`boss.ts:65` HP ramp; `hpFrac < 0.34 → rate 0.8` is the only "phase change" for 5 of 6 bosses). The *one* boss that escalates by behavior — Mirrorblade's enrage (`boss.ts:349-405`: halves windup/recover, **chains a second lunge**) — is the review's favourite. Generalise that model, telegraph the untelegraphed, and turn the Sovereign's safe expose-window into a *trade*.

### File Structure (Part 2)

- Modify `src/tune.ts` — add `enrageFrac` + enraged-behavior fields to each boss block; add Sovereign `spiralTelegraph`, `exposeFireDense`, `finaleFrac`.
- Modify `src/boss.ts` — `updateWarden/Weaver/Beacon/Hollow/Sovereign` enraged branches; Sovereign spiral wind-up + live-fire expose + finale; Hollow echo-sync.
- Modify `src/sovereign.ts` — add `sovereignFinale(e): boolean` predicate (pure, tested).
- Modify `src/render.ts` — draw the spiral telegraph tracers + finale tint (co-edited; stage own hunks).

---

### Task 2.1: Sovereign — telegraph the NOVA SPIRAL (readability fix)

**Files:** Modify `src/tune.ts` (`SOVEREIGN` block ~line 919), `src/boss.ts:643-656`.

**Problem:** `boss.ts:645` sets `e.telegraph = 0` during the spiral — bullets appear with zero pre-fire warning, unlike the beams' 0.85s telegraph. The review flagged this exact inconsistency.

- [ ] **Step 1:** Add to `SOVEREIGN` in tune.ts: `spiralTelegraph: 0.6, // s of tracer wind-up before live spiral arms`.

- [ ] **Step 2:** In `updateSovereign`'s spiral branch (`boss.ts:643`), add a lead-in. On entering phase 1 (`boss.ts:628` sets `e.fireTimer = 0` for phase 1 — change to `e.fireTimer = SOVEREIGN.spiralTelegraph` and seed `e.subPhase = 0`). Then:

```ts
  } else {
    // NOVA SPIRAL — now telegraphs before it fires (subPhase 0 = wind-up, 1 = live)
    e.fireTimer -= dt;
    if (e.subPhase === 0) {
      e.telegraph = clamp(1 - e.fireTimer / SOVEREIGN.spiralTelegraph, 0, 1); // tracer ramp
      if (e.fireTimer <= 0) { e.subPhase = 1; e.fireTimer = 0; }
    } else {
      e.telegraph = 0;
      while (e.fireTimer <= 0) {
        const sp = SOVEREIGN.spiralSpeed;
        for (let i = 0; i < SOVEREIGN.spiralArms; i++) {
          const a = e.angle + (i / SOVEREIGN.spiralArms) * Math.PI * 2;
          world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, SOVEREIGN.color, true);
        }
        e.angle += SOVEREIGN.spiralSpin;
        e.fireTimer += SOVEREIGN.spiralEvery * rate;
      }
    }
  }
```

- [ ] **Step 3:** Render: during phase-1 `subPhase 0`, draw faint rotating tracer lines along the arm angles (render.ts, co-edited — stage own hunk).
- [ ] **Step 4:** `npx vitest run src/determinism.test.ts` — PASS (no new rng; bullet *spawn order* is unchanged, only delayed by a fixed wind-up). Update any boss-timing golden in `waves.test.ts` if present.
- [ ] **Step 5:** Commit `feat(lancefall): Sovereign NOVA SPIRAL telegraphs before it fires`.

---

### Task 2.2: Sovereign — EXPOSED becomes a live-fire trade, + a true finale

**Files:** Modify `src/sovereign.ts`, `src/sovereign.test.ts`, `src/tune.ts`, `src/boss.ts:596-657`.

**Problem:** Exposed (`boss.ts:596`) is a 5.5s safe window — the body fires only light aimed fans while you dash-spam it. No tension. And there is no "everything at once" climax (the review's central Sovereign complaint).

**Design:**
- Shorten `exposeDuration` 5.5 → 3.5 and make cores cheaper to break (so total kill-time is similar but there are *more* expose beats → more climaxes).
- During expose, fire a *denser desperation pattern* (a slow inward ring + the aimed fans) so you dodge **while** you punish.
- **Finale (HP < `finaleFrac` 0.25):** cores reform but the body **stays exposed**, and beams **and** spiral fire simultaneously at reduced density — the crescendo.

- [ ] **Step 1: Write the failing predicate test**

```ts
// src/sovereign.test.ts (add)
import { sovereignFinale } from './sovereign';
it('enters finale below the finale HP fraction', () => {
  const e: any = { kind: 'sovereign', hp: 6, maxHp: 30 };
  expect(sovereignFinale(e)).toBe(true);
  e.hp = 20;
  expect(sovereignFinale(e)).toBe(false);
});
```

- [ ] **Step 2:** Run `npx vitest run src/sovereign.test.ts` → FAIL (`sovereignFinale` undefined).

- [ ] **Step 3:** Add the pure predicate to `sovereign.ts` + tune fields:

```ts
// sovereign.ts
import { SOVEREIGN } from './tune';
export function sovereignFinale(e: Enemy): boolean {
  return e.kind === 'sovereign' && e.hp / e.maxHp < SOVEREIGN.finaleFrac;
}
```

```ts
// tune.ts SOVEREIGN: change exposeDuration 5.5 -> 3.5, coreWeakBonus 4 -> 5, add:
  finaleFrac: 0.25,        // below this HP frac: cores reform but body stays open; beams+spiral together
  exposeRingEvery: 0.9,    // s between desperation rings during EXPOSED
  exposeRingBullets: 18,
  exposeRingSpeed: 150,
```

- [ ] **Step 4:** In `updateSovereign` expose branch (`boss.ts:596`), add a desperation ring alongside the aimed fans:

```ts
    // desperation ring while exposed — you must dodge WHILE you punish
    e.spawnTime; // (already advanced)
    if ((e as any)._ringT === undefined) (e as any)._ringT = SOVEREIGN.exposeRingEvery;
    (e as any)._ringT -= dt;
    if ((e as any)._ringT <= 0) {
      (e as any)._ringT = SOVEREIGN.exposeRingEvery;
      const n = SOVEREIGN.exposeRingBullets, sp = SOVEREIGN.exposeRingSpeed;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + e.angle;
        world.spawnBullet(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 7, SOVEREIGN.coreColor, true);
      }
    }
```

(Prefer a real typed field on `Enemy` — e.g. `e.ringTimer` — over the `_ringT` cast; add it to `types.ts` for cleanliness.)

And on re-armor (`boss.ts:611`), if `sovereignFinale(e)` skip the re-armor: keep `e.phase = 2`, reset `e.timer = SOVEREIGN.exposeDuration`, and set a `world.sovereignFinale = true` flag the armored-phase fire code reads to *also* emit a thinned beam/spiral. (Gate the extra fire behind the flag so non-finale cycles are unchanged.)

- [ ] **Step 5:** Verify in dev build (`__lf` spawn Sovereign at low HP); confirm the expose window now requires dodging and the sub-25% phase reads as a climax. Run `npx vitest run src/sovereign.test.ts src/determinism.test.ts` → PASS.
- [ ] **Step 6:** Commit `feat(lancefall): Sovereign live-fire expose window + sub-25% finale crescendo`.

---

### Task 2.3: Universal boss enrage scaffold (behavior, not just rate)

**Files:** Modify `src/tune.ts` (add `enrageFrac` to WARDEN/WEAVER/BEACON/HOLLOW), `src/boss.ts` (each `update*`).

**Design — one real behavioral change per boss at `hpFrac < enrageFrac` (default 0.4):**
- **Warden:** enraged spiral fires from *two* rotating origins (double arms), and the fan phase adds a 3-bullet back-spray covering the rear arc for that volley — you must re-earn the flank. (`boss.ts:182-211`.)
- **Weaver:** enraged pulse rings spawn with **two** offset safe-gaps that drift toward each other (read two lanes). (`boss.ts:259-269`.)
- **Beacon:** enraged sweep adds a second beam at `+π` (a full counter-rotating diameter) — the beam the review praised, doubled. (`boss.ts:301-318`.)

- [ ] **Step 1:** Add `enrageFrac: 0.4` to the four tune blocks.
- [ ] **Step 2:** In each `update*`, compute `const enraged = e.hp / e.maxHp < <BOSS>.enrageFrac;` and branch the *pattern* (not just the existing `rate`). Keep the change deterministic — Weaver's second gap must be a fixed offset (e.g. `(gapStart + n/2) % n`), not a second `rng` draw.
- [ ] **Step 3:** Add focused tests where a pure seam exists (e.g. a `weaverGaps(gapStart, enraged)` helper returning the omitted indices) — extract the gap math so it's testable, mirroring how `beaconBeamActive` is a pure export.
- [ ] **Step 4:** `npx vitest run` full suite → PASS; verify each boss in dev at low HP.
- [ ] **Step 5:** Commit `feat(lancefall): bosses escalate by behavior at low HP (enrage, not just fire-rate)`.

---

### Task 2.4: Hollow — turn the 3.5s "wait for white" into a hunt

**Files:** Modify `src/boss.ts:428-496` (updateHollow), `src/tune.ts` (HOLLOW block).

**Problem:** The Hollow's only damage window is a predictable timer (`syncEvery`), and the body is intangible between. The player *waits*. (Review's "step backward" boss.)

**Design:** Make the sync window **player-driven** — killing an echo clone "destabilises" the Hollow, opening a short vulnerability window immediately. Keep a long fallback timer so a passive player still eventually gets a window, but reward active echo-hunting with faster, more frequent openings.

- [ ] **Step 1:** Add `HOLLOW.echoSyncWindow: 1.4` (s of vulnerability granted per echo kill) and lengthen the passive `syncEvery` so hunting is the *better* path.
- [ ] **Step 2:** Where echo deaths are resolved (grep `hollow_echo` in `game.ts`), when an echo dies and `world.boss?.kind === 'hollow'`, set the boss to phase 2 with `timer = HOLLOW.echoSyncWindow` (open the window now). The existing phase-2 path already makes it damageable.
- [ ] **Step 3:** Verify in dev: killing echoes opens windows on demand; a passive player still gets the slow fallback. Run `npx vitest run src/determinism.test.ts` (echo death already exists in the seeded stream — confirm no new draw).
- [ ] **Step 4:** Commit `feat(lancefall): Hollow vulnerability is earned by hunting echoes, not waiting`.

---

## Part 3 — Tuning hit-list (POST-JAM — ships/tune are locked for submission)

All values below are the **current** constants (verified in-repo) → **proposed**. Each is a small, determinism-safe change (pure arithmetic). Land as one commit per fix with the suite green.

### 3.1 — THE PERPETUAL infinite-dash loop (structural fix) ⬅ highest priority

**Root cause:** `killStaminaRefund` is **uncapped per dash**. `perks.ts:274` adds `+20 × siphon`; PERPETUAL evo adds `+20` (`evolutions.ts:86`); OVERCHARGE relic adds `+30` (`relics.ts:49`). Stacked: **90 stamina refunded per kill** vs a **115** dash cost (`100 × 1.15` Overcharge) → any dash that kills ≥2 is net-positive stamina → perpetual dashing + `timeThiefExtra` slow-mo overlap → near-permanent bullet-time. The v2.1 "curb" only shrank the numbers; the *structure* still overflows.

**Fix — cap refund per dash to one dash's worth.** A dash may refund at most what it cost (snowball preserved: a big chain refills *one* dash; it can never bank surplus). The `refundThisDash` field already exists and is reset at `player.ts:178` — enforce it as a ceiling.

- [ ] **Step 1: Write the failing test**

```ts
// src/perks.test.ts (add) — exercise the refund-cap helper
import { cappedKillRefund } from './dash';
it('per-dash refund never exceeds one dash cost', () => {
  const cost = 115;
  // three kills @ 90 each would be 270; capped to the dash cost
  let banked = 0, refundThisDash = 0;
  for (let k = 0; k < 3; k++) {
    const r = cappedKillRefund(90, refundThisDash, cost);
    banked += r; refundThisDash += r;
  }
  expect(banked).toBeCloseTo(cost); // refilled exactly one dash, not three
});
```

- [ ] **Step 2:** Run `npx vitest run src/perks.test.ts` → FAIL (`cappedKillRefund` undefined).

- [ ] **Step 3:** Add the pure helper to `dash.ts`:

```ts
/** Stamina a kill may refund, clamped so total per-dash refund never exceeds one
 *  dash cost — kills the PERPETUAL overflow while keeping the snowball (a chain can
 *  refill ONE dash, never bank surplus). `want` = the build's per-kill refund. */
export function cappedKillRefund(want: number, refundThisDash: number, dashCost: number): number {
  return Math.max(0, Math.min(want, dashCost - refundThisDash));
}
```

- [ ] **Step 4:** At the kill-refund site in `game.ts` (where `killStaminaRefund` is applied per dash-kill), route through `cappedKillRefund(stats.killStaminaRefund, p.refundThisDash, effectiveDashCost(...))` and accumulate `p.refundThisDash += refunded`.
- [ ] **Step 5:** `npx vitest run src/perks.test.ts src/determinism.test.ts` → PASS. Verify in dev that a Siphon×2 + PERPETUAL + Overcharge + PHANTOM build is *strong* but no longer perpetual.
- [ ] **Step 6:** Commit `fix(lancefall): cap per-dash stamina refund to one dash cost (kills the PERPETUAL loop)`.

### 3.2 — Ship outliers

| Ship | Current (`ships.ts`) | Problem | Proposed |
|------|----------------------|---------|----------|
| **PHANTOM** (4500) | `seg→1, regen+70, regenDelay×0.4, dashLen×1.6, hitbox+6, speed×1.18` | Dominant — fastest single-segment refill is the ideal PERPETUAL chassis | `regen+70 → +45`, `regenDelay ×0.4 → ×0.55`. Keep the `dashLen×1.6` identity. (Combined with 3.1, the loop closes.) |
| **TEMPEST** (2000) | `speed×1.2, accel×1.3, regen+18, dashLen×0.92` | Filler — no identity; a strict-worse PHANTOM in the mobility niche | Give it the **graze-flow** identity: add `s.grazeStaminaRefund *= 1.6; s.grazeRadius += 8;` keep speed/accel. Now it's the dedicated graze-tempo ship (pairs with the new PARRY), distinct from PHANTOM's raw dash. |
| **REAVER** (3500) | kill-refund engine, `grazeRefund×0.4`, `regen×0.65` | Narrow (forces Chain+Siphon) — *acceptable*, it's a high-skill archetype | Leave as-is; it's a constraint by design. Note only. |

- [ ] One commit per ship change; `npx vitest run src/ships.test.ts` after each.

### 3.3 — Trap perks

| Perk | Current (`perks.ts`) | Problem | Proposed |
|------|----------------------|---------|----------|
| **Afterimage** | `afterimageSec = 0.35 + 0.15(ai-1)` (0.35→0.50s), passive ghost only | Too weak; doesn't scale or synergize | Bump to `0.6 + 0.3(ai-1)` (0.6→0.9s) **and** let the ghost shatter chaff bullets in its radius (defensive value) — a reason to take it beyond trivial passive damage. |
| **Slipstream** | `comboWindowBonus += 0.6 × stacks` | Dead pick for kiting/solo-kill styles (only helps if already chaining) | Add a universal sliver: also `grazeComboBonus += 0.15 × stacks` so graze-flow builds get value too. Keeps it an INFERNO feeder while removing the dead-pick case. |
| **Shard Cache** | filler, pads short drafts (`perks.ts:352`) | Appears as a booby-prize when your archetype's perks are exhausted | Lower priority. Mitigate by offering a **diminished repeat** of a non-maxed perk before falling back to Shard Cache, so late drafts stay build-relevant. |

- [ ] One commit per perk; `npx vitest run src/perks.test.ts` after each.

---

## Part 4 — The remaining review items (scoped; one task each — promote to full TDD when picked up)

- [ ] **4.1 Coherence teeth (#6):** Part 1's parry-on-beat is the primary fix. Optionally add a high-coherence *gameplay* nudge: at combo tier ≥5, shave `dashCostMul` by ~10% (a tested pure modifier in `coherence.ts`), so flow state is mechanically felt, not just pretty. Keep it tiny + determinism-safe.
- [ ] **4.2 Enemy roster (#3):** Merge the 6 chasers (darter/mini/splitter/wisp/shade/bomber) → 4 with sharper verbs (e.g. fold Wisp into Splitter as a "swarm on death"); reinvest the spawn budget into more elite-Champion variety. Update `enemies.ts`, `waves.ts`, `bestiary.ts`, `tune.ts`.
- [ ] **4.3 Modes (#4):** Give two procedural modes a *structural* rule, not a multiplier — e.g. Nightmare gains roaming safe-zones (the only place regen works) and Solstice grants brief bullet-time on a correct cipher key. Lives in `modes.ts` ModeRules + a hook in `waves.ts`/`game.ts`.
- [ ] **4.4 Onboarding (#8):** A 3-beat "act two" teacher on the first *real* run (after the sandbox): one-line glosses for coherence, graze, and the new parry, surfaced on first sighting and persisted as seen in `save.ts` (so it survives a restart, unlike the session-only glosses).
- [ ] **4.5 Social (#9):** URL-encode build DNA + duel codes (`?build=…` / `?duel=…`) so a share is one clickable link, not a paste; seed the default leaderboard with a handful of dev ghosts so a fresh/offline board isn't empty. `buildDna.ts`, `ghost.ts`, `api.ts`, `ui.ts`.
- [ ] **4.6 HUD (#8):** A "Minimal HUD" settings toggle that hides non-essential meters (mutator badges, PB, beat-pip) during play; `save.ts` flag + `ui.ts` gate.
- [ ] **4.7 Narrative (#7):** One contextual narrator line keyed to the *actual* boss killed or death cause (read `world.boss?.kind` / death cause), so the fiction reacts at least once per run. `narrator.ts` + the kill/death sites in `game.ts`.
- [ ] **4.8 Craft (#11):** Extract `gameLoop.ts` (the fixed-timestep accumulator) out of `game.ts`, and add a happy-dom smoke harness asserting the win/loss FSM transitions (Arena victory, one-hit death → game-over). First slice of de-god-filing `game.ts`.

---

## Self-Review

**Spec coverage** — all eleven review components map to a task: #1 combat→Part 1; #2 progression→Part 3 + 3.3; #3 content→Part 2 + 4.2; #4 modes→4.3; #5 audio-arch→(strength, no fix); #6 coherence→Part 1 + 4.1; #7 narrative→4.7; #8 UX→4.4 + 4.6; #9 social→4.5; #10 accessibility→(strength; parry/boss juice stays a11y-gated); #11 craft→3.1 + 4.8. ✓

**Placeholder scan** — headline tasks (1.1, 2.1, 2.2, 3.1) carry real test code + exact constants + exact file:line targets. Part 4 items are deliberately one-task stubs (flagged "promote to full TDD"), not hidden placeholders. ✓

**Type consistency** — `parryArcContains`/`parryReward`/`parryDeflectsBoss` (parry.ts), `cappedKillRefund` (dash.ts), `sovereignFinale` (sovereign.ts), `Player.parryActive/parryTime/parryCooldown`, `InputState.parryPressed`, `KeyBindings.parry`, `PlayerEvents.parryFired`, `TUNE.parry.*`, `SOVEREIGN.finaleFrac/spiralTelegraph/exposeRing*` — names are used consistently across the tasks that produce and consume them. ✓

**Determinism** — every gameplay change is pure arithmetic or a fixed counter; Weaver's second gap and Sovereign's telegraph use fixed offsets, not new `rng` draws. ✓
