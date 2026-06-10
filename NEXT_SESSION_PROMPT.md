# KICKOFF — LANCEFALL "THE LAST LANCE" v6: THE FULL PASS (autonomous, multi-agent)

You are LEAD DESIGNER + TECHNICAL DIRECTOR for **LANCEFALL** at `C:\Users\patij212\Downloads\_Organised\Projects\Claudes playground\lancefall`. This is an autonomous overnight build: **drive the entire pass yourself — design → build → adversarially review → commit, no approval gate.** Improve EVERY part of the game in one coordinated pass. The **SOUNDTRACK is the centerpiece.**

## MISSION
Ship v6: (1) more COHERENCE; (2) longer waves between bosses; (3) more combo opportunities; (4) real mode differentiation; (5) a select-before-PLAY step; (6) a less-cheesy story that keeps the light/dark theme; (7) a default survivability cushion ("3rd life segment"); (8) **a truly great, complex, instant-earworm soundtrack for hours-long sessions** — the headline feature; (9) leave the codebase better than you found it.

## DESIGN-LOCKED INVARIANTS — violate ANY of these and the change is wrong
1. **Daily / seeded determinism is bit-identical.** `world.rng` is the ONLY scoring-affecting seeded stream. Cosmetic streams (`dropRng`, `hsRng`, narrator rng, the new `cmusRng`) stay separate. NEVER add/remove/reorder a `world.rng` draw on the Daily path. Run a Daily golden-replay check before AND after every sim-touching change.
2. **`tune.ts` is the single source of truth for numbers.** Every new constant goes there. Cosmetic-audio constants live under the `COHERENCE`/`COHERENCE_AUDIO` blocks — never mixed with gameplay numbers. No magic numbers in logic files.
3. **No engine swap.** Vanilla TS + Canvas 2D + Web Audio + Vitest. No new deps.
4. **Offline-first audio.** Zero downloads, zero `fetch`/`decodeAudioData`. Synthesize live or render once via `OfflineAudioContext` at boot.
5. **Accessibility-gate every visual.** Every new flash/lurch/pulse respects `reduceFlashing`/`reduceMotion`/`clarity` exactly like `vignetteDeepenFactor`/`focusSnapLift` in `renderMath.ts`. Per-dash feedback must be a11y-safe (localized to player/spear, NOT frame-wide) so it survives those gates.
6. **One save-schema bump for the whole pass.** `SAVE_VERSION 5→6` (migrate.ts:12). Batch EVERY new persisted field (`selectedMode`, `cityMemoryMeter`, `firstRunsBeatHint`, `baseShields` if persisted, any new audio toggle) into that SINGLE migration. The spread-over-`defaultSave()` handles old saves. Per-run state needs NO bump.
7. **Pure-sim layer stays unit-tested.** Extract new logic into PURE functions with Vitest coverage, mirroring `beat.ts`/`coherence.ts`/`combat.ts`.

## DRIVE WITH DYNAMIC WORKFLOWS — one workflow per phase, fan out per subsystem
For each phase, spin a workflow that fans out across the 8 work-streams and verifies findings adversarially:
- **UNDERSTAND** — read the real files (cite line numbers); confirm every assumption in code before acting. Do NOT trust this prompt's line refs blindly — re-verify.
- **DESIGN TOURNAMENT** — for each non-trivial change, generate 2-3 approaches, pick the winner on (determinism-safety, blast radius, feel), record why.
- **IMPLEMENT** — smallest correct change; one commit per logical change.
- **ADVERSARIAL REVIEW** — a fresh pass tries to BREAK each change: did any `world.rng` draw move? is any visual ungated for a11y? did the save migration round-trip? does the mix slam the limiter? Fix what it finds before moving on.

## WORK-STREAMS WITH ACCEPTANCE CRITERIA

