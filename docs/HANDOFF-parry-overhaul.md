# HANDOFF — PARRY OVERHAUL (make the second verb *sing*)

> The v1 parry shipped (commits `d56d9eb`…`cb9ec48`) and works, but playtest verdict: **underwhelming**. It only *subtracts* bullets, the reward is abstract, it borrows the graze sound, and it has no reason to exist next to the dash. This brief turns it into the game's **boss-breaker that turns fire into offense and rewards flow**. Design was brainstormed + owner-approved 2026-06-19; this doc is the spec.

---

## PROMPT (paste this to spawn the agent)

> Overhaul the PARRY verb in THE LAST LANCE (lancefall) per the design in this doc (`docs/HANDOFF-parry-overhaul.md`). v1 deflects bullets and pays an abstract reward — it feels flat. Make it a *skill move with teeth*: (1) a **riposte** — a successful parry deals a small counter-burst to enemies in its arc, so a parry KILLS (particles, combo, dopamine); (2) **chunky juice** — its own sharp metallic *ting* (brighter on-beat) replacing `audio.graze()`, a spark burst + flash + freeze-frame per deflect, a slow-mo flourish on the best ones, and a faint *fizzle* + cooldown on an empty whiff (a successful parry flows freely); (3) the **COHERENCE teeth as a loop** — on-beat parries build a streak multiplier AND feed coherence, and high coherence widens the arc toward a full circle + grows the radius (flow-state felt mechanically); (4) **make it matter vs bosses** — a boss-bullet parry SHORTENS the boss's armored phase so its EXPOSE window comes sooner (a posture-break), respecting the existing boss-bullet budget; (5) a **hero moment** — a parry that is BOTH perfect-frame AND on-beat triggers a mini radial bullet-clear + a coherence surge + a chord sting; (6) a dedicated **PARRY branch in the meta upgrade tree** whose capstone "Perfect Frame" opens/widens the frame-perfect timing window.
>
> **Hard structural rule (improve the codebase, don't bloat it):** ALL new parry math goes in the EXISTING pure `src/parry.ts` (TDD'd — streak, perfect-frame grading, coherence-arc scaling, riposte arc, whiff/cooldown decision as pure helpers). The `resolveParry` hook in `game.ts` stays thin (delegate to `parry.ts`). ALL new parry drawing extends the EXISTING `src/render/spear.ts` — add ZERO inline drawing to `render.ts`. New SFX = one small `audio.parry()` in `audio.ts`. The meta-branch nodes go in `meta.ts` following the existing node pattern; the tree UI in `panels/upgrades.ts`.
>
> Build in two phases (Phase 1 = feel + boss-matter; Phase 2 = coherence loop + meta-branch) — ship and playtest Phase 1 before Phase 2. Determinism is load-bearing: NO new `world.rng` draws (the riposte targets by geometry, the streak/grading are pure). Gate every flash/slow-mo behind `reduceFlashing`/`reduceMotion`. Keep the guardrails (below) so it never becomes a win-button. Verify each task with `npx tsc --noEmit` + `npx vitest run` (1026+ green) + a prod-build boot-smoke. Commit per task with the Co-Authored-By trailer. When done, `npm run deploy` and confirm the live site boots.

---

## Why (the diagnosis this fixes)

The v1 parry (`resolveParry`, game.ts) destroys bullets in the arc and pays +28 stamina / +2 combo / +0.05 overdrive, plays `audio.graze()` + a floatText. So: nothing dies, the reward is invisible, it whispers, and the dash (i-frames + kills + mobility) dominates it. The overhaul gives it a **kill payoff**, a **punchy identity**, a **flow loop**, and a **boss niche**.

## The design — four pillars

