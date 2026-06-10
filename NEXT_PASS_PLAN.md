# PREPARED GROUND — LANCEFALL "THE LAST LANCE" v6 Full-Pass Design Doc

> Scope: a single coordinated pass that improves **every** part of the game, driven by dynamic multi-agent workflows. All claims below are verified against the current working tree on branch **`lastlance`** (HEAD `204a0a4` — includes the HERALD + SEEKER enemies, ghost replays, async duels, WARLORDS, and the balance bot; `master` is stale). `SAVE_VERSION = 5` (migrate.ts:12); the pass makes ONE 5→6 bump. ~42 test files / 327 tests. Build = `tsc && vite build`; tests = `vitest run`. **Re-verify line refs in code before acting — the codebase moves.**

## DESIGN-LOCKED INVARIANTS (apply to every change, no exceptions)

1. **Daily / seeded determinism is bit-identical.** `world.rng` is the ONLY seeded stream that affects scoring. Cosmetic streams (`dropRng`, `hsRng`, narrator rng, the proposed `cmusRng`) are separate and must stay separate. No change may add/remove/reorder a `world.rng` draw on the Daily path. The Daily-determinism test must pass byte-for-byte before and after.
2. **`tune.ts` is the single source of truth for numbers.** Every new constant lands in `tune.ts` (cosmetic-audio constants live under `COHERENCE`/`COHERENCE_AUDIO` blocks, never mixed with gameplay numbers). No magic numbers in logic files.
3. **No engine swap.** Vanilla TS + Canvas 2D + Web Audio + Vitest. No new runtime deps, no frameworks.
4. **Offline-first audio.** Zero asset downloads, zero `fetch`/`decodeAudioData`. Everything synthesized live or rendered once via `OfflineAudioContext` at boot if ever needed.
5. **Accessibility-gate every visual.** Any new flash/lurch/pulse must respect `reduceFlashing` / `reduceMotion` / `clarity` exactly like `vignetteDeepenFactor` / `focusSnapLift` in `renderMath.ts`. Per-dash a11y-safe feedback must survive those gates (localized, not frame-wide).
6. **Save-schema bump discipline.** ONE `SAVE_VERSION 5→6` bump for the whole pass; batch every new persisted field into that single `migrate.ts` migration (spread-over-`defaultSave()` handles old saves). Run state (combo, shields-per-run) needs NO bump.
7. **Pure-sim layer stays unit-tested.** New logic (music transport/score, survival charge consume, stretch swell) is extracted into PURE functions with Vitest coverage, mirroring `beat.ts` / `coherence.ts` / `combat.ts`.

---

## 1 — MORE COHERENCE (the soul dial)

**Current state.** One eased 0..1 scalar (`coherence.ts: CoherenceState`), updated in `frame()` on `realDt`, structurally rng-free. Target = `floor(0.06) + 0.94*(comboT*0.7 + dashT*0.3)`; `comboHalf=14`, `dashChainFull=5`; `riseRate=4.5`, `fallRate=1.1`. Beat is reward-only: `perfectKick=0.18` / `onbeatKick=0.06`, Perfect sets `focusPulse=1` (decay 0.5s). Render = one global saturation wash gated off under `quality<=0.6`; audio = drone bloom throttled to every 0.4s (game.ts:719-722); meaning = ~30 narrator lines on combo tiers. The word "COHERENCE" appears NOWHERE in `ui.ts`.

**The real problem.** The reward channel is fully built but **invisible and undiscoverable**: a Perfect on-beat dash produces only (a) a snare gated off under `reduceFlashing` and (b) a frame-wide saturation pulse gated off under `reduceMotion`/`clarity`. The single most rewarding mechanic has the weakest feedback. The three channels (sight per-frame, sound throttled 0.4s, meaning at tier cuts) are temporally desynced, so the "one bus" reads as three loosely-coupled buses. `rhythmAssist` defaults `false` (save.ts:151) so a new player never learns the beat exists.

**Target.** Dash-on-the-beat becomes the loop's most satisfying micro-moment; the three channels lock to the SAME value at the SAME instant; the dial gains a legible (opt-in) identity; the FALL is felt as the inverse of the bloom.

**Change-set.**
- **C1 — a11y-safe graded beat feedback.** In `game.ts` `dashFiredThisStep` block (~760-766), on `grade !== 'off'` fire a cosmetic `floatText` ("ON BEAT"/"PERFECT", colored `theme.accent2`) via `world.particles.floatText` (already determinism-safe, used at game.ts:497) + a HUD beat-grade pip in `ui.ts`. Add a NEW `coherence.beatFlash` envelope (field on `CoherenceState`, set in `coherenceBeatKick`) that the renderer reads to ring-pulse the **player/spear** (not the whole frame) so it survives `reduceMotion`/`reduceFlashing`. Knobs: `COHERENCE.beatFlashDecay`, `COHERENCE.beatRingLift`. **OFF dashes stay silent** (preserve no-punishment).
- **C2 — tighten the ONE BUS.** Call `audio.setCoherence(value, tier)` EVERY frame (the `setTargetAtTime` glides already smooth it — droneGlide 0.5 / filterGlide 0.5 / choirGlide 0.6 — so per-frame writes de-stair-step the bloom cheaply); keep only `setIntensity` on the 0.4s throttle. Add COHERENCE transients on the dial's OWN thresholds: collapse-to-floor ("the city forgets") and a rise through `windowThreshold=0.55` ("the lights come on"), each a short filter swell + a cooldown-gated narrator line.
- **C3 — felt FALL.** When `coherenceTarget` snaps to floor on a dead chain (coherence.ts:43), add a `collapseDip` envelope (negative analogue of `focusPulse`) that momentarily drops `washSaturation` below steady then recovers via `fallRate` — gated under `reduceFlashing`/`reduceMotion`/`clarity` exactly like `vignetteDeepen`. Reframe the narrator's combo-break pool to speak of the CITY forgetting.
- **C4 — legible identity (opt-in, default ON).** A thin "CITY MEMORY" gray→neon bar/ring in `ui.ts` fed each frame from `coherence.value` (toggle next to `rhythmAssist` at ui.ts:480). Bind the dial to the focal object: lift spear/dash-trail neon by a coherence-scaled accent (render.ts ~1266-1275) so "my momentum lights the world."
- **C5 — teach the beat.** Add `firstRunsBeatHint` (auto-show the beat-ring for ~3 runs) + a one-time `tryHint('dashOnBeat')` reusing the existing hint surface (game.ts:930 `tryHint('comboBreak')` is the pattern). Lower-risk than flipping `rhythmAssist` default.