**WS-1 COHERENCE** (`coherence.ts`, `beat.ts`, `renderMath.ts`, `render.ts`, `audio.ts`, `game.ts`, `narrator.ts`, `ui.ts`, `tune.ts`, `save.ts`)
- A Perfect/Good on-beat dash produces a LOCALIZED a11y-safe cue (floatText "PERFECT"/"ON BEAT" + a player/spear ring-pulse from a new rng-free `coherence.beatFlash` envelope + a HUD pip) that survives `reduceMotion`/`reduceFlashing`. OFF dashes stay silent.
- `audio.setCoherence` runs EVERY frame (glides already smooth it); only `setIntensity` stays on the 0.4s throttle. Collapse-to-floor and rise-through-`windowThreshold` get short audio+narrator transients on the dial's own thresholds.
- The FALL is felt: a gated `collapseDip` saturation lurch on a dead chain.
- Opt-in (default ON) "CITY MEMORY" meter in `ui.ts` fed from `coherence.value`; spear/trail neon lifts with coherence. New player is taught the beat (`firstRunsBeatHint` + one-time `tryHint('dashOnBeat')`).
- `coherence.test.ts` covers every new envelope. `CoherenceState` stays rng-free.

**WS-2 DIRECTOR** (`waves.ts`, `tune.ts`, `modes.ts`, `biomes.ts`, `game.ts`, `waves.test.ts`)
- `bossInterval` 45→70 (endless/daily), 35→55 (nightmare). Each stretch shaped build-up→crescendo via a pure `stretchSwell` (0.35) applied ONLY to spawnInterval/enemiesPerSpawn/maxConcurrent (NOT speed). `bossLull` (3.5s) post-boss payoff breath + ~1.5s pre-boss calm. `BIOME_DURATION` realigned. Early unlocks pulled earlier.
- **PROVE zero extra `world.rng` draw** (Daily golden check identical). `waves.test.ts` green (update unlock-pacing assertions).

**WS-3 COMBO** (`combat.ts`, `game.ts`, `tune.ts`, `combat.test.ts`)
- Graze refreshes the combo window (+ conservative fractional `comboGrazeCharge`). Dynamic window grows with streak (`window + combo*windowPerCombo`, capped). Dash-chain ≥2 extends the window on landing. Boss/big-enemy dash-HITS refresh the timer WITHOUT incrementing. All pure deterministic sim, no rng, no schema. `combat.test.ts` updated for the new window formula.

**WS-4 MODES** (`modes.ts`, `waves.ts`, `game.ts`, `world.ts`, `heat.ts`, `events.ts`, `api.ts`, `tune.ts`)
- Declarative optional `rules: ModeRules` on RunConfig wired at exactly one read site each; absent `rules` = today's behavior. NIGHTMARE gets SUDDEN DEATH (bossCount-derived arena shrink — clamp on SIM state, never pixels/DPR). ARENA/BOSSRUSH get cleartime+nohit scoring submitted via existing per-mode boards. DAILY gets the **best-of-3-ATTEMPTS** framing (Phase 0) + curated events declared in modes.ts (move the `cfg.id==='daily'` special-case behind a flag). `rollEventId` draw count constant across pools.

**WS-5 MODE SELECTION** (`ui.ts`, `save.ts`, `migrate.ts`, `game.ts`, `input.ts`, `style.css`)
- Title = select-then-PLAY: 5 selectable `mode-card`s (name + desc + difficulty/reward line + `aria-pressed`), one `selectedModeId` (persisted via the 5→6 bump), PLAY launches the selected mode. Mirror `openHeat`/`openArchetype`. Full keyboard+gamepad nav (roving tabindex; `handleMeta` launches `save.selectedMode` not `MODES[0]`). Daily seed + Heat chip + READ-ONLY daily-mutator preview (preview MUST use its own rng, NEVER `world.rng`/`dropRng`). Larger touch targets; no one-tap accidental launch. `start(cfg)`/`world.rng` untouched.

