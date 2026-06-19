# HANDOFF — MODES UPGRADE (every mode a distinct *way to play*)

> Brainstormed from the adversarial review's modes critique ("6 modes, but really 2 structures + difficulty knobs"). Goal: make each mode a distinct **reason to play** — a structural rule that changes *how* you play, not a number that changes how *hard* it is. The vehicle already exists (the declarative `ModeRules` + the `mutators.ts` deck); the gap is that the structural rule-types are **reserved and unwired**, and run-to-run variety only touches seeded modes. This wires the structure in.

---

## PROMPT (paste this to spawn the agent)

> Upgrade the game modes in THE LAST LANCE (lancefall) per the design in this doc. Today: `ModeRules` (modes.ts) is declarative but its structural rule-types (`oneLife`, `biomeLock`, `perkCadenceMul`) are RESERVED with no read site; 4 modes are genuinely distinct (Arena scripted, Boss Rush, Nightmare walls, Solstice cipher) and 4 are the same director loop with different numbers/seeds (Endless/Daily/Weekly/Casual); the 7 `mutators.ts` modifiers are good but **seeded-modes-only and mostly number tweaks** (only FOG OF WAR is structural). 
>
> Deliver: **(Phase 1, core)** wire the reserved structural rules + add 2-3 new declarative `ModeRules` types that reshape *play*; give the two structural modes a signature deepening — **NIGHTMARE** gets roaming **safe-zones** (reach the light or wither, inside the closing walls), **SOLSTICE** gets a **bullet-time flourish on a decoded cipher key** (read→reward rhythm); and **deepen the mutator deck with 3-4 STRUCTURAL mutators** (not number tweaks) so procedural runs vary. **(Phase 2, optional)** open mutators as a **player choice** for a custom Endless/Heat run (the roguelite replay engine), and add ONE new mode — **IRONLANCE** (`oneLife`: no LAST BREATH, no revive — hardcore tension).
>
> **DETERMINISM IS THE HARD PART — do not get this wrong:** Daily + Weekly MUST stay bit-identical for every player. Mutators already use a SEPARATE salted PRNG stream (`pickDailyMutators`/`pickWeeklyMutators`) precisely so they never perturb `world.rng`. EVERY new structural rule and mutator must follow that discipline — placement/effects are fixed or drawn from the separate seeded stream, NEVER from `world.rng`. Run `src/determinism.test.ts` + `src/modes.test.ts` after every change; a single new `world.rng` draw in a seeded path is a release-blocking bug.
>
> **Structural rule:** rule/mutator DEFINITIONS stay in `modes.ts` + `mutators.ts` (their declarative homes); the thin READ SITES go where the existing ones live (game.ts/waves.ts — follow the `suddenDeath`/`events` precedent); safe-zone DRAWING goes in a focused `src/render/*` module (NOT render.ts/skins.ts); the optional player-facing mutator UI is a `panels/*` modal (panel convention). Gate flashes a11y. Verify with `npx tsc --noEmit` + `npx vitest run` (1101+ green) + a prod boot-smoke. Commit per mode/rule with the Co-Authored-By trailer. When done, `npm run deploy` and confirm the live site boots.

---

## Why (the precise gap)

The `ModeRules` interface is built for this — `events`/`scoreFrame`/`suddenDeath`/`ranked` are wired and give Arena/Boss-Rush/Nightmare/Casual real identity. But `oneLife`/`biomeLock`/`perkCadenceMul` are **reserved no-ops** (modes.ts comment: "no read site yet"), so the 4 loop-modes can only differ by `intensityMul`/`spawnMul`/`seedKind`. And the mutator deck — the natural engine for run variety — only fires on the Daily/Weekly seed and is mostly density/speed/score knobs. So: **the structure is designed but not turned on.** Turn it on.

## Phase 1 (core) — turn the structure on

### Each mode becomes a distinct reason to play

| Mode | Identity after the upgrade |
|---|---|
| **ENDLESS** | the pure climb — now with the **deeper structural mutator deck** (each run rolls modifiers → no two runs alike). The base, finally endlessly varied. |
| **ARENA** | scripted 15-wave gauntlet, winnable — *already distinct, keep.* |
| **DAILY (Echo)** | shared date-seed + deterministic mutators + leaderboard — *distinct (competition), keep.* |
| **WEEKLY** | shared week-seed + spicier mutators + weekly board — *distinct (competition), keep.* |
| **NIGHTMARE** | sudden-death walls **+ roaming SAFE-ZONES** — reach the moving light pockets inside the closing arena or wither. A survival-horror remix. |
| **BOSS RUSH** | bosses back-to-back, winnable — *already distinct, keep.* |
| **SOLSTICE** | cipher bosses **+ a BULLET-TIME flourish on each decoded key** — the cipher becomes a read→reward rhythm, not just a gate. A puzzle-action remix. |
| **CASUAL** | eased + shields + off-board — *distinct (accessibility), keep.* |

