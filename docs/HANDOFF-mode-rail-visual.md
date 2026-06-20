# HANDOFF — SELECT MODE rail: a significant visual upgrade

> The title's **SELECT MODE** rail works and is on-brand, but it reads **flat and samey** — every card is icon + name + a dry "TIER · NOTE" line, "STANDARD" repeats on almost every card, the selected state is a single left-border, and the modes don't feel *distinct* or *weighted* (SOLSTICE is the campaign yet sits in the list like the rest). The hooks for a gorgeous rail are **already in place** — each card carries its **per-mode accent** (`--accent` / `--accent-rgb`), a tier/reward/note brief, a selected/locked state, a PB, variant pills, and badges. This is a **visual re-skin** (mostly CSS), not a logic rebuild: keep every existing behavior, make the rail *fabulous*.

---

## PROMPT (paste this to spawn the agent)

> Significantly improve the **SELECT MODE rail** on the title screen of THE LAST LANCE (lancefall) — a **visual** upgrade. It works but reads flat and repetitive (see `docs/HANDOFF-mode-rail-visual.md` for the exact class contract). The cards already carry a **per-mode accent** (`--accent` / `--accent-rgb`, set by `railAccent(id)` in `ui.ts`) and a `modeBrief` (tier / reward / note) — lean into them.
>
> **Make each mode feel like its own thing, and the selected one a hero.** Concretely: (1) **per-mode colour identity** — drive each card's border, glow, icon tile, hover and selected-ring off its `--accent` so the rail reads as a palette (SOLSTICE violet, ENDLESS green, ARENA cyan, BOSS RUSH amber, ECHO gold, NIGHTMARE red); (2) a **hero/selected treatment** that's far stronger than today's left-border — an accent bloom, an enlarged glowing icon, a subtle accent sweep/scanline on selection (a faint cipher-glyph texture on the card ties it to the game's decryption soul); (3) a **difficulty-at-a-glance gauge** — turn `brief.tier` (STANDARD/HARD/BRUTAL) into 1–3 filled accent pips instead of a word, and **surface `brief.reward`** (×shards — currently computed but never shown) as a small chip; (4) turn the dry "TIER · NOTE" line into tasteful **chips** (a `CIPHER` / `WINNABLE` / `SEEDED` / `SUDDEN DEATH` chip), and stop repeating "STANDARD" as plain text; (5) crisper **variant pills** (CASUAL/STANDARD, DAILY/WEEKLY) as a real segmented toggle with the active segment accent-filled; (6) distinctly **enciphered/grey LOCKED** cards that "resolve" into colour when unlocked (theme tie-in); (7) a richer **flavour footer** (`.mode-flavor`) tinted to the selected mode's accent; (8) smooth **hover/selection motion**.
>
> **Hard constraints — do not break or violate:** **(a) Keep ALL existing behavior** — the roving-tabindex keyboard/d-pad nav, the variant-pill click handling, the 64px touch targets, the selected/locked logic, the badges (START HERE / DAILY / LOCKED), the PB line. This is a re-skin; the render logic in `ui.ts` already sets the classes/`--accent`/dataset — you mostly style them. **(b) Work CSS-first in `src/style.css`** (append a commented `/* ── SELECT MODE rail ── */` block at the **end**); only if a move genuinely needs new DOM (the difficulty pips, the reward chip) add a **thin, additive** element in the card's `createFn` + set a `data-tier`/value in the `updateFn` (the `mode-card` reconciler around `ui.ts:2940`) — minimal, content-filtered. Do **not** grow `ui.ts` beyond those hooks; touch no other file. **(c) A11y is mandatory** (match the 450+ existing patterns in `style.css`): `reduce-motion` → no sweep/shimmer/lift (static); `reduce-flashing` → no strobe; `clarity` → keep text crisp, dial back glow; **colorblind → never encode difficulty by hue alone — the pips' COUNT/shape carry it**; respect `hudScale` (`em`/scale vars, the cards must stay ≥64px touch targets). **(d) Shared tree:** `style.css` + `ui.ts` are live-edited by other agents — `git status` first, NEVER `git add -A`, append CSS at the end, content-filter your `ui.ts` hunks (`git apply --cached`); a worktree off `v6` is a clean option. UI-only, no determinism concern.
>
> Verify **visually**: `npx vite build` + minified `vite preview`, screenshot the rail **before/after** (the `tools/ui-capture` harness helps), and confirm each mode is visually distinct, the selected/SOLSTICE card is a clear hero, difficulty/reward read at a glance, and locked cards look enciphered. **Test keyboard/d-pad nav + clicking a variant pill + a 64px touch hit still work**, and re-check with reduce-motion / clarity / colorblind ON. `npx tsc --noEmit` + `npx vitest run` stay green. Commit with the Co-Authored-By trailer; deploy needs the owner's explicit OK.

---

## The class contract (frozen by `ui.ts` — style these; the render already sets them)

The rail lives in `.ck-col-left` → `.ck-sec` ("SELECT MODE") + the reconciled `mode-card` grid + `.mode-flavor` footer. Each card (`ui.ts` ~2944–3043):