**WS-6 STORY** (`narrator.ts`, `bestiary.ts`, `stillpoint.ts`, `lore.ts`, `ui.ts`) — text-only, zero sim/schema risk
- **FULL rename (Phase 0):** purge incidental "remember" AND rename the OVERDRIVE ultimate ("REMEMBER EVERYTHING" → a new light/dark name) — update game.ts:497/508, ui.ts:723/1177, the 2 achievement strings, any test on the old string. The tagline may keep one deliberate echo. Combo-tier lines = 6 rising sentences matching all 6 `tierCombo` cut points, no countdown. Boss quotes: taunts→regrets (keep dossier prose). THE CHOICE: drop "remembers your name", new prompt/buttons — KEEP the `stillpoint.test.ts` heads ('THE LIGHT HOLDS'/'THE LIGHT RELEASED'), change only `.line`. Restore restraint to meta/player-facing lore. Verify no test asserts on edited substrings.

**WS-7 SURVIVABILITY** (`types.ts`, `tune.ts`, `perks.ts`, `game.ts`, `heat.ts`, `world.ts`)
- ✅ **LOCKED: Option A — ARMOR hit-buffer** (Phase 0). `defaultShields: 2`, `postHitIframe ~0.85`, reuse the LAST BREATH push loop, order **shields→LAST BREATH→revive→death**, HUD pips, +1 regen on boss-clear, a `heat.ts shieldsLost` strip column, ON for everyone incl. Daily. Factor the pre-death checks into a PURE `consumeSurvivalCharge()` (like `clutch.ts`) and unit-test it. Determinism-safe (positions only, no rng).

**WS-8 SOUNDTRACK ⭐ THE CENTERPIECE** (`audio.ts`, `tune.ts`, `bossThemes.ts`, new `musicTransport.ts` + `musicScore.ts` + tests) — strictly sequenced:
- **A1** Extract PURE `musicTransport.ts` (`{bar, beatInBar, sixteenthIndex, section}` + AMBIENT/COMBAT/BOSS/OVERDRIVE/CALM state machine) + PURE `musicScore.ts` (per-section/per-biome rhythm/bass/motif tables) replacing inline `PENTA`/`ARP`/`playStep`. **Snapshot today's pattern as section AMBIENT so default output is byte-unchanged.** Keep `musicEpoch`/`musicTime` semantics identical (game.ts:728 reconcile depends on them). Tests for both modules.
- **A2** Named sub-bus tree (drums/bass/harmony/lead/boss → musicBus) + a music-side reverb send + `setLayer()`. Re-point the ~6 voice call-sites. One-time per-voice gain re-tune.
- **A3** `DynamicsCompressorNode` on musicBus + four-on-the-floor sidechain pump (scheduled gain dips keyed off kick times). Constants in tune.ts.
- **A4** THE LANCE THEME: 8-note pentatonic hook = common arch + ONE +9-semitone turning-point leap (the snag) + stepwise gap-fill descent (the satisfaction) + unresolved 2nd-degree loop point (the itch); detuned-twin-saw neon lead through `leadFilter`; transposes intact via `rootMul` so it lifts with the combo tier (the earworm IS the scoreboard). THE FALL = same pitch set 4× augmented on the choir/pad. Per-biome chord movement (Am-F-C-G as `rootMul` offsets) — all PENTA-safe so it can't sound wrong.
- **A5** Six gain-gated stems; L3 LEAD fades in at `coherence>leadOnset≈0.35` (the hook is the reward of a clean run), L5 half-time DnB break at `heat>~0.7`. `setCoherence` owns `leadGain`/`leadFilter` (one controller per knob). New `COHERENCE_AUDIO` consts.
- **A6** Per-boss `motif?: number[]` in `bossThemes.ts` (data-only, bar-quantized horizontal re-sequencing); replace binary `duckMusic` with `setMixState(COMBAT/MENU/BOSS/OVERDRIVE/DEATH)` snapshots.
- **A7** Anti-fatigue: macro-form A/A'/B/A (~28-bar/~60s rotation, ~2-min exact-repeat horizon) + per-note humanization from a NEW cosmetic LCG `cmusRng` seeded from the audio clock (NEVER `world.rng`) + 30-90s drone/choir swells + vertical thinning in lulls.
- **A8** Pure Vitest (no AudioContext): LANCE_THEME index→freq under each tier transpose (`== PENTA*rootMul`, in range), MACRO_FORM selection, `cmusRng` reproducibility.
- **MUSIC_BPM=112 stays UNCHANGED** (beat grid + dash-grading + combo-transpose SoT). Everything routes through musicBus (inherits ducking/slider/limiter); budget new gains (lead 0.12, break ~0.06) so the soft-clip is never slammed.

