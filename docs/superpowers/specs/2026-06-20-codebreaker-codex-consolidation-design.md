# THE CODEBREAKER / CODEX consolidation — design

> Design spec. Removes the duplicate lore-decryption system, renames THE BOMBE → THE CODEBREAKER,
> and splits the meta layer into a clean **read / do** model: ONE place you decrypt (THE
> CODEBREAKER), ONE place you read what you've recovered (CODEX archive). Grounded in the
> 2026-06-20 IA audit (workflow `codex-bombe-ia-audit`).
> Status: APPROVED (design + 3 decisions) → pending written-spec review → implementation plan.

## Decisions (locked by the owner)
1. Rename **THE BOMBE → THE CODEBREAKER** (player-facing only; internal identifiers unchanged).
2. **Option A — read/do split** (keep the console standalone; strip duplicate decrypt from the CODEX).
3. **MEMORIES grid → read-only** (decryption happens only in the console).

## Context (as-built, verified by the audit)

- `decryptedWords` (written ONLY by `decryptWord` in THE BOMBE via `game.ts decryptIntercept`) is the
  single source of truth. `stillpointLore`, woken citizens (`citizens.ts`), and dossiers
  (`dossiers.ts`) are all DERIVED reads of it. `syncInterceptLore` (`intercepts.ts`) pushes a
  transmission's `loreLink` into `stillpointLore` on completion.
- **The duplicate system:** the CODEX **MEMORIES** grid (`ui.ts refreshMemories`, the `DECRYPT ◆cost`
  button) lets the player spend Fragments to flip a `LoreEntry` (`lore.ts LORE`) straight to
  remembered via `onUnlockLore → game.ts unlockLore`, writing the SAME `stillpointLore` bit as
  THE BOMBE. The 12 `LORE` entries are 1:1 with the first 12 `INTERCEPTS` transmissions
  (`int-first-light→first-light` … `int-what-remains→what-remains`). This is the v1 system THE
  BOMBE replaced. It is also **asymmetric**: a CODEX unlock does NOT write `decryptedWords`, so the
  transmission stays scrambled in THE BOMBE for a "remembered" memory.
- **Not redundant, just misplaced:** the `READ THE KEY · THE CIPHER` crib (`ui.ts` mainPane, from
  `panels/codex.ts renderCipherLegend`/`CIPHER_CRIB`) teaches the in-game BOSS substitution-cipher
  combat mechanic (`cipher.ts`/`world.cipher`). It sits in the lore economy where it reads as part
  of the Fragment system; it belongs in HOW TO.
- Naming collisions: BOMBE section heading `INTERCEPTS` over `TRANSMISSION NN` cards; two `THE SIX`
  grids on the FALL tab (`THE SIX WHO LET IT FALL` timeline vs `THE FALL · THE SIX` dossier grid);
  CODEX nav button → first tab also labelled `CODEX`; Fragments named `Memory Fragment(s)` /
  `Fragment(s)` / bare `◆`.

**Constraint:** all of this is PURE + save-side + render — no run sim, no rng. **No `SAVE_VERSION`
bump and no migration** (`stillpointLore` + `decryptedWords` shapes unchanged; only the *write*
path narrows). Old saves where a memory was bought directly already have the `stillpointLore` bit
set, so they read correctly in the new archive.

---

## Feature 1 — Rename THE BOMBE → THE CODEBREAKER (player-facing only)

- Nav button label + aria/tooltip (`ui.ts`, the cockpit nav where `'THE BOMBE'` is created).
- Panel head title (`panels/bombe.ts` — the `panel-head-title` `'THE BOMBE'`). The eyebrow is
  already `'CODEBREAKER'`; the lead/prose may say "Build the Bombe…" → reword to "Build THE
  CODEBREAKER…" (keep the machine/rotor flavor).
- Modal title map (`ui.ts` `closeModal`/title lookup that maps the bombe screen → `'THE BOMBE'`).
- **Do NOT rename internal identifiers** — `openBombe`, `buildBombePanel`, `bombeLevel`,
  `bombeBranches`, `INTERCEPTS`, `.bombe-*` CSS classes, save fields — all stay (code-only; renaming
  them is pure churn + blast radius). This is a STRING/label change only.
- Update any e2e/test selectors keyed on the literal `'THE BOMBE'`.

## Feature 2 — CODEX MEMORIES → read-only "RECOVERED MEMORIES" archive

- In `ui.ts refreshMemories`: remove the `DECRYPT ◆cost` button from each card. Render each `LORE`
  entry: if `loreUnlocked(save, id)` → the entry title + full text; else a muted locked state —
  `"— still enciphered —"` + a hint `"decrypt its transmission in THE CODEBREAKER →"`.
- Heading: keep a clear archive label (e.g. `THE FALL · RECOVERED MEMORIES`). Use the canonical
  `Memory Fragments` noun anywhere Fragments are mentioned in this pane (or drop the Fragment line
  here entirely since you no longer spend in the CODEX).
