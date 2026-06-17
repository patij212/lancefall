# LANCEFALL — The Path to 10/10

> **Goal:** take LANCEFALL from a ~7/10 *experience* (on top of ~9/10 *engineering*) to a genuine **10/10 game** — and ship a strong **Solstice jam** submission (due 2026‑06‑21) on the way.
> **Author:** review + spec, 2026‑06‑16. Grounded in a first‑hand playtest, the v6 codebase (26k LOC, ~120 modules, 73 test files), and the prior multi‑reviewer audit in `docs/WINNING_PLAN.md`.
> **Scope answers baked in:** optimize for *player‑craft polish + jam launch*; cuts are *recommended, you decide*; everything ranked by impact.
> **Two user‑set design pillars folded in:** the new **cockpit UI** (`.superpowers/.../mock-v4*`, the "ChatGPT Image Jun 16" render) and the **biomechanical enemy redesign** (`mockups/shot-b.png`, Proposal B).

---

## 0. Build-status reality check (audited 2026‑06‑16)

A live code audit shows the team already shipped **most of Tiers 0–2** from the old `WINNING_PLAN`. Verified present in the codebase:

| Spec item | Status | Evidence |
|---|---|---|
| 0.1 Boot guard | ✅ shipped | `main.ts` — "THE SIGNAL DROPPED" overlay + `window.onerror` + `unhandledrejection` + try/catch |
| 0.2 Full‑sim determinism test | ✅ shipped | `determinism.test.ts` — bit‑identical rng state after a 300s run |
| 0.3 "Cheating Death" misfire | ✅ addressed | `achievements.ts:60` gated by `won \|\| wave>=2` |
| 1.3 Threats always legible | ✅ shipped | `THREAT_RIM` / `threatRim()` — constant neon edge that survives the desaturation wash |
| 1.4 Tap‑dash | ✅ shipped | `input.ts` dash‑tap edge + `player.ts` tap‑dash floor |
| 1.5 Casual mode (off‑board) | ✅ shipped | `modes.ts` — `ranked:false` + `casualShields:6` |
| 1.7 / onboarding grace | ◑ partial | `onboarding.ts` first‑run grace + beat‑teach nudge exist; a dedicated *no‑fail dash sandbox first screen* does not |
| 2.2 FIRST LIGHT | ✅ shipped | `game.ts`/`render.ts` day‑wash ramp + `lore.ts` "The First Light" |
| 2.3 Branded GIF | ◑ mostly | `gif.ts` `drawWatermark` (score/seed/site) done; verify the in‑page copy‑image/`navigator.share` UX |
| 2.4 READ THE KEY decode | ✅ shipped | `cipherDecode.ts` — substitution key on HUD, player reads the cipher |

**Therefore the true remaining gap to 10/10 is narrow and matches the two directions you chose:**

1. **The Cockpit UI (item 1.1)** — *not built.* The live title is still the old card sprawl. **Highest‑impact visible lever.**
2. **The Biomechanical enemy + boss redesign (item 2.1)** — *in progress (2026‑06‑17), uncommitted.* A clarity‑first biomech layer is already built behind a `BIOMECH_ENEMIES` flag, but it details the *legacy* silhouettes rather than porting the liked `drawB_*` designs. **The user + a parallel agent now own the enemy/boss visuals.** Still the identity payload. (See §0.1.)

Secondary still‑open work: onboarding sandbox polish (1.2), the optional cuts/consolidation (§4), Tier‑3 depth (biomes‑change‑a‑rule, unique enemy verbs, meta‑as‑mechanics), and Tier‑5 craft (god‑object splits, broader tests, perf budget, modal a11y). Everything in Tiers 0–2 not listed as a gap above is **done**.

> The rest of this document is the original full spec; treat the two gaps above as the active work and the ✅ rows as reference/regression‑guard.

### 0.1 Status re-baseline (2026‑06‑17 — execution kickoff)

A second audit + the team's decisions update §0 and supersede parts of the roadmap below:

