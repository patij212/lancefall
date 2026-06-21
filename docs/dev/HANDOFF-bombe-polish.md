# HANDOFF — THE BOMBE: polish to fabulous + take the meta cipher layer to the next level

> Plan 2 (the meta decryption layer — intercepts + the Memory-Fragment economy + THE BOMBE cockpit console) is **shipped, wired, and tested end-to-end** (you can open the console, decrypt a word, watch the master cipher tick 0→1/265). But it is **functionally complete, not yet *fabulous*** — the console renders as **unstyled DOM** (the CSS was deliberately deferred), the decrypt has **no juice/animation/sound**, the puzzle "rewards" are **labels that don't grant anything**, there is **no celebration** for completing a transmission or reaching the longest day, and the layer is **invisible from gameplay** (a player earns Fragments and never learns the console exists). This handoff turns it into a showpiece and deepens it — **complexity and a wonderful player experience, NEVER difficulty.**

---

## PROMPT (paste this to spawn the agent)

> Polish + deepen THE BOMBE / meta-decryption layer in THE LAST LANCE (lancefall) per the design in this doc (`docs/HANDOFF-bombe-polish.md`). Plan 2 shipped the *mechanics* (a vocabulary decryption economy in `src/intercepts.ts`, the Bombe auto-crack + cryptanalysis puzzles in `src/bombe.ts`, the console modal in `src/panels/bombe.ts`, save fields `decryptedWords`/`bombeLevel`/`solvedPuzzles`, a cockpit-backdrop hook in `src/cockpitCipher.ts`, and game.ts/ui.ts wiring) — but it has **zero BOMBE-specific CSS**, no decrypt juice/sound, unwired puzzle rewards, no completion/longest-day celebrations, and no discoverability from a run. Make it **fabulous and deep**.
>
> **Do PRIORITY 1 (the fabulous layer) first, in order:** (1) **STYLE the console** — author all the `.bombe-*` CSS so the master-cipher meter is a glowing grey→neon bar, the enciphered tokens read as glyphs and the decrypted ones as warm plaintext, the intercept cards + Bombe status + puzzle board all look like a real codebreaker station (match the cockpit's neon/CIPHER-STORM aesthetic + the existing panel look). (2) **Decrypt JUICE** — when a word cracks, the glyph token visibly *resolves* into plaintext (a flash/dissolve), the master meter animates up, and **every other instance of that word across the visible transmissions resolves too** (the cross-intercept reveal, *seen*). (3) **SOUND** — a rising decrypt tick, a heavier "transmission decrypted" chord, a Bombe-builds clunk, a puzzle-solved sting (hook `audio.ts` from the game.ts BOMBE methods). (4) **CELEBRATIONS** — a flourish when a transmission fully decrypts (+ its CODEX memory unlocking, *shown*), and a real **THE LONGEST DAY** payoff at 100% master cipher (the meta mirror of FIRST LIGHT). (5) **DISCOVERABILITY** — a nav-button pip + a first-time "INTERCEPT RECEIVED" teach so a player who earns a Fragment finds the console.
>
> **Then PRIORITY 2 (depth — complexity, not difficulty):** wire **real puzzle rewards** (the labels currently grant nothing — unlock an actual dash-trail/theme/lore or re-scope honestly), add **decryption ACHIEVEMENTS** (first decrypt, first transmission, Bombe built, all puzzles, 100%), give the Bombe a **visible working-machine** beat (it's an ode to Turing's bombe — show it crack), add **richer economy texture** (a free daily "crib" hint, a partial-transmission teaser, word rarity), and **bridge combat↔console** (breaking a boss's cipher in a run deterministically reveals/earns a console word) — pick the ones that excite you; the owner can cut any.
>
> **HARD CONSTRAINTS — do not violate:** **(a) Depth, not difficulty** — nothing here may make a *run* harder; the console is untimed/unfailable; juice never obscures gameplay. **(b) Determinism is sacred** — the meta layer is save-side (no `world.rng`); ANY combat↔console bridge you add must NOT introduce a `world.rng` draw in a seeded path (a fixed grant, or the existing cipher seed — run `src/determinism.test.ts` after). **(c) A11y is mandatory** — every new visual must honor `reduceMotion` (a held, resolved frame — no animation), `reduceFlashing` (no strobe — the resolve is a soft cross-fade), `clarity`, and `colorblind`, exactly like FIRST LIGHT / cockpitCipher already do. **(d) Don't grow the god-files** — new logic in `intercepts.ts`/`bombe.ts`/`achievements.ts`; new CSS APPENDED to `style.css`; render juice in the panel or a `src/render/*` module; keep `ui.ts`/`game.ts` edits to thin reads. **(e) SHARED TREE** — `ui.ts` + `style.css` are live-edited by a concurrent card-agent (currently a `sandbox-pips` feature that has left HEAD with pre-existing tsc errors around a `bossBroke` SandboxEvents field — NOT yours, do not touch sandbox code). `git status` before editing; NEVER `git add -A`; stage only your hunks (append CSS at the file END to minimize conflicts; content-filter shared-file commits via `git apply --cached` — see the `lancefall-shared-tree-staging` memory). Consider a worktree off `v6` for clean iteration.
>
> Verify with `npx tsc --noEmit` (your files clean; the card-agent's `sandbox`/`bossBroke` errors are pre-existing — filter them), `npx vitest run` (1176+ green, add pure tests for any new logic/achievements), `src/determinism.test.ts` green, and a **prod build + minified `vite preview` boot** where you OPEN THE BOMBE and watch a decrypt resolve with full juice (0 console errors). Commit per slice with the Co-Authored-By trailer. When done, tell the owner — deploy needs their explicit OK.

---

## Current state you're polishing (exact)

| Piece | File | What's there | What's missing |
|---|---|---|---|
| Intercept catalog + economy | `src/intercepts.ts` | 13 transmissions, `wordCost`/`vocabulary`/`cipherWord`, `decryptWord`/`syncInterceptLore`/`masterProgress`/`tokenView` | rarity, crib hints, partial teasers |
| Bombe + puzzles | `src/bombe.ts` | 5-level Bombe (`bombeCostMul`/`runBombe`/`upgradeBombe`), 3 cryptograms (`CONSOLE_PUZZLES`/`checkPuzzle`/`solvePuzzle`) | real rewards, more/typed puzzles, a daily puzzle |
| The console modal | `src/panels/bombe.ts` | master meter + reconciled intercepts (token-by-token + priced DECRYPT) + Bombe upgrade + puzzle board | **all CSS**, decrypt animation, the cross-reveal ripple, a Bombe machine visual |
| Save | `src/save.ts`/`migrate.ts` | `decryptedWords`/`bombeLevel`/`solvedPuzzles` (additive, sanitized) | — |
| Cockpit backdrop | `src/cockpitCipher.ts` | reads `decryptedWords` → master frac folds into the coherence floor (grey→neon) | a 100% "longest day" one-time celebration |
| Wiring | `game.ts`/`ui.ts` | nav button (`THE BOMBE`), 3 callbacks, `decryptIntercept`/`upgradeBombe`/`solveConsolePuzzle`, run-end `runBombe` | **sound hooks**, a nav pip, a discovery teach |

**The unstyled `.bombe-*` classes that need CSS** (in `panels/bombe.ts`): `.bombe-body` · `.bombe-master` / `-master-label` / `-master-track` / `-master-fill`(+`.done`) · `.bombe-frag` · `.bombe-status` · `.bombe-statusrow` · `.bombe-upgrade` · `.bombe-list` · `.bombe-intercept`(+`.done`) · `.bombe-ic-head` / `-ic-title` / `-ic-prog` / `-ic-text` · `.bombe-tok`(+`.enc`) · `.bombe-decrypt` · `.bombe-puzzles` · `.bombe-puzzle`(+`.done`) · `.bombe-pz-prompt` / `-pz-hint` / `-pz-solve`(+`.hidden`) / `-pz-input` / `-pz-btn` / `-pz-done`. (The shell reuses already-styled `.panel`/`.panel-wide`/`.panel-head*`/`.panel-lead`/`.stats-label`/`.btn*` — lean on those for consistency.)

---

## PRIORITY 1 — make it fabulous (do this first, in order)

### 1.1 Style the console (the biggest single win)
Author the `.bombe-*` CSS (appended to `style.css`) so the console reads as a **codebreaker station**, in the game's neon/CIPHER-STORM language:
- **Master cipher meter** — a wide track with a fill that goes **grey (cold) → cyan/amber (decrypted)**, a soft glow that intensifies with %, and the label in the mono cipher font. At 100% it should look *radiant* (set up the `.done` state for the longest-day payoff).
- **Transmission cards** — the enciphered tokens (`.bombe-tok.enc`) render as dim, monospace **glyphs** (they already carry Greek cipher text); decrypted tokens are warm, readable plaintext. A half-decrypted card should look like a *tantalising, gappy message* — that gappiness is the hook.
- **Bombe status + upgrade** — make it feel mechanical (a small rotor/drum motif, a "−20% cost · 1 crack/run" readout).
- **Puzzle board** — the cryptogram prompt in big mono glyphs, a styled input + SOLVE, a satisfying solved state.
- Respect `hudScale`, `clarity` (high-contrast variant), and `colorblind`. Reuse CSS variables already in `style.css` (the `--accent`/`--coh` system) so it themes with the rest.

### 1.2 Decrypt juice (the moment that sells it)
When a word cracks (`decryptIntercept` re-opens the panel today with a plain morph), make it **resolve visibly**:
- The just-cracked glyph token **flips/dissolves** into plaintext (a short neon flash + cross-fade).
- The master meter **animates** up to its new %.
- **The cross-intercept reveal, *seen*:** every other visible instance of that same word lights up in the same beat (this is the "you built a piece of the key" payoff — currently invisible). You'll need to thread the just-decrypted word into `panel.open(save, justDecryptedWord?)` (extend the signature) so the panel can flash matching `.bombe-tok`s.
- Under `reduceMotion`: no animation — the tokens just appear resolved (a held frame). Under `reduceFlashing`: a soft fade, no strobe.

### 1.3 Sound
Hook `audio.ts` (the AudioEngine is reachable from the game's BOMBE methods — `this.audio`):
- a light **rising tick** per word decrypted (pitch can rise with the intercept's progress),
- a heavier **chord** when a transmission fully decrypts,
- a **mechanical clunk** when the Bombe is built/upgraded,
- a **puzzle-solved sting**.
All gated by the existing sfx volume; silent if muted.

### 1.4 Celebrations
- **Transmission complete** → a flourish in the console + the existing "MEMORY DECRYPTED" toast, and the linked **CODEX memory visibly unlocking** (it already pushes to `stillpointLore` via `syncInterceptLore`; make the codex memory *light up* if open, or toast it with the title).
- **THE LONGEST DAY (100% master cipher)** → the marquee payoff: a one-time celebration (the cockpit backdrop already resolves via `decryptFrac`; at 100% trigger a special title-screen moment — a sustained golden bloom like FIRST LIGHT, a line like "THE CITY REMEMBERS EVERYTHING — the longest day has come"), an **achievement**, and persist it so it fires once. This is the meta twin of winning the game.

### 1.5 Discoverability (so players actually find it)
- A **pip on the THE BOMBE nav button** when there's affordable decryption waiting (the `navBtn` already takes a `pip` param — see the gold UPGRADES pip). 
- A **first-time teach**: the first run-end where the player carries a Fragment, surface a one-line "◆ INTERCEPT RECEIVED — decrypt the fall in THE BOMBE" (reuse the gloss/onboarding-toast system; persist it once like the other teaches in `taught`).
- Optionally a Fragment-balance + "N% of the fall decrypted" line on the loadout/hub.

---

## PRIORITY 2 — next level / depth (complexity, NOT difficulty)

Pick what excites you; the owner can cut any. Each must keep the layer untimed/unfailable and determinism-safe.

- **Real puzzle rewards.** `solveConsolePuzzle` currently only grants a free crack; the `reward` strings ("A dash-trail cosmetic", "A lore fragment", "A Bombe boost") are **cosmetic labels that don't fire**. Wire them to *actually* grant (unlock a real `unlockedTrails`/`unlockedThemes` entry, a Fragment, a Bombe level) — or re-scope the labels to match. Make solving a puzzle feel *worth it*.
- **Decryption achievements** (`achievements.ts` + `evalAchievements`): first word, first full transmission, the Bombe built, all puzzles solved, 100% master cipher. Pure save-side checks; surface via the existing achievement toast.
- **The Bombe as a working machine** — an ode to Turing's bombe: show it *crack* (a spinning rotor/drum in the console and/or a beat in `cockpitCipher`'s Enigma-rotor motif), and consider a gentle idle/incremental feel (it "ran overnight" — the run-end `runBombe` already does the logic; make it *visible* with a "the Bombe cracked N words while you were out" readout on return).
- **Richer economy texture**: word **rarity** (rare/key words cost more but reveal a bigger chunk of meaning), a **free daily crib** (one common word revealed each day as a foothold), a **partial-transmission teaser** (a half-decrypted message reads as evocative fragments — lean into it). Keep `wordCost` pure + deterministic.
- **More puzzle types + a track**: a real Vigenère, a frequency-attack substitution, and a **daily intercept** tied deterministically to the Daily seed (everyone decrypts the same one — a shared shareable cryptogram). Determinism: derive from the date seed, never `world.rng`.
- **Bridge combat ↔ console** (the two cipher layers talking): breaking a boss's ring-cipher in a run **deterministically reveals or earns a console word** (a fixed grant or one keyed off the existing cipher seed — NOT a new `world.rng` draw), so the thing you do under fire feeds the thing you do at peace. And/or: a fully-decrypted transmission surfaces its lore as a one-line gloss the first time you next fight that boss.

---

## Structural mandate (where the work goes)
| New/changed | Where | Why |
|---|---|---|
| New economy/puzzle/reward logic | extend **pure** `src/intercepts.ts` / `src/bombe.ts` (TDD) | keep it pure + unit-tested; zero rng |
| Achievements | `src/achievements.ts` (+ `evalAchievements`) | the existing, tested home |
| **All `.bombe-*` CSS** | **append to `src/style.css`** | shared file — append at the END to minimize card-agent conflicts |
| Decrypt animation / the cross-reveal ripple / Bombe machine | `src/panels/bombe.ts` (+ a `src/render/*` module if it needs canvas) | the panel owns its render; don't bloat `ui.ts` |
| Sound hooks | thin calls in the game.ts BOMBE methods (`this.audio.*`) | the audio engine is already there |
| Celebrations / longest-day | `cockpitCipher.ts` (100% state) + the existing toast/announce | reuse FIRST LIGHT's a11y-safe compositor pattern |
| Discovery pip / teach | thin reads in `ui.ts` (nav pip) + `onboarding.ts`/`taught` (the teach) | follow the act-two onboarding precedent |

**Do not** grow `ui.ts` / `render.ts` / `skins.ts` / `game.ts` beyond thin reads. The depth is data + the panel + CSS.

## Determinism + a11y mandate (re-read)
- **Determinism:** the whole meta layer is **save-side — zero `world.rng`**. The ONLY place you could break this is a combat↔console bridge or a "daily intercept": those must derive from a **fixed value or the existing seed**, never a new `world.rng` draw in a seeded path. Run `src/determinism.test.ts` after every such change — a Daily-stream regression is release-blocking.
- **A11y:** every new visual honors `reduceMotion` (held resolved frame, no animation), `reduceFlashing` (soft cross-fade, no strobe — the decrypt-flash and the longest-day bloom especially), `clarity` (high-contrast), `colorblind`, and `hudScale`. The shipped FIRST LIGHT + cockpitCipher "STILL CITY" frame are your templates — match them.

## Verification (every slice)
1. `npx tsc --noEmit` → your files clean. (The repo currently has **pre-existing card-agent tsc errors** around a `bossBroke` `SandboxEvents` field in `sandbox.ts`/`sandbox.test.ts`/`game.ts:645` — NOT yours; filter them: `npx tsc --noEmit | grep -v sandbox | grep -v bossBroke`. Do not "fix" their mid-flight sandbox code.)
2. `npx vitest run` → **1176+ green** (add pure tests for new economy/puzzle/reward/achievement logic + a happy-dom assertion for any new panel structure).
3. `npx vitest run src/determinism.test.ts` → green (the cardinal check if you bridge combat↔console).
4. Prod **`npx vite build` + minified `vite preview`** → OPEN THE BOMBE, fund a save with Fragments, and watch a decrypt **resolve with full juice** (the token flips, the meter animates, the cross-reveal ripples, the sound plays); complete a transmission (celebration + memory unlock); reach 100% if you can stub it (the longest day). **0 console errors.** Test with `reduceMotion` + `reduceFlashing` ON (no animation/strobe; still legible).

## Definition of done
- THE BOMBE console looks like a **fabulous codebreaker station** (fully styled, themed, scaled, a11y-safe), not unstyled DOM.
- Decrypting a word is a **moment** — the glyph resolves, the meter animates, the cross-intercept reveal ripples, a sound plays. Completing a transmission and reaching the **longest day (100%)** are *celebrations*.
- Players **discover** the console (nav pip + first-Fragment teach); puzzle **rewards are real**; decryption **achievements** exist.
- (Depth, as chosen) a visible Bombe machine, richer economy texture, more puzzle types / a daily intercept, and/or a determinism-safe combat↔console bridge.
- **Depth not difficulty** held (no run got harder; the console stays untimed/unfailable); **determinism intact** (no `world.rng` in seeded paths); **a11y honored**; god-files not grown; new CSS appended to `style.css`; shared-file commits content-filtered.
- tsc clean (your files), full suite green, prod boots clean with the console working. Committed per slice; owner OKs any deploy.