### New declarative `ModeRules` types to wire (each deterministic, Daily-safe)
- **`oneLife?: boolean`** (wire the reserved field) — disable LAST BREATH + revive tokens; one lethal hit ends the run. (Powers IRONLANCE in Phase 2.)
- **`safeZones?: { count; radius; driftSpeed }`** (NEW) — N slow-drifting safe pockets; inside one, the player is protected/regens; outside the closing walls you must keep reaching them. Placement/drift are **deterministic** (fixed pattern or seeded-stream), drawn in a `render/*` module. (Nightmare's signature.)
- **`cipherBulletTime?: { seconds; scale }`** (NEW) — on a correctly-decoded cipher key, grant a brief real-time-safe slow-mo (reuse the existing scheduler slow-mo — it's already determinism-safe). (Solstice's signature.)
- *(Skip `perkCadenceMul` — it's a knob, not structure. `biomeLock` is a nice-to-have for a themed mode; wire only if you add one.)*

### Deepen the mutator deck — add STRUCTURAL mutators (not number tweaks)
The 7 existing are fine; add 3-4 that reshape *play* (all deterministic, all via the separate seeded stream for Daily/Weekly):
- **MIRROR** — enemies spawn in mirrored pairs (symmetry changes the read).
- **GRAVITY WELL** — a slow arena drift/pull (a constant repositioning pressure — reuse the Sovereign gravity math).
- **ECHOES** — a slain enemy leaves a brief ghost-hazard where it died (don't camp your kills).
- **RELENTLESS** — no perk drafts, but a flat power floor (a deliberately different build experience).
> These are the creative core — pick the ones that excite you; the agent/owner can swap any. Each is a `MutatorDef` (data-driven `apply`/`config` + a thin read site for the structural ones).

## Phase 2 (optional) — the replay engine + a hardcore mode
- **Player-chosen mutators** — let the player TOGGLE/stack mutators for a custom Endless run (a "CUSTOM SIEGE" entry or fold into the Heat ladder). Off-board (self-chosen difficulty, like Casual). This turns the deck into a true Hades-Heat / RoR2-artifacts replay engine — arguably the single biggest replayability win, but the biggest UI surface (a `panels/*` modal).
- **IRONLANCE** — a new mode with `oneLife: true` (no second wind), off-board or its own board. A classic, beloved roguelite tension mode; cheap once `oneLife` is wired.

## Determinism mandate (the cardinal rule — re-read)
Daily + Weekly are bit-identical for the world. The existing pattern is your template: mutators are picked from a **separate salted PRNG** (`createRng(seed ^ 0x9e3779b9)` for Daily, `^ 0x85ebca6b` for Weekly) so they NEVER touch `world.rng`. Every new structural rule + mutator effect must be **deterministic**: fixed math, `subPhase % N` counters, or a draw from that separate stream — never a new `world.rng` call in a seeded path. The safe-zone positions, the mirror pairing, the gravity field, the echo placement — all deterministic. Run `determinism.test.ts` + `modes.test.ts` after every change.

## Structural mandate (where the work goes)
| New/changed | Where | Why |
|---|---|---|
| New `ModeRules` types + per-mode `rules` blocks | **`modes.ts`** (declarative home; 282 lines) | additive — an absent rule = today's behavior; no schema churn elsewhere |
| New mutators | **`mutators.ts`** (data-driven home; 185 lines) | `MutatorDef` `apply`/`config` + the elite/structural hooks |
| Rule READ SITES (oneLife → no LAST BREATH; safeZones; cipherBulletTime) | thin reads in **game.ts/waves.ts** at the existing rule sites | follow the `suddenDeath`/`events` precedent — declarative reads, not new systems |
| Safe-zone + mutator DRAWING (gravity field, echoes, mirror tells) | **NEW/existing `src/render/*` module** | keep it OUT of render.ts (2503) and skins.ts (5048) — continue the render split |
| Player-facing mutator picker (Phase 2) | a **`panels/*` modal** | follow the panel-extraction convention (build<Name>Panel) |
| Pure logic (zone placement, mutator pick, rule predicates) | **tested helpers** in modes.ts/mutators.ts | unit-testable + deterministic, like `pickDailyMutators` |

## Current state you're extending
- **`modes.ts`**: `ModeRules` (events/scoreFrame/suddenDeath/ranked/casualShields wired; oneLife/biomeLock/perkCadenceMul reserved), 8 `RunConfig`s, the rail cards, `modeRanked`/`modeSeeded`/`modeUnlocked`. Read sites noted in the file comment.
- **`mutators.ts`**: 7 `MutatorDef`s (CHAMPION TIDE, GLASS CANNON, BULLET STORM, FOG OF WAR, BERSERK, WINDFALL, WARLORDS); `pickDailyMutators`/`pickWeeklyMutators` (separate salted PRNG — the determinism template); `buildMutatorApply`/`applyMutatorConfig`/`mutatorElite` composition.
- **Nightmare** already does `suddenDeath:{afterBoss:1}` (waves.ts `suddenDeathInset`). **Solstice** already does `cipherLock` (boss ring-ciphers). **Bosses already zone the player** (a recent commit) — coordinate the safe-zones with that.

## Verification (every change)
1. `npx tsc --noEmit` → clean.
2. `npx vitest run` → **1101+ green** (add pure tests for each new rule/mutator + the safe-zone/zone math).
3. `npx vitest run src/determinism.test.ts src/modes.test.ts` → green — the **non-negotiable** check; a seeded-path `world.rng` regression fails here.
4. Prod boot-smoke; playtest each upgraded mode in dev (Nightmare safe-zones, Solstice cipher bullet-time, an Endless run with a structural mutator) — confirm each *plays differently*, not just *harder*.

## Definition of done
- Each mode is a distinct reason to play; Nightmare + Solstice have their signature structural twist; Endless runs vary via the deeper mutator deck.
- New `ModeRules` types wired with read sites; 3-4 new STRUCTURAL mutators; (optional) the player-mutator picker + IRONLANCE.
- **Determinism intact** — Daily/Weekly bit-identical, every new rule/mutator deterministic (no `world.rng` in seeded paths); `determinism.test.ts` + `modes.test.ts` green.
- Definitions in modes.ts/mutators.ts; thin read sites; new drawing in `render/*` (not render.ts/skins.ts); pure logic tested.
- tsc clean, full suite green, prod boots clean. Committed per mode/rule, then `npm run deploy` and confirm `lancefall.pages.dev` boots.