- **2.1 biomech is no longer "not built" — it's in‑progress and uncommitted.** A clarity‑first biomech layer exists behind a `BIOMECH_ENEMIES` flag (`render.ts` grew ~+1260 LOC → **2898, now the largest file**; `tune.ts` adds a `BIOMECH` block). It typechecks and the full suite passes (74 files / **705 tests**; `vite build` OK), with the legacy flat‑neon art preserved behind the flag for A/B. BUT it *details the legacy silhouettes* rather than porting the liked `drawB_*` designs (`mockups/proposal-b-biomech.html`): Warden is close, Darter/Seeker partial, **Orbiter (hex≠cog) and Lancer (triangle≠railgun) drifted**. **The user + a parallel agent now own the enemy/boss visuals**; the implementer of this plan stays out of `render.ts` enemy draws + `tune.ts` BIOMECH until handoff. Biomech ships as the default + a single **global** all‑enemies A/B toggle (settings live in `save.ts`).
- **1.1 cockpit UI is the live gap and the active build** — porting `mock-v6.html` into `ui.ts`/`style.css` (DOM; no render.ts conflict).
- **§4 cuts: superseded by the team's own (gentler) consolidation.** Adopt the **6‑card rail** from `mock-v6.html` — CASUAL · ARENA · BOSS RUSH · ECHO OF THE FALL (daily+weekly merged) · NIGHTMARE (locked) · SOLSTICE PROTOCOL (locked) — NOT the spec's more aggressive 5 (we keep Boss Rush + Casual as cards). **All 8 modes stay as data; all 6 ships stay** (no REAVER gating — "one fewer ship improves nothing"). Newcomers get progressive disclosure, not deletion.
- **Timeline:** ~4 days to the jam (2026‑06‑21) at re-baseline.
- **Stale figures fixed:** `render.ts` is 2898 LOC (not 1786, see §2/§5.1); the §2.1 enemy‑switch line numbers (~723–954) are obsolete.

---

## 1. The honest review

**One sentence:** LANCEFALL is a world‑class *engine* and a maximalist *content pile* wearing the front door of a settings menu — the distance from 7 to 10 is **subtraction, focus, and identity**, not more features.

### What's genuinely great (don't touch these)
- **The hook is A‑tier.** "You don't shoot, you *dash* — your trail is the spear." Momentum‑commit‑on‑release, i‑frames, graze‑to‑refuel, combo‑or‑die. This is a real, original verb. Few games have one this clean.
- **The engine is a 9.** Fixed‑timestep sim decoupled from a global `timeScale`, object pools (zero hot‑path alloc), swept segment‑vs‑circle so fast dashes never tunnel, seeded `mulberry32` determinism, a pure/tested `sim` layer. Boots with **0 console errors/warnings**. This is the foundation a 10/10 is *allowed* to stand on.
- **The juice stack is rich** — trauma shake, hitstop, slow‑mo, bloom, chromatic aberration, parallax, combo callouts. The raw materials of "feel" are all here.
- **Audio is ambitious and honest** — hybrid authored beds + procedural reactive layer, machine‑checked CC0/CC‑BY provenance ledger, graceful procedural fallback.

### What holds it at ~7 (the 10/10 blockers)
1. **The front door is "configure me," not "PLAY."** First screen (even after the planned declutter) still exposes **9 mode cards + 6 ships + 5 palettes + 7 trails + 11 utility buttons**. A new player meets a control panel, not a game. *This is the single biggest perceived‑quality drag.* — **The new cockpit UI fixes exactly this.**
2. **The struggling player gets the least‑legible screen.** Threat legibility is coupled to the COHERENCE gray‑wash: low combo → desaturated, harder to read → you die → even lower combo. The juice‑for‑skill loop is inverted for the people who most need clarity.
3. **No gentle on‑ramp.** One‑hit‑kill from second one, jargon (COHERENCE, ARMOR, OVERDRIVE, graze, fusions) fired at you with no sandbox. The core verb is never *taught*, only listed in a controls table.
4. **The identity is generic neon.** Enemies read as "glowing vector shapes #47." Nothing about a screenshot says *LANCEFALL* specifically. — **The biomechanical redesign is the fix.**
5. **The "ode to Turing" is decoration, not a played act.** The cipher is memorize‑and‑follow‑the‑highlight, not a deduction you perform. A rival jam entry ships a real Bombe.
6. **No signature WOW frame.** There is no single ~3‑second beat the trailer opens and closes on — the thing that makes someone share it.
7. **Content breadth outruns content depth.** Biomes retint rather than re‑rule; several enemies share one zoner AI; meta nodes are flat stat bumps; one dash‑refund build dominates. Lots of *systems*, not enough *consequences*.
8. **Invisible‑but‑real craft debt.** `game.ts`/`audio.ts`/`ui.ts`/`render.ts` are 1.7k–2.6k‑LOC god‑objects; the 5 biggest files + the Worker have ~no tests; modals are click‑only; shake isn't tied to reduce‑motion; the leaderboard is client‑authoritative; boot is (was) unguarded.

