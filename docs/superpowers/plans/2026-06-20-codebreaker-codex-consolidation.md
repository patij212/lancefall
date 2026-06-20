# THE CODEBREAKER / CODEX consolidation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Rename THE BOMBE → THE CODEBREAKER, fix naming collisions, and split the meta layer into a clean read/do model — the console is the ONLY place you decrypt; the CODEX becomes a read-only recovery archive (no duplicate Fragment-spend, cipher crib moved to HOW TO).

**Architecture:** Pure label + UI-structure changes. No new logic, no data changes, no save migration. `decryptedWords` stays the single source of truth; `stillpointLore` becomes written ONLY by `syncInterceptLore` (the legacy CODEX direct-unlock path is removed).

**Tech Stack:** Vite + TS, Vitest, Canvas. No new deps.

## Global Constraints
- Pure/meta/render ONLY — no run sim, no rng. NO `SAVE_VERSION` bump, NO migration (`stillpointLore`/`decryptedWords` shapes unchanged).
- Player-facing STRINGS/structure only. Do NOT rename internal identifiers: `openBombe`, `buildBombePanel`, `bombeLevel`, `bombeBranches`, `INTERCEPTS`/`Intercept`, the `'bombe'` nav key, `.bombe-*` CSS classes, save fields. (Renaming them is pure churn.)
- Shared files `src/ui.ts` + `src/style.css` are live-edited by another agent (the mode-rail card-agent). NEVER `git add -A`; the implementer makes edits but does NOT commit shared files — the controller content-filters (`git apply --cached`, NOT `--recount`; Python hunk-extract, decode UTF-8 `errors='surrogateescape'`). Clean files (`panels/bombe.ts`, `game.ts`, `lore.ts`, `lore.test.ts`, `achievements.ts`, `panels/codex.ts`) may be staged whole.
- No UTF-8 BOM (files start with `//`/`import`/`:root`; verify first 3 bytes). CRLF — Edit/sed.
- `tsc --noEmit` + `vitest run` green before each commit (baseline ~1262). `ui.ts` has zero unit coverage — verify via minified `vite preview` in Task 3.
- No e2e refs to `'THE BOMBE'`/`'INTERCEPTS'` exist (grep confirmed) — none to update.

---

## Task 1: Rename THE BOMBE → THE CODEBREAKER + naming cleanup (string swaps)

**Files:** `src/panels/bombe.ts` (clean), `src/game.ts` (clean), `src/achievements.ts` (clean), `src/ui.ts` (SHARED — edit, do not commit). All are player-facing string changes — no structural/logic change.

**Exact edits (verify each string by reading its line; line numbers may drift):**
- `src/ui.ts:767` modal-title map `[this.bombePanel, 'THE BOMBE']` → `'THE CODEBREAKER'`.
- `src/ui.ts:1422` nav button: `navBtn('bombe', 'THE BOMBE', () => this.openBombe(), 'THE BOMBE — the codebreaker console: decrypt the intercepts, build the machine, break the city back into meaning.')` → label `'THE CODEBREAKER'` + tooltip reworded to `'THE CODEBREAKER — decrypt the transmissions, build the machine, break the city back into meaning.'`. KEEP the `'bombe'` key + `openBombe`.
- `src/panels/bombe.ts:59` `el('h2', {class:'panel-head-title'}, 'THE BOMBE')` → `'THE CODEBREAKER'`. (Eyebrow stays `'CODEBREAKER'`.)
- `src/panels/bombe.ts:61` lead prose: `'The intercepts of the fall, enciphered. Spend Memory Fragments to decrypt them word by word — a word cracked here resolves across every transmission. Build the Bombe to crack faster.'` → reword: `'The transmissions of the fall, enciphered. Spend Memory Fragments to decrypt them word by word — a word cracked here resolves across every transmission. Build THE CODEBREAKER to crack faster.'`
- `src/panels/bombe.ts:96` `listLabel = el('div', {class:'stats-label'}, 'INTERCEPTS')` → `'TRANSMISSIONS'`.
- `src/panels/bombe.ts:152` overnight text `⚙ THE BOMBE ran overnight — …` → `⚙ THE CODEBREAKER ran overnight — …`.
- `src/panels/bombe.ts:165` `fragLine.textContent = \`◆ ${bal} Fragment${bal === 1 ? '' : 's'}\`` → `\`◆ ${bal} Memory Fragment${bal === 1 ? '' : 's'}\``.
- `src/panels/bombe.ts:172` `'THE BOMBE — not yet built · choose a branch to start'` → `'THE CODEBREAKER — not yet built · choose a branch to start'`.
- `src/panels/bombe.ts:178` `\`THE BOMBE — Lv ${lvl}/${BOMBE_MAX_LEVEL} · …\`` → `\`THE CODEBREAKER — Lv ${lvl}/${BOMBE_MAX_LEVEL} · …\``.
- `src/game.ts:3253` toast `'◆ INTERCEPT RECEIVED — decrypt the fall in THE BOMBE'` → `'◆ TRANSMISSION RECEIVED — decrypt the fall in THE CODEBREAKER'`.
- `src/achievements.ts:101` desc `'Decrypt your first word in THE BOMBE.'` → `'Decrypt your first word in THE CODEBREAKER.'`.
- `src/ui.ts:2620` dossier heading `el('div', {class:'stats-label'}, 'THE FALL · THE SIX')` → `'THE SIX · DOSSIERS'`.

