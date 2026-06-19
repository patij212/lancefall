# HANDOFF — Boss behavior-phase reworks (escalate by behavior, not HP)

> Self-contained brief for the next agent. Read top-to-bottom once, then work task-by-task.
> Full mechanical spec lives in **`docs/superpowers/plans/2026-06-19-lastlance-depth-pass.md` → Part 2 (Tasks 2.1–2.4)**. This handoff adds the *structural* mandate and current-state context.

---

## PROMPT (paste this to spawn the agent)

> Rework the bosses in THE LAST LANCE (lancefall) so they **escalate by behavior, not by HP**, per the spec in `docs/superpowers/plans/2026-06-19-lastlance-depth-pass.md` Part 2. Today every boss except Mirrorblade just bulks HP and nudges its fire rate; Mirrorblade (which truly enrages — halves its timing and chains a second lunge) is the model to generalize. Deliver: (2.1) the Sovereign NOVA SPIRAL **telegraphs** before it fires — it currently appears with zero warning; (2.2) the Sovereign EXPOSED window becomes a **live-fire trade** (dodge while you punish) plus a **sub-25% HP "everything at once" finale** — the climax it lacks; (2.3) a **universal low-HP enrage** that changes *behavior* (Beacon gains a second counter-rotating beam, Weaver two closing gaps, Warden's fan covers its own rear weak-point); (2.4) the **Hollow** becomes vulnerable by **hunting its echoes** instead of a predictable 3.5s "wait for white."
>
> **Hard structural rule (improve the codebase through this work, don't bloat it):** `boss.ts` (657 lines) holds every per-boss `update*` inline. As you rework each boss, **extract it into `src/bosses/<name>.ts`** following the EXISTING `src/sovereign.ts` precedent (pure pattern-math helpers + the stateful update), so `boss.ts` shrinks to a thin spawn+dispatch file. Put ALL new telegraph/finale **drawing** in a NEW `src/render/boss.ts` — add ZERO inline drawing to the 2591-line `render.ts`. Pure pattern math (telegraph progress, enrage gap indices, the finale predicate) must be unit-tested like `sovereign.ts`.
>
> Work on branch `v6` directly. Determinism is load-bearing: enrage gaps/telegraphs use FIXED offsets or `subPhase % N` counters, NEVER new `world.rng` draws. Verify with `npx tsc --noEmit` + `npx vitest run` (~983 green) + a prod-build boot-smoke. Commit per boss with descriptive messages ending in the Co-Authored-By trailer. When done, `npm run deploy` and confirm the live site boots.

---

## Mission

The content review's lowest marks were for bosses that *bulk HP instead of escalating*, a Sovereign whose scope outruns its challenge, and a Hollow that's a 3.5s wait. The throughline fix: **steal the one boss that works.** Mirrorblade (`updateMirrorblade`) genuinely enrages below 50% HP — it halves windup/recover and chains a second lunge. Generalize that model; telegraph the untelegraphed; make the Sovereign's safe expose-window a tense trade with a real finale.

The four deliverables (full numbers in the plan, Part 2):
- **2.1 Sovereign spiral telegraph** — `boss.ts updateSovereign` sets `e.telegraph = 0` during the NOVA SPIRAL, so bullets appear with no warning (unlike the beams' 0.85s telegraph). Add a ~0.6s tracer wind-up.
- **2.2 Sovereign live-fire expose + finale** — the EXPOSED phase currently fires only light fans while you free-chew it for 5.5s. Make it fire a desperation pattern (dodge while you punish), shorten the window but cheapen the cores (more climax beats), and add a **sub-25% HP finale** where cores reform but the body stays open and beams+spiral fire together.
- **2.3 Universal enrage** — add `enrageFrac` to WARDEN/WEAVER/BEACON/HOLLOW; below it, change the *pattern*, not just the rate. Beacon: a second beam at +π. Weaver: two offset gaps that drift together. Warden: the fan adds a back-spray covering its rear weak-point.
- **2.4 Hollow echo-hunt** — killing an echo clone destabilises the Hollow and opens a vulnerability window *now*; keep a long passive fallback so a passive player still gets one, but reward active hunting. Converts dead waiting into a hunt.

---

## THE STRUCTURAL MANDATE (read this twice)

The owner's explicit instruction: **do not grow the already-huge files; improve the structure through this work, with minimal effort.** Huge files: `skins.ts` (5048), `ui.ts` (4217), `game.ts` (3040), `render.ts` (2591). `boss.ts` (657) isn't huge yet but these reworks will grow it — pre-empt that by splitting. "Minimal effort" = **opportunistic extraction scoped to the boss you're touching**, NOT a big-bang refactor.

| New/changed code | Where it goes | Why |
|---|---|---|
| Each reworked boss's `update*` + its pure pattern math | **NEW `src/bosses/<name>.ts`** (warden/weaver/beacon/mirrorblade/hollow), following `src/sovereign.ts` | `sovereign.ts` already proves the split (pure helpers extracted, stateful loop in `boss.ts`); finish the pattern |
| `boss.ts` | becomes a thin **spawn + dispatch** file that delegates to `bosses/*` | the 657-line file SHRINKS as you go |
| Telegraph progress, enrage gap indices, finale predicate (e.g. `sovereignFinale`) | **pure, unit-tested helpers** in the per-boss module | mirrors `sovereign.ts`'s `gravityPull`/`beamHitsPoint`/`isSovereignExposed` tests |
| New telegraph/finale **drawing** (spiral tracers, finale tint, second beam) | **NEW `src/render/boss.ts`** (`drawBossTelegraphs(ctx, boss, …)`), called from `render.ts` | **start the `render.ts` de-god-file** — the structural win |

**Suggested order that maximizes the structural payoff:** start by **moving the existing `src/sovereign.ts` helpers under `src/bosses/sovereign.ts`** and extracting `updateSovereign` into it (this establishes `src/bosses/` and proves the dispatch), then do 2.1 + 2.2 there. Then extract Warden/Weaver/Beacon/Hollow one per commit as you enrage them (2.3) and rework the Hollow (2.4). `boss.ts` ends as a ~120-line dispatcher.

**The bar:** after this work, `boss.ts` is *smaller*, `render.ts` is *no larger* (telegraph drawing went to `render/boss.ts`), and each boss is a focused, individually-testable module.

> Note: a PARRY agent may also be creating `src/render/` (for `render/spear.ts`). No conflict — different files. If `src/render/` already exists, just add `render/boss.ts` to it.

---

## Current state you're building on

- **`boss.ts`** (657): `spawnBoss` (HP ramp `Math.min(count,4)+0.5*max(0,count-4)`), `updateBoss` (dispatch by `e.kind`), and `updateWarden/Weaver/Beacon/Mirrorblade/Hollow/Sovereign` inline. Phases via `e.phase`/`e.subPhase`/`e.timer`/`e.fireTimer`/`e.telegraph`/`e.angle`. Bullets: `world.spawnBullet(x,y,vx,vy,r,color,hostile)`. Shared helper `fireAimedFan`. Per-boss tune blocks (WARDEN/WEAVER/… and CIPHER/SOVEREIGN) live in `tune.ts` ~lines 811–956.
- **`sovereign.ts`** (66): the precedent — pure helpers (`gravityPull`, `coreOrbitPos`, `beamHitsPoint`, `isSovereignExposed`, `sovereignBodyArmored`, `exposeSovereign`) with `sovereign.test.ts`. The stateful `updateSovereign` is in `boss.ts` — move it here (or to `bosses/sovereign.ts`) as part of 2.1/2.2.
- **Mirrorblade is the reference** for real enrage (`updateMirrorblade`: `const enraged = e.hp/e.maxHp < 0.5`; halved windup/recover; chained sub-phase lunge). Copy its shape.
- The boss telegraph is rendered in `render.ts` (grep `telegraph` / the per-boss draw fns) — extract the parts you extend.

---

## Conventions (non-negotiable)

- **Determinism** (seeded Daily): enrage gaps, telegraph offsets, the second beam, finale fire — all FIXED math or `subPhase % N` counters. NEVER a new `world.rng` draw. The existing enemy "verbs" do exactly this — copy that discipline. Run `src/determinism.test.ts` + `src/waves.test.ts` after (update any boss-timing golden only if it legitimately shifts).
- **TDD the pure math**: extract telegraph-progress, gap-index, and finale predicates as pure functions and test them (like `sovereign.test.ts`). The stateful `update*` + rendering are verified by playtest + boot-smoke.
- **a11y**: new telegraphs are readability aids — make them clear and steady; gate any flash behind `reduceFlashing`. Telegraphs should *help* the player read the pattern (the whole point of 2.1).
- **Commits**: one per boss/deliverable. Messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Verification workflow (every commit)

1. `npx tsc --noEmit` → clean.
2. `npx vitest run` → **983+ green** (your new per-boss `*.test.ts` add to it).
3. `npx vitest run src/determinism.test.ts src/waves.test.ts` → green (proves no rng/timing drift).
4. Boot-smoke the prod build: `npx vite build && npx vite preview --port 4181 --strictPort`, load it, **0 console errors** (catches the minified-boot-crash class). Verify each reworked boss in dev via the `__lf` hook (spawn a boss at low HP and watch the enrage/telegraph/finale).

## Definition of done

- Sovereign spiral telegraphs; its expose window is a live-fire trade; a sub-25% finale fires beams+spiral together.
- Warden/Weaver/Beacon/Hollow each change *behavior* at low HP; the Hollow's window is earned by hunting echoes.
- **`src/bosses/` exists**, each boss is a focused tested module, **`boss.ts` is smaller**, telegraph drawing is in **`render/boss.ts`** (not inline in `render.ts`).
- tsc clean, full suite green, prod build boots clean.
- Committed per boss, then `npm run deploy` and confirm `lancefall.pages.dev` boots.