### Pillar 1 — Make it PUNCH (Phase 1)
- **Riposte (keystone):** on a SUCCESSFUL parry, deal a small counter-burst to enemies inside the parry arc (reach × halfAngle wedge). Use the existing damage path (like Nova/Chain radius damage → `damageEnemy`). Small numbers: enough to **kill chaff** (so they pop — particles, combo, dopamine) and **chip** elites/bosses. Target by GEOMETRY (enemies in the arc), not per-bullet source lookup — deterministic + feasible. This is the "punish the shooter" feel.
- **Distinct SFX:** add `audio.parry(onBeat)` — a short sharp metallic *ting*, brighter/higher on-beat. Replace the `audio.graze()` call in `resolveParry`.
- **Per-deflect juice:** a spark burst + a brief flash at each deflected bullet's position; a short **freeze-frame** (hitstop, reuse the juice-budget hitstop) on contact. a11y: flash gated by `reduceFlashing`.
- **Bullet shove:** un-parried bullets near the player get nudged outward a little on a successful parry (a defensive breathing-room push; small, deterministic).
- **Whiff = risk:** an EMPTY parry (deflected 0 bullets) plays a faint *fizzle* + imposes the `cooldown`. A SUCCESSFUL parry flows — little/no cooldown (so skilled parrying chains, spamming doesn't). Make `cooldown` apply on whiff, a much shorter `flowCooldown` on success.

### Pillar 2 — The COHERENCE teeth, as a LOOP (Phase 2)
- **Streak:** consecutive **on-beat** parries build a `parryStreak` multiplier (like combo) that scales the parry reward (stamina/combo/overdrive/riposte). A whiff or an off-beat parry resets/decays it.
- **Feeds coherence:** an on-beat parry also kicks coherence (it already calls `coherenceBeatKick` — make the kick scale with the streak).
- **Coherence widens the arc:** read the live coherence value in `parryArcContains`/the sweep — at high coherence, scale `reach` up and `halfAngle` toward `π` (a full circle at MAX coherence only). Flow-state literally makes you parry better → more on-beat parries → higher coherence. The self-reinforcing loop is the point.
- **Hero moment:** a parry that is BOTH **perfect-frame** AND **on-beat** = a mini radial **bullet-clear** (chaff bullets in a radius, like a small COMBO ERUPTION — reuse that code) + a coherence surge + a chord sting (audio). Gated behind both conditions so it's rare + earned. a11y: the clear flash + slow-mo gated.

### Pillar 3 — Make it MATTER vs bosses (Phase 1) — **owner decision: BREAK ITS GUARD**
- A successful parry of a **boss bullet** SHORTENS the boss's current **armored phase**, bringing its vulnerable **EXPOSE window sooner** (a posture-break — "deflecting its attacks wears down its guard"). Wire this into the boss phase timers (now in `src/bosses/*`): reduce the armored-phase `timer` by a small `bossGuardShave` per parried boss bullet.
- **Respect the existing `PARRY.bossBudget` cap** — one parry can only eat/shave from a bounded number of boss bullets, so you can't parry-spam a whole pattern into an instant expose.
- This is the parry's reason to exist: it's strongest exactly where the game is hardest.

### Pillar 4 — The PROGRESSION (Phase 2)
- **Two skill axes** (design refinement): **timing** (perfect-frame = caught in the first ~2–3 frames of the active window) and **rhythm** (on-beat). They're SEPARATE and both rewarded; nailing **both at once** is the apex (→ the hero moment). Add a pure `parryGrade(activeElapsed, onBeat)` → `'perfect'|'good'` × `onBeat` in `parry.ts`.
- **Meta branch:** a dedicated PARRY node cluster in `meta.ts` (e.g. *Wider Guard* = +arc, *Quick Recover* = −recovery, *Streak Memory* = +streak window, and the **"PERFECT FRAME"** capstone = opens/widens the perfect-frame window so timing-skill pays off). Follow the existing meta-node shape; surface in `panels/upgrades.ts` following the panel convention.

## Guardrails (bake these in — it must NOT become a win-button)
- Riposte damage stays SMALL (kills chaff; only chips elites/bosses — never a boss-melter).
- Full-circle arc only at **max** coherence (a rare flow reward, not the default stance).
- The hero bullet-clear is gated behind **perfect AND on-beat** (rare + earned), and clears only **chaff** bullets (not boss bullets).
- The `bossBudget` cap still bounds the boss-guard-shave per parry.
- **Determinism:** every new bit is pure / geometry / fixed math — NO new `world.rng` draws. Run `src/determinism.test.ts` after each task.
- **a11y:** all flashes/slow-mo gated by `reduceFlashing`/`reduceMotion`, mirroring the existing tells.

## Current state you're extending
- **`src/parry.ts`** (pure, tested): `parryArcContains`, `parryReward(onBeat)`, `parryDeflectsBoss`, `applyParryReward`, `parrySweep`. EXTEND this — add streak, `parryGrade`, coherence-arc scaling, riposte-arc, whiff/cooldown helpers, all TDD'd in `parry.test.ts`.
- **`game.ts` `resolveParry`** (~line 1741): the thin hook. It calls `parrySweep` + `applyParryReward` + `audio.graze()` + a floatText, latched by `p.parryRewarded`. Extend MINIMALLY — push logic into `parry.ts`; add the riposte/juice/boss-shave as thin calls.
- **`src/render/spear.ts`**: the parry-arc draw (already split out of render.ts). Extend it for the widened arc, spark burst, hero flash.
- **`tune.ts` `PARRY` block**: `active/recover/cooldown/reach/halfAngle/staminaReward/comboReward/overdriveReward/bossBudget`. Add `flowCooldown`, `perfectFrames`/`perfectWindow`, `streakMax`, `coherenceArcMax`, `bossGuardShave`, `riposteDamage`, `riposteRadius`, hero-clear radius.
- **On-beat** is graded via `gradeRelease(this.beat.beatError(), this.beat.synced, this.scheduler.timeScale)` (beat.ts) — already used in `resolveParry`. Coherence kicks via `coherence.ts` (`coherenceBeatKick/Flash`).
- **Player parry state**: `p.parryActive/parryTime/parryCooldown/parryRewarded` (player.ts). Add a `parryStreak` + the active-window elapsed for perfect-frame grading.
- **`src/bosses/*`**: the boss phase machines (timers you'll shave for the guard-break). `audio.ts`: add `parry()`. `meta.ts` + `panels/upgrades.ts`: the meta branch.

## Sequencing
- **Phase 1 (feel + boss-matter):** riposte counter-burst · distinct `audio.parry()` + spark/flash/freeze-frame · whiff fizzle + flow-vs-whiff cooldown · bullet shove · boss-guard-shave. **Ship + playtest this first** — it's where "underwhelming" dies.
- **Phase 2 (systems):** on-beat streak multiplier + coherence feed · coherence-widened arc · perfect-frame grading + the hero moment · the meta PARRY branch.

## Verification (every task)
1. `npx tsc --noEmit` → clean.
2. `npx vitest run` → **1026+ green** (your new `parry.test.ts` cases add to it).
3. `npx vitest run src/determinism.test.ts` → green (proves no rng drift).
4. Prod boot-smoke: `npx vite build && npx vite preview --port 4182 --strictPort`, load it, **0 console errors** (the only allowed error is the CSP-blocked Cloudflare beacon). Feel is verified in dev via the `__lf` hook / Playwright.

## Definition of done
- A parry KILLS (riposte), PUNCHES (ting + spark + freeze-frame), and FLOWS (whiff-only cooldown).
- On-beat parries build a streak + feed coherence; high coherence visibly widens the arc; a perfect+on-beat parry fires the hero bullet-clear.
- A boss-bullet parry measurably brings the expose window sooner (capped).
- A PARRY branch exists in the meta tree with a Perfect-Frame capstone.
- `parry.ts` holds the logic (pure, tested); `game.ts`/`render.ts` stay thin (drawing in `render/spear.ts`); tsc clean; full suite green; prod boots clean.
- Committed per task, then `npm run deploy` and confirm `lancefall.pages.dev` boots.