Code comments mentioning "THE BOMBE" are internal — leave them (optional to update; not required).

- [ ] **Step 1:** Make all the edits above. `grep -rn "THE BOMBE" src/panels/bombe.ts src/game.ts src/achievements.ts` and confirm only intended (non-comment) hits remain or are intentional.
- [ ] **Step 2:** `npx tsc --noEmit` clean; `npx vitest run` green (a test may assert the `firstdecrypt` desc or a heading — update any that break to the new strings).
- [ ] **Step 3:** No BOM (first 3 bytes of each edited file). 
- [ ] **Step 4 (controller stages):** clean files staged whole (`panels/bombe.ts`, `game.ts`, `achievements.ts`); `ui.ts` content-filtered to only the `:767`, `:1422`, `:2620` hunks. Commit `feat(lancefall): rename THE BOMBE → THE CODEBREAKER + naming cleanup (TRANSMISSIONS, THE SIX · DOSSIERS, Memory Fragments)` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Task 2: Read/do split — cipher crib → HOW TO, MEMORIES read-only, retire direct-unlock, CODEX tab reorg

**Files:** `src/ui.ts` (SHARED — edit, do not commit), `src/style.css` (SHARED — edit, do not commit, append), `src/game.ts` (clean), `src/lore.ts` (clean), `src/lore.test.ts` (clean), `src/panels/codex.ts` (clean, if a helper is added).

**Interfaces touched:** remove `UICallbacks.onUnlockLore` (`ui.ts:105`) + its call site (`ui.ts:2529`) + the dep wiring (`game.ts:245`) + `game.ts unlockLore` (`game.ts:3329`) + `lore.ts canUnlockLore` (`lore.ts:103`). These are COUPLED — do them together so tsc never breaks.

**Sub-changes:**

**(a) Cipher crib → HOW TO.** Remove the `cipher` const from `mainPane` (`ui.ts:2085-2090` build + `:2097` `el('div',{class:'codex-pane'}, lead, this.codexBestiary, cipher, this.codexMemories)` → `el('div',{class:'codex-pane'}, lead, this.codexBestiary)`). In `renderHowToContent()` (`ui.ts:2717`) append the crib: a `stats-label` `'BOSS CIPHER'` + `renderCipherLegend()` (already imported from `./panels/codex` at `ui.ts:52`).

**(b) MEMORIES → read-only + moved to THE FALL tab.** In `mainPane` (`ui.ts:2097`) the `this.codexMemories` is removed (it moves). In `fallPane` (`ui.ts:2098`) `el('div',{class:'codex-pane hidden'}, this.renderFallContent(), this.codexCitizens, this.codexDossiers)` → insert `this.codexMemories` and a `→ DECRYPT MORE` button: `el('div',{class:'codex-pane hidden'}, this.renderFallContent(), this.codexMemories, this.codexCitizens, this.codexDossiers, decryptMoreBtn)` where `decryptMoreBtn = el('button',{class:'btn btn-sm'}, '→ DECRYPT MORE')` with `addEventListener('click', () => this.openBombe())`.
  - In `refreshMemories()` (`ui.ts:2502-2559`): change the heading (`ui.ts:2513`) `'THE FALL · MEMORIES'` → `'THE FALL · RECOVERED MEMORIES'`. Remove the frag-balance spend line (`ui.ts:2518`) OR reword it to a non-spend caption (e.g. `'The memories you have decrypted, restored.'`). In the per-entry render: REMOVE the `DECRYPT ◆cost` button (`ui.ts:2527`) and its `onUnlockLore` listener (`ui.ts:2529`). Render: `loreUnlocked(save, e.id)` → title + full `e.text`; else a muted card: `'— still enciphered —'` + a hint line `'decrypt its transmission in THE CODEBREAKER →'`.