**Effort.** M (C1, C2, C3) + M-L (C4) + S-M (C5). **Risk.** Low for C1/C3/C5; Medium for C2 (verify no zipper noise / CPU on adaptPerf path) and C4 (save bump + bullet readability at high coherence). C4 + C5 share the single 5→6 bump.

**OPEN QUESTION (owner).** Keep COHERENCE nameless ambience, or give it the opt-in "CITY MEMORY" meter (C4)? Recommendation: **ship C4 default-ON but toggleable** — it makes the dial chase-able without killing restraint. Confirm OFF-dash stays fully silent (recommended yes).

---

## 2 — LONGER WAVES BETWEEN BOSSES (the director)

**Current state.** `tune.director.bossInterval=45` (tune.ts:109); per-mode `bossInterval` 45 (endless/daily/arena), 35 (nightmare), 45 (bossrush). Boss fires only when `!bossAlive`, so effective gap = 45s chaff + ~15-25s fight ≈ 60-70s real, but the **chaff stretch is a flat featureless 45s**. `intensity()` ramps 0→1 over `rampSeconds=240` then climbs unbounded — it is **boss-blind**, so the 45s before a boss feels identical to the 45s after. `BIOME_DURATION=45` (biomes.ts:18) is value-coupled to `bossInterval`. First boss at t=45s arrives before half the roster unlocks (bloomer@85, bomber@105). ARENA is a scripted 18-entry gauntlet (the model the endless modes lack).

**Target.** ~70s endless/daily, ~55s nightmare stretches, each shaped as **build-up → crescendo → boss → payoff breath** instead of a flat slope. Biome cadence stays coherent. Opening stretch isn't thin AND short.