### The through‑line
A 10/10 arcade game is **legible**: Geometry Wars, Vampire Survivors, Tetris Effect, Hades all have *one* obvious hook and a *frictionless* on‑ramp, then reveal depth. LANCEFALL has the hook and the depth — it's **missing the legibility and the identity in between**. Every tier below serves that.

---

## 2. Current → target scorecard

Axes from the prior audit (Grid B), re‑scored against a *player‑craft 10/10* bar. "Now" = my read of the live build; "10" = what a perfect score requires.

| Axis | Now | 10/10 requires | Biggest lever |
|---|---|---|---|
| Game feel / juice | 8 | Tap‑dash instant verb; per‑frame juice budget so big chains read as power, not noise | T1 / T2 |
| Visual clarity | 7 | **Threats always full‑saturation**, decoupled from the wash; bloom soft‑capped | **T1** |
| Visual identity | 5 | **Biomechanical** enemies + bosses; one recognizable silhouette language | **T2** |
| Audio | 8 | Raise the low‑combo floor mix; finish per‑boss themes; credits screen | T2/T5 |
| Controls | 7 | Tap‑dash, rebinding, touch pause, latency audit on the core verb | **T1** |
| First 60s / onboarding | 6 | No‑fail dash sandbox; teach ONE verb; jargon tooltips; Casual default for newcomers | **T1** |
| UI / UX | 6 | **Cockpit UI**: one DESCEND, modes as a rail, loadout tucked, utilities demoted | **T1** |
| Difficulty / fairness | 7 | Casual/Story (off‑board); readable telegraphs; no "least‑legible‑when‑losing" | T1/T3 |
| Accessibility | 7 | Esc/focus‑trap modals; shake↔reduce‑motion; canvas `aria`; colorblind verified on biomech art | T1/T5 |
| Content breadth | 7 | Fewer, *deeper* modes; biomes change a rule; unique enemy verbs | T3 |
| Progression / meta | 6 | Flat nodes → unlockable *mechanics* + challenge unlocks | T3 |
| Balance / build variety | 7 | Kill the dominant refund build; fix trap perks; 3–4 viable archetypes | T3 |
| Replayability | 7 | Weekly mutator + endless milestones + a reason to chase Heat | T3 |
| Social / shareability | 5 | **Branded share GIF** + FIRST LIGHT + challenge‑the‑dev seed | **T2/T4** |
| Monetization | 5 | Pro unlock + cosmetic packs OR engine‑as‑kit (only if going commercial) | T6 |
| Architecture | 8 | Split the 4 god‑objects | T5 |
| Test coverage | 6 | Tests for the 5 biggest files + Worker; **full‑sim determinism test** | T5 |
| Performance | 8 | Offscreen static bg; DPR cap ~2; gate `shadowBlur` | T1/T5 |
| Robustness | 6 | Boot guard; leaderboard plausibility; fix achievement misfires | T0/T5 |
| Build / ops | 8 | Worker in CI; self‑host fonts; CSP; tighten CORS | T5 |

---

## 3. The ranked roadmap

Tiered by **impact on the perceived score**. Inside each tier, ordered by leverage. Effort: **S** (hours), **M** (1–3 days), **L** (a week+). `[?]` = verify current status before starting (some may already be shipped — the git log shows Sovereign Victory, FIRST LIGHT‑era work, and an existing jam submission doc).

### TIER 0 — Blockers (do first; cheap; protect everything else)
| # | Item | Why | Effort |
|---|---|---|---|
| 0.1 | **Boot guard** — `window.onerror` + static fallback overlay around `main.ts` boot `[?]` | One uncaught throw = blank page = instant 0 from a judge or new player | S |
| 0.2 | **Full‑sim determinism test** — replay a seed, assert bit‑identical world + `world.rng` draw count | Ghost/duel/Daily all *claim* determinism that is currently unproven; gates every render/skin change | S–M |
| 0.3 | **Fix achievement misfires** — "Cheating Death" fires on *using* last‑breath, not surviving; wave‑1 0‑score death triggers `[?]` | Visible correctness bug; erodes trust | S |
| 0.4 | **Doc truth pass** — README says 5 ships; there are 6 (REAVER). Reconcile feature list to reality | A 10/10 doesn't lie in its own README | S |

### TIER 1 — The first two minutes (the highest‑leverage work in this doc)
This tier is where 7→9 happens. A judge/new player decides in ~90 seconds.

