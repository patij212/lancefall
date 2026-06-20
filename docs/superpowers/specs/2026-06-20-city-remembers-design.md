# THE CITY REMEMBERS — meta-cipher depth pass

> Design spec. Turns decryption from a lorebook into the act of bringing a dead city back —
> its people, its skyline, its ending. Builds on the shipped cipher-layer depth pass
> (THE LAST TRANSMISSION, Intel, daily cipher, Bombe branches).
> Status: APPROVED (design) → pending written-spec review → implementation plan.

## Context (as-built, verified)

- **Decryption** (`intercepts.ts`): 14 transmissions, ~265 vocab words; `decryptWord` (pure save mutation), `masterProgress(save).frac`, `isLongestDay`. Completing a transmission unlocks a CODEX memory via `syncInterceptLore` → `stillpointLore`. The decrypt action is `game.ts decryptIntercept` (~L3374-3388): it calls `decryptWord` → `syncInterceptLore` → toasts → `evalMetaAchievements()` → `saveSave` → `ui.refreshMemories()` → `ui.openBombe`.
- **THE CHOICE** (`stillpoint.ts` `choiceEnding(choice)`, `Choice='catch'|'fall'|'none'`): written ONLY in `game.ts makeChoice(c)` (~L3318) → `save.stillpointChoice` + `ui.resolveChoice`. Presented on the Sovereign-kill game-over when `won && sovereignDown && stillpointChoice==='none'`.
- **ECHO citizens** (`stillpoint.ts`): `ECHO_NAMES` (16 roles), `ECHO_MEMORIES` (10), `echoVignette(daySeed)`, `echoLine(daySeed)` — pure, isolated rng.
- **Narrator** (`narrator.ts` + `game.ts narrate/narrateOne` ~L1016): pure pooled line picker; `ambientReady` 7s cooldown gate.
- **CODEX** (`ui.ts refreshMemories` ~L2473 + `panels/codex.ts renderBestiary`): the `reconcile(grid, DATA, idFn, createFn, updateFn)` idiom morphs grids in place; THE FALL pane holds bestiary + cipher + memories.
- **Cockpit backdrop** (`cockpitCipher.ts`): already reads `decryptFrac` from `localStorage` every 0.2s (`readDecryptFrac`), feeds a coherence floor (`targetCoh` → `decryptFrac*0.85`), brightens skyline windows with coherence (`drawSkyline` ~L629), and blooms once at 100% (`maybeCelebrateLongestDay`, gated by `localStorage 'lancefall.longestday'`). Skyline buildings are a generated array (`buildSkyline` ~L420).
- **Console puzzles** (`bombe.ts`): `ConsolePuzzle{kind:'caesar'|'substitution'|'vigenere'}`, `CONSOLE_PUZZLES` (3), `checkPuzzle` (generic `norm()` compare), `solvePuzzleReward` (+Fragments +free crack, all-solved → `CRYPTANALYST_TRAIL`). Rendered in `panels/bombe.ts`.
- **Bombe branches** (`bombe.ts`): `bombeBranches{thrift,speed,insight}`, `upgradeBombeBranch`, `BRANCH_MAX=3`.

**Constraint:** everything here is PURE + save-side + render — NONE of it touches the run sim or rng. (The one run-layer idea, encrypted relics, is explicitly DEFERRED to its own pass.) Additive save fields only; no `SAVE_VERSION` bump.

---

## The interlocking loop

**decrypt → a transmission's citizen wakes → a window lights in the skyline (felt mid-run) → their story + the linked figure's dossier deepen (read in the calm codex) → milestone beats punctuate the climb → the last cipher waits for THE CHOICE.**

Runs are for playing: **no new mid-run reading**. All text lives in calm contexts (codex, run-end debrief, cockpit, the signal-restored moment between the action). Mid-run, the city's return is purely **visual** (skyline windows).

---

## Feature 1 — CITIZENS (the people return)

**New pure module `citizens.ts`.**
- `CITIZENS: Citizen[]` — a curated roster (~16) authored from the ECHO names. Each:
  ```ts
  interface Citizen {
    id: string;            // 'lamplighter'
    name: string;          // 'The Lamplighter' (or a proper name)
    role: string;          // 'kept the lattice-lights'
    wakeBy: string;        // transmission id OR milestone key ('m25'|'m50'|'m75'|'m100') that wakes them
    figure?: EnemyKind;    // the Six figure they're tied to (for the dossier weave), optional
    memory: string;        // 2–3 sentence authored memory (ECHO voice, deepened)
    deeper: string;        // a fuller paragraph, revealed once their figure's dossier completes (or master% threshold)
  }
  ```
- Each of the 14 transmissions maps to one citizen via `wakeBy`; the remaining ~2 wake at master-% milestones so the roster fills across the whole arc.
- `wokenCitizens(save): Citizen[]` — pure derive from decryption state: a citizen is woken if its `wakeBy` transmission `isInterceptComplete`, or its milestone `masterProgress.frac >=` threshold. **No new "woken" save field** — it's a function of existing state.
- `citizenDeeperUnlocked(save, c): boolean` — true once the citizen's linked figure dossier is complete (Feature 3) or master-% past a tier; gates the `deeper` paragraph.
- `cityRememberedCount(save): {woken:number; total:number}` — for the cockpit/debrief readout.

