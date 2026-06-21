# HANDOFF — Make the title CITY COHERENCE bar REAL

> The title-screen **CITY COHERENCE** bar is **hardcoded decoration** — the code says so: `// decorative CITY COHERENCE bar — flavour ONLY (no gameplay state); a static 62%.` (`ui.ts` ~1041). It renders a fixed `62%`, a static fill, and a fixed tagline, and **never updates**. Worse, it sits next to the cockpit backdrop, which *already* resolves grey→neon from the player's REAL cipher-decryption progress — so the bar and the backdrop **contradict each other**. Make the bar a real, persistent **"how much of Lancefall you've brought back"** meter, **decryption-led** so the title bar, the backdrop, and the BOMBE master meter finally all tell the same truth — and so the deep meta/decryption layer gets a permanent, always-visible hook on the main screen.

---

## PROMPT (paste this to spawn the agent)

> Make the title-screen **CITY COHERENCE** bar real in THE LAST LANCE (lancefall) per `docs/HANDOFF-city-coherence.md`. Today it's hardcoded decoration (`ui.ts` ~1041: a static `62%`, static fill, fixed tagline, built once in `buildCockpit`, never refreshed). Drive it from a new **pure, save-derived** helper that measures how much of the city the player has restored — **decryption-led** so it agrees with the cockpit backdrop (`cockpitCipher.ts`, which already reads the master-cipher decrypt fraction) and the BOMBE master meter.
>
> **Build `src/cityCoherence.ts`** (pure, unit-tested, no rng/DOM/sim) exporting `cityCoherence(save): { frac: number; pct: number; tagline: string }`. `frac` (clamped 0..1) is a weighted blend — start with **~0.55 × `masterProgress(save).frac`** (from `./intercepts` — the city remembering, the literal metaphor) **+ ~0.20 × lore remembered** (`save.stillpointLore.length / LORE.length`, `LORE` from `./lore`) **+ ~0.15 × achievements** (`save.achievements.length /` the achievements catalog length in `achievements.ts`) **+ ~0.10 × the arc** (a milestone blend: any boss felled `save.lifeBoss > 0`, THE CHOICE made `save.stillpointChoice !== 'none'`, any run won `save.lifeWins > 0`). Weights are tunable; keep it monotonic + bounded. `pct = Math.round(frac*100)`. `tagline` by band: `0 → "THE CITY SLEEPS IN GREY"`, `<0.34 → "A FEW LIGHTS REMEMBER"`, `<0.67 → "NEON BLOOMS AS THE CITY REMEMBERS"`, `<1 → "THE CITY IS ALMOST WHOLE"`, `1 → "THE LONGEST DAY · THE CITY IS WHOLE"`.
>
> **Wire it in `ui.ts` (thin):** keep a ref to the bar's `.ck-coh-pct`, `.ck-coh-fill`, and `.ck-coh-sub` (built in `buildCockpit` ~1041–1054) and **update all three in `refreshTitle(save)`** (where the mode rail + selected run already refresh, ~2940): `.ck-coh-pct` → `${pct}%`, `.ck-coh-fill` width → the real `pct` (set inline or via a `--pct` CSS var), `.ck-coh-sub` → the tagline. In `style.css`, make the fill dynamic (it's static today) with an **a11y-safe width transition** (eased normally, instant under `reduce-motion`). Because it's now meaningful state (not decoration), give the bar an accessible read (a `role="meter"` + `aria-valuenow`/`aria-valuetext`, or at least drop the `aria-hidden` and keep the `%`+tagline readable).
>
> **Constraints:** **(a) Determinism/safety** — `cityCoherence` is pure save-derived; NO `world.rng`, no sim, no `Date.now`/`Math.random`. (b) **A11y** — the fill transition honors `reduce-motion` (no ease) + `reduce-flashing`; `clarity` keeps the %/tagline crisp; don't encode the level by hue alone (the number + tagline carry it). (c) **Don't grow the god-files** — logic lives in `cityCoherence.ts`; `ui.ts` gets only the refs + the ~6-line refresh; `style.css` gets a small fill rule. (d) **Shared tree** — `ui.ts` + `style.css` are live-edited by other agents: `git status` first, NEVER `git add -A`, append CSS at the end, content-filter your `ui.ts`/`style.css` hunks (`git apply --cached`; see `lancefall-shared-tree-staging`); a worktree off `v6` is clean. Do not touch the SEPARATE in-run HUD coherence meter (`.hud-citymem` / `cityMemoryFill`) — that one is already real.
>
> Verify: add pure tests for `cityCoherence` (fresh save → ~0% + "GREY" tagline; rises with decryption/lore/achievements; full → 1.0 + the longest-day tagline; monotonic + bounded). `npx tsc --noEmit` + `npx vitest run` green. Build + minified `vite preview`: a fresh save shows a low, grey bar; a partly-decrypted save (set `decryptedWords`/`stillpointLore` in `localStorage`) shows a higher bar + the matching tagline, and it AGREES with the backdrop's resolve. Screenshot before/after. Commit with the Co-Authored-By trailer; deploy needs the owner's explicit OK.

