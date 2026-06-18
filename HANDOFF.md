# LANCEFALL — Session Handoff (2026-06-18)

Focus this session: **mode-rail consolidation** (7 cards → 6 via variant pills, WEEKLY made
reachable) + **fixing the flaky `sandbox.smoke` e2e**. Branch: `v6` (the active dev branch;
the repo's default branch is `master`, which the harness mislabels as `main`).

All of this session's work is **committed**. The only uncommitted item is
`tools/ui-capture/panels.mjs` (modified before this session — not mine) plus the long-standing
untracked mockups/scratch files; left as-is.

## What shipped

### 1. Mode consolidation — UI-only, no sim/scoring/save-format change
The title rail went **7 cards → 6**, and the previously-stranded **WEEKLY SIEGE is now reachable**.
A "card" is now a group of one or two mode variants with an on-card pill.

- **`src/modes.ts`** — `RAIL_CARDS` (each card = its variants, `[0]` = default), `RAIL_CARD_IDS`,
  `RAIL_VARIANT_IDS`, `cardForMode()`; `nextRailMode()` walks cards. **ENDLESS card** owns
  `['casual','endless']` (CASUAL·STANDARD pill); **ECHO card** owns `['daily','weekly']`
  (DAILY·WEEKLY pill). `MODES` data unchanged (all 8 stay). A `modes.test` **reachability guard**
  now asserts every `MODES` id is in some card (would have caught the stranded WEEKLY).
- **`src/ui.ts`** — rail render over `RAIL_CARDS` with a variant pill (`<span role=button>`, not
  nested `<button>`); `flipVariant()`; in-memory per-card variant memory (`cardVariant` map);
  the `refreshTitle` selection-coercion judges lock on the card's primary.
- **`src/input.ts` + `src/game.ts`** — `↑/↓` flip the selected card's variant (`variantEdge` /
  `consumeVariant` → `ui.flipVariant`); `←/→` rail nav unchanged; digit-jump walks `RAIL_CARD_IDS`.
- **`src/save.ts`** — fresh saves default `selectedMode:'casual'` (the suggested run-1 mode);
  `migrate`'s id-guard unchanged. No `SAVE_VERSION` bump.
- **`e2e/mode-rail.smoke.spec.ts`** (new) — 6-card rail, both pills flip (click + `↑/↓`), hero
  swaps to the exact launchable mode incl. WEEKLY, 0 console errors.

Commits: `097c458` (model + guard) · `f2d96b4` (pill + memory) · `9fc3f20` (↑/↓ wiring) ·
`c7fca7a` (digit-jump + drop alias) · `99d5c49` (casual default) · `4760ff1` (smoke + pill
hardening). Spec + plan: `docs/superpowers/specs/2026-06-18-mode-consolidation-design.md`,
`docs/superpowers/plans/2026-06-18-mode-consolidation.md` (`739c787`, `27cad21`).

### 2. Flaky `sandbox.smoke` e2e — fixed (`0a3d4b9`)
Two root causes (found by instrumenting; my first fitCockpit theory was WRONG — the frame scale
and button layout are both constant, only the *rendered* box pulsed):
1. **Deterministic:** `.btn-play { animation: pulse 1.4s infinite }` (keyframe `transform:
   scale(1.04)`) makes the DESCEND button breathe forever → its box never settles → real
   `.click()` trips Playwright's stability gate ("element is not stable"). All 4 sandbox tests
   failed; a human clicks it fine.
2. **Flaky:** parallel workers contend on the single `vite preview` server (each runs full
   Web-Audio + canvas) → transient asset 404s + timing failures.

Fixes: **`e2e/fixtures.ts`** (new shared fixture) zeroes animation/transition **durations** via an
injected stylesheet — a pure rendering-timing change, invisible to app logic, so the dash sandbox
still shows (do NOT use `prefers-reduced-motion`: the cockpit *skips* the sandbox under it via
`shouldShowSandbox`; also `use.reducedMotion` did not propagate to `matchMedia` here, only
`page.emulateMedia`/`newContext` did). Plus **`workers: 1`** in `playwright.config.ts`.

## Gate status (verified at HEAD `f96b41e`)
- `tsc --noEmit` clean · **832 vitest pass** · `vite build` OK (via the e2e webServer).
- **Full e2e: 9/9 passed**, serial — confirmed reliable across 5+ consecutive runs.

## Coordination — a parallel card-visuals agent is co-committing on `v6`
- This session it shipped the **`reconcile()` no-rebuild UI morph** series (`316ce15`→`f96b41e`,
  incl. `a6c82a1` "mode rail morphs in place"). That refactored the rail render I'd added the pill
  to — my pill/variant logic survived intact (verified: 14 pill refs in `ui.ts`, smoke green).
- `src/ui.ts` and `src/style.css` are SHARED with that agent — **`git status` before editing**,
  stage only your own hunks. Earlier in the session their commits landed between mine; each of my
  commits contains only my hunks.

## Suggested next steps (owner's call)
- **Playtest the rail ergonomics** — `↑/↓` flips the pill while `←/→` moves cards (the rail is a
  vertical column). If the vertical-rail "↑/↓ should move cards" instinct wins, inverting the axes
  is a follow-up (it re-maps shipped nav + its tests, so deliberately out of scope here).
- **Default variant** — fresh saves currently land on CASUAL (then `selectedMode` remembers); flag
  if you'd rather STANDARD be pre-selected for returning players.
- **Pre-existing:** the `pulse`/`scale(1.04)` breathing on `.btn-play` is intentional design (kept);
  only the e2e now neutralizes it. No product change made.

## Reference
- Memory: `lancefall-mode-consolidation` (incl. the e2e-debugging gotchas), `lancefall-repo-facts`
  (default branch = `master`), `lancefall-ui-reconciler` (the card-agent's morph convention).