**Reading surfaces (calm only):**
- CODEX **CITIZENS** pane (Feature: UI) — per-citizen detail cards via `reconcile`; un-woken read as "— still lost —"; woken show name/role/memory; `deeper` appears when unlocked.
- Run-end debrief line: `"the city remembers 9 of 16 — a chorister returned"` (only when a NEW citizen woke this session — compare a transient pre/post count; render-only).
- Cockpit: a calm `cityRememberedCount` readout.

**Mid-run presence (visual only):** waking a citizen lights a specific skyline window permanently (Feature 5 binds citizen→building). NO narrator text mid-run (the earlier `citizenRecall` ambient idea is DROPPED).

Tests: roster integrity (every `wakeBy` is a real transmission id or milestone key; every `figure` is a real boss kind); `wokenCitizens` monotonic with decryption; `deeper` gated correctly.

## Feature 2 — THE LAST CIPHER (your choice writes the ending)

The final line of TRANSMISSION XII (`int-what-remains`) — *"the one cipher that cannot be solved, only chosen"* — gets an extra **choice-locked tail** that stays unwritten even at 100%, and resolves to **one of two closing sentences** by `save.stillpointChoice`.

- **Mechanism (clean, no vocab contamination):** the tail is SEPARATE authored data, NOT in `INTERCEPTS[int-what-remains].tokens` — so `vocabulary()` / `masterProgress` are completely untouched and 100% / THE LONGEST DAY remains reachable by decryption alone. In `intercepts.ts` (or `stillpoint.ts`): `CHOICE_TAIL: Record<'catch'|'fall', string>` (two authored sentences echoing `choiceEnding` — catch = the light holds / fall = released) + a pure helper `choiceTail(save): string | null` returning the chosen sentence, or `null` if `stillpointChoice==='none'`.
- **Render:** in `panels/bombe.ts`, the `int-what-remains` card appends the tail after its (decrypted) body: reads "— [ this cipher is not solved; it is chosen, on the longest day ] —" while `choiceTail` is null, then the chosen sentence (subtle gold/dusk tint matching catch/fall) once a choice exists.
- Tests: `choiceTail` returns null when `stillpointChoice==='none'`, the catch sentence for 'catch', the fall sentence for 'fall'; the tail text is NOT present in `vocabulary()` (assert no new vocab words) so 100% is reachable without a choice.

## Feature 3 — THE DOSSIER WEB

For each of the Six (warden/weaver/beacon/mirrorblade/hollow/sovereign), a DOSSIER that synthesises progressively from how many of that figure's key-word mentions are decrypted.
- In `citizens.ts` or a sibling `dossiers.ts` (pure): `figureDossier(save, kind): {revealed: number; total: number; lines: string[]}` — `total` = count of that figure's key-word occurrences across all transmissions (using `wordRarity==='key'` + the name); `revealed` = how many are decrypted; `lines` = the authored dossier paragraphs unlocked at revealed/total thresholds (e.g. 1/3, 2/3, full).
- Reuses existing `INTERCEPTS`/`wordKey`/`isWordDecrypted`. No new save field.
- Rendered in the CODEX beside MEMORIES + CITIZENS (the "people of Lancefall" — figures + citizens woven). A complete dossier unlocks its linked citizens' `deeper` paragraph (Feature 1).
- Tests: `total` counts real occurrences; `revealed` rises with decryption; threshold lines gate correctly.

## Feature 4 — THE ENIGMA PUZZLE (mastery → permanent power)

- Add `kind: 'enigma'` to `ConsolePuzzle` (union extension only — `checkPuzzle` is already generic via `norm()`). Author one rotor-cipher puzzle (`pz-enigma-1`): a single-rotor monoalphabetic-with-step cipher the player decodes; the `prompt` is the ciphertext, `answer` the plaintext, `hint` explains the rotor step. Verify by hand it decodes.
- Reward: same `solvePuzzleReward` (Fragments + free crack). Completing the FULL set (now 4) still grants `CRYPTANALYST_TRAIL` AND now also a **permanent INSIGHT +1** (`save.bombeBranches.insight`, capped at `BRANCH_MAX`) — mastery converts to lasting Bombe power. New pure helper `grantCryptanalystBonus(save)` (idempotent, fires when all puzzles solved).
- Render: the existing puzzle block handles it; add a distinct rotor visual/label.
- Tests: the enigma cipher round-trips (`checkPuzzle('pz-enigma-1', answer)===true`, `prompt!==answer`); all-solved grants the INSIGHT level once (idempotent).

## Feature 5 — THE SKYLINE REBUILDS (district by district)