---

## The element contract (frozen by `ui.ts`)

The bar is built once in `buildCockpit` (`ui.ts` ~1041–1054):

```
.ck-coh
  .ck-coh-row
    .ck-coh-icon   (COH_CITY_SVG)
    .ck-coh-lbl    'CITY COHERENCE'
    .ck-coh-pct    '62%'                              ← hardcoded → real ${pct}%
  .ck-coh-track
    .ck-coh-fill                                       ← static width → real pct
  .ck-coh-sub      'NEON BLOOMS AS THE CITY REMEMBERS' ← hardcoded → tagline by band
```

It is **built once and never refreshed** — the fix is (1) keep refs to the three dynamic nodes, (2) update them in `refreshTitle(save)` (the per-title-open refresh that already morphs the mode rail at ~2940 and calls `refreshSelectedRun`). No structural rebuild.

## The helper (new `src/cityCoherence.ts`, pure + tested)

```ts
import type { SaveData } from './save';
import { masterProgress } from './intercepts';
import { LORE } from './lore';
// + the achievements catalog (see achievements.ts for the exported list/length)

export interface CityCoherence { frac: number; pct: number; tagline: string; }

export function cityCoherence(save: SaveData): CityCoherence {
  const decrypt = masterProgress(save).frac;                       // the city remembering
  const lore = LORE.length ? save.stillpointLore.length / LORE.length : 0;
  const ach = /* save.achievements.length / TOTAL_ACHIEVEMENTS */ 0;
  const arc = ( (save.lifeBoss > 0 ? 1 : 0)
              + (save.stillpointChoice !== 'none' ? 1 : 0)
              + (save.lifeWins > 0 ? 1 : 0) ) / 3;
  const frac = clamp01(0.55 * decrypt + 0.20 * lore + 0.15 * ach + 0.10 * arc);
  return { frac, pct: Math.round(frac * 100), tagline: taglineFor(frac) };
}
```

(Weights/bands are tunable — the test should assert monotonicity + the band boundaries, not exact magic numbers.)

## Why this is the right fix (not just a number swap)
- **Three surfaces stop lying to each other:** the title bar, the cockpit backdrop (already decryption-driven), and the BOMBE master meter all show the same restoration truth.
- **A permanent hook for the deep layer:** a fresh player sees "your city is N% remembered" on the main screen every session — the pull the meta/decryption layer was missing (a direct answer to the recent review's "the depth is invisible" critique).
- **A real long-term goal:** climbing to 100% becomes *the longest day · the city is whole* — a meta twin of winning.
- **Cheap + safe:** one pure helper + ~6 lines of wiring + a small CSS rule; save-derived, determinism-irrelevant.

## A11y mandate
- The `.ck-coh-fill` width transition: eased normally, **instant under `.reduce-motion`** (+ `@media (prefers-reduced-motion: reduce)`); no strobe under `reduce-flashing`.
- `.clarity`: keep `%` + tagline high-contrast; don't let glow wash them out.
- The level is carried by the **number + tagline**, not hue alone (colorblind-safe).
- It's real state now — expose it (`role="meter"` + `aria-valuenow`/`aria-valuetext`, or remove `aria-hidden` so the `%`/tagline are read).

## Structural / staging mandate
- New logic → `src/cityCoherence.ts` (pure, tested). `ui.ts` → only the 3 refs + the refresh in `refreshTitle`. `style.css` → the dynamic-fill rule (append at end).
- **Determinism:** pure save-derived; no `world.rng`/sim/`Date.now`/`Math.random`. (UI meta — `determinism.test.ts` is unaffected, but stay rng-free.)
- **Shared files** (`ui.ts`, `style.css`): `git status` first, NEVER `git add -A`, append CSS at the end, content-filter your hunks via `git apply --cached` (see `lancefall-shared-tree-staging`). Worktree off `v6` is an option. **Leave the in-run `.hud-citymem` meter alone** — it's already real.

## Verification
1. `npx tsc --noEmit` clean; `npx vitest run` green (+ the new `cityCoherence` tests: fresh ≈ 0% + GREY tagline; rises with decryption/lore/achievements; full = 100% + longest-day tagline; monotonic + bounded).
2. Build + minified `vite preview`: a fresh save → low, grey bar; inject a partly-decrypted save (`localStorage` `decryptedWords` + `stillpointLore`) → higher bar + the matching tagline, **agreeing with the backdrop's grey→neon resolve**. Confirm it updates each time the title re-opens.
3. Re-check with `reduce-motion` + `clarity` ON. Before/after screenshots.

## Definition of done
- The title CITY COHERENCE bar shows a **real, save-derived %** (decryption-led composite), a **dynamic tagline** by band (longest-day at 100%), and an animated-but-a11y-safe fill — it agrees with the backdrop + the BOMBE meter, and updates as the player progresses.
- Pure `cityCoherence` helper, unit-tested; `ui.ts`/`style.css` touched thinly + content-filtered; the in-run HUD meter untouched; determinism-safe; a11y honored; tsc + tests green; screenshots delivered; owner OKs any deploy.
