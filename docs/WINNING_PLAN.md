# LANCEFALL — The Winning Plan

> Goal: a **fully professional, polished, fun and beautiful** game that wins the **dev.to June Solstice Game Jam** — targeting **an Overall prize + Best Ode to Alan Turing**.
> Deadline: **2026-06-21**. Live build: https://lancefall.pages.dev. Branch: `v6` (deployed).
> This doc is the canonical plan. It embeds the score grids and the results of the unbiased review that produced them, then turns every grid cell into an action.

## Scope decision — "both categories"

The jam awards **3 overall winners + Best Ode to Alan Turing + Best Google AI Usage**, and the rules state a submission can win **"one overall prize and/or one prize category."** So winning *both named categories* (Turing **and** Google AI) is impossible, and "Best Google AI Usage" requires building with Gemini / Google AI Studio / Google Cloud — we built with Claude, so chasing it would be inauthentic and split focus. **Target = Overall prize + Best Ode to Alan Turing.**

## Official judging criteria (what we're scored on)

1. **Relevance to Theme** — connects to the June solstice / celebration themes.
2. **Creativity** — original concept or an interesting take.
3. **Technical Execution** — functional, well-built, playable.
4. **Writing Quality** — the submission post is clear and engaging.
5. **Prize Category** — "Best Ode to Alan Turing": meaningful engagement with algorithms, code-breaking, AI.

Tie-break = most positive reactions on the DEV post. Required artifacts: **demo video w/ voiceover, repo embed, theme + technical writeup.** Must be a new creation built during the jam, or reused open-source with **"significant/tangible" modifications clearly credited.**

---

## Review results & score grids (unbiased panel + live playtest)

Method: four independent reviewers judged the app cold from source + README, plus a live playtest of the deployed build and a benchmark against the official rules and the rival Turing entry. **Overall ≈ 6.8/10 as a polished game; jam = medium overall, low-medium Turing.**

### Grid A — Jam rubric

| Criterion | Score | Read |
|---|---|---|
| Relevance to theme (solstice) | 6/10 | Light-from-grey frame is genuine but asserted over a pre-existing COHERENCE dial; no literal solstice/date hook. |
| Creativity | 7/10 | "Dash = a keypress in the decoded order" is an original verb on a familiar genre; novelty concentrated in one ~80-line module. |
| Technical execution | 9/10 | Standout. Live build clean (0 console errors/warnings), deterministic, well-engineered. |
| Writing quality | 8/10 prose · **3/10 as-shipped** | Prose excellent, but the post still has placeholder `[video]`, `[repo]`, `[screenshots]` — the rubric *requires* video + repo. |
| Best Ode to Turing | 6/10 | The ode is *allegorical* (memorize-and-dash), not real cryptanalysis. A rival ("The Longest Day") shipped a playable Bombe + frequency analysis, and it is complete. |

### Grid B — Picky-gamer / professional-polish (1–10)

| Cluster | Category | Score |
|---|---|---|
| Feel & presentation | Game feel / juice | 8 |
| | Visual clarity / readability | 8 |
| | Audio | 8 |
| | Controls & responsiveness | 7 |
| Player experience | First 60s / onboarding | 6 |
| | UI/UX & menus | 6 |
| | Difficulty / fairness | 7 |
| | Accessibility | 7 |
| Content & replay | Content breadth | 7 |
| | Progression / meta depth | 6 |
| | Balance / build variety | 7 |
| | Replayability | 7 |
| | Social / shareability | 5 |
| | Monetization potential | 5 |
| Technical quality | Architecture / maintainability | 8 |
| | Test coverage | 6 |
| | Performance | 8 |
| | Robustness / failure-modes | 6 |
| | Build / deploy & ops | 8 |

### Reviewer headlines (high-confidence = multiple reviewers agreed)