| # | Item | Spec | Effort |
|---|---|---|---|
| 1.1 | **Ship the cockpit UI** | Implement the new `mock-v4`/"ChatGPT Image" layout: a single gold **DESCEND**; modes as a left **rail** (not a card wall); a center **SELECTED RUN** panel (name, tags, seed, attempt, ranked flag, preview); **LOADOUT** tucked right (ship + cosmetics behind a "CHANGE SHIP" affordance); utilities (UPGRADES/CODEX/STATS/HEAT/DUEL/SETTINGS) demoted to a thin bottom icon row. **Progressive disclosure:** a first‑time player sees DESCEND + one or two modes; everything else unlocks/reveals with play. | **L** |
| 1.2 | **No‑fail dash sandbox as the true first screen** | 5–8s, can't die: "HOLD to charge → RELEASE to spear." One dummy to skewer, one combo to feel. Then drop into the run. Teaches the *one verb* the whole game rests on. | M |
| 1.3 | **Threats always legible** | Decouple enemy/bullet saturation from the COHERENCE wash. A 1px **neon rim** (not full‑body flood — protect the Clarity baseline) that stays constant regardless of combo. The wash may dim the *world*, never the *threats*. | M |
| 1.4 | **Tap‑dash** | A tap (no hold) fires an instant short dash; hold still charges the long one. Removes the latency wart on the core verb — the #1 "controls" complaint. | M |
| 1.5 | **Casual / Story mode**, off‑leaderboard | More ARMOR/grace, softer one‑hit rule, assist highlights on. Routed through `ModeRules.ranked=false` + api gate so boards stay meaningful. Make it the *suggested* mode for run 1. | M |
| 1.6 | **Controls hardening** | Key rebinding; touch **pause** button; gamepad glyphs in‑context. | M |
| 1.7 | **Jargon tooltips** | First time COHERENCE/ARMOR/OVERDRIVE/graze/fusion appears, a one‑line hover/long‑press gloss. | S |

### TIER 2 — Identity & the WOW (what turns a 9 into a memorable 10)
| # | Item | Spec | Effort |
|---|---|---|---|
| 2.1 | **Biomechanical enemy redesign (Proposal B)** | Adopt `mockups/shot-b.png` as the art direction: *organic cores · armor plating · bio‑veins · sensor clusters · living machines*. Rewrite the per‑`kind` vector routines in `render.ts` (the switch at ~723–954): a pulsing organic **core**, layered **carapace** plates, glowing **bio‑veins** that brighten with aggression, **sensor‑cluster** eyes that track the player. Keep **shape‑coding** intact (silhouettes stay colorblind‑distinct). Extend the language to the **6 bosses** — this is the identity payload, so bosses get the most love. Ship behind a render flag, A/B against the Clarity + reduce‑motion baselines. | **L** |
| 2.2 | **FIRST LIGHT — the signature win frame** | On the final kill (the Solstice/Sovereign crack), hard cross‑fade (never flash) to a warm white‑gold "day" palette layered *above* the wash, invert the gray vignette into a bloom halo, light the skyline gold, ~2s slow‑mo with choir+lead full, freeze a clean tableau. The one beat the trailer opens and closes on. `[?]` (may exist as FIRST LIGHT already — verify and polish to trailer quality). | M |
| 2.3 | **Branded auto‑capture GIF** | Auto‑grab the FIRST LIGHT beat (existing 6s/60‑frame `ReplayRecorder`); burn `score · seed · lancefall.pages.dev`; in‑page preview + **copy‑image / `navigator.share`** (replace the silent `<a download>`). This is the tie‑break artifact and the lead image of the post. | S–M |
| 2.4 | **READ THE KEY — code‑breaking as a *played* act** | Convert the cipher from follow‑the‑highlight to a read‑only **decode skin**: glyphs→letters via a static map; show *ciphertext + a legend with one crib pre‑lit*; the player **derives** the next core and dashes it. A wrong (forgiving) dash **strikes out** that glyph in the legend — the visible "rule out what contradicts" Bombe gesture. **Engine untouched** (`dashCipherCore` byte‑identical; zero new `world.rng` draws — gated by test 0.2). Arms on the first boss (trivial 3‑glyph) + the final Sovereign lock, every mode. This is the Turing win *and* a genuinely novel "deduce under fire" mechanic. | M |
| 2.5 | **Art‑direction coherence pass** | Make COHERENCE/biomes/palette serve clarity, not noise: soft‑cap additive bloom at the enemy cap; ensure each biome retint preserves threat contrast; one consistent HUD type/spacing system shared with the cockpit UI. | M |