**Change-set.**
- **D1 — lengthen interval.** `tune.director.bossInterval` 45→70; modes.ts ENDLESS/DAILY 45→70, NIGHTMARE 35→55. `waves.test.ts` reads the value dynamically (no edit). Sanity-check Heat (`bossInterval*=0.65` → 45.5s at MELTDOWN) and `relentless` mutator (`*=0.6` → 42s).
- **D2 — stretch swell (the "satisfying" half).** Pure helper in `updateEndless`: `p = clamp((t - stretchStart)/bossInterval, 0, 1)`; `swell = 1 + TUNE.director.stretchSwell * smoothstep(p)` peaking ~5s pre-boss, reset to 1 the tick after a boss dies. Apply ONLY to spawnInterval/enemiesPerSpawn/maxConcurrent (NOT speed multipliers — avoids a difficulty cliff). Add `stretchSwell: 0.35`. **Derived purely from `this.t` + timer — zero new `world.rng` draws.**
- **D3 — payoff breath + pre-boss calm.** `tune.director.bossLull: 3.5`: skip the spawn branch for ~3.5s after the director detects the `bossAlive` true→false edge (so the gem/power-up/perk payoff isn't stepped on), and suppress ~1.5s before a scheduled boss so it "roars into a clean arena." Pure functions of `this.t` + `bossAlive` — no rng.
- **D4 — re-align biomes.** `BIOME_DURATION` 45→70 (lockstep), OR keep it offset by half a stretch so the biome shift becomes the mid-stretch crescendo marker.
- **D5 — thicken the opening.** Pull early unlocks earlier (orbiter 18→15, splitter 45→35, lancer 60→50) so the longer first stretch builds through 3-4 archetypes. Update `waves.test.ts` unlock-pacing assertions.

**Effort.** S (D1, D4, D5) + M (D2, D3). **Risk.** D1 low-correctness/medium-feel (slog without D2). D2/D3 MEDIUM — must prove zero extra rng draw (run daily-determinism test before/after; the only loop rng is `rng.weighted` whose call count must be unchanged).

**OPEN QUESTION (owner).** Target stretch length: **70s endless/daily, 55s nightmare** (recommended), or push to 90s? And: biome lockstep (D4a) vs half-offset crescendo marker (D4b)? Recommendation: 70s + lockstep for v6 simplicity.

---

## 3 — MORE COMBO OPPORTUNITIES (the combo economy)

**Current state.** `world.combo` int + flat `comboTimer`. `combo.window=1.5`, `multPerCombo=0.1`, `multCap=12`. **Only ONE source feeds combo: a KILL** (`registerKill` called only from `killEnemy` game.ts:1098 and `shatterCore` game.ts:1181). Grazing — the most frequent player action — is invisible to combo. Dash-chain (`killsThisDash`) drives score/slowmo/hitstop but grants NO window extension or streak protection. Boss fights are combo dead zones (dash-HITS on a living boss give zero combo). The 1.5s window is identical for a x2 and a x40 streak. Window-extension sources are all perk/relic-gated, never baseline.

**Target.** Chains survive lulls, boss fights, and clean dashes-into-space. Skill expression (grazing, fat dashes) keeps the combo (and the COHERENCE bloom) alive. High combos feel earned and sustainable, not lucky.

**Change-set (all pure deterministic sim, no rng, no save bump — in-run state only).**
- **B1 — graze refreshes the window.** In `Game.graze` (game.ts:1426), unconditionally `w.comboTimer = max(w.comboTimer, TUNE.combo.grazeRefreshWindow ≈ 1.0)` when `w.combo > 0`. Un-gates the existing `grazeComboBonus` path into a baseline. Optional fractional `comboGrazeCharge += grazePerGraze (≈0.34)` → +1 combo at 1.0 (bounded by `graze.cooldown=0.25`).
- **B2 — dynamic window grows with streak.** `registerKill`: `timer = min(window + combo*windowPerCombo, windowMax)` with `windowPerCombo≈0.03`, `windowMax≈3.0`. A x40 streak gets ~2.2s vs 1.5s. Update `combat.test.ts:51-55` (currently asserts `r.timer === TUNE.combo.window`).
- **B3 — dash-chain extends the window on landing.** On `ev.landed` (game.ts:962), if `killsThisDash >= 2`: `w.comboTimer = max(w.comboTimer, window + killsThisDash*chainWindowBonus)` with `chainWindowBonus≈0.25`. A clean 5-kill dash buys ~1.25s grace.
- **B4 — boss & big-enemy dash-HITS sustain (refresh, no increment).** In `damageEnemy` `hp>0 && fromDash` branch (game.ts:1067-1073): if `w.combo>0`, `comboTimer = max(comboTimer, bossSustainWindow≈1.2)`. Real kills still required to climb — no inflation.
- **B5 (optional, HIGHER RISK) — combo-aware spawn clustering.** Occasional collinear "lane spawn" along a likely dash line, gated by `TUNE.director.laneSpawnChance≈0.18`. **CRITICAL:** new `world.rng` draws MUST be appended at the END of the per-spawn sequence and drawn EVERY spawn (even on failure) to keep the stream byte-aligned. Needs a golden-seed `spawnReset.test.ts` assertion.

**Effort.** S (B1 refresh-only, B2, B3, B4) + M (B1 fractional) + M-L (B5). **Risk.** B1-B4 LOW determinism / MED Daily score pacing (chains last longer → higher scores; re-baselines public boards — acceptable, flag it). B5 MED-HIGH determinism — defer unless B1-B4 prove insufficient.

**OPEN QUESTION (owner).** (a) Should grazing give a full +1 combo or only refresh the window (recommended: **refresh + conservative fractional charge**, avoids trivializing the x12 cap)? (b) Dynamic window shifts existing Daily score pacing — accept the re-baseline, or gate window-growth behind a flag? Recommendation: accept the re-baseline (boards already reset across versions).

---

## 4 — MODE DIFFERENTIATION

**Current state.** Five modes share one `RunConfig` shape read in 3 places. THREE are structurally identical (`updateEndless`, same curve, win=never): ENDLESS, DAILY (byte-identical except `seedKind:'date'` — its flavor is bolted on OUTSIDE modes.ts via `pickDailyMutators`), NIGHTMARE (pure number nudges — and HEAT already does scaled difficulty + score reward, so Nightmare **duplicates the Heat ladder**). Only ARENA and BOSS RUSH have real identity (scripted, winnable). Scoring is uniform `w.score` across all five — a fast flawless Arena clear scores the same as a slow sloppy one. Events are silently endless-only (`updateEndless` is the only emitter).

**Target.** Each mode carries a distinct MECHANICAL identity as DATA, not a Director branch. Winnable modes reward MASTERY. Daily feels like "your one shot."

**Change-set.**
- **M1 — declarative `rules` block on RunConfig.** Optional `rules?: ModeRules` = `{ events: 'normal'|'none'|'curated'; oneLife?: boolean; scoreFrame?: 'survival'|'cleartime'|'nohit'; suddenDeath?: {...}; biomeLock?: number; perkCadenceMul?: number }`. Wire each flag at exactly ONE read site (events at waves.ts:192, oneLife sets `reviveLeft=0` at game.ts:311, scoreFrame at game.ts:1603/1699). Flows through the SAME clone pipeline Heat/mutators already use. Absent `rules` = today's behavior exactly. None touch `world.rng`.
- **M2 — NIGHTMARE gets SUDDEN DEATH.** Replace its number-nudge identity with `rules.suddenDeath`: arena shrinks by a deterministic inset derived purely from `bossCount` (no rng) + shields OFF + `rules.events:'curated'` (high-risk pool only). The walls-close-in mechanic is something Heat CANNOT express — gives Nightmare a true identity instead of overlapping Heat. **CRITICAL:** bounds clamp must apply identically in sim regardless of canvas size/DPR — gate on `bossCount` (sim state), never pixels.
- **M3 — completion-quality scoring for ARENA & BOSS RUSH.** `rules.scoreFrame:'cleartime'`: track `clearTime` (sim time) + `hitsTaken`; add a deterministic bonus `+floor(timeBonusBase - clearTime*k) + noHitBonus*(hitsTaken===0)` (constants in tune.ts) in `winRun`/`finishGameOver`. Submit `clearTime`/`hitsTaken` via the existing per-mode `submitScore` payload. Turns winnable modes into speedrun/mastery modes reusing the existing boards.
- **M4 — DAILY as a self-contained identity.** `rules.oneLife:true` + `rules.events:'curated'` declared IN modes.ts; move the `cfg.id==='daily'` special-case (game.ts:286) behind a `dailyMutators:true` flag. "Your one serious run on today's echo." **Owner sign-off needed** (one-life is a design call; interacts with the Reviver meta node — apply `reviveLeft=0` AFTER stats so it always wins).
- **M5 — event behavior per mode (near-free).** Branch `rules.events` at waves.ts:192-195: ENDLESS 'normal', NIGHTMARE 'curated', DAILY 'curated fixed slot', ARENA/BOSSRUSH 'none' (explicit). **CRITICAL:** keep `rollEventId`'s `world.rng` draw count constant across pools (draw then map) to preserve Daily bit-identity.

**Effort.** M (M1) + M-L (M2) + M (M3) + S-M (M4) + S (M5). **Risk.** M1/M5 Low. M2 Med (bounds-clamp desync trap). M3 Med (save bump only if persisting best clear-time). M4 Low-Med (oneLife × revive interactions).

**OPEN QUESTION (owner).** Retire NIGHTMARE into the Heat ladder, or keep it with the Sudden-Death rule (recommended: **keep + Sudden Death**)? And: is `oneLife` Daily acceptable for the public board, or must Daily stay a plain Endless seed for fairness? Recommendation: oneLife Daily is the classic framing and stays deterministic — ship it behind owner sign-off.

---

## 5 — MODE-SELECTION STEP BEFORE PLAY

**Current state.** NO select step. `PLAY` (ui.ts:265) IS hardwired to Endless; the other 4 modes are instant-launch `btn-mode` buttons (ui.ts:272). No persisted/highlighted selection (SaveData has no `selectedMode`). Descriptions hidden as hover `title` tooltips (invisible on touch/AT). Keyboard/gamepad CANNOT pick a non-Endless mode — `handleMeta()` title branch (game.ts:822-823) hardcodes `start(MODES[0])`. Small touch targets launch a full run on one tap (footgun). **The proven select-then-persist pattern ALREADY EXISTS** for Heat (`openHeat` ui.ts:762) and Archetype (`openArchetype` ui.ts:797) — it just hasn't been applied to modes.

**Target.** Pick a mode (with description + difficulty/reward) → see it highlighted + persisted → press ONE prominent PLAY. Fully operable on keyboard/gamepad/touch. Daily/Heat/mutators surface in the selection flow.

**Change-set.**
- **U1 — select-then-PLAY.** Render all 5 modes (incl. Endless) as selectable `mode-card`s (name + desc + a difficulty/reward line derived from RunConfig: NIGHTMARE → "×1.75 shards · faster, denser"; ARENA/BOSSRUSH → "WINNABLE"). Track `selectedModeId` in UI; clicking sets `.selected` + `aria-pressed` + updates one description/preview panel — mirroring `openHeat`. `btn-play` becomes the ONE action: `onStart(modeById(this.selectedModeId))`. Add `selectedMode: string` (default 'endless') to SaveData + the single 5→6 bump; persist via new `onSelectMode(id)` callback; `refreshTitle` restores the highlight. **`start(cfg)`/`world.rng` untouched.**
- **U2 — keyboard + gamepad nav.** `handleMeta()` title branch: `consumeStart()` launches `modeById(save.selectedMode)` (not `MODES[0]`); route left/right to `ui.moveModeSelection(dir)`. Reuse existing input edges (gamepad d-pad input.ts:272-273, digits 1-5 input.ts:63-66). Roving tabindex / aria on the cards.
- **U3 — surface Daily seed / Heat / mutators in the preview.** For Daily: show today's seed line + a READ-ONLY mutator preview via `pickDailyMutators(seedFromDate())` mapped through `MUTATORS[id]`. **CRITICAL:** the preview MUST call `pickDailyMutators` on a throwaway seed using its OWN rng — never `world.rng`/`dropRng` (the real pick happens in `start()` off the seeded stream). For all modes: a compact Heat chip with a "change" affordance opening `openHeat`.
- **U4 — touch targets + accidental-launch guard.** Cards become non-launching selectors (footgun gone). Enlarge `.btn-mode` → card `min-height ~64px` + selected ring; keep PLAY the dominant pulsing CTA (respects reduce-motion gate at style.css:1271).

**Effort.** M (U1) + M (U2) + S-M (U3) + S (U4). **Risk.** Low-Medium. Single 5→6 bump (shared with §1 C4/C5 and §4 M3 — **one migration for all**). Verify `migrate.test.ts` + determinism test pass.

**OPEN QUESTION (owner).** Default-selected card on load: **Endless** (returning muscle-memory) or last-played mode? And: confirm `pickDailyMutators(seed)` uses its OWN rng so the preview can't perturb the Daily (must verify in code before U3). Recommendation: default to last-played; verify the rng isolation first.

---

## 6 — BETTER, LESS-CHEESY STORY (keep light/dark)

**Current state.** Narrative is entirely text/data on cosmetic surfaces → every rewrite is byte-safe (no rng, no sim, no schema bump). The motif **"remember/remembers" is a verbal tic** appearing on ~10 surfaces (combo tiers, strata, victory, highCoherence, tagline, the OVERDRIVE name, lore, the choice). The narrator TELLS the emotion the COHERENCE wash already SHOWS ("The whole skyline remembers now" while the skyline literally lights up). Combo-tier lines are anticlimactic ("Ten." "Twenty." "Fifty.") and only voice 4 of 6 COHERENCE cut points `[10,20,35,50,75,100]`. Boss quotes read as comic-book taunts in a grief story. `choiceEnding('catch')` "the city remembers your name" is the single cheesiest line AND contradicts the "you ARE the kingdom's last memory" through-line. Meta/player-facing lore drifts earnest/greeting-card; the chatty personified city/loop breaks the file's own stated "restraint IS the soul."

**Target.** Concentrate the motif on 2-3 anchors so it lands; trust the wash to carry emotion; regret over banter; resolve the through-line drift (you are a memory holding itself, not a knight being thanked).

**Change-set (all text-only, own rng, cosmetic — zero sim/schema risk).**
- **S1 — de-tic the motif.** Rewrite `narrator.comboTier` to stop counting + stop repeating "remember"; drop `highCoherence` to one near-silent line that doesn't restate the visual; trim victory's double "Lancefall remembers itself." Keep the tagline "remember the fall" + the "REMEMBER EVERYTHING" ultimate as the two PROTECTED anchors.
- **S2 — reground combo-tier cadence to all 6 cut points.** Six rising sentences the city speaks to itself (not a countdown), so the audio tier bloom and the narrator beat agree. Additive — `game.ts:1224` reads `NARRATOR.comboTier[t.at]` by value, so adding 35/75 keys is safe.
- **S3 — boss quotes: taunts → regrets.** Keep the (genuinely good) dossier prose; replace the 6 quippy quotes with admissions/regret (e.g. SOVEREIGN "There was a word that would have turned it. I chose silence."). Mirror into `narrator.bossKill`/`bossApproach`. Watch CODEX blurb width at small viewports.
- **S4 — fix THE CHOICE copy + through-line.** `choiceEnding('catch')` → drop "remembers your name" (generic hero flattery that contradicts the lore). Prompt (ui.ts:404) "The star is falling. Will you catch it?" → "The light is going out. Hold it, or let it go." Buttons "HOLD THE LIGHT" / "LET IT GO". **Keep the test heads** ('THE LIGHT HOLDS'/'THE LIGHT RELEASED') so `stillpoint.test.ts` passes; only change `.line`.
- **S5 — restore restraint to player-facing lore + meta narrator.** Terser, colder second-person; the dead world is too far gone to flatter or banter. Verify no test asserts on a specific lore `.text` substring before editing.

**Effort.** ~4-5h total, text-only. **Risk.** None to sim. Only taste + a few test-string guards (stillpoint heads, lore ids/costs). Keep rewrites in the same buckets so `game.ts` wiring is untouched.

**OPEN QUESTION (owner).** (a) Expand the ECHO vignette pool (the most grounded surface)? Growing it changes which citizen a past date maps to (cosmetic-only, Daily score still bit-identical) — recommend yes, flag it. (b) Keep both motif anchors, or rename the ultimate to free the word entirely (higher blast radius — touches game.ts:497/508, ui.ts:723/1177, 2 achievement strings)? Recommendation: keep both anchors, de-tic only the incidental uses.

---

## 7 — A 3rd LIFE SEGMENT BY DEFAULT  ⚠️ INTENT MUST BE CONFIRMED FIRST

**The terminology trap.** The owner says "add a 3rd life segment by default," but the game ALREADY has `stamina.segments=3` — and those are **DASH segments, not lives**. The `Player` type has NO health/lives/armor field; LANCEFALL is strict one-hit-death. So "a 3rd life segment" CANNOT be taken literally (segments=3 is already the default; a *4th* would be the change). It must mean **a small default survivability cushion (~3 hits)**. A fresh player with no meta unlock has ZERO free lives — only LAST BREATH on a 38s cooldown. That brutal swinginess is almost certainly why the owner wants a default buffer.

**THREE OPTIONS — owner picks before any code:**

| | Option | What | Feel | Risk |
|---|---|---|---|---|
| **A ✅ RECOMMENDED** | **ARMOR hit-buffer** | New `player.shields`/`maxShields`; `tune.survival = { defaultShields: 2-3, postHitIframe ~0.8-0.9, postHitPush, postHitPushRadius }`. In `playerDie` BEFORE LAST BREATH: if `shields>0`, decrement, set iframe, shove nearby bullets (reuse the proven LAST BREATH push loop — deterministic, position-only), "ARMOR" toast, return. Order: **shields → LAST BREATH → revive → death**. Discrete HUD pips (matches "segments" wording). Optional +1 regen on wave-clear. | Each absorb costs tempo + forces repositioning (it's a shove, NOT a full bullet-clear) — bullet-hell tension survives. Closest faithful reading of "3 life segments." | Medium — most likely to soften difficulty if `defaultShields` too high. Mitigate: start at 2, gate via a new `heat.ts shieldsLost` column. |
| **B (minimal)** | **Free revive default** | `deriveStats` base `reviveTokens` 0→1 (or `TUNE.survival.defaultRevives`). Reuses the fully-built, tested revive path; Heat already strips revives. No new field/HUD/system. | A revive's full-screen bullet-clear is a big DRAMATIC save, not a gentle cushion; 1 revive ≠ 3 segments. | Low mechanically, conceptually mismatched. |
| **C (alternative)** | **Regenerating shield charge** | `player.shieldCharge` (0..1, optionally up to 3) recharging after ~20s without a hit (like LAST BREATH but a true hit-eater). HUD = a shield ring that refills. | Sustained, skill-rewarding ("play clean, keep your shield"); can never snowball into invincibility. | Medium — the recharge timer lives in the hot sim loop and MUST advance on **sim dt** (like `tickClutch`) to stay Daily-bit-identical. |

**All three are determinism-safe** (read positions only, no `world.rng`, no coherence/ghost/narrator touch) and Daily-identical if seeded identically from `TUNE`. Persistent `baseShields` as a meta-upgradable stat → the single 5→6 bump (a pure per-run cushion needs NO bump). Whatever is added, **Heat needs a matching strip column** so the score-multiplier ladder stays balanced at high levels.

**Recommended order if multiple cushions coexist:** buffer first → LAST BREATH (last line of defence) → revive → death.

**OPEN QUESTION (owner) — THE GATING QUESTION FOR THIS WHOLE WORK-STREAM.** Which of A / B / C? (Recommendation: **A, `defaultShields: 2`, `postHitIframe ~0.85`, regen +1 on boss-clear**, HUD pips, Heat strip column.) And: behind an accessibility/difficulty toggle (leaderboard purists run true one-hit), or genuinely ON for everyone incl. Daily? Recommendation: ON for everyone (it stays deterministic; boards re-baseline), no asterisk.

---

## 8 — THE SOUNDTRACK ⭐ (THE CENTERPIECE)

**Current state.** Fully synthesized, offline-first. Signal chain: every voice → `sfxBus(0.9)` or `musicBus(0.6)` → `master(0.8)` → a single tanh `WaveShaper` soft-clip limiter → destination. **No DynamicsCompressor, no AnalyserNode, no convolver, no StereoPanner** anywhere (confirmed). Music = ONE 16-step / 8-note loop: hardcoded `PENTA[10]` (audio.ts:819) + `ARP[8]=[5,7,9,7,6,9,7,5]` (audio.ts:820) + a 16-step rhythm in `playStep`, all over a **static A-minor drone that never changes chord**. `MUSIC_BPM=112`. 6 boss themes exist as pure data (`bossThemes.ts`). COHERENCE owns the drone bloom + choir crossfade (`choirOnset=0.6`). The delay "reverb" sends SFX only — music is bone dry. **The #1 earworm blocker: no melodic hook, no chord movement, no song structure, no leitmotif that returns.** It's ambient generative texture, not a song. ZERO audio tests (only `beat.test.ts` + `bossThemes.test.ts`).

**The research, distilled (full citations in the brief).**
- **Earworm = common global contour + ONE uncommon local leap** (Jakubowski et al. 2017): a predictable arch the brain forecasts from a few notes, plus one oversized turning-point gradient that "snags."
- **Repetition is the engine**, not the enemy (Margulis *On Repeat*): short loops chunk fast (motoric/basal-ganglia encoding), processing fluency is misread as "I like this," and attention migrates to the SURFACE (timbre/groove). An unresolved loop point = a Zeigarnik "cognitive itch."
- **Groove = syncopation + gap-fill + tension/release**; a great track has a MELODIC hook AND a PRODUCTION hook (a signature timbre).
- **Adaptive scoring = vertical layering (add/remove stems by intensity) + horizontal re-sequencing (swap sections at musical boundaries).** LANCEFALL already seeds both: COHERENCE drone-bloom/choir/arp-density (vertical) + per-boss themes / biomes (horizontal).
- **Long-session fatigue is solved by loop-length ≥ scene-time + SURFACE variation + dynamic range**, not more melody.
- **112-130 BPM is the action/flow pocket**; synthwave is the established neon-dash-combat idiom (Hotline Miami / Blood Dragon / Drive). **112 BPM stays UNCHANGED** (it's the beat grid + dash-grading + combo-transpose SoT; changing it is a gameplay-feel change, out of scope).

**THE ARCHITECTURE DECISION — HYBRID, realized as PROCEDURAL STEMS.** Keep 100% procedural Web Audio (preserves offline-first, no asset weight, no schema change for the engine, keeps the COHERENCE/combo pitch-coupling that makes this game's audio diegetic), but restructure the engine into a **stem/bus model** that mimics authored stems: each "stem" is a deterministic procedural generator gated by a layer-gain → authored-style vertical layering + horizontal re-sequencing WITHOUT shipping files. Authored loops would break the offline-first invariant and lose the pitch-coupling. **Verdict: procedural-but-much-richer, organized as if it were stems.**

**THE BUILD PLAN (sequenced — later steps depend on earlier).**

**A1 — Extract a PURE, unit-tested transport + score (the keystone).** New `src/musicTransport.ts` (PURE, no ctx — mirrors `beat.ts`): given `musicTime` + bpm, yields `{bar, beatInBar, sixteenthIndex, section}` + a section state machine (AMBIENT / COMBAT / BOSS / OVERDRIVE / CALM) with bar-quantized transition requests. New `src/musicScore.ts`: PURE data tables (per-section/per-biome rhythm masks, bass patterns, melodic motifs as PENTA indices) replacing the inline `PENTA`/`ARP`/`playStep` branching. `scheduleMusic` asks the score "what plays at (section, step)." Tests: `musicTransport.test.ts` + `musicScore.test.ts`. **Snapshot the current pattern as section AMBIENT so default output is unchanged** (de-risks the scheduler refactor). Keep `musicEpoch`/`musicTime` semantics identical (game.ts:728 reconcile depends on them).

**A2 — Named music sub-bus tree.** Under `musicBus`: `musicDrumsBus`, `musicBassBus`, `musicHarmonyBus` (drone+choir), `musicLeadBus` (arp+lead), `musicBossBus` — each a GainNode → musicBus. Re-point the ~6 voice call-sites (kick→drums, bass→bass, drone/choir→harmony, boss→boss, pluck→lead). Add a music-side reverb send (mirror the sfx delay, OR an `OfflineAudioContext`-rendered IR convolver — still offline-first). `setLayer(name, gain, glide)` so the director fades stems per section. **A one-time per-voice gain re-tune is expected** (summed gain into musicBus changes) — cosmetic, no sim impact.

**A3 — DynamicsCompressor on musicBus + sidechain "pump."** Insert a `DynamicsCompressorNode` between musicBus and master. The four-on-the-floor pump (kick ducks pad/bass) is the genre-defining synthwave trait and is currently impossible. Lower-risk approach: scheduled `setTargetAtTime` gain dips on harmony/bass sub-buses keyed off kick times (reuses existing kick scheduling). Constants → `tune.ts` (threshold, ratio, pumpDepth, pumpRelease).

**A4 — THE LANCE THEME (the earworm) + chord movement.** Per-biome motif table + a simple diatonic chord cycle (e.g. Am-F-C-G as transpose offsets applied to the existing `rootMul`) so the harmony MOVES instead of sitting on a static A drone. **THE LANCE THEME** (hero leitmotif): an 8-note pentatonic hook — global rising-then-falling arch (the common contour) + **ONE +9-semitone leap** at the turning point (A-C-E up to high D, on a syncopated "and" — the snag) + a **stepwise descent gap-fill** (E-D-C-A — the satisfaction) + ending **unresolved on the 2nd degree** (the Zeigarnik itch that loops the ear back). Built from the existing PENTA set so it can never sound "wrong," and it **transposes intact with `rootMul`** — so as the combo tier climbs through `COHERENCE_AUDIO.tierSemis [0,2,3,5,7,9,12]`, the whole hook lifts in lockstep with the visual neon bloom. **The earworm IS the scoreboard.** **THE FALL** (kingdom/light-dark): the SAME pitch set in 4× augmentation on the choir/pad as the gray calm theme — so the calm-state pad and the combat hook are the same melody at different time-scales (a hidden Margulis relationship players feel before they notice); at full COHERENCE they overlay = "remember everything."

**A5 — Layer model + COHERENCE/heat integration (vertical).** Six gain-gated stems: L0 SUB/DRONE (always on, owned by `setCoherence`), L1 KICK+BASS (always on), L2 ARP (heat-gated), **L3 LEAD/HOOK (NEW — detuned-twin-saw neon lead playing THE LANCE THEME through `leadFilter`; gain fades in at `coherence > leadOnset≈0.35` so the hook is the REWARD of a clean run)**, L4 CHOIR/PAD (`coherence>0.6`), **L5 PERC/BREAK (NEW — half-time DnB hat/ghost-snare at `heat>~0.7` for the synthwave-DnB hybrid)**. Extend `setCoherence(c, tier)` to own `leadGain`/`leadFilter` (ONE controller per knob — the engine's rule). New `COHERENCE_AUDIO` constants: `leadOnset:0.35`, `leadGain:0.12`, `leadFilterBase:800`.

**A6 — Per-boss motifs + mix snapshots (horizontal).** `bossThemes.ts` gets optional `motif?: number[]` + `motifGain?` (data-only): each boss states a recognizable 2-bar phrase over its chord (WARDEN tritone, SOVEREIGN grand root-fifth-octave finale), scheduled on the lead layer at bar boundaries — pure horizontal re-sequencing; boss death fires the existing `bossStinger` then resequences back to arena form. Replace the binary `duckMusic(15%)` with `setMixState(COMBAT/MENU/BOSS/OVERDRIVE/DEATH)` — coordinated per-bus gain/filter snapshots (data in tune.ts), called from the existing audio call-sites (bossMusic game.ts:1852, overdrive game.ts:505, menu/draft game.ts:415/436, death game.ts:1584).

**A7 — Anti-fatigue (long sessions).** Short surface loop (2-bar hook, chunks fast) but long effective horizon: macro-form **A (8 bars, plain) → A' (8 bars, octave-up/ornamented) → B (4 bars, fifth-up = THE FALL fragment) → A (8 bars)** = ~28-bar / ~60s rotation, ~2-min exact-repeat horizon. Per-note humanization (velocity, ±3ms timing, ±4c detune, cutoff jitter) from a dedicated **cosmetic LCG `cmusRng` seeded from the audio clock — NEVER `world.rng`** (Daily stays bit-identical). Drone/choir/filter swells on 30-90s envelopes (continuous slow motion under the fast loop). Vertical thinning at low intensity (shed L3/L5 in lulls → the Hyper Light Drifter ambient pole → real ear-rest before the next bloom).

**A8 — Tests.** Pure-number Vitest (no AudioContext): `LANCE_THEME` index→frequency under each tier transpose (assert `== PENTA*rootMul`, in range), `MACRO_FORM` section selection given a step count, `cmusRng` reproducibility from a fixed seed.

**Effort.** L (A1) + M (A2) + S-M (A3) + L (A4) + M (A5) + M (A6) + (A7 folded into A4/A5) + S (A8). The soundtrack is the largest single work-stream. **Risk.** A1 Medium (beat-clock epoch/timing regression — mitigate by keeping musicEpoch semantics identical + snapshotting current pattern as AMBIENT). A2 Medium (mix re-tune). A4 Medium (chord motion staying consonant under coherence transpose — keep everything PENTA-safe). All cosmetic, no sim/rng/determinism risk. Schema bump only if a user "lead on/off" or "reactive music" toggle is persisted (fold into the single 5→6 bump).

**OPEN QUESTIONS (owner).** (a) **Architecture: confirm HYBRID-as-procedural-stems** (recommended) vs a fully authored composed theme (faster to "memorable" but adds asset weight / breaks offline-first / loses pitch-coupling). (b) Per-biome music identity — should each biome get its own key/progression/percussion stem (recommended yes — the score evolves with the world like the color wash)? (c) Acceptable to ship tiny `OfflineAudioContext`-rendered one-shots (snare/hat/pad) baked at boot to escape live-oscillator CPU/tone limits, or must every sound stay a live node graph? (d) Is a one-time re-tune of all per-voice SFX gains acceptable (cosmetic, changes the felt mix)?

---

## BUILD ORDER (prioritized + sequenced, with dependencies)

**Phase 0 — UNLOCK (owner answers, ~0 code).** Resolve the 4 gating questions: §7 (A/B/C cushion + on-by-default?), §8a (hybrid-procedural-stems confirmed?), §4 (oneLife Daily OK?), §6b (keep both motif anchors?). Everything else can proceed in parallel on defaults.

**Phase 1 — FOUNDATIONS (parallel, low-risk, no cross-deps).**
- Story rewrites §6 S1-S5 (text-only, zero risk — ship first, builds momentum).
- Director §2 D1 + D4 + D5 (numeric, low risk).
- Combo §3 B1-B4 (pure sim, no rng, no schema).
- The SINGLE `SAVE_VERSION 5→6` migration scaffold (so §1, §4, §5, §7 can each add their persisted field into ONE migration).

**Phase 2 — STRUCTURE (depends on Phase 1).**
- Director §2 D2 + D3 (stretch swell + lull — needs D1's interval; prove zero extra rng draw).
- Mode `rules` block §4 M1 (the data spine that M2/M3/M4/M5 hang off).
- Mode-selection §5 U1 (consumes the 5→6 bump; the pattern other UI hangs off).

**Phase 3 — IDENTITY (depends on Phase 2).**
- Modes §4 M2 (Sudden Death) + M3 (cleartime/nohit) + M4 (Daily oneLife) + M5 (events) — all ride the M1 rules block.
- Mode-selection §5 U2 (kbd/gamepad) + U3 (Daily/Heat/mutator preview) + U4 (touch) — ride U1.
- Survivability §7 (the chosen option A/B/C) + Heat strip column.

**Phase 4 — COHERENCE BINDING (parallel with 3, some shared files).**
- §1 C1 (graded beat feedback) + C2 (per-frame audio + transients) + C3 (felt fall) + C4 (CITY MEMORY meter, rides the 5→6 bump) + C5 (teach the beat).

**Phase 5 — THE SOUNDTRACK CENTERPIECE (largest, mostly independent files; A4+ benefits from §1 C2's per-frame audio landing first).**
- §8 A1 (transport/score keystone) → A2 (sub-buses) → A3 (compressor/pump) → A4 (LANCE THEME + chords) → A5 (layer model + coherence integration) → A6 (boss motifs + mix snapshots) → A7 (anti-fatigue) → A8 (tests). Strictly sequenced internally.

**Phase 6 — INTEGRATION SWEEP.** Full `tsc` + all tests + build + in-browser playthrough across all 5 modes; Daily-determinism golden check; a11y pass (reduceFlashing/reduceMotion/clarity on every new visual); update README + CLAUDE.md project table + MEMORY note.

---

## FURTHER IMPROVEMENTS / EXPANSIONS (brainstorm)

- **The earworm as a meta-progression reward.** Unlock alternate LANCE-THEME timbres / boss motif remixes as cosmetic "soundtrack skins" alongside dash-trail unlocks — directly monetizable as a cosmetic tier.
- **Shareable 6s replay gets the music baked in.** The existing replay already captures the run; render the COHERENCE-synced soundtrack snippet so the share clip is audibly the player's run — huge organic-growth lever.
- **"Conduct the city" daily modifier.** A Daily where the section/biome music identity is the puzzle (a fixed horizontal sequence everyone hears), turning the soundtrack into a shared talking point.
- **Adaptive difficulty via COHERENCE.** Surface (not change) a gentle rubber-band: sustained low coherence after deaths could (opt-in, off the leaderboard) soften the swell ceiling — a kinder on-ramp that the bullet-hell purist can disable.
- **Per-biome leitmotif CODEX entries.** Unlock the written "story" of each biome's theme as Memory Fragments — deepens both the music and the lore layers with shared content.
- **Endless "terminal beat."** Give Endless a soft 20-min crescendo cap (an optional final mega-boss / choir apotheosis) so it has a destination instead of pure attrition — fixes the §4 "Endless has no terminal beat" gap.
- **Accessibility "audio-only beat cue" mode.** For low-vision players, a distinct metronome tick + the LEAD's downbeat as the dash-on-beat teacher — turns the soundtrack itself into the a11y feedback channel.
- **Stereo width + the new sub-buses.** Once A2 lands, a `StereoPannerNode` per stem (pad wide, kick centered) is a near-free production-hook upgrade.
- **Leaderboard dimensions per scoreFrame.** Once §4 M3 ships clear-time/no-hit, expose them as separate boards (the Worker is already keyed by mode) — speedrun and survival communities both get a home.