- **Jam judge:** the post is unfinished (DQ risk — missing required video + repo); the cipher is allegorical vs a real Bombe competitor; ~95% of the codebase is the pre-existing engine (eligibility risk, but "significant modifications clearly credited" likely cleared). Turing odds: low-medium. #1 fix: finish the post.
- **Picky gamer (~7.2):** title-menu sprawl ("configure me" not "PLAY"); threat legibility is coupled to the COHERENCE gray-wash so a *struggling* (low-combo) player gets the *least* legible screen; hold-charge-release latency on the core verb; no key rebinding; no touch pause button; one-hit-kill with no Casual difficulty; juice can read as noise on big chains.
- **Content (~6.5):** the "infinite dash" kill-refund build is dominant and removes the stamina resource; biomes are retint-only padding; 5 of 14 enemies share one zoner AI; social layer is technically complete but virally weak (manual code-paste, no URL share) and the leaderboard is client-authoritative / cheatable; monetization 0% built.
- **Technical:** architecture clean but `game.ts`/`ui.ts`/`audio.ts` are 70–104KB god-objects; depth-good/breadth-poor tests — the 5 biggest files + the Worker have zero tests and there is **no full-sim determinism test** (so ghost/duel reproduction is unproven); perf scales particles but not gradients/`shadowBlur`/DPR; a11y strong visually but modals are click-only (no Esc/focus-trap), shake isn't tied to reduce-motion, canvas has no `aria`; **boot is unguarded** (one throw = blank page); leaderboard trivially spoofable.
- **Live playtest:** 0 console errors/warnings across title/runs/debrief/settings; debrief and settings are genuinely polished; **"Cheating Death" achievement misfires on a wave-1, 0-score death** (bug).

---

## Strategy — the through-line (coherence, not a checklist)

Every grid weakness collapses into **three pillars**; each serves *fun + beautiful + a specific win* simultaneously.

| Pillar | Wins… | Because… | Makes it… |
|---|---|---|---|
| **1. A flawless, legible, fair first 2 minutes** | Overall | judges play briefly and decide fast | beautiful + fun |
| **2. Code-breaking as a real *played* act** | Turing | rewards mechanical ode, not decoration | clever + fun |
| **3. A complete, trustworthy package** | Overall (Technical/Writing) | "is it finished?" is a scored axis | proud-to-share |

The game is already **9/10 technically** — we do not rebuild it. We **remove the three things that hide its quality** (a cluttered door, an unfair wall, a decorative ode) and **finish the frame around it**.

## Grid → action map (every cell turned into work)

### Grid A
| Criterion | Action | Target |
|---|---|---|
| Theme 6 | **DAYBREAK win** — world floods to full daylight on victory; real-date solstice daily seed | 8 |
| Creativity 7 | Lean the pitch on *decode-and-dash* (the one truly original verb) | 8 |
| Technical 9 | Keep clean; **harden boot** so a judge never sees a blank page | 9 |
| Writing 8/3 | **Finish the post + record the video** | 8 |
| Turing 6 | **Real cryptanalysis beat** (spec below) | 8 |

### Grid B
| Category | Applied action | Pillar |
|---|---|---|
| Game feel/juice 8 | Per-frame **juice budget** + debounce stacked slow-mo | 1 |
| Visual clarity 8 | **Threats stay full-saturation always**; soft-cap additive bloom at the enemy cap | 1 |
| Audio 8 | Raise the **floor mix** so low-combo play still sounds full | 1 |
| Controls 7 | **Tap = instant short dash**; **key rebinding**; **touch pause button** | 1 |
| Onboarding 6 | **5-sec no-fail dash sandbox** as first screen; jargon tooltips | 1 |
| UI/UX menus 6 | **Title = PLAY + "More" drawer** (hide meta until run 1) | 1 |
| Difficulty 7 | **Casual/Story mode** (more shields/grace, off-leaderboard) | 1 |
| Accessibility 7 | **Esc-to-close + focus-trap** modals; shake↔reduce-motion; canvas `aria` | 1 |
| Content breadth 7 | **Biomes change a rule**; give 2–3 zoner enemies a unique verb | fun |
| Meta depth 6 | Convert ~4 flat nodes into **unlockable mechanics**; unlock *challenges* | fun |
| Balance 7 | **Cap stacked kill-refund** (kill "infinite dash"); fix trap perks | fun |
| Replayability 7 | Weekly mutator challenge + Endless milestone waves (infra exists) | fun |
| Social 5 | **Duel = shareable URL**; branded **score-card PNG** on PB | 3 |
| Monetization 5 | Package the **engine as a starter kit** (post-jam) | 3 |
| Architecture 8 | Split `game.ts` god-object (post-jam refactor) | 3 |
| Test coverage 6 | **Worker tests + full-sim determinism test** | 3 |
| Performance 8 | Offscreen static background; **cap DPR ~2**; gate `shadowBlur` | 1 |
| Robustness 6 | **Guard boot** (`window.onerror` + fallback overlay); leaderboard plausibility | 3 |
| Build/ops 8 | Worker in CI; self-host fonts; tighten CORS; add CSP | 3 |