## PHASE 0 — DECISIONS (owner-confirmed; LOCKED — build to these)
- **(7) Survivability = ARMOR hit-buffer.** `defaultShields: 2`, `postHitIframe ~0.85`, +1 regen on boss-clear, discrete HUD pips, a `heat.ts shieldsLost` strip column. **ON for everyone incl. Daily** (stays deterministic; boards re-baseline; no asterisk).
- **(8a) Soundtrack = PROCEDURAL STEMS** (no authored assets — preserves offline-first + the combo-tier pitch-coupling). `(8c)` `OfflineAudioContext`-baked one-shots ARE allowed.
- **(4) Daily = "3 ATTEMPTS" (best-of-3), NOT one-life** — the owner found one-life too harsh. The Daily is a best-of-3 challenge: the player may run today's seed up to **3 times**; the **best score is submitted**. Track `dailyAttempts` + `dailyAttemptDate` in save (folded into the single 5→6 bump); show "Attempt N/3" on the mode card + debrief; when exhausted, lock further daily runs (offer Endless). The Daily run itself uses the standard armor cushion. Attempt accounting is cosmetic save state — NEVER `world.rng`; the seed stays bit-identical. ⚠️ Interpretation: "attempts" = retries of the seed (best counts). If ambiguous in play, that's the intended reading.
- **(6) Story = FULL RENAME of the ultimate.** Purge incidental "remember" AND rename the OVERDRIVE ultimate (today "REMEMBER EVERYTHING") to a fresh light/dark-themed name. Update game.ts:497/508, ui.ts:723/1177, the 2 achievement strings, and any test asserting the old string. Higher blast radius — grep first.
- Everything else needs no gate — start immediately.

## BUILD ORDER (dependencies)
Phase 1 (parallel, low-risk): WS-6 story (ship first), WS-2 D1/D4/D5, WS-3 B1-B4, the single 5→6 migration scaffold. → Phase 2: WS-2 swell/lull, WS-4 `rules` spine, WS-5 select-then-PLAY. → Phase 3: WS-4 identities, WS-5 nav/preview/touch, WS-7 cushion. → Phase 4: WS-1 coherence binding. → Phase 5: WS-8 soundtrack A1→A8 (sequenced; A4+ benefits from WS-1's per-frame audio). → Phase 6: integration sweep + docs.

## QUALITY GATE — run BEFORE EVERY COMMIT, no exceptions
1. `npx tsc --noEmit` clean. 2. `npm test` (vitest run) — ALL green, including new tests. 3. `npm run build` clean. 4. In-browser proof via Playwright: load the app, zero console errors, exercise the changed surface (play each affected mode, hear/see the change). 5. **Daily determinism preserved** — golden-replay byte-identical for any sim-touching change. 6. Every new visual verified under `reduceFlashing`+`reduceMotion`+`clarity`. 7. One commit per logical change; message ends with the Co-Authored-By trailer. **Start from the current branch `lastlance`** — it holds ALL the latest work (the HERALD + SEEKER enemies, ghost replays, async duels, WARLORDS, the balance bot); `master` is stale at the old kickoff doc. Branch off `lastlance` for the pass. Autonomous: no approval gate — but NEVER commit on a red gate.

## DEFINITION OF DONE
All 8 work-streams meet their acceptance criteria; the soundtrack is a genuine instant-earworm that survives hours of play (verify the macro-form rotation + humanization by ear in-browser); `tsc`+tests+build all green; Daily stays bit-identical; every visual is a11y-gated; the single 5→6 migration round-trips; README + the root CLAUDE.md project table + the MEMORY note are updated to "THE LAST LANCE (v6)". Be concrete, opinionated, and ruthless about quality. Make it sing.