**(c) Retire the direct-unlock write path.** Remove `UICallbacks.onUnlockLore` (`ui.ts:105`). Remove the dep wiring `onUnlockLore: (id) => this.unlockLore(id)` (`game.ts:245`). Remove `private unlockLore(id)` (`game.ts:3329-3337`). Remove `canUnlockLore` from `src/lore.ts` (`:103`) and update `src/lore.test.ts` (remove the `canUnlockLore` import + the "respects balance/cost/already-unlocked" test, `:4,:30-36`). Keep `lore.ts` `LORE`/`loreById`/`loreUnlocked`/`fragmentBalance` (still used elsewhere).

**(d) CODEX tab label.** `tabDefs` (`ui.ts:2102`) `['codex', 'CODEX']` → `['codex', 'BESTIARY']` (key stays `'codex'`). Update the CODEX nav tooltip (`ui.ts:1421`) copy from `'CODEX — the bestiary + lore, THE FALL (the story), HOW TO PLAY, and your achievements.'` → `'CODEX — the bestiary, THE FALL (what you've recovered), HOW TO PLAY, and your achievements.'`.

**(e) style.css:** if the read-only memory cards / decrypt-more button / locked-hint need styling, append a small commented block at the END (reuse `.codex-*` where possible). Keep a11y-safe.

- [ ] **Step 1: impact** — `impact({target:'unlockLore'})` and `impact({target:'refreshMemories'})` (fall back to grep if locked); confirm `canUnlockLore` has no callers besides lore.test.ts.
- [ ] **Step 2:** Make all edits (a)-(e). Implementer does NOT commit (shared ui.ts/style.css).
- [ ] **Step 3:** `npx tsc --noEmit` clean (the coupled onUnlockLore removal must leave no dangling reference); `npx vitest run` green (lore.test.ts updated). No BOM.
- [ ] **Step 4 (controller stages):** clean files whole (`game.ts`, `lore.ts`, `lore.test.ts`, `panels/codex.ts` if touched); `ui.ts` + `style.css` content-filtered to only this task's hunks (markers: `RECOVERED MEMORIES`, `BOSS CIPHER`, `DECRYPT MORE`, `BESTIARY`, `still enciphered`, the mainPane/fallPane recompose, the onUnlockLore removal). Commit `feat(lancefall): CODEX read-only recovery archive — memories read-only, cipher crib → HOW TO, retire direct-unlock, BESTIARY tab + DECRYPT MORE`.

## Task 3: Verify (integration + visual)
- [ ] `npx tsc --noEmit && npx vite build && npx vitest run` (all green; ≥ baseline).
- [ ] Minified `vite preview` (port 4350), fund a save with some decryption + some Fragments. Confirm: nav button reads **THE CODEBREAKER**; opening it shows **TRANSMISSIONS** heading + **Memory Fragment(s)** copy; the CODEX nav opens to a **BESTIARY** tab (no memories/cipher in it); the **THE FALL** tab shows **RECOVERED MEMORIES** (unlocked = full text, locked = "decrypt in THE CODEBREAKER →"), **CITIZENS**, **THE SIX · DOSSIERS**, and a **→ DECRYPT MORE** button that opens the console; the cipher crib appears under **BOSS CIPHER** in **HOW TO**; there is NO `DECRYPT ◆cost` spend button anywhere in the CODEX. Zero console errors (verify via DOM eval if the screenshot tool wedges on the backdrop).
- [ ] `detect_changes({scope:'compare', base_ref:'main'})` — only expected scope. Deploy only on owner's explicit OK.

## Self-review (coverage)
- Rename THE BOMBE→THE CODEBREAKER (player-facing) → T1. ✓
- Naming: INTERCEPTS→TRANSMISSIONS, THE SIX·DOSSIERS, Memory Fragments → T1. ✓
- Cipher crib → HOW TO → T2(a). ✓
- MEMORIES read-only + moved to FALL + DECRYPT MORE → T2(b). ✓
- Retire direct-unlock (onUnlockLore/unlockLore/canUnlockLore) → T2(c). ✓
- BESTIARY tab label + nav tooltip → T2(d). ✓
- Pure/render; no migration; shared-file content-filtering; internal identifiers untouched. ✓