## Pillar 2 — the Turing win (highest-leverage design)

Convert the cipher-lock from *memorize-and-dash* to **decode-and-dash** — keep it action-fast, make the player perform a real, small deduction:

- The CIPHER readout shows **ciphertext you actually decode** (a Caesar shift or short substitution with a visible **crib/frequency tell**) — the decoded order is *derived*, not handed over.
- A **wrong key reveals a contradiction** that *narrows* the remaining possibilities — literally Turing's Bombe ("rule out what is inconsistent"), but performed *under fire*.
- Keep **Mirrorblade = imitation game** and **THE CHOICE = halting problem**; now the *core verb* is genuine cryptanalysis, so all three legs are real.
- **Guardrails:** stays on the cipher's own local RNG (determinism invariant intact), unit-tested; the heavier deduction lives in **THE LONGEST DAY** mode so action-first modes stay snappy.

Lifts Turing 6→8, Creativity 7→8, technical depth — and it is the thing the submission video should open on.

## Pillar 3 — the package

- **Finish `docs/SOLSTICE_JAM_SUBMISSION.md`:** record the (already-scripted) voiceover, embed the repo, add 3 screenshots. Removes a DQ risk.
- **Video** opens on decode-and-dash, then juice, then DAYBREAK, then THE CHOICE. ~90s.
- **Duel = URL + score-card PNG** + leaderboard **plausibility check** → social proof + trust a judge sees.

## Sequenced against the deadline (today Jun 15 → due Jun 21)

**Jam-critical (must land by Jun 21, in order):**
1. **Real cryptanalysis beat** (Pillar 2) — the category-maker; riskiest, start first.
2. **Title declutter → PLAY + More drawer** + **Casual mode** (Pillar 1).
3. **DAYBREAK victory + solstice daily** (theme → beautiful payoff).
4. **Threats-full-saturation + bloom cap** + **guard the boot**.
5. **Finish the post + record the video** (last, once the above is filmable).

**Post-jam (toward "proud-to-share"):**
6. Cap infinite-dash; biomes-change-a-rule; tap-dash + rebinding + touch pause.
7. Duel-as-URL + score-card; Worker tests + plausibility; full-sim determinism test.
8. Perf (offscreen bg, DPR cap); modal a11y contract; juice budget; meta mechanics; engine-as-product; fix the "Cheating Death" achievement misfire.

## Guardrails (every change must hold these)

- **Determinism invariant:** `world.rng` is the only scoring-affecting seeded stream; cosmetic/cipher randomness uses separate streams; never perturb the Daily wave stream.
- **A11y invariant:** every new visual respects reduce-flashing / reduce-motion / clarity; per-event feedback localized.
- **Quality gate per commit:** `tsc` + full `vitest` + `vite build` + in-browser smoke (0 console errors).
- **Casual mode and any assist must be off the leaderboards** so the boards stay meaningful.

---

# v2 — THE HARDENED PLAN (adversarial pass)

> Authored after a 5-lens adversarial cross-examination of v1 (jam-win / fun-beauty / scope-risk / ambition / retention-trust — each red-team critique independently verified, only code/rule-backed, deadline-feasible items kept). **v1's prize premise (3 Overall + Best Ode to Alan Turing; a submission may win one Overall slot AND/OR one category) is verified CORRECT against the official rules** — this is a re-sequencing and a sharpening, not a rewrite. **v2 supersedes v1's sequencing and Pillar-2 spec where they conflict.**

## The one-sentence through-line