- **Retire the direct-unlock write path:** remove the `onUnlockLore` dep wiring (`ui.ts`
  `buildCodex` deps + the `UICallbacks.onUnlockLore` call site `game.ts:245`) and `game.ts
  unlockLore`. Keep `lore.ts` `LORE`, `loreById`, `loreUnlocked`, `fragmentBalance` (still used);
  `canUnlockLore` becomes unused → remove it + its tests, OR leave it dead (prefer remove). After
  this, `stillpointLore` is written ONLY by `syncInterceptLore`.
- Tests: update/remove `lore`/codex tests that asserted the direct-unlock; add a render smoke
  asserting locked entries show the deep-link hint and unlocked show full text.

## Feature 3 — Move the cipher crib to HOW TO

- Remove the `cipher` const from the CODEX main pane composition (`ui.ts` `buildCodex` mainPane).
- Append `renderCipherLegend()` / the `CIPHER_CRIB` (`panels/codex.ts`) to the **HOW TO** pane
  (`renderHowToContent`), near the existing combat-cipher rule, under a `BOSS CIPHER` heading. It is
  reference/manual content. Do not delete it.

## Feature 4 — CODEX tab reorganization (read archive)

- Tabs become: **BESTIARY** (key `codex`, label changed `CODEX`→`BESTIARY`; content = the bestiary
  only, now that memories + cipher leave the main pane) · **THE FALL** (the recovery archive) ·
  **HOW TO** (+ the cipher crib) · **ACHIEVEMENTS**. Tab *keys* stay the same (no code churn); only
  labels + pane contents change.
- THE FALL pane (`renderFallContent`) is the unified recovery archive: the premise prose/`THE SIX
  WHO LET IT FALL` timeline + **RECOVERED MEMORIES** (moved here from the main pane) + **CITIZENS**
  + **THE SIX · DOSSIERS**. Add a single `→ DECRYPT MORE` button that calls `openBombe()` (the
  one deep-link from read → do).
- Ensure `refreshMemories`/`refreshCitizens`/`refreshDossiers` are all invoked when the CODEX opens
  + after any decrypt (they already are; just confirm the moved memories grid still refreshes).

## Feature 5 — Naming cleanup

- BOMBE section heading `INTERCEPTS` → **`TRANSMISSIONS`** (`panels/bombe.ts`) to match the
  `TRANSMISSION NN` card titles + prose + the `transmission` achievement. (Code identifier
  `INTERCEPTS` stays.)
- Dossier grid heading `THE FALL · THE SIX` → **`THE SIX · DOSSIERS`** (disambiguates from the
  `THE SIX WHO LET IT FALL` timeline).
- Standardize Fragment copy to **`Memory Fragments`** (+ `◆` glyph) in body text; bare `◆N` on
  buttons is fine.

---

## Architecture / files
- All edits in `ui.ts` (nav label, refreshMemories→read-only, tab labels, mainPane recompose, HOW TO
  crib, FALL archive + DECRYPT MORE, remove onUnlockLore wiring), `panels/bombe.ts` (title +
  INTERCEPTS→TRANSMISSIONS + lead reword), `panels/codex.ts` (cipher crib relocation helper if
  needed), `game.ts` (remove `unlockLore` + the dep), `lore.ts` (remove `canUnlockLore`), `style.css`
  (any label/spacing tweaks; append), plus e2e/test selector updates.
- **Determinism:** untouched — pure/meta/render only. No rng/sim contact.
- **Save:** NO migration, NO `SAVE_VERSION` bump. `stillpointLore`/`decryptedWords` unchanged.
- **Shared-file discipline:** `ui.ts`, `style.css`, `panels/bombe.ts` are live-edited by other
  agents — content-filtered commits (`git apply --cached`, no `--recount`; Python hunk-extract,
  decode UTF-8 `surrogateescape`). No UTF-8 BOM. CRLF — Edit/sed.
- **Verification:** ui.ts has zero unit coverage — verify via the `__lf` dev hook + a happy-dom
  render smoke + the minified `vite preview` (rolldown re-export bug has crashed prod boot while
  dev+tests were green). `npx tsc --noEmit` + `npx vitest run` green throughout.

## Build order
1. Rename THE BOMBE → THE CODEBREAKER (labels) + e2e selectors.
2. Naming cleanup (INTERCEPTS→TRANSMISSIONS, THE SIX·DOSSIERS, Memory Fragments).
3. Move the cipher crib to HOW TO + remove from main pane.
4. MEMORIES → read-only archive + retire `unlockLore`/`onUnlockLore`/`canUnlockLore`.
5. CODEX tab reorg (BESTIARY label, THE FALL archive: memories+citizens+dossiers, `→ DECRYPT MORE`).
6. Verify: tsc + vitest + minified preview walkthrough (decrypt in CODEBREAKER, read in CODEX, no
   direct-spend, crib in HOW TO, all labels consistent).

## Out of scope (YAGNI)
- Folding the console into a CODEX tab (Option B) / one mega-hub (Option C) — rejected: buries the
  headline console + balloons blast radius for no extra redundancy removed.
- Renaming internal identifiers (`bombeLevel`, `openBombe`, `INTERCEPTS`, `.bombe-*`) — code churn.
- The deprecated `upgradeBombe`/`upgradeBombeCost` alias cleanup — optional opportunistic only.
- Deploy — owner triggers explicitly.