### TIER 3 — Depth, balance & fairness (keeps a 10 a 10 past minute 5)
| # | Item | Spec | Effort |
|---|---|---|---|
| 3.1 | **Balance the dominant build** | Cap stacked kill‑refund so "infinite dash" can't delete the stamina resource `[?]` (may be shipped — `game.ts:1303`); audit perks for traps and dead‑on‑arrival picks; target **3–4 viable archetypes**. | M |
| 3.2 | **Biomes change a rule, not just a tint** | Give at least 2–3 biomes a mechanical twist (e.g., THE NULL = no graze refuel; THE EMBERWALL = burning floor lanes). Padding → content. | M |
| 3.3 | **Unique enemy verbs** | 5 of the zoner‑family share one AI. Give 2–3 a distinct verb so the bestiary reads as 12 threats, not 7. (Pairs naturally with the biomech redesign — new look + new behavior together.) | M |
| 3.4 | **Meta tree → mechanics + challenges** | Convert ~4 flat stat nodes into *unlockable mechanics* (a verb, not a +%); add **challenge unlocks** ("clear Arena no‑hit"). Gives the "one more run" engine real goals. | M |
| 3.5 | **Endless milestones / weekly mutator** | Milestone waves + a rotating weekly challenge (infra largely exists). Replay depth for the veteran. | M |

### TIER 4 — Social, shareability & retention
| # | Item | Spec | Effort |
|---|---|---|---|
| 4.1 | **"Challenge the dev" seed** | One pinned fixed seed + author ghost ("beat my run, drop your GIF"). Manufactures the comment loop. | S |
| 4.2 | **Daily streak counter** | `save.ts` already persists last‑played date; surface a streak. Cheap retention hook. | S |
| 4.3 | **Relabel the board "community (unverified)"** | The ghost stores positions, not inputs — scores can't be re‑sim‑verified. Candor a dev audience respects (beats a fake "verified"). | S |
| 4.4 | **Duel = shareable URL** | Encode seed+ghost in a URL instead of clipboard paste. Real virality vs. friction. | M |

### TIER 5 — Technical craft (invisible, but a true 10 has no jank under the hood)
| # | Item | Spec | Effort |
|---|---|---|---|
| 5.1 | **Split the god‑objects** | `render.ts` (**2898 — now the largest**, grew with the biomech layer), `game.ts` (2583), `audio.ts` (2050), `ui.ts` (1949) → focused modules. Improves your *and* my edit reliability. NOTE: the biomech layer already landed *without* this split, so `render.ts` is now the priority — extract a `renderBiomech.ts` first, after the enemy‑art handoff. | L |
| 5.2 | **Test the dark corners** | Unit/integration tests for the 5 biggest files + the Worker; the full‑sim determinism test (0.2) anchors ghost/duel/Daily claims. | M |
| 5.3 | **Performance budget** | Offscreen static background; cap DPR ~2; gate `shadowBlur`/gradients behind the perf tier (particles already scale). Protects 60fps on the biomech art + bloom. | M |
| 5.4 | **A11y contract** | Esc‑to‑close + focus‑trap on every modal; bind shake to reduce‑motion; canvas `aria-label`/live region for state; re‑verify colorblind shape‑coding on the new biomech silhouettes. | M |
| 5.5 | **Ops** | Worker in CI; self‑host the fonts (already partially via `@fontsource`); add CSP; tighten CORS; leaderboard plausibility cap. | M |

### TIER 6 — Monetization (only if you take it commercial — out of scope for "player‑craft + jam")
- **Lancefall Pro** one‑time unlock (Gumroad/Lemon Squeezy, client‑validated): extra ships, bonus perk pool, skin/palette packs, a Zen mode.
- **Cosmetic packs** as micro‑purchases (the trail/palette system is already built for this).
- **Engine‑as‑starter‑kit** — sell the juice/audio/pool/determinism framework as a "juicy Canvas2D arcade kit." Arguably the highest‑margin path given the engine quality.

---

## 4. Cuts & consolidation — *recommended, your call* (per your answer)

The biggest threat to a 10/10 here is **breadth diluting focus**. None of these are "delete good work" — they're "stop splitting the player's attention." Each is **optional**; I'm flagging, you decide.