**"Today the whole world breaks the same key, and breaking it brings back the light."** One deterministic cipher you *actually read*, cracked under fire, that detonates into an authored sunrise we auto-capture as the share GIF — so **Turing (real cryptanalysis), Theme (literal solstice), Beauty (one peak frame), and Social (the tie-break artifact) all land in a single ~6-second beat** the video opens AND closes on. That beat is the spine; everything else is hygiene that stops it from being hidden.

## What changed from v1, and why (code-verified)

| v1 said | v2 says | Why v1 was wrong/risky |
|---|---|---|
| Pillar 2 first; post **last** "once filmable" | **Post + video FIRST** (Jun 16) against today's build; re-shoot only the cracked-key beat | The only hard-DQ gate was behind 4 slip-prone features. Rubric requires video+repo; as-shipped Writing = 3/10. Inverting this is the single biggest risk reduction. |
| Real decode lives in **THE LONGEST DAY** mode | Real decode lives on the **default first boss + the Sovereign final lock, in every mode** | `game.ts:2211` only arms the rich cipher when `mode.cipherLock`; the median 60–90s judge never opens the side mode. |
| Decode = **Caesar + crib**, "wrong key reveals a contradiction" | Decode = **read a substitution off an on-screen legend** as a **read-only skin**; reducer `dashCipherCore` stays **byte-identical** | v1's "wrong key punishes" reverses the two forgiveness commits (`18b649e`+`bf1bac8`; `cipher.ts:61-72` is a *forgiving no-op* by design) and reads worse under fire. Skin it instead. |
| Mode named **"THE LONGEST DAY"** | **Rename → "SOLSTICE PROTOCOL"**; final lock → **"THE SOLSTICE KEY"** | Collides *exactly* with the rival's whole finished game ("The Longest Day"). A judge who plays both reads us as the derivative. Rename is free. |
| **"DAYBREAK win"** floods to daylight | **"DAYBREAK" is already the ultimate's name** (`ui.ts:1480`). Win beat renamed **"FIRST LIGHT"**, a **new warm-gold above-wash palette**, not more neon | `game.ts:574`: the ultimate *already* floods the world to full neon — reusing it wouldn't read as a climax. |
| GIF untouched; share = post-jam | **Brand the GIF + lead with it** is jam-critical | `replay.ts:120-130` is a silent `<a download>` with no caption/score/seed/brand. The tie-break **is** post reactions; a bare file is shared by ~no one. |
| Leaderboard "plausibility cap" post-jam | **Relabel "community board (unverified)"** now; **drop re-sim verification entirely** | `ghost.ts` stores *positions* (90 samples), **not inputs** — you cannot replay-verify a score. Re-sim is multi-day/infeasible; candor is the only survivable fix. |

## CUT for the jam window (discipline)

1. **Worker re-simulation / trusted board** — infeasible (ghost is a position trace, not inputs). Ship **candor relabel** instead.
2. **"Wrong key = contradiction" reducer change** — reverses forgiveness; risks Clarity-8/Fairness-7 under fire. The legible Bombe gesture ships **cosmetically** (struck-out glyphs) with no reducer touch.
3. **Caesar/frequency-analysis-while-dodging** — too hard to grasp <10s under fire; breaks Pillar 1. One-substitution read off a visible legend delivers "cryptanalysis is *played*" at a fraction of the risk.
4. **Daily-seed-as-theme (invisible)** — replaced by the on-screen **"SOLSTICE — the longest day"** title stamp on Jun 21 (`rng.ts:46` already yields `20260621`) + the visible FIRST LIGHT sunrise.
5. **Duel-as-URL** — packaging, no public artifact. Redirect to **ONE pinned "CHALLENGE THE DEV" seed**.
6. **Standalone score-card PNG** — fold "burn seed+score" into the GIF; don't staff a second artifact.
7. **All Grid-B "fun"-tier content** (biomes-rule, zoner verbs, meta-as-unlocks, weekly mutator, engine-as-product, god-object split, modal a11y, DPR cap, CORS/CSP) — invisible to a brief judge; stays post-jam.

## Pillar 2 (sharpened) — REAL cryptanalysis that beats the Bombe rival *on our terms*

