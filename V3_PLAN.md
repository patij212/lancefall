# LANCEFALL v3 — execution plan (multi-agent design → sequential build)

Derived from a 5-architect design workflow + tech-lead synthesis. The five shared
surfaces — `save.ts`, `perks.ts`/`deriveStats`, `render.ts`, `game.ts`, the draft
chassis (`evolutions.ts` DraftCard + `ui.ts` showDraft + `game.ts` pickPerk) — are
edited in a strict order so no two features three-way-merge the same method.
Implementing sequentially (one builder), each step verified (tsc + vitest + build +
in-browser) and committed.

## Source-verified facts (from synthesis "notes")
- `deriveStats(stacks, shipApply?, metaApply?, evoApply?)` — order base→meta→ship→perks→evo. Only call site: `World.recomputeStats()`.
- `RenderOpts` = `{reduceFlashing, colorblind, combo}`; `render(world, cam, opts)` — no realDt today.
- `loadSave()` is a naive spread-merge; `SAVE_KEY = 'lancefall.v1'`.
- `State` (game.ts) and `ScreenId` (ui.ts) are SEPARATE parallel unions; `handleMeta()` is an if-else chain.
- `enemyWeights()` base record is `Record<EnemyKind,number>` — new EnemyKinds must be added there or TS won't compile.
- game.ts ~1105 lines — treat as append-only during feature work.
- BP3 & BP5 "ghostPlayer" are the SAME render hook — dedupe.

## Phase 0 — shared infra (unblocks everything)
- [x] 0.1 Save versioning: `migrate.ts` (SAVE_VERSION, migrate(raw)), route `loadSave()` through it, rename key `lancefall.v1`→`lancefall.save` with one-time legacy read. (Note: keep the in-dev save shape intact.)
- [x] 0.2 Stat pipeline: add `postApply?` 5th param to `deriveStats` (runs last, after evo); add RunStats fields `fogRadius:0`, `dashCostMul:1`; `World` gains `mutatorApply` + `postApply` no-op fields and composes meta+mutator (before ship) and relics+heat (postApply, after evo). Canonical order: base→meta→mutator→ship→perks→evo→relics→heat.
- RenderOpts extensions (ghostPlayer?, caPerCombo?, realDt): added per-feature when the consumer lands (single builder = no collision risk).

## Phase 1 — Content (Direction 2): The Hollow + Drifter + Shade  [most additive]
- 5th boss **THE HOLLOW**: clone-sync; Phase 2 damage window = dash through the boss during its white flash (i-frame dash only). EnemyKinds: `hollow`, `hollow_echo`. New `boss_hollow.ts`. Add to BOSS_CYCLE, bossrush (→5), arena (→15-wave gauntlet).
- New enemies **Drifter** + **Shade** (arc-via-speed-differential, no Bullet struct change). Add to EnemyKind union, ENEMY_DEFS, unlockedKinds, enemyWeights (Record!), ELITE_KINDS (as appropriate), enemies.ts AI switch, render drawEnemy switch.
- Refactor `isBossLethal(boss)` into boss.ts (extract from game.ts:888).

## Phase 2 — Variety (Direction 1): mutators + mid-run events  [first big bet]
- `mutators.ts` (6: doubleChampions, glassCannon, bulletStorm, fogOfWar, suddenDeath, eliteHunt) + `events.ts` (5: shrine, gamble, eliteWave, treasure, cursedBargain) + tests. Pure first.
- Daily picks mutators from `seedFromDate()` via a SEPARATE rng; weekly = floor(date/7).
- `DirectorDecision.event`; new `'event'` State (the ONLY new State value) + handleMeta branch + ui 'event' ScreenId + event panel (draft chassis) + HUD mutator badges + fog-of-war render read.
- save: `dailyMutators`, `weeklyMutators` (via migrate chokepoint).

## Phase 3 — Endgame depth (Direction 5): Heat / Ghost / Archetypes / Relics / DNA  [XL]
- `heat.ts` (ascension ladder), `ghost.ts` (best-run replay shadow), `archetypes.ts` (build goals up-weight draft), `relics.ts` (cursed double-edged, extend DraftCard + isRelic guard), Build DNA export (save codec + share). Pure layers + tests first, then wiring on the settled draft chassis. Overlays only (NO new State).
- Quick win subset: **Build DNA export** (~65 lines) + **Build Archetypes overlay**.

## Phase 4 — Steam polish (Direction 4)
- Audio mix pass (isolated, quick win). tune additive consts (MAX_PARTICLES, comboTierPulseAlpha).
- render cinematics: victory sequence, boss entrance, combo-tier pulse (LAST render.ts toucher).
- perf hardening (particle cap + frame-time auto-scale), onboarding refinement, pause/quit UX.

## Phase 5 — Online (Direction 3): leaderboards + cloud daily  [lowest coupling]
- `api.ts` (offline-noop first, fire-and-forget), `worker/` (Cloudflare Workers + D1; schema.sql, wrangler.toml, validate.ts, index.ts), `.env.example`.
- Wiring: `submitRun()` one-liner in finishGameOver, daily-seed fetch in start(), leaderboard overlay panel + title button. Deploy steps documented.

## Phase 6 — integration + balance + docs (v3.0)
- Full vitest + in-browser smoke per direction. Retune compounding (Heat + glassCannon + GLASS_SPEAR + fog). Filter: skip dashCostMul relics when staminaSegments≤1; curate daily mutators for new players. Docs → v3.0.

## Conventions during the build
- After each step: `npx tsc --noEmit` + `npx vitest run` + `npx vite build`, in-browser check via `window.__lf`, then commit. Reset localStorage to the owner's real save (highScore 46472, bestCombo 31) after any test that touches it.
- Adversarial review workflow after each major phase; fix findings before moving on.