| Candidate | Recommendation | Rationale |
|---|---|---|
| **9 game modes** | **Consolidate to ~5:** Endless, Arena (winnable), Daily (Echo), Solstice Protocol (the cipher showcase), Nightmare. Fold **Boss Rush** into an Arena toggle; **Weekly Siege** into the Daily as a weekly variant; **Casual** into a difficulty toggle on any mode (not its own card). | Nine cards is the front‑door clutter in microcosm. Five crisp modes read as *curation*; nine read as *indecision*. |
| **6 ships** | **Keep 5, gate the 6th (REAVER) as an unlock.** | Six on the title screen is choice paralysis for run 1. Make distinct playstyles a *reward*, not a launch decision. |
| **Relics + Archetypes + Mutators + Events** | **Pick two primary run‑modifiers, demote the rest.** Suggest keeping **perk draft + one run‑identity system**; fold the others into events. | Four overlapping "your run is different because…" systems blur into noise. Depth comes from *consequence*, not *count*. |
| **Ghosts + Duels + Build‑DNA + Inspect** | **Keep the share spine (GIF + challenge seed); soft‑pedal the rest** until the social loop proves out. | Technically complete but virally weak; they're surface area without pull. |
| **Coherence + Heat + NG+ + Daily‑goal + Ascend** | **Audit for overlap.** Likely keep Heat (the score‑chase) + Coherence (the soul dial, *if* it reads on screen post‑T1.3) and merge/cut the others. | Several "long‑term progression" layers compete for the same slot in the player's head. |

**Net:** a focused LANCEFALL — one verb, ~5 modes, 5 ships, one run‑identity system, one progression chase, one share artifact — would *feel* more 10/10 than today's everything‑at‑once, with less to maintain.

---

## 5. Jam‑critical path (Solstice jam, due 2026‑06‑21 — ~5 days)

If the jam ships in parallel, this is the minimum‑viable *winning* slice, in order. (Much overlaps Tiers 0–2.)

1. **0.1 Boot guard** + **0.2 determinism test** — protect against a blank‑page DQ and gate the cipher skin. *(S)*
2. **2.2 FIRST LIGHT** polished to trailer quality + **2.3 branded GIF**. The WOW the post leads with. *(M)*
3. **Finish the submission post + record the ~90s video** against today's build (open on the GIF/FIRST LIGHT, then juice, then THE CHOICE). The rubric *requires* video + repo — this is the only hard‑DQ gate. *(M)*
4. **2.4 READ THE KEY** decode skin — the "Best Ode to Turing" lever — *if* it's legible <10s under fire by a Jun‑19 gate; else fall back to the named allegory (Mirrorblade = imitation game, THE CHOICE = halting problem) and go all‑in on Overall. *(M)*
5. **1.1 cockpit UI** (at least the DESCEND‑first front door) + **1.3 threats‑legible** + **1.5 Casual** — so a judge's first 90s is flawless. *(partial L)*
6. **4.1 challenge‑the‑dev seed** + **4.3 relabel board** — social proof + candor. *(S)*

**Biomech redesign (2.1) is the dream identity win but is L‑effort** — only attempt for the jam if FIRST LIGHT + the post + the cipher are already locked. Otherwise it's the headline of the *post‑jam* 10/10 push.

---

## 6. Guardrails (every change must hold these)
- **Determinism invariant:** `world.rng` is the only scoring‑affecting stream; cipher/cosmetic randomness stays on separate streams; never perturb the Daily wave stream. Test 0.2 enforces it.
- **A11y invariant:** every new visual (biomech glow, FIRST LIGHT, neon rim, struck glyphs) respects reduce‑flashing / reduce‑motion / clarity; per‑event feedback stays player‑local; colorblind shape‑coding survives the redesign.
- **Clarity invariant:** threats never lose saturation; bloom soft‑capped; before/after legibility screenshot on any render change.
- **Per‑commit gate:** `tsc` + full `vitest` + `vite build` + in‑browser smoke (0 console errors).
- **Off‑board assists:** Casual and any assist stay off the leaderboards so the boards mean something.

---

## 7. What "10/10" means here (definition of done)
A new player clicks **one button**, is *taught the one verb in 5 seconds*, and is immediately dashing through a swarm that is **always legible** and unmistakably **biomechanical‑LANCEFALL**. They die, laugh, hit DESCEND again. Within three runs they crack a code under fire, the world **breaks into light**, and the game hands them a **branded GIF** they actually want to post. Under the hood it's deterministic, tested, accessible, and 60fps. Nothing on screen is jargon they weren't taught; nothing is a feature they can't feel.

That's the 10. Everything above is the route.
