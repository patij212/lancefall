# HANDOFF — ONBOARDING "ACT TWO" (teach the now-rich game)

> The depth pass tripled the game's mechanical surface — **dash + parry (riposte/streak/hero) + heavy overcharge + graze + coherence teeth + 12 distinct enemy reads + boss mechanics** — but the teaching layer still stops after the **dash**. A new player is dropped off a cliff into a game they can't read. This builds the missing "act two": a progressive, contextual, *persisted* teacher that introduces the new depth one beat at a time. **Extend the two existing pure modules** — don't build a tutorial system from scratch.

---

## PROMPT (paste this to spawn the agent)

> Build the "act two" onboarding for THE LAST LANCE (lancefall) per the design in this doc. The game now has way more to teach than the dash, but `src/onboarding.ts` (a pure progressive-hint engine) and `src/sandbox.ts` (a pure no-fail dash drill) were never extended for it. EXTEND those two modules to teach, progressively and just-in-time: **PARRY** (the second verb — deflect + counter), **HEAVY** (hold past full charge — the overcharge thrust), the **COHERENCE / parry-&-dash-on-the-beat** connection, and a one-line **read hint** the first time each reworked enemy and each boss appears (Darter "don't dash at it", Splitter "parry to shatter", Bomber "don't greed the kill", Shade "wait for the strike", Brooder "kill the spawner", Wisp "weave & graze"; Warden flank, Sovereign cores, Hollow hunt-echoes, etc.). **Persist what's been taught** (a `taught` set in the save) so each hint fires ONCE EVER — fixing today's session-only glosses — and add a settings toggle to replay/disable hints.
>
> **Hard structural rule:** all "what to teach next" logic goes in the pure `src/onboarding.ts` (extend it — new triggers + hint entries + the persisted-taught check, TDD'd like it is now); the no-fail drill beats go in pure `src/sandbox.ts`; the persisted `taught` set is an ADDITIVE `save.ts` field (no version bump — the generic loader/`migrate.ts` tolerates it). DISPLAY reuses the EXISTING toast/gloss/center-callout UI — do NOT add a big tutorial system to `ui.ts` (4217 lines). The game-event TRIGGERS are thin hooks in `game.ts` (it already calls `hintFor`/the onboarding sequence).
>
> **Determinism is sacred:** onboarding is UI/cosmetic and must NEVER touch `world.rng` or perturb the seeded sim (`sandbox.ts` is explicitly rng-free — keep that discipline; the Daily must stay bit-identical). Hints are text (a11y: aria-live friendly, no flashing, respect `reduceMotion` like the sandbox already does). Verify with `npx tsc --noEmit` + `npx vitest run` (1101+ green, add pure onboarding tests) + a prod boot-smoke. Commit per stage with the Co-Authored-By trailer. When done, `npm run deploy` and confirm the live site boots.

---

## Why this matters most right now

After the depth pass, the review's "broad but shallow" critique is dead — but the depth is **invisible to a new player**. They get a 6-second dash drill, then face a game with three verbs, a rhythm/coherence layer, and twelve enemies that each demand a different read. Teaching that gap is the single highest-leverage thing for a first impression (and for a 10/10). The good news: the *patterns already exist* — you're filling them in, not inventing them.

## The curriculum (what to teach, when, how)

Built on the two existing patterns: a **no-fail drill** (sandbox) for the core verbs, then **contextual just-in-time hints** (onboarding) for everything else, each firing **once ever**.

### Stage 0 — Sandbox: add a PARRY beat (keep it ≤10s, no-fail)
`SANDBOX_STEPS` currently teaches charge → release → chain (dash). **Add a short PARRY beat** after the dash: a dummy fires ONE slow, telegraphed bullet; the step advances on a successful parry (or its time cap). Text: *"PARRY (right-click / K) to deflect — and counter."* Optionally a one-line HEAVY nudge at the end (*"Hold PAST full charge for a HEAVY thrust"*) — but keep HEAVY mostly contextual (Stage 1) so the sandbox stays tight. New trigger: `'parried'`. Stay pure + rng-free; keep the existing skip + reduce-motion auto-skip.

> **Owner decision (defaulting):** sandbox teaches **dash + parry**; HEAVY + all reads are contextual. Alternative = teach every verb in an expanded sandbox (more thorough, but a longer gate before the first real run). Defaulting to the tighter version — easy to expand.

### Stage 1 — Contextual verb hints (extend `ONBOARDING[]`)
Keep the current dash/combo/graze/decay/beat hints. Add new ordered, trigger-gated hints:
- **HEAVY** — trigger `'fullCharge'` (player holds to full for the first time): *"Keep holding PAST full for a HEAVY thrust — it phases through the pattern."*
- **PARRY in context** — trigger `'parryable'` (first incoming bullet the player could parry, if not already taught in the sandbox): reinforce the parry.
- **COHERENCE / on-beat** — trigger `'onBeatAction'` (first on-beat dash or parry): *"On the BEAT builds COHERENCE — the city wakes, and your guard widens. Chain on-beat parries for a streak."* (This is the "soul" teeth, now real — name it so the player feels the loop.)

### Stage 2 — Enemy reads (the gloss system, but PERSISTED)
First time each **reworked** enemy appears, a one-line read (fires once ever):
- **Darter:** *"Counter-lunges if you dash AT it — bait it, then punish."*
- **Splitter:** *"PARRY it to shatter it into combo fodder; a dash just clears it."*
- **Bomber:** *"It self-detonates — kill from range or dash THROUGH it."*
- **Shade:** *"Harmless until it strikes — read the flash, dash through."*
- **Brooder:** *"Hatches drones — kill the source fast."*
- **Wisp:** *"A swarm — weave through to graze, one dash sweeps them."*
(Keepers can get optional one-liners too — Orbiter "avoid the mine zone", Herald "find the lane", etc. — but the six reworked ones are the priority.)

### Stage 3 — Boss reads
First time each boss appears, a one-line mechanic hint: Warden *"flank its rear"*, Beacon *"dash the safe arc"*, Mirrorblade *"parry its lunge — the duel"*, Hollow *"kill echoes to expose it"*, Sovereign *"break the cores"*. Surfaced with the existing boss-incoming toast.

### Persistence + respect
- Add `taught: string[]` (or a `Record<string,true>`) to the save; each hint key (`'verb:parry'`, `'enemy:darter'`, `'boss:warden'`, …) fires only if not in the set, then is added. **This fixes today's session-only glosses** (a forgetful returning player currently never re-sees them, and a new session re-shows nothing).
- A **settings toggle**: "Tutorial hints" (default ON) + a "Replay tutorial" action that clears `taught` + `seenSandbox`. Experienced players turn it off; forgetful ones replay it.

## Structural mandate (where the work goes)

| New/changed | Where | Why |
|---|---|---|
| New triggers, hint entries, the persisted-taught gate (`shouldTeach(key, taught)` etc.) | **extend pure `src/onboarding.ts`** (TDD in `onboarding.test.ts`) | it's already the pure "what to teach next" engine — keep it pure + ordered + rng-free |
| The PARRY (and optional HEAVY) no-fail drill beat | **extend pure `src/sandbox.ts`** | mirrors the existing dash drill; pure, no rng, skippable |
| `taught` persisted set + the hints/replay settings | **`save.ts`** (additive field) + `settings` | additive → no SAVE_VERSION bump; confirm `migrate.ts` per-field validation tolerates it (defaults to []) |
| The TRIGGERS (first fullCharge / parryable / on-beat / first enemy-kind / first boss) | **thin hooks in `game.ts`** at the existing event sites | game.ts already drives `hintFor` + the onboarding sequence; add the new event taps, keep them ≤ a few lines each |
| DISPLAY (toast / gloss / center callout) | **reuse the EXISTING UI surfaces** | do NOT add a tutorial framework to `ui.ts` (4217); extend the existing hint/toast rendering |

**Do not** grow `ui.ts`/`render.ts`/`skins.ts`. The teaching is data (onboarding.ts) + thin event taps + the existing display.

## Current state you're extending
- **`src/onboarding.ts`**: `ONBOARDING[]` (4 contextual hints: start/dash/kill/comboBreak), `hintFor(step, trigger)`, `FIRST_DASH_PROMPT` (the big center callout), `BEAT_HINT_TEXT` + `beatTeachState(runs, capRing, capHint)` (first-few-runs beat-ring + dash-on-beat nudge). Pure, ordered, rng-free — extend in kind.
- **`src/sandbox.ts`**: `SANDBOX_STEPS` (charge/release/chain/done), `stepSandbox` (pure transition), `shouldShowSandbox(seenSandbox, reduceMotion)`, `dummyLayout()`. Explicitly **pure + NO rng** (the module comment stresses this — the seeded run's determinism is sacred). Add the parry beat here.
- **Glosses** (in `ui.ts`): one-line tooltips on first sighting, currently **session-only** (the bug you're fixing via persistence). Reuse the rendering; back it with the persisted `taught` set.
- The verbs to teach are real and shipped: PARRY (RMB/`k`/gamepad-B, with riposte + on-beat streak), HEAVY (hold past full — `isHeavyArmed`/`overcharge`), coherence (`coherence.ts`), and the 12 reworked enemies + boss mechanics (`src/enemies/*`, `src/bosses/*`, the new `render/enemyTells.ts`).

## Sequencing
- **Stage 0+1 first** (the verbs — sandbox parry beat + contextual PARRY/HEAVY/coherence hints + persistence): this is the core gap. Ship + playtest with a *fresh save* (clear `seenSandbox`/`taught`).
- **Stage 2+3** (enemy + boss reads): layer on once the verbs teach cleanly.

## Verification (every stage)
1. `npx tsc --noEmit` → clean.
2. `npx vitest run` → **1101+ green** (add pure tests for the new triggers / the taught-gate / the sandbox parry beat).
3. `npx vitest run src/determinism.test.ts` → green (proves onboarding never perturbs the seeded sim — the cardinal rule here).
4. Prod boot-smoke (`npx vite build && npx vite preview …`, 0 console errors). **Playtest from a FRESH save** (clear localStorage / `seenSandbox`+`taught`): walk the whole first-run as a new player and confirm each verb + enemy read is taught once, in order, non-intrusively, and that a second run doesn't re-teach.

## Definition of done
- A brand-new player is taught **parry + heavy + coherence** progressively (sandbox parry beat + contextual hints), not dropped off a cliff after the dash.
- Each reworked enemy + each boss gives a one-line read on first sighting; each teach fires **once ever** (persisted `taught`); a "replay hints" toggle exists.
- Logic lives in the pure `onboarding.ts`/`sandbox.ts` (tested); display reuses existing UI; `ui.ts`/`render.ts`/`skins.ts` don't grow; the save field is additive (no version bump).
- Determinism intact (no `world.rng` touched), a11y respected (text hints, reduceMotion honored, no flashing).
- tsc clean, full suite green, prod boots clean. Committed per stage, then `npm run deploy` and confirm `lancefall.pages.dev` boots.