We won't out-Bombe a finished 676-position Bombe on faithfulness. We win the axis the rival is weak on: **legibility-under-action — "code-breaking *is* the verb you press."** Their deduction is a separate screen; **ours narrates live on the HUD while you dodge.**

**"READ THE KEY" (read-only decode skin):**
- **Engine untouched.** `cipher.ts` + `dashCipherCore` stay byte-identical (forgiveness + determinism intact — `cipher.ts:4-7` draws zero `world.rng`). All changes in `render.ts` (~1258–1282) + `ui.ts` (~1482–1499) + one pure label-map + one HUD panel.
- **Glyphs become letters** via a static `glyphToLetter[]` map; plaintext spells a short word (`DAY`/`DAWN`/`LIGHT`/`SUN`, 4–5 glyphs).
- **Show ciphertext + the legend, not the answer.** HUD shows the scrambled letters + a visible substitution **key strip** with ONE anchor pair pre-lit as the crib; the player **derives** the next core. **Delete the `isNext` white ring (`render.ts:1264-1270`) + `.next` hand-off (`ui.ts:1491`) during the decode locks** — that ring is what makes today's mechanic follow-the-highlight.
- **Visible Bombe gesture for free:** a wrong dash (already a forgiving no-op) **crosses out that glyph in the legend** ("rule out what contradicts") — cosmetic, derived from `progress`/`wrongFlash`, no reducer change.
- **Assist stays:** the white-ring highlight survives as a Casual/off-leaderboard toggle; solving without it grants a small visible bonus.
- **Arms on:** the **default first boss** (trivial 3-glyph read + `READ THE KEY → DASH IN ORDER` tooltip) **and** the **Sovereign final lock "THE SOLSTICE KEY"** (4–5 glyphs) in **every mode**.
- **Determinism guard (non-negotiable):** every skin input derives **only** from `cipher.order`/`glyphs` + the static map — **never `world.rng`** (`cipherCycle` is skill-dependent and would silently fork the Daily).
- **Tests first (TDD):** 6–8 round-trip assertions incl. **zero new `world.rng` draws** (extend `cipherIntegration.test.ts:109`). Effort **M.**

## Pillar 1 + Theme — the signature WOW: **FIRST LIGHT**

Build **before** the cipher so a WOW is guaranteed even if decode slips.
- **Trigger:** cracking THE SOLSTICE KEY (final lock / win), *not* the ultimate.
- **The frame (new, distinct from the neon ultimate flood):** hard cross-fade to a **warm white-gold "day" palette layered ABOVE the COHERENCE wash**, invert the gray vignette into a **bloom halo**, light every skyline window gold, hold **~2s slow-mo** with choir+lead full, **freeze a clean tableau** with the cracked plaintext glowing.
- **Auto-capture** via the existing `ReplayRecorder` (6s/60-frame buffer + GIF encoder) → hero GIF + the video's closing frame.
- **a11y:** cross-fade, **never flash**; honor `reduce-motion`/`reduce-flashing`; validate vs the Clarity-8 baseline. Name it **FIRST LIGHT** (avoid the DAYBREAK ultimate). Effort **M.** Lifts Theme 6→8 and is the biggest lever on the reactions tie-break.

## Social — manufacture the comment loop (tie-break = reactions)

Reframe every social task by *"does a stranger reading the thread react?"* — GIF-in-comment and challenge-the-dev pass; clipboard duel fails.
- **Brand the GIF (S):** burn score+seed+`lancefall.pages.dev` watermark; in-page preview + copy-image/`navigator.share` (replace the silent `a.download`). Video + post both **open on this GIF**.
- **Pin ONE "CHALLENGE THE DEV" seed (S):** fixed seed + author ghost (`toChallengeCode` exists) → "beat my run, drop your GIF below."
- **Relabel board "community board (unverified)" (S):** `README.md:3` + RANKS screen — candor a dev audience respects.
- **Daily streak counter (S):** `save.ts:80-81` already persists the last-played date; zero sim risk.

## THE JAM-CRITICAL TRACK (ship by Jun 21, in order)