| Element | Class | The render already provides |
|---|---|---|
| Card | `button.mode-card.ck-mi` (+`.selected`, +`.locked`) | `--accent` + `--accent-rgb` (per-mode), `aria-pressed`, roving `tabindex`, `data-activeId`/`data-unlocked` |
| Icon | `.ck-mi-icon` | the mode SVG (innerHTML) — currently small/flat; make it an accent-tinted glowing tile |
| Text col | `.ck-mi-text` | wraps the below |
| Name | `.ck-mi-name` | the mode title |
| Sub-line | `.ck-mi-sub` | today: `"${brief.tier} · ${brief.note}"` — re-express as pips + chips (see below) |
| PB | `.ck-mi-pb` (+`.hidden`) | selected-only; a `PB` `::before` prefix already exists |
| Variant pills | `.ck-mi-pill` → `.ck-mi-pill-seg` (+`.on`) | multi-variant cards (Endless, Echo); style as a segmented toggle |
| Badge | `.ck-mi-badge` (+`.hidden`/`.locked`/`.start`/`.daily`) | corner badge (START HERE / DAILY / LOCKED) |
| Flavour footer | `.mode-flavor` | the selected mode's flavour copy |

**Already themed for you:** `--accent` / `--accent-rgb` per card — your single biggest lever. Use it for borders, glows, the icon tile, the selected ring, the pips, the active pill segment, and the flavour-footer tint.

**Data you can surface but currently isn't shown:** `modeBrief(m).reward` (e.g. `×1.75 shards`) — add a reward chip. `brief.tier` is `STANDARD`/`HARD`/`BRUTAL` → map to a 1/2/3-pip difficulty gauge (set a `data-tier` on the card in the `updateFn` and render pips in CSS, or append a tiny gauge element in `createFn`).

## Design moves (what "significantly improve" means)
1. **Palette, not a list** — each card's identity comes from its `--accent` (border + a soft outer glow + the icon tile). The rail should look like six coloured keys, not six grey rows.
2. **Hero selected card** — a real elevation: stronger accent bloom, the icon enlarged + lit, a one-shot accent sweep on selection, optional faint cipher-glyph texture (the decryption motif). SOLSTICE, as the campaign, should feel like the front door.
3. **Difficulty + reward, visual** — 1–3 accent pips for tier (colourblind-safe: count carries it), a small `×shards` reward chip. Kill the repeated plain "STANDARD".
4. **Note as a chip** — `CIPHER` / `WINNABLE` / `SEEDED` / `SUDDEN DEATH` / `OFF-BOARD` as accent-tinted chips, not "·"-joined text.
5. **Segmented variant toggle** — `.ck-mi-pill-seg.on` accent-filled; the off segments quiet; a crisp slider feel.
6. **Enciphered locked state** — locked cards read grey/scrambled (a subtle glyph or noise + a lock), and "resolve" to colour when unlocked — the game's grey→neon language, in the menu.
7. **Atmospheric flavour footer** — frame `.mode-flavor`, tint it to the selected accent, hairline divider; it should feel like a dossier line, not a caption.
8. **Motion** — a smooth hover lift + selection transition + the accent sweep, all `reduce-motion`-gated.

## A11y (non-negotiable — copy the existing patterns)
- `.reduce-motion` (+ `@media (prefers-reduced-motion: reduce)`): no lift, sweep, shimmer, or texture animation — static accent states only.
- `reduce-flashing`: no strobe; the selection sweep is a soft one-shot fade or omitted.
- `.clarity`: keep name/sub legible — reduce glow/texture, raise contrast.
- **colorblind**: difficulty must be readable without hue — the **pip COUNT** (and/or shape/fill) is the signal, accent is decoration.
- `hudScale`: use `em`/the scale vars; cards stay ≥ 64px touch targets at every scale.

## Structural / staging mandate
- **`src/style.css` first** — append one commented `/* ── SELECT MODE rail ── */` block at the **end of the file**. Only the difficulty-pip / reward-chip hooks may touch `ui.ts` (thin, additive, in the `mode-card` reconciler ~`ui.ts:2940`). No other files.
- **Shared files** (`style.css`, `ui.ts` are live-edited by the card-agent + others): `git status` before/after, NEVER `git add -A`, append CSS at the end, content-filter your `ui.ts` hunks via `git apply --cached` (see `lancefall-shared-tree-staging`). A worktree off `v6` is clean. UI-only — no determinism/sim concern.

## Verification (visual)
1. `npx vite build` + minified `vite preview`; open the title.
2. **Before/after screenshots** of the rail (`tools/ui-capture` harness available). Each mode visually distinct; SOLSTICE/selected a clear hero; difficulty + reward read instantly; locked cards enciphered.
3. **Behavior intact:** ↑/↓ + d-pad nav rove correctly, the selected card has focus, clicking a variant pill (CASUAL/STANDARD, DAILY/WEEKLY) switches without launching, a 64px touch hit selects, badges + PB render. Re-check with **reduce-motion / clarity / colorblind** ON.
4. `npx tsc --noEmit` + `npx vitest run` green (CSS shouldn't affect them; the modes/ui tests must still pass).

## Definition of done
- The SELECT MODE rail looks **significantly better** — a coloured palette of distinct modes, a hero selected/SOLSTICE card, difficulty + reward at a glance, chip'd notes, a crisp variant toggle, enciphered locked cards, an atmospheric flavour footer, smooth a11y-safe motion.
- **Zero behavior regressions** (nav, pills, touch, badges, PB, selected/locked).
- a11y honored (reduce-motion / reduce-flashing / clarity / colorblind / hudScale); work is `style.css`-first with only thin additive `ui.ts` hooks; commits content-filtered; tsc + tests green; before/after screenshots delivered; owner OKs any deploy.
