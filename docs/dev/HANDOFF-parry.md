# HANDOFF — PARRY (the second combat verb)

> Self-contained brief for the next agent. Read top-to-bottom once, then work task-by-task.
> Full mechanical spec lives in **`docs/superpowers/plans/2026-06-19-lastlance-depth-pass.md` → Part 1 (Tasks 1.1–1.5)**. This handoff adds the *structural* mandate and current-state context the plan predates.

---

## PROMPT (paste this to spawn the agent)

> Implement **PARRY**, the second combat verb for THE LAST LANCE (lancefall), per the spec in `docs/superpowers/plans/2026-06-19-lastlance-depth-pass.md` Part 1. A parry is a short, aim-directed deflect arc: it destroys only the bullets *inside* the arc (no blanket i-frames — that's the dash's job), whiffing commits you to a recovery window, and a **parry landed on the musical beat doubles the payout** — this is the mechanic that finally gives the COHERENCE/beat layer real teeth. Bind it to right-mouse (currently unbound), `k`, and gamepad-B.
>
> **Hard structural rule (the point of this task is to improve the codebase, not bloat it):** put ALL parry logic in a NEW pure module `src/parry.ts` (TDD'd like `dash.ts`). Do NOT add more than ~15 net lines to `game.ts`, and add ZERO inline drawing to the 2591-line `render.ts` — instead **start a `src/render/` split**: extract the spear/charge/parry drawing into `src/render/spear.ts` and call it from `render.ts`. While you're in the bullet-destruction code, DRY the three copies (Riposte shatter, Afterimage ghost-shatter, your new parry deflect) into one shared helper. Leave every file you touch smaller or no larger than you found it.
>
> Work on branch `v6` directly (the other agent is done). TDD every pure helper, keep determinism (no new `world.rng` draws), gate all juice behind `reduceFlashing`/`reduceMotion`. Verify with `npx tsc --noEmit` + `npx vitest run` (~983 tests must stay green) + a prod-build boot-smoke (`npx vite build` then `vite preview` + load it — the minified build can crash boot even when dev is green). Commit per task with descriptive messages ending in the Co-Authored-By trailer. When done, `npm run deploy` and confirm the live site boots.

---

## Mission

Combat today is effectively **one verb** (charge→dash, now with the HEAVY LANCE overcharge layer). PARRY adds a real *defensive decision* AND fixes the "cosmetic soul" critique in one move:

- **Dash** = spend stamina, move, kill, i-frames only while travelling.
- **Parry** = stand your ground, read ONE threat, near-zero stamina, but commit to a recovery window if you whiff. It deflects only the bullets inside its arc (never blanket i-frames), so it never becomes a second "pass through everything" button.
- **Parry-on-the-beat doubles the reward** — the only on-beat *stamina/combo* payout in the game. This is the teeth the "dash on the beat / with a soul" pitch is missing.

Values (start here, tune by feel — all live in a `PARRY` block in `tune.ts`): active `0.12s`, recovery `0.22s`, cooldown `0.5s`, reach `70px`, halfAngle `0.62rad`, stamina reward `28`, combo `2`, overdrive `0.05`, boss-bullet budget `2`. On-beat ×2.

---

## THE STRUCTURAL MANDATE (read this twice)

The owner's explicit instruction: **do not grow the already-huge files; improve the structure through this work, with minimal effort.** The huge files are `skins.ts` (5048), `ui.ts` (4217), `game.ts` (3040), `render.ts` (2591). "Minimal effort" means **opportunistic extraction scoped to what you touch** — NOT a separate refactor crusade.

Concretely, for PARRY:

| New/changed code | Where it goes | Why |
|---|---|---|
| Parry arc geometry, reward math, state advance | **NEW `src/parry.ts`** (pure, TDD'd) | mirrors `dash.ts`/`combat.ts`/`sovereign.ts` — the established pure-helper convention |
| The deflect sweep + reward wiring | `game.ts` — **thin hook only (~10–15 lines)** calling `parry.ts` | the orchestrator stays an orchestrator |
| Bullet destruction in a region | **DRY into one helper** (`collision.ts` or a new `bulletSweep.ts`) shared by Riposte + Afterimage-ghost + Parry | there are already TWO copies of this loop in `game.ts`; make it one and game.ts SHRINKS |
| The parry arc + the existing charge/heavy-tell drawing | **NEW `src/render/spear.ts`** (`drawSpear(ctx, player, stats, opts)`), called from `render.ts` | **start the `render.ts` de-god-file** — this is the structural win |
| Player parry timers (`parryTime`, `parryCooldown`, `parryActive`) | `player.ts` (it's only ~210 lines — fine) or `parry.ts` advance fn | keep `player.ts` the FSM |
| Input binding | `input.ts` (`parry: ['k']` + RMB `button===2` + gamepad B `button 1`) + `InputState.parryPressed` | follows the existing `KeyBindings`/edge pattern |

**Net effect to aim for:** `game.ts` ends roughly the same size or smaller (the bullet-sweep DRY pays for the parry hook), and `render.ts` ends *smaller* (spear drawing extracted to `render/spear.ts`). That is the bar.

---

## Current state you're building on (post-HEAVY-LANCE)

- **`player.ts`** (~210 lines): the charge→dash FSM. `fireDash` now sets `p.dashHeavy = isHeavyArmed(p.overcharge)` and adds `heavyIframeBonus`. The charging branch accumulates `p.overcharge` past full charge. Add the parry entry-gate beside the dash gate (parry only from idle/drift, not mid-charge/dash, not during cooldown).
- **`game.ts`** (~3040): `resolveDashHits` (dash damage), `resolveGhostHits` (Afterimage + **chaff-bullet shatter** — a working example of "destroy bullets in a region"), the Riposte shatter (`w.stats.dashShatterRadius` block — the OTHER copy), the graze sweep. Bullets: `w.bullets.forEachActive(b => …)`, `w.bullets.release(b)`. Geometry: `segCircleHit`/`circleHit` from `collision.ts`. The spatial hash: `w.hash.queryAABB`.
- **`beat.ts`**: `BeatClock` + `gradeRelease(...)` returns `'perfect'|'good'|'off'` — reuse this for the on-beat parry check (same call the dash-on-beat uses). The coherence kick lives in `game.ts` (`coherenceBeatKick`). **Wire parry-on-beat to grant the ×2 reward + a `perfect` coherence kick — this is the headline.**
- **`input.ts`**: `KeyBindings { dash, overdrive, pause }`. RMB is **unbound** (`mousedown` only handles `button === 0`); gamepad B (`button 1`) is free. `InputState` is the per-frame snapshot.
- **`dash.ts`**: the pure-helper template (`chargeToLen`, `effectiveDashCost`, `cappedRefund`, `isHeavyArmed`) — copy its shape for `parry.ts`.

---

## Conventions (non-negotiable)

- **TDD** every pure helper (`parry.test.ts`): write the failing test, see it fail, implement, see it pass. The pure parts (arc-contains, reward math, state advance) are all unit-testable — `game.ts`/`render.ts` integration is verified by playtest + the boot-smoke.
- **Determinism is load-bearing** (seeded Daily mode). NO new `world.rng` draws in any gameplay path. The parry reward is pure arithmetic + the beat clock (real-time, already determinism-safe). Run `src/determinism.test.ts` after.
- **a11y**: the parry arc + on-beat flash must be **steady glows gated by `reduceFlashing`** (never a strobe), mirror the existing heavy-charge tell. Localized ring, not a frame-wide flash.
- **`ui.ts` is CRLF** — if you touch it, use Edit/sed (gawk mangles the CR). You shouldn't need to touch `ui.ts` for parry except maybe a keybind label in settings.
- **Commits**: one per task (1.1 helpers, 1.2 input, 1.3 player state, 1.4 deflect+reward, 1.5 render). Descriptive messages, end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Verification workflow (every task)

1. `npx tsc --noEmit` → clean.
2. `npx vitest run` → **983+ green** (your new `parry.test.ts` adds to it).
3. `npx vitest run src/determinism.test.ts` → still green (proves no rng drift).
4. For the integration (game.ts/render.ts — untested layers): `npx vite build && npx vite preview --port 4180 --strictPort`, then load `http://localhost:4180/` and check **0 console errors** (the minified build has crashed boot before while dev+tests were green — a rolldown re-export-alias bug; this smoke catches it). UI/feel is verified via the DEV-only `__lf` hook or Playwright.

## Definition of done

- Parry works: RMB/k/B fires it; bullets in the arc are deflected; whiff → recovery lockout; **on-beat parry visibly doubles the payout**.
- `parry.ts` is pure + fully unit-tested; `game.ts` net growth ≤ ~15 lines; the bullet-sweep DRY landed; **`render/spear.ts` created and `render.ts` is smaller**.
- tsc clean, full suite green, prod build boots clean.
- Committed per task, then `npm run deploy` and confirm `lancefall.pages.dev` boots.
