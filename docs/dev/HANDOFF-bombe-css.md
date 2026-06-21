# HANDOFF — Style THE BOMBE console (the fabulous look — CSS only)

> THE BOMBE cockpit console is fully built and **its JS hooks are all in place** — the cross-intercept reveal ripple (`.bombe-tok.just` + `data-word` + `--flash-delay`), the working-machine motif (`.bombe-machine.running` + `.bombe-drum`), word-rarity tints (`.r-key`/`.r-rare`), the "ran overnight" banner, the 100% **THE LONGEST DAY** state — but it renders as **completely unstyled DOM** (there are **zero `.bombe-*` rules in `style.css`**). This is one focused job: **author the `.bombe-*` CSS** so the console looks like a fabulous neon codebreaker station, and the animations the panel already drives actually fire. **CSS only — do not touch `panels/bombe.ts` (a polish agent owns it and built every hook you'll target).**

---

## PROMPT (paste this to spawn the agent)

> Style THE BOMBE cockpit console in THE LAST LANCE (lancefall) per `docs/HANDOFF-bombe-css.md`. The console (`src/panels/bombe.ts`) is fully built and renders all its DOM + drives all its animations via classes, but there is **zero `.bombe-*` CSS** — it's unstyled. Make it **fabulous**: a neon codebreaker station matching the game's cockpit / CIPHER-STORM aesthetic (cyan/indigo/amber, the `--accent` / `--coh` variable system, the mono cipher font, dark glassy panels — look at the existing `.panel`, `.panel-head`, `.stats-label`, and the cockpit styles in `src/style.css`).
>
> **You work in `src/style.css` ONLY** — append one well-commented `/* ── THE BOMBE console ── */` block at the **end of the file**. **Do NOT edit `panels/bombe.ts`** (a polish agent owns it; the class contract below is frozen — read the panel read-only for reference). Style every class in the contract, and provide the **keyframes** the panel already toggles: the master-meter fill (grey→neon gradient + glow + a width transition so it animates up; the `.done` state is radiant gold = the longest day), the **transmission tokens** (`.bombe-tok.enc` = dim monospace glyphs, decrypted = warm readable plaintext, `.r-key`/`.r-rare` = a tasteful rarity glow, **`.bombe-tok.just` = the decrypt FLASH** using `--flash-delay`), the **rotor machine** (`.bombe-drum` spins when `.bombe-machine.running`, intensity off `--lvl`), the intercept cards (locked/partial/`.done`), the Bombe status + upgrade, the puzzle board, and the overnight banner.
>
> **A11y is mandatory — match the 450+ existing patterns in `style.css`:** under `.reduce-motion` (the class the panel checks) ALL animations become static held states (no spin, no flash, the meter just sits at width); under `reduce-flashing` the decrypt flash is a **soft cross-fade, no strobe**; support `.clarity` (high-contrast) and `colorblind` (don't rely on hue alone — pair the grey→neon resolve with brightness/weight); respect `hudScale` (use `em`/the existing scale vars, not hard px everywhere). The shipped FIRST LIGHT + cockpit styles are your templates.
>
> **Shared file:** `style.css` is also live-edited by the card-agent + the polish agent. `git status` first; NEVER `git add -A`; append your block at the very end (lowest conflict); content-filter your commit to only the bombe CSS hunk (`git apply --cached` — see the `lancefall-shared-tree-staging` memory); consider a worktree off `v6`. This is presentation only — no determinism/sim concern.
>
> Verify VISUALLY: `npx vite build` + minified `vite preview`, open THE BOMBE (fund a save with Fragments via `localStorage`), and confirm it looks fabulous — the meter glows and animates on decrypt, tokens resolve glyph→plaintext with the flash rippling across transmissions, the rotor spins, key words glow, the cards/puzzles/buttons all look intentional. **Screenshot it.** Re-check with `reduce-motion` + `reduce-flashing` ON (no animation/strobe, still legible) and `clarity` ON. `npx tsc --noEmit` + `npx vitest run` stay green (CSS can't break them, but confirm). Commit with the Co-Authored-By trailer; deploy needs the owner's explicit OK.

---

## The class contract (frozen by `panels/bombe.ts` — style every one)

Read `src/panels/bombe.ts` read-only to see them in context. **Inline-set values you must NOT override** (the panel sets these on `.style`): `.bombe-master-fill` **width** (`%`), `.bombe-machine` **`--lvl`**, `.bombe-tok.just` **`--flash-delay`**. Your CSS provides everything else.

| Region | Classes | Notes |
|---|---|---|
| Body | `.bombe-body` | flex column; scrollable (many intercepts); comfortable spacing |
| Overnight banner | `.bombe-overnight` (+`.hidden`) | a one-time "⚙ THE BOMBE ran overnight — cracked N words" callout; subtle, dismissable look |
| **Master meter** | `.bombe-master`, `.bombe-master-label`, `.bombe-master-track`, `.bombe-master-fill` (+`.done`) | the headline. Track = dark inset; **fill width is inline %** — you do the **grey(cold)→cyan→amber(decrypted) gradient + glow that grows with %**, a `transition: width` so it animates up. **`.done`** (100%) = **radiant gold**, a soft sustained bloom (the longest day). Label in the mono cipher font. |
| Bombe status + machine | `.bombe-statusrow`, `.bombe-statuscol`, `.bombe-frag`, `.bombe-status`, `.bombe-machine` (+`.running`), `.bombe-drum`, `.bombe-upgrade` | a mechanical row. **3 `.bombe-drum` spans spin** (CSS rotation) when `.bombe-machine.running`; intensity can scale off `--lvl`. `.bombe-upgrade` is a `.btn .btn-sm` variant. |
| Intercept list | `.bombe-list`, `.bombe-intercept` (+`.done`), `.bombe-ic-head`, `.bombe-ic-title`, `.bombe-ic-prog`, `.bombe-ic-text`, `.bombe-decrypt` | cards. Locked/partial = the gappy enciphered message reads as *tantalising*; **`.done`** = a settled, glowing "decrypted" card. `.bombe-decrypt` is a priced `.btn .btn-sm`. |
| **Tokens** | `.bombe-tok`, `.bombe-tok.enc`, `.bombe-tok.r-key`, `.bombe-tok.r-rare`, **`.bombe-tok.just`** | `.enc` = dim monospace **glyph** (un-cracked); no `.enc` = warm readable plaintext (cracked). `.r-key`/`.r-rare` = a tasteful glow so load-bearing words read as worth cracking. **`.just`** = the decrypt FLASH (a neon pulse → fade), **delayed by `--flash-delay`** so the reveal sweeps across the message. |
| Puzzles | `.bombe-puzzles`, `.bombe-puzzle` (+`.done`), `.bombe-pz-prompt`, `.bombe-pz-hint`, `.bombe-pz-solve` (+`.hidden`), `.bombe-pz-input`, `.bombe-pz-btn`, `.bombe-pz-done` | the cryptogram prompt in **big mono glyphs**; a styled `<input>` + SOLVE; a satisfying `.done` solved state showing the reward. |

Reused (already styled — lean on them for consistency, don't restyle): `.panel`, `.panel-wide`, `.panel-head`, `.panel-head-titles`, `.panel-eyebrow`, `.panel-head-title`, `.panel-lead`, `.stats-label`, `.btn`, `.btn-sm`, `.btn-primary`, `.screen-modal`, `.hidden`.

## The keyframes / transitions to provide
- `.bombe-master-fill { transition: width …; }` + a grey→neon gradient + a glow that intensifies; `.bombe-master-fill.done` = a sustained gold bloom (a slow, **flash-safe** shimmer is fine).
- `@keyframes bombe-resolve` for `.bombe-tok.just` — a quick neon brighten → settle, honoring `--flash-delay` (`animation-delay: var(--flash-delay)`). The panel removes `.just` after the flash; you just define the look.
- `@keyframes bombe-drum-spin` for `.bombe-machine.running .bombe-drum` — a continuous rotation (stagger the 3 drums for a mechanical feel).
- Optional: a gentle pulse on `.bombe-overnight` when it appears.

## A11y mandate (non-negotiable — match the existing patterns)
`style.css` already has 450+ `reduce-motion`/`clarity`/`--accent`/`--coh`/`prefers-reduced` rules — copy their style:
- **`.reduce-motion`** (a class on `<html>`, also `@media (prefers-reduced-motion: reduce)`): NO animations — `.bombe-drum` doesn't spin, `.bombe-tok.just` has no flash (the panel already skips adding `.just` under reduce-motion, but also neutralise it in CSS as defense), `.bombe-master-fill` has no width transition (snaps), `.done` is a held glow not a shimmer.
- **`reduce-flashing`**: the decrypt flash is a **soft opacity/colour cross-fade, never a hard strobe**; the longest-day bloom is sustained, not blinking.
- **`.clarity`** (high-contrast): boost token contrast (glyph vs plaintext), thicker borders, dial back the bloom so text stays crisp.
- **colorblind**: don't lean on hue alone — pair the grey→neon "resolved" signal with **brightness + weight** so a decrypted token reads as decrypted without colour.
- **hudScale**: prefer `em`/`rem` + the existing scale variables over hard px so the console scales with the HUD.

## Structural / staging mandate
- **`src/style.css` ONLY.** Append ONE commented `/* ── THE BOMBE console ── */` block at the **end of the file**. Do **not** edit `panels/bombe.ts` (the polish agent owns it; you'd collide). Do not touch any other file.
- **Shared file discipline:** `git status` before and after; NEVER `git add -A`; if `style.css` has the card-agent's / polish-agent's uncommitted hunks, stage ONLY your appended block via content-filtered `git apply --cached` (see `lancefall-shared-tree-staging`). Appending at the END keeps your hunk isolated. A worktree off `v6` is a clean option.
- Reuse the existing CSS variables (`--accent`, `--accent-rgb`, `--coh`, the scale vars) so the console themes with the rest of the cockpit and reacts to the per-mode accent.

## Verification (visual — there's no unit test for CSS)
1. `npx vite build` succeeds; `npx vite preview` (minified) boots clean.
2. Fund a save in the browser console: `localStorage.setItem('lancefall.save', JSON.stringify({version:8, stillpointFragments:Array.from({length:40},(_,i)=>'f'+i)}))`, reload, open **THE BOMBE** (the nav button), and confirm it's **fabulous**: the meter glows + animates up on DECRYPT, tokens resolve glyph→plaintext with the flash **rippling across transmissions**, the rotor spins, key words glow, cards/puzzles/buttons look intentional, the overnight banner reads well, and 100% shows the gold longest-day state (decrypt enough, or temporarily stub `decryptedWords` to the full `vocabulary()` to preview it).
3. **Screenshot the styled console** for the owner (the `tools/ui-capture` harness is available for before/after diffs).
4. Toggle **reduce-motion** + **reduce-flashing** + **clarity** ON (Settings) and re-open: no spin/flash/strobe, still legible and good-looking.
5. `npx tsc --noEmit` + `npx vitest run` green (sanity — CSS shouldn't affect them).

## Definition of done
- THE BOMBE console looks like a **fabulous neon codebreaker station**, fully styled, themed to the cockpit, scaled, and a11y-safe — not unstyled DOM.
- Every contract class is styled; the meter animates grey→neon (gold at 100%), tokens resolve with the rippling flash, the rotor spins, key/rare words glow, puzzles + cards + buttons + the overnight banner all read intentionally.
- `reduce-motion` / `reduce-flashing` / `clarity` / colorblind / `hudScale` all honored.
- Work is **`style.css`-only**, appended at the end, committed content-filtered; `panels/bombe.ts` untouched; tsc + tests green; a screenshot delivered; owner OKs any deploy.