| # | Item | Effort |
|---|---|---|
| **0** | **Boot guard** — `window.onerror` + static fallback overlay (`main.ts:8` is a bare `game.boot()`) | S |
| **0b** | **Determinism safety net** — full-run / `world.rng` draw-count test, asserts bit-identical after arming the skin | S–M |
| **1** | **RENAME** `THE LONGEST DAY → SOLSTICE PROTOCOL`; final lock → `THE SOLSTICE KEY` | S |
| **2** | **FIRST LIGHT** signature win-state + auto-capture (built **before** the cipher) | M |
| **3** | **Brand the GIF + share path** (watermark, preview, copy-image/share) | S |
| **4** | **SUBMISSION POST + VIDEO against today's build** — valid complete submission by **Jun 16** | M |
| **5** | **READ THE KEY decode skin** (letters + legend + crib, drop `isNext` ring, struck-glyph gesture, assist) + tests | M |
| **6** | **Title declutter** (autofocus big `PLAY`; demote meta to a "More" drawer) | S |
| **7** | **Casual mode** (off-leaderboard via `ModeRules.ranked` + api gate) + threat **neon RIM** (1px, not full saturation) | M |
| **8** | **Pin "CHALLENGE THE DEV"** + **relabel board** + **Daily streak** + **"SOLSTICE" Jun-21 title stamp** | S |
| **9** | **Re-shoot the decode beat** into the video; **fix "Cheating Death"** (`achievements.ts:55` fires on *using* last breath, not surviving) | S |

**Decision gate — Jun 19, 18:00:** Is READ THE KEY clean, legible <10s under fire, and filmable? **Yes →** headline it, re-cut the video to open on it. **No →** do *not* half-ship a broken decode — fall back to all-in **Overall** (Technical 9 + FIRST LIGHT + the solstice stamp), Turing as a tasteful *named* allegory (Mirrorblade = imitation game, THE CHOICE = halting problem). #0–#4 + #6–#8 already shipped a complete submission, so the gate protects win-probability.

## POST-JAM TRACK (proud-to-share; no jam value)

- **PERFECT THREAD** verb (graze≥N in one dash → chromatic bloom + bonus) — replaces v1's "cap infinite dash", which is **already shipped** (`game.ts:1303-1314`); reallocate that slot here. **S.**
- **Stage the Mirrorblade reveal** (player silhouette + `TELL ME WHICH OF US IS REAL` card; `drawMirrorblade` exists but is narrator-text-only) — *told* → *shown* Turing. **S.**
- Biomes-change-a-rule (one biome); zoner verbs; meta-as-unlocks; weekly mutator; god-object split; Worker tests+CI; modal a11y; DPR cap + gate `shadowBlur`; offscreen bg; self-host fonts; CORS/CSP; engine-as-starter-kit. **M–L.**

## RISKS & MITIGATIONS

| Risk | Mitigation |
|---|---|
| **Determinism fork** (skin samples `world.rng` via skill-dependent `cipherCycle`) | Skin derives only from `cipher.order`/`glyphs` + static map; ship the draw-count test (#0b) **first**; reducer byte-identical. |
| **a11y regression** (FIRST LIGHT flash; strike flicker; RIM strobe) | Cross-fade not flash; static strike; 1px constant RIM; validate vs `reduce-motion`/`reduce-flashing`. |
| **Clarity-8 regression** in `render.ts` | Use the **neon RIM**, never full-body saturation; gate behind a before/after legibility screenshot. |
| **Forgiveness reversal** | **Never touch `dashCipherCore`**; decode is read-only render/ui; Bombe "rule-out" cosmetic only. |
| **Cipher slip** | Post+video+FIRST LIGHT ship first (Jun 16); the Jun-19 gate falls back to a complete Overall submission. |
| **Blank-page DQ** | Boot guard is commit #0. |
| **Read-as-derivative** | Rename (commit #1) before any screenshots/video. |

**Per-commit gate (enforced):** `tsc` + full `vitest` + `vite build` + in-browser smoke (0 console errors). For any render/skin commit: a before/after screenshot vs the Clarity-8 + `reduce-motion` baselines, and the `world.rng` draw-count assertion green.