`cockpitCipher.ts` already brightens the whole skyline with `decryptFrac`. Give each building its own **resolve threshold** so the city lights block by block.
- In `buildSkyline`, assign each building a deterministic threshold `t = (i+0.5)/buildingCount` (left→right) or by `hash01(i)`. In `drawSkyline`, a building's windows reach full neon only once `decryptFrac >= t` (below that, dim/grey); blend smoothly near the threshold.
- **Citizen binding (ties Feature 1):** map each woken citizen to a building index → that building gets a small extra "just lit" glow on the first frame after it crosses (reuse the burst path). This is the visual "a citizen returned." Read from the same `localStorage` save the backdrop already parses (extend `readDecryptFrac` to also derive woken count, or read `stillpointLore` length).
- A11y: respect the existing reduce-motion/reduce-flashing handling already in `cockpitCipher.ts` (no new strobe; thresholds resolve as a held brighten).
- No unit test (canvas); verify visually.

## Feature 6 — MILESTONE BEATS (25/50/75%)

Mirror `grantLongestDayRewards`:
- New pure `cipherMilestones.ts`: `grantCipherMilestones(save): string[]` — for each threshold in {0.25,0.5,0.75} not yet recorded and now reached, record it and grant a small reward (e.g. ◆N Fragments via synthetic dedup ids `cipher-milestone:25`) + return a tag for a narrator toast. Needs a tiny additive save field `cipherMilestones: string[]` (the recorded thresholds) — or reuse `achievements` with ids `decrypt25/50/75`. **Decision:** add `decrypt25/50/75` achievements (achievement engine already idempotent + persisted + toasts) PLUS the Fragment grant via `grantCipherMilestones` keyed off the achievement set — no new save field.
- Wired in `game.ts decryptIntercept` after `evalMetaAchievements()` (same site as `grantLongestDayRewards`): toast a narrator milestone line + the Fragment reward.
- Backdrop bloom: `cockpitCipher.ts` fires a brief `burst` when crossing each milestone (extend `maybeCelebrateLongestDay` into a `maybeCelebrateMilestones` that checks 25/50/75 via `localStorage` flags `lancefall.cipher25/50/75`, like the existing 100% flag).
- Tests: `grantCipherMilestones` grants each tier once, idempotent, only at/after the threshold.

## Feature 7 — "SIGNAL RESTORED" (the transmission-complete moment)

When `syncInterceptLore` reports a newly-completed transmission, show a one-time full-text typeset reveal of the restored message — a calm, between-action beat (NOT mid-combat; the console is open when decrypting, so this fires in the console/cockpit context).
- New UI moment in `ui.ts` (a `signalRestored(title, text, citizen)` overlay): the restored transmission text typesets in, the woken citizen's name fades up ("— a chorister returns —"), the COHERENCE choir audio swells (reuse `audio.transmissionChord` already fired on completion; add a short swell). Dismissable; a11y: reduce-motion → instant show, reduce-flashing → soft fade.
- Wired in `game.ts decryptIntercept`: when `completed.length`, call `ui.signalRestored(...)` for the (first) completed transmission with its citizen.
- No unit test (UI); verify visually.

---

## Architecture / files

- New pure modules: `src/citizens.ts` (roster + woken + dossier-deeper), `src/dossiers.ts` (figure dossiers) — or fold dossiers into citizens.ts if small; `src/cipherMilestones.ts`.
- Edits: `intercepts.ts` (choice-locked tail + exclude from vocab), `bombe.ts` (enigma puzzle + cryptanalyst INSIGHT bonus), `achievements.ts` (decrypt25/50/75), `cockpitCipher.ts` (per-building thresholds + milestone bursts + citizen glow), `game.ts` (wire milestones + signal-restored + choice-tail resolve), `ui.ts`/`panels/codex.ts` (CITIZENS + DOSSIER panes), `ui.ts` (signalRestored overlay + debrief line), `panels/bombe.ts` (choice-tail render + enigma), `style.css` (citizens/dossier/signal-restored styles, appended).
- Determinism: nothing touches the run sim/rng. THE CHOICE read is a pure save read.
- Save: additive only; prefer deriving over storing (citizens, dossiers, milestones all derive from `decryptedWords`/`stillpointLore`/`stillpointChoice`/`achievements`). No `SAVE_VERSION` bump.
- Tests: a `*.test.ts` per pure module + extended achievements/intercepts tests.
- Shared-file discipline: content-filtered commits around concurrent agents (ui.ts/style.css/panels/bombe.ts are hot); append CSS at end; watch the subagent UTF-8 BOM.

## Build order
1. `citizens.ts` + `dossiers.ts` (pure, tested) — the data spine.
2. THE LAST CIPHER choice-tail (intercepts + render).
3. The Enigma puzzle + cryptanalyst INSIGHT bonus.
4. Milestone beats (`cipherMilestones.ts` + achievements + wiring + backdrop bursts).
5. Skyline districts (cockpitCipher) + citizen→building glow.
6. CODEX CITIZENS + DOSSIER panes (UI).
7. "Signal restored" moment + run-end debrief line (UI).

## Out of scope (YAGNI / deferred)
- **Encrypted relics** — deferred to its own run-layer pass (determinism-heavy, needs a new mid-run currency).
- Reading-order narrator variants — folded into citizens/dossiers (the roster reflects what you've read); no per-order authored narration.
- Mid-run citizen text — explicitly dropped (runs are for playing).
- Deploy — owner triggers explicitly.
